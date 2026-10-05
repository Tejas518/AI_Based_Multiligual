"""
Campaign Feedback & Emergency Contact Routes — 
Allows audience members to rate/review campaigns and send emergency requests.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Any

from app.database import get_db
from app.models import User, Campaign, CampaignFeedback, EmergencyContact
from app.schemas import (
    CampaignFeedbackCreate, CampaignFeedbackResponse, CampaignFeedbackSummary,
    EmergencyContactCreate, EmergencyContactResponse, EmergencyContactReply
)
from app.auth import get_current_user, require_any_authenticated, require_manager_or_higher
from app.services.ai_service import draft_emergency_response

router = APIRouter(prefix="/feedback", tags=["Campaign Feedback"])

VALID_FEEDBACK_TYPES = ["helpful", "not_relevant", "too_frequent", "confusing", "excellent"]


# ─── FEEDBACK ENDPOINTS ───


@router.post("", response_model=CampaignFeedbackResponse, status_code=status.HTTP_201_CREATED)
def submit_feedback(
    fb_in: CampaignFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Submit feedback on a campaign. Any authenticated user can provide feedback."""
    # Validate campaign exists
    campaign = db.query(Campaign).filter(
        Campaign.id == fb_in.campaign_id,
        Campaign.is_deleted == False
    ).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    # Validate feedback type
    if fb_in.feedback_type not in VALID_FEEDBACK_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid feedback_type. Allowed: {VALID_FEEDBACK_TYPES}"
        )

    # Check for duplicate feedback (one per user per campaign)
    existing = db.query(CampaignFeedback).filter(
        CampaignFeedback.campaign_id == fb_in.campaign_id,
        CampaignFeedback.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted feedback for this campaign. Delete the existing one first."
        )

    feedback = CampaignFeedback(
        campaign_id=fb_in.campaign_id,
        user_id=current_user.id,
        rating=fb_in.rating,
        comment=fb_in.comment,
        feedback_type=fb_in.feedback_type
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return CampaignFeedbackResponse(
        id=feedback.id,
        campaign_id=feedback.campaign_id,
        campaign_title=campaign.title,
        user_id=feedback.user_id,
        user_name=current_user.full_name,
        rating=feedback.rating,
        comment=feedback.comment,
        feedback_type=feedback.feedback_type,
        created_at=feedback.created_at
    )


@router.get("/my", response_model=List[CampaignFeedbackResponse])
def get_my_feedback(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Get all feedback submitted by the current user."""
    results = (
        db.query(CampaignFeedback, Campaign.title)
        .join(Campaign, Campaign.id == CampaignFeedback.campaign_id)
        .filter(CampaignFeedback.user_id == current_user.id)
        .order_by(CampaignFeedback.created_at.desc())
        .all()
    )
    return [
        CampaignFeedbackResponse(
            id=fb.id,
            campaign_id=fb.campaign_id,
            campaign_title=title,
            user_id=fb.user_id,
            user_name=current_user.full_name,
            rating=fb.rating,
            comment=fb.comment,
            feedback_type=fb.feedback_type,
            created_at=fb.created_at
        )
        for fb, title in results
    ]


@router.get("/campaign/{campaign_id}", response_model=List[CampaignFeedbackResponse])
def get_campaign_feedback(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Get all feedback for a specific campaign. Manager/Admin sees all, audience sees only their own."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    query = (
        db.query(CampaignFeedback, User.full_name)
        .join(User, User.id == CampaignFeedback.user_id)
        .filter(CampaignFeedback.campaign_id == campaign_id)
    )

    # Audience can only see their own feedback
    if current_user.role == "audience":
        query = query.filter(CampaignFeedback.user_id == current_user.id)

    results = query.order_by(CampaignFeedback.created_at.desc()).all()

    return [
        CampaignFeedbackResponse(
            id=fb.id,
            campaign_id=fb.campaign_id,
            campaign_title=campaign.title,
            user_id=fb.user_id,
            user_name=user_name,
            rating=fb.rating,
            comment=fb.comment,
            feedback_type=fb.feedback_type,
            created_at=fb.created_at
        )
        for fb, user_name in results
    ]


@router.get("/summary/{campaign_id}", response_model=CampaignFeedbackSummary)
def get_feedback_summary(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Get aggregated feedback stats for a campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    feedbacks = db.query(CampaignFeedback).filter(CampaignFeedback.campaign_id == campaign_id).all()

    total = len(feedbacks)
    avg_rating = sum(f.rating for f in feedbacks) / total if total > 0 else 0.0

    rating_dist = {str(i): 0 for i in range(1, 6)}
    type_dist = {t: 0 for t in VALID_FEEDBACK_TYPES}

    for f in feedbacks:
        rating_dist[str(f.rating)] = rating_dist.get(str(f.rating), 0) + 1
        type_dist[f.feedback_type] = type_dist.get(f.feedback_type, 0) + 1

    return CampaignFeedbackSummary(
        campaign_id=campaign_id,
        campaign_title=campaign.title,
        total_feedback=total,
        average_rating=round(avg_rating, 2),
        rating_distribution=rating_dist,
        type_distribution=type_dist
    )


@router.delete("/{feedback_id}", status_code=status.HTTP_200_OK)
def delete_feedback(
    feedback_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Delete a feedback entry. Users can only delete their own, admins can delete any."""
    feedback = db.query(CampaignFeedback).filter(CampaignFeedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    if feedback.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete other users' feedback")

    db.delete(feedback)
    db.commit()
    return {"message": "Feedback deleted successfully", "id": feedback_id}


# ─── CAMPAIGNS FOR AUDIENCE (view completed/active campaigns) ───


@router.get("/campaigns-available", response_model=List[dict])
def get_campaigns_for_audience(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Get campaigns available for feedback (active or completed campaigns)."""
    campaigns = (
        db.query(Campaign)
        .filter(Campaign.is_deleted == False, Campaign.status.in_(["active", "completed"]))
        .order_by(Campaign.created_at.desc())
        .limit(50)
        .all()
    )

    # Check which ones the user has already submitted feedback for
    user_feedback = (
        db.query(CampaignFeedback.campaign_id)
        .filter(CampaignFeedback.user_id == current_user.id)
        .all()
    )
    feedback_campaign_ids = {f.campaign_id for f in user_feedback}

    # Resolve target preferred language of the logged in user
    pref_langs = []
    if current_user.preferred_languages:
        try:
            import json
            pref_langs = json.loads(current_user.preferred_languages) if isinstance(current_user.preferred_languages, str) else current_user.preferred_languages
        except Exception:
            pass

    if current_user.role == "audience":
        from app.models import Audience
        aud = db.query(Audience).filter(Audience.email == current_user.email, Audience.is_deleted == False).first()
        if aud and aud.preferred_languages:
            try:
                import json
                pref_langs = json.loads(aud.preferred_languages) if isinstance(aud.preferred_languages, str) else aud.preferred_languages
            except Exception:
                pass

    user_lang = pref_langs[0] if pref_langs else "English"

    result = []
    for c in campaigns:
        title = c.title
        description = c.description

        if user_lang and user_lang.lower() != "english":
            try:
                from app.services.translation_service import translate_text
                title = translate_text(c.title, user_lang, "English")
                if c.description:
                    description = translate_text(c.description, user_lang, "English")
            except Exception:
                pass

        result.append({
            "id": c.id,
            "title": title,
            "description": description,
            "campaign_type": c.campaign_type,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "has_feedback": c.id in feedback_campaign_ids
        })

    return result


# ─── EMERGENCY CONTACT ENDPOINTS ───

emergency_router = APIRouter(prefix="/emergency-contact", tags=["Emergency Contact"])


@emergency_router.post("", response_model=EmergencyContactResponse, status_code=status.HTTP_201_CREATED)
def submit_emergency_contact(
    ec_in: EmergencyContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Submit an emergency contact request to campaign managers."""
    if ec_in.urgency not in ["normal", "urgent", "critical"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid urgency level. Allowed: normal, urgent, critical"
        )

    contact = EmergencyContact(
        user_id=current_user.id,
        subject=ec_in.subject,
        message=ec_in.message,
        urgency=ec_in.urgency
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    # Broadcast new emergency alert via WebSockets
    import asyncio
    import logging
    from app.services.websocket_manager import bulletin_manager
    try:
        payload = {
            "type": "emergency_contact",
            "id": contact.id,
            "user_name": current_user.full_name,
            "subject": contact.subject,
            "message": contact.message,
            "urgency": contact.urgency,
            "created_at": contact.created_at.isoformat()
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(bulletin_manager.broadcast(payload))
        except RuntimeError:
            # No running loop (e.g. running in testing thread)
            asyncio.run(bulletin_manager.broadcast(payload))
    except Exception as e:
        logging.getLogger("commai").error(f"[WS] Failed to broadcast emergency contact: {e}")

    return EmergencyContactResponse(
        id=contact.id,
        user_id=contact.user_id,
        user_name=current_user.full_name,
        subject=contact.subject,
        message=contact.message,
        urgency=contact.urgency,
        status=contact.status,
        admin_reply=contact.admin_reply,
        replied_at=contact.replied_at,
        created_at=contact.created_at
    )


@emergency_router.get("", response_model=List[EmergencyContactResponse])
def list_emergency_contacts(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """List emergency contact requests. Audience sees their own; managers/admins see all."""
    query = db.query(EmergencyContact, User.full_name).join(User, User.id == EmergencyContact.user_id)

    if current_user.role == "audience":
        query = query.filter(EmergencyContact.user_id == current_user.id)

    if status_filter:
        query = query.filter(EmergencyContact.status == status_filter)

    results = query.order_by(EmergencyContact.created_at.desc()).all()

    return [
        EmergencyContactResponse(
            id=ec.id,
            user_id=ec.user_id,
            user_name=user_name,
            subject=ec.subject,
            message=ec.message,
            urgency=ec.urgency,
            status=ec.status,
            admin_reply=ec.admin_reply,
            replied_at=ec.replied_at,
            created_at=ec.created_at
        )
        for ec, user_name in results
    ]


@emergency_router.put("/{contact_id}/status")
def update_emergency_status(
    contact_id: str,
    new_status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Update the status of an emergency contact request. Manager/Admin only."""
    if new_status not in ["open", "acknowledged", "resolved"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status. Allowed: open, acknowledged, resolved"
        )

    contact = db.query(EmergencyContact).filter(EmergencyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Emergency contact not found")

    contact.status = new_status
    db.commit()
    return {"message": f"Status updated to '{new_status}'", "id": contact_id}


@emergency_router.put("/{contact_id}/reply", response_model=EmergencyContactResponse)
def reply_to_emergency(
    contact_id: str,
    reply_in: EmergencyContactReply,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Reply to an emergency contact request and transition its status. Manager/Admin only."""
    import datetime as dt
    contact = db.query(EmergencyContact).filter(EmergencyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Emergency contact not found")

    if reply_in.status not in ["open", "acknowledged", "resolved"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status. Allowed: open, acknowledged, resolved"
        )

    contact.admin_reply = reply_in.admin_reply
    contact.status = reply_in.status
    contact.replied_at = dt.datetime.utcnow()
    db.commit()
    db.refresh(contact)

    # Get the user name
    creator = db.query(User).filter(User.id == contact.user_id).first()
    creator_name = creator.full_name if creator else "Unknown"

    return EmergencyContactResponse(
        id=contact.id,
        user_id=contact.user_id,
        user_name=creator_name,
        subject=contact.subject,
        message=contact.message,
        urgency=contact.urgency,
        status=contact.status,
        admin_reply=contact.admin_reply,
        replied_at=contact.replied_at,
        created_at=contact.created_at
    )


@emergency_router.post("/{contact_id}/generate-draft")
def generate_emergency_draft(
    contact_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Generate an AI draft response for an emergency contact."""
    contact = db.query(EmergencyContact).filter(EmergencyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Emergency contact not found")

    draft = draft_emergency_response(contact.subject, contact.message, contact.urgency)
    return {"draft": draft}
