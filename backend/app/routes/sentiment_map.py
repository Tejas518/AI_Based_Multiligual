"""
Sentiment Map Routes — Aggregates emergency data by state for
geographic sentiment visualization on an interactive India map.
"""
import json
import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator

from app.database import get_db
from app.models import EmergencyContact, User, Audience, Poster
from app.auth import require_manager_or_higher
from app.services.websocket_manager import bulletin_manager
from app.services.poster_service import generate_poster_prompt, generate_poster_url

logger = logging.getLogger("commai.sentiment_map")

router = APIRouter(prefix="/sentiment-map", tags=["Sentiment Map"])

# State centroids (approximate lat/lng for major Indian states)
STATE_COORDINATES = {
    "Andhra Pradesh": {"lat": 15.9129, "lng": 79.7400},
    "Arunachal Pradesh": {"lat": 28.2180, "lng": 94.7278},
    "Assam": {"lat": 26.2006, "lng": 92.9376},
    "Bihar": {"lat": 25.0961, "lng": 85.3131},
    "Chhattisgarh": {"lat": 21.2787, "lng": 81.8661},
    "Delhi": {"lat": 28.7041, "lng": 77.1025},
    "Goa": {"lat": 15.2993, "lng": 74.1240},
    "Gujarat": {"lat": 22.2587, "lng": 71.1924},
    "Haryana": {"lat": 29.0588, "lng": 76.0856},
    "Himachal Pradesh": {"lat": 31.1048, "lng": 77.1734},
    "Jharkhand": {"lat": 23.6102, "lng": 85.2799},
    "Karnataka": {"lat": 15.3173, "lng": 75.7139},
    "Kerala": {"lat": 10.8505, "lng": 76.2711},
    "Madhya Pradesh": {"lat": 22.9734, "lng": 78.6569},
    "Maharashtra": {"lat": 19.7515, "lng": 75.7139},
    "Manipur": {"lat": 24.6637, "lng": 93.9063},
    "Meghalaya": {"lat": 25.4670, "lng": 91.3662},
    "Mizoram": {"lat": 23.1645, "lng": 92.9376},
    "Nagaland": {"lat": 26.1584, "lng": 94.5624},
    "Odisha": {"lat": 20.9517, "lng": 85.0985},
    "Punjab": {"lat": 31.1471, "lng": 75.3412},
    "Rajasthan": {"lat": 27.0238, "lng": 74.2179},
    "Sikkim": {"lat": 27.5330, "lng": 88.5122},
    "Tamil Nadu": {"lat": 11.1271, "lng": 78.6569},
    "Telangana": {"lat": 18.1124, "lng": 79.0193},
    "Tripura": {"lat": 23.9408, "lng": 91.9882},
    "Uttar Pradesh": {"lat": 26.8467, "lng": 80.9462},
    "Uttarakhand": {"lat": 30.0668, "lng": 79.0193},
    "West Bengal": {"lat": 22.9868, "lng": 87.8550},
    "Jammu and Kashmir": {"lat": 33.7782, "lng": 76.5762},
    "Ladakh": {"lat": 34.1526, "lng": 77.5771},
    "New Delhi": {"lat": 28.6139, "lng": 77.2090},
}


@router.get("/data")
def get_sentiment_map_data(
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_higher),
) -> List[Dict[str, Any]]:
    """
    Aggregate emergency contacts by state with urgency breakdown.
    Returns data points for map visualization.
    """
    # Join EmergencyContact -> User -> Audience to get state info
    # Get all emergency contacts with user info
    emergencies = (
        db.query(EmergencyContact, User)
        .join(User, User.id == EmergencyContact.user_id)
        .all()
    )

    # Map user IDs to audience states
    user_ids = list(set(e.user_id for e, _ in emergencies))
    user_emails = {u.id: u.email for _, u in emergencies}

    # Get audience records for these users (by email match)
    audience_states = {}
    if user_emails:
        for uid, email in user_emails.items():
            aud = db.query(Audience).filter(
                Audience.email == email,
                Audience.is_deleted == False
            ).first()
            if aud:
                audience_states[uid] = aud.state
            else:
                audience_states[uid] = "Unknown"

    # Aggregate by state
    state_data = {}
    for emergency, user in emergencies:
        state = audience_states.get(emergency.user_id, "Unknown")
        if state not in state_data:
            state_data[state] = {
                "state": state,
                "total": 0,
                "critical": 0,
                "urgent": 0,
                "normal": 0,
                "open": 0,
                "resolved": 0,
                "subjects": [],
            }

        state_data[state]["total"] += 1
        urgency = emergency.urgency or "normal"
        if urgency == "critical":
            state_data[state]["critical"] += 1
        elif urgency == "urgent":
            state_data[state]["urgent"] += 1
        else:
            state_data[state]["normal"] += 1

        if emergency.status == "open":
            state_data[state]["open"] += 1
        else:
            state_data[state]["resolved"] += 1

        # Keep last 3 subjects for tooltip
        if len(state_data[state]["subjects"]) < 3:
            state_data[state]["subjects"].append(emergency.subject[:60])

    # Build result with coordinates and sentiment
    result = []
    for state, data in state_data.items():
        coords = STATE_COORDINATES.get(state)

        # Determine sentiment based on urgency distribution
        if data["critical"] > 0:
            sentiment = "critical"
        elif data["urgent"] > data["normal"]:
            sentiment = "concerning"
        else:
            sentiment = "stable"

        result.append({
            "state": state,
            "lat": coords["lat"] if coords else None,
            "lng": coords["lng"] if coords else None,
            "total": data["total"],
            "critical_count": data["critical"],
            "urgent_count": data["urgent"],
            "normal_count": data["normal"],
            "open_count": data["open"],
            "resolved_count": data["resolved"],
            "sentiment": sentiment,
            "recent_subjects": data["subjects"],
        })

    # Sort by total descending
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


