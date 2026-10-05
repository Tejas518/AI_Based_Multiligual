"""
Poster Generation Routes — Generate visual campaign posters / flyers
using AI-crafted prompts and the free Pollinations.ai image API.

Architecture: Hybrid rendering
  - Backend generates text-free AI background + structured translated content
  - Frontend composites text onto the background using Canvas with proper fonts
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import timezone

from app.auth import require_any_authenticated, require_manager_or_higher
from app.services.poster_service import (
    generate_poster_prompt,
    generate_poster_content,
    generate_poster_url,
)

router = APIRouter(prefix="/poster", tags=["Poster Generation"])


def utc_isoformat(value) -> str:
    """Serialize legacy naïve database timestamps as explicit UTC ISO-8601."""
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class PosterRequest(BaseModel):
    title: str
    description: str
    category: Optional[str] = "awareness"
    tone: Optional[str] = "formal"
    language: Optional[str] = "English"

    @validator("title")
    def title_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()

    @validator("description")
    def description_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Description cannot be empty")
        return v.strip()


class PosterContentSchema(BaseModel):
    headline: str
    subheadline: str
    body_points: List[str]
    call_to_action: str
    helpline: str = ""
    footer: str = ""


class PosterResponse(BaseModel):
    id: Optional[str] = None
    image_url: str
    prompt_used: str
    language: str
    poster_content: Optional[PosterContentSchema] = None
    is_fallback_content: bool = False
    error: Optional[str] = None


class PosterSendRequest(BaseModel):
    image_url: str
    audience_ids: Optional[List[str]] = None
    segment_id: Optional[str] = None
    channels: Optional[List[str]] = None



@router.post("/generate", response_model=PosterResponse)
def generate_poster(
    request: PosterRequest,
    current_user=Depends(require_manager_or_higher),
):
    """
    Generate a visual poster/flyer for a campaign.
    
    Returns:
      - image_url: Text-free AI-generated background image
      - poster_content: Structured text content translated into the selected language
      - prompt_used: The image generation prompt (for transparency)
    """
    # Step 1: Generate text-free background image prompt
    prompt = generate_poster_prompt(
        title=request.title,
        description=request.description,
        category=request.category,
        tone=request.tone,
        language=request.language,
    )

    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is currently unavailable for prompt generation. Please try again."
        )

    # Step 2: Generate poster image URL (text-free background)
    image_url = generate_poster_url(prompt)

    # Step 3: Generate structured text content in the selected language
    content = generate_poster_content(
        title=request.title,
        description=request.description,
        category=request.category,
        tone=request.tone,
        language=request.language,
    )

    is_fallback = False
    poster_content_schema = None

    if content:
        is_fallback = content.pop("_is_fallback", False)
        poster_content_schema = PosterContentSchema(**content)

    # Save generated poster to database
    from app.database import SessionLocal
    from app.models import Poster
    db = SessionLocal()
    poster_id = None
    try:
        db_poster = Poster(
            title=request.title,
            description=request.description,
            category=request.category,
            tone=request.tone,
            language=request.language,
            image_url=image_url,
            prompt_used=prompt
        )
        db.add(db_poster)
        db.commit()
        db.refresh(db_poster)
        poster_id = db_poster.id
    except Exception:
        pass
    finally:
        db.close()

    return PosterResponse(
        id=poster_id,
        image_url=image_url,
        prompt_used=prompt,
        language=request.language,
        poster_content=poster_content_schema,
        is_fallback_content=is_fallback,
    )


@router.post("/regenerate-content")
def regenerate_poster_content(
    request: PosterRequest,
    current_user=Depends(require_manager_or_higher),
):
    """
    Regenerate ONLY the text content for a poster without regenerating the image.
    Useful when the user wants different text but likes the current background.
    """
    content = generate_poster_content(
        title=request.title,
        description=request.description,
        category=request.category,
        tone=request.tone,
        language=request.language,
    )

    if not content:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is currently unavailable for content generation."
        )

    is_fallback = content.pop("_is_fallback", False)

    return {
        "poster_content": content,
        "language": request.language,
        "is_fallback_content": is_fallback,
    }


@router.get("/available")
def get_available_posters(
    language: Optional[str] = None,
    current_user=Depends(require_any_authenticated),
):
    """Retrieve available posters. Filters by language if provided and targets if audience."""
    from app.database import SessionLocal
    from app.models import Poster, Audience
    from app.services.dispatcher import resolve_audience_members
    import json
    
    db = SessionLocal()
    try:
        # If current user is an audience member, filter based on targets
        aud = db.query(Audience).filter(
            Audience.email == current_user.email,
            Audience.is_deleted == False
        ).first()
        
        # Find target languages matching request or preferred languages
        target_languages = []
        if language:
            target_languages = [language]
        elif aud and aud.preferred_languages:
            try:
                target_languages = json.loads(aud.preferred_languages)
            except Exception:
                pass

        # Retrieve all posters
        posters = db.query(Poster).order_by(Poster.created_at.desc()).all()
        
        filtered_posters = []
        for p in posters:
            # If user is audience, apply targeting rules
            if aud:
                # 1. Target Audience Check
                if p.target_audience_ids:
                    try:
                        target_ids = json.loads(p.target_audience_ids)
                        if aud.id not in target_ids:
                            continue
                    except Exception:
                        continue
                # 2. Target Segment Check
                elif p.target_segment_id:
                    seg_members = resolve_audience_members(db, p.target_segment_id)
                    seg_member_ids = {m.id for m in seg_members}
                    if aud.id not in seg_member_ids:
                        continue

            # 3. Emergency flyers must remain visible to their explicitly
            # targeted citizens even if their portal language differs.
            if target_languages and p.category != "emergency" and p.language not in target_languages:
                continue

            filtered_posters.append(p)

        user_lang = target_languages[0] if target_languages else "English"

        from app.config import settings
        from app.services.translation_service import translate_text
        
        results = []
        for p in filtered_posters[:20]:
            title = p.title
            description = p.description
            
            # Translate if user language is different from poster language
            if user_lang and user_lang.lower() != p.language.lower():
                try:
                    title = translate_text(p.title, user_lang, p.language)
                    description = translate_text(p.description, user_lang, p.language)
                except Exception as ex:
                    logging.getLogger("commai").error(f"[POSTER-AVAILABLE] Translation failed for poster {p.id}: {ex}")

            results.append({
                "id": p.id,
                "title": title,
                "description": description,
                "category": p.category,
                "tone": p.tone,
                "language": user_lang,
                "image_url": f"{settings.BACKEND_URL}/api/poster/{p.id}/image" if p.image_url.startswith("data:image/") else p.image_url,
                "created_at": utc_isoformat(p.created_at)
            })

        return results
    finally:
        db.close()


def dispatch_poster_in_background(
    poster_id: str,
    audience_ids: Optional[List[str]],
    segment_id: Optional[str],
    channels: List[str]
):
    from app.database import SessionLocal
    from app.models import Poster, Audience
    from app.services.dispatcher import dispatch_to_channel, resolve_audience_members
    import json
    import logging
    
    db = SessionLocal()
    try:
        poster = db.query(Poster).filter(Poster.id == poster_id).first()
        if not poster:
            return
            
        # Resolve target audience members
        audience_members = []
        if audience_ids:
            audience_members = db.query(Audience).filter(
                Audience.id.in_(audience_ids),
                Audience.is_deleted == False,
                Audience.is_active == True
            ).all()
        elif segment_id:
            audience_members = resolve_audience_members(db, segment_id)
        else:
            # Fallback/default: broadcast to all active audience members
            audience_members = db.query(Audience).filter(
                Audience.is_deleted == False,
                Audience.is_active == True
            ).all()

        if not audience_members:
            logging.getLogger("commai").info(f"[POSTER-DISPATCH] No target audience members resolved for poster {poster_id}")
            return

        # Subject and body for visual alerts
        from app.config import settings
        subject = f"Visual Alert: {poster.title}"
        
        # Set email body to campaign description (image is sent directly as inline & file attachment)
        body = poster.description
        
        inline_image = poster.image_url if poster.image_url.startswith("data:image/") else None

        # Local translation cache for this dispatch session
        translations_cache = {}

        logging.getLogger("commai").info(f"[POSTER-DISPATCH] Start dispatching poster {poster_id} to {len(audience_members)} users via {channels}")
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
                        logging.getLogger("commai").info(f"[POSTER-DISPATCH] Pre-translated poster to {target_lang}")
                    except Exception as e:
                        logging.getLogger("commai").error(f"[POSTER-DISPATCH] Failed translating poster to {target_lang}: {e}")
                        translations_cache[target_lang] = (subject, body)
                
                member_subject, member_body = translations_cache[target_lang]

            for channel in channels:
                try:
                    dispatch_to_channel(channel, member, member_subject, member_body, inline_image_base64=inline_image)
                except Exception as ex:
                    logging.getLogger("commai").error(f"[POSTER-DISPATCH] Failed channel {channel} for {member.email or member.phone}: {ex}")
    except Exception as e:
        logging.getLogger("commai").error(f"[POSTER-DISPATCH] Exception in background dispatch: {e}")
    finally:
        db.close()


@router.post("/{id}/send")
def send_poster(
    id: str,
    request: PosterSendRequest,
    current_user = Depends(require_manager_or_higher)
):
    """
    Save the final composited image back to the database, and broadcast it
    as a real-time campaign alert to all citizens.
    """
    from app.database import SessionLocal
    from app.models import Poster
    import asyncio
    import logging
    import datetime
    import threading
    import json
    from app.services.websocket_manager import bulletin_manager
    
    db = SessionLocal()
    try:
        poster = db.query(Poster).filter(Poster.id == id).first()
        if not poster:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poster not found")
            
        # Update poster with the final composited data URL and targets
        poster.image_url = request.image_url
        poster.target_audience_ids = json.dumps(request.audience_ids) if request.audience_ids else None
        poster.target_segment_id = request.segment_id
        db.commit()
        
        # Broadcast new bulletin to websocket clients
        payload = {
            "id": poster.id,
            "type": "campaign_alert",
            "title": f"New Poster Alert: {poster.title}",
            "message": poster.description,
            "urgency": "critical" if poster.category == "emergency" else "normal",
            "created_at": datetime.datetime.utcnow().isoformat()
        }
        
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(bulletin_manager.broadcast(payload))
        except RuntimeError:
            asyncio.run(bulletin_manager.broadcast(payload))
            
        # Dispatch via channels in background thread
        channels = request.channels or []
        if channels:
            t = threading.Thread(
                target=dispatch_poster_in_background,
                args=(poster.id, request.audience_ids, request.segment_id, channels),
                name=f"poster-dispatcher-{poster.id[:8]}"
            )
            t.daemon = True
            t.start()
            
        return {"status": "success", "message": "Poster published/sent successfully!"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.getLogger("commai").error(f"[POSTER] Failed to send poster: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to publish poster: {str(e)}")
    finally:
        db.close()


@router.get("/{id}/image")
def get_poster_image(id: str):
    """
    Serve the poster image directly. If it is a base64 encoded string,
    decode it and return as a binary image response.
    Otherwise, redirect to the external URL (e.g. pollination.ai URL).
    """
    from app.database import SessionLocal
    from app.models import Poster
    import base64
    from fastapi import Response
    from fastapi.responses import RedirectResponse
    
    db = SessionLocal()
    try:
        poster = db.query(Poster).filter(Poster.id == id).first()
        if not poster:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poster not found")
            
        image_url = poster.image_url
        if image_url.startswith("data:image/"):
            try:
                # Format: data:image/jpeg;base64,/9j/4AAQ...
                header, base64_data = image_url.split(",", 1)
                media_type = "image/jpeg"
                if "image/" in header:
                    # extract image/jpeg or image/png
                    parts = header.split(";")
                    for p in parts:
                        if p.startswith("data:image/"):
                            media_type = p.split(":")[1]
                            break
                image_bytes = base64.b64decode(base64_data)
                return Response(content=image_bytes, media_type=media_type)
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to decode base64 image: {str(e)}")
        else:
            return RedirectResponse(url=image_url)
    finally:
        db.close()