class StateEmergencyBroadcastSchema(BaseModel):
    state: str = Field(min_length=2, max_length=100)
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=5, max_length=5000)
    channels: List[Literal["email", "whatsapp", "sms", "push"]] = Field(
        default_factory=lambda: ["email", "whatsapp", "sms", "push"], min_length=1
    )
    urgency: Literal["critical", "urgent", "normal"] = "critical"

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str) -> str:
        state = value.strip()
        if state not in STATE_COORDINATES:
            raise ValueError("State must be a supported Indian state or union territory")
        return state

    @field_validator("title", "description")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("channels")
    @classmethod
    def unique_channels(cls, value: List[str]) -> List[str]:
        return list(dict.fromkeys(value))


def dispatch_state_emergency_in_background(
    audience_ids: List[str],
    title: str,
    description: str,
    channels: List[str]
):
    import logging
    from app.database import SessionLocal
    from app.models import Audience
    from app.services.dispatcher import dispatch_to_channel
    import json

    db = SessionLocal()
    try:
        # The IDs were resolved when the poster was created, so delivery and
        # persistent-flyer visibility use the exact same state audience.
        audience_members = db.query(Audience).filter(
            Audience.id.in_(audience_ids),
            Audience.is_deleted == False,
            Audience.is_active == True
        ).all()

        if not audience_members:
            logging.getLogger("commai").info("[MAP-EMERGENCY] No active target audience members remain")
            return

        subject = f"🚨 EMERGENCY ALERT: {title}"
        body = description

        # Local cache for translations to avoid hitting the LLM API repeatedly for the same language
        translations_cache = {}

        logging.getLogger("commai").info(f"[MAP-EMERGENCY] Start dispatching alert to {len(audience_members)} users via {channels}")
        for member in audience_members:
            # Resolve preferred languages
            pref_langs = []
            if member.preferred_languages:
                try:
                    pref_langs = json.loads(member.preferred_languages) if isinstance(member.preferred_languages, str) else member.preferred_languages
                except Exception:
                    pref_langs = []

            # Determine target language (default is English)
            target_lang = "English"
            if pref_langs and isinstance(pref_langs, list) and len(pref_langs) > 0:
                target_lang = pref_langs[0].strip()

            member_subject = subject
            member_body = body

            if target_lang and target_lang.lower() != "english":
                if target_lang not in translations_cache:
                    try:
                        from app.services.translation_service import translate_text
                        t_subject = translate_text(subject, target_lang, "English")
                        t_body = translate_text(body, target_lang, "English")
                        translations_cache[target_lang] = (t_subject, t_body)
                        logging.getLogger("commai").info(f"[MAP-EMERGENCY] Pre-translated alert to {target_lang}")
                    except Exception as e:
                        logging.getLogger("commai").error(f"[MAP-EMERGENCY] Failed translating to {target_lang}: {e}")
                        translations_cache[target_lang] = (subject, body)
                
                member_subject, member_body = translations_cache[target_lang]

            for channel in channels:
                try:
                    dispatch_to_channel(channel, member, member_subject, member_body)
                except Exception as ex:
                    logging.getLogger("commai").error(f"[MAP-EMERGENCY] Failed channel {channel} for {member.email or member.phone}: {ex}")
    except Exception as e:
        logging.getLogger("commai").error(f"[MAP-EMERGENCY] Exception in background state dispatch: {e}")
    finally:
        db.close()


@router.post("/broadcast-emergency")
async def broadcast_state_emergency(
    request: StateEmergencyBroadcastSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_higher),
):
    """
    Directly broadcast a critical emergency alert targeting a specific state/region.
    Creates a Poster record with a dynamic AI-generated background, sends real-time
    WebSocket push to citizens, and dispatches via communication channels.
    """
    import datetime

    # Resolve the state audience before saving the poster. These same IDs make
    # the flyer persistently visible only to the intended citizens.
    audience_members = db.query(Audience).filter(
        Audience.state == request.state,
        Audience.is_deleted == False,
        Audience.is_active == True,
    ).all()
    audience_ids = [member.id for member in audience_members]

    # 1. Generate visual background prompt
    prompt = generate_poster_prompt(
        title=request.title,
        description=request.description,
        category="emergency",
        tone="urgent",
        language="English",
    )

    # 2. Get Pollinations AI image URL
    image_url = generate_poster_url(prompt) if prompt else "https://image.pollinations.ai/prompt/emergency%20alert"

    # 3. Create Poster database record
    db_poster = Poster(
        title=request.title,
        description=request.description,
        category="emergency",
        tone="urgent",
        language="English",
        image_url=image_url,
        prompt_used=prompt or "Fallback emergency prompt"
    )
    db_poster.target_audience_ids = json.dumps(audience_ids)
    db_poster.target_segment_id = None
    db.add(db_poster)
    db.commit()
    db.refresh(db_poster)

    # 4. Broadcast live notification to connected clients via WebSockets
    payload = {
        "id": db_poster.id,
        "type": "campaign_alert",
        "title": f"🚨 EMERGENCY: {request.title}",
        "message": request.description,
        "urgency": request.urgency,
        "target_state": request.state,
        "created_at": datetime.datetime.utcnow().isoformat()
    }
    await bulletin_manager.broadcast(payload)

    # 5. Launch background channel dispatch thread
    background_tasks.add_task(
        dispatch_state_emergency_in_background,
        audience_ids,
        request.title,
        request.description,
        request.channels
    )

    return {
        "status": "success",
        "message": "Emergency alert broadcasted successfully!",
        "poster_id": db_poster.id,
        "target_count": len(audience_ids),
    }
