"""
Webhook Routes — Two-way citizen communication via RAG-powered auto-replies.
Handles inbound citizen messages and generates contextual responses.
"""
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import Response, RedirectResponse
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.models import Audience, CitizenMessage, DeliveryLog, Campaign
from app.auth import require_any_authenticated, require_manager_or_higher
from app.services.rag_service import generate_rag_response, populate_knowledge_base

logger = logging.getLogger("commai.webhook")

router = APIRouter(prefix="/webhook", tags=["Citizen Webhooks"])


class CitizenMessageRequest(BaseModel):
    audience_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    channel: str = "whatsapp"
    content: str

    @validator("content")
    def content_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Message content cannot be empty")
        return v.strip()


class CitizenMessageResponse(BaseModel):
    id: str
    audience_id: str
    audience_name: str
    direction: str
    channel: str
    content: str
    auto_reply: Optional[str] = None
    created_at: str


class ManualReplyRequest(BaseModel):
    audience_id: str
    content: str
    channel: str = "whatsapp"

    @validator("content")
    def content_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Message content cannot be empty")
        return v.strip()


@router.post("/citizen-reply", response_model=CitizenMessageResponse)
def receive_citizen_message(
    request: CitizenMessageRequest,
    bg_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Receive an inbound citizen message (from SMS/WhatsApp gateway callback),
    run RAG pipeline, store the message and auto-reply.
    """
    # Resolve the audience member
    audience = None
    if request.audience_id:
        audience = db.query(Audience).filter(
            Audience.id == request.audience_id,
            Audience.is_deleted == False
        ).first()
    elif request.phone:
        audience = db.query(Audience).filter(
            Audience.phone == request.phone,
            Audience.is_deleted == False
        ).first()
    elif request.email:
        audience = db.query(Audience).filter(
            Audience.email == request.email,
            Audience.is_deleted == False
        ).first()

    if not audience:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audience member not found. Register first."
        )

    # Ensure knowledge base is populated
    populate_knowledge_base(db)

    # Generate RAG response
    auto_reply = generate_rag_response(request.content, db)

    # Store inbound message
    inbound = CitizenMessage(
        audience_id=audience.id,
        direction="inbound",
        channel=request.channel,
        content=request.content,
    )
    db.add(inbound)

    # Store outbound auto-reply
    outbound = CitizenMessage(
        audience_id=audience.id,
        direction="outbound",
        channel=request.channel,
        content=auto_reply,
    )
    db.add(outbound)
    db.commit()
    db.refresh(inbound)

    # Queue background task to scan for rumors
    bg_tasks.add_task(process_inbound_rumor_check, request.content, audience.id)

    return CitizenMessageResponse(
        id=inbound.id,
        audience_id=audience.id,
        audience_name=f"{audience.first_name} {audience.last_name}",
        direction="inbound",
        channel=request.channel,
        content=request.content,
        auto_reply=auto_reply,
        created_at=inbound.created_at.isoformat(),
    )


@router.post("/manual-reply", response_model=CitizenMessageResponse)
def send_manual_reply(
    request: ManualReplyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_higher)
):
    """
    Dispatch a manual operator override message to the citizen,
    attempting real delivery if configured and logging it.
    """
    audience = db.query(Audience).filter(
        Audience.id == request.audience_id,
        Audience.is_deleted == False
    ).first()

    if not audience:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audience member not found."
        )

    # Attempt actual dispatch to the target channel
    from app.services.dispatcher import dispatch_to_channel
    
    subject = "Urgent Advisory Update"
    success, error, actual_channel = dispatch_to_channel(
        channel=request.channel,
        audience=audience,
        subject=subject,
        body=request.content
    )

    # Store the outbound operator message in CitizenMessage
    outbound = CitizenMessage(
        audience_id=audience.id,
        direction="outbound",
        channel=actual_channel,
        content=request.content
    )
    db.add(outbound)
    db.commit()
    db.refresh(outbound)

    return CitizenMessageResponse(
        id=outbound.id,
        audience_id=audience.id,
        audience_name=f"{audience.first_name} {audience.last_name}",
        direction="outbound",
        channel=actual_channel,
        content=request.content,
        auto_reply=None,
        created_at=outbound.created_at.isoformat()
    )


@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_higher),
):
    """List all citizen conversations grouped by audience member (manager/admin view)."""
    from sqlalchemy import func

    # Get distinct audience IDs with message counts
    convos = (
        db.query(
            CitizenMessage.audience_id,
            func.count(CitizenMessage.id).label("message_count"),
            func.max(CitizenMessage.created_at).label("last_message_at"),
        )
        .group_by(CitizenMessage.audience_id)
        .order_by(func.max(CitizenMessage.created_at).desc())
        .all()
    )

    result = []
    for aud_id, msg_count, last_at in convos:
        aud = db.query(Audience).filter(Audience.id == aud_id).first()
        if aud:
            result.append({
                "audience_id": aud_id,
                "audience_name": f"{aud.first_name} {aud.last_name}",
                "phone": aud.phone,
                "email": aud.email,
                "state": aud.state,
                "city": aud.city,
                "message_count": msg_count,
                "last_message_at": last_at.isoformat() if last_at else None,
            })

    return result


from app.auth import require_any_authenticated, require_manager_or_higher

@router.get("/conversations/{audience_id}")
def get_conversation_thread(
    audience_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_any_authenticated),
):
    """Get the full conversation thread for a specific audience member."""
    if current_user.role == "audience":
        aud_check = db.query(Audience).filter(Audience.email == current_user.email).first()
        if not aud_check or aud_check.id != audience_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own conversation thread."
            )
    messages = (
        db.query(CitizenMessage)
        .filter(CitizenMessage.audience_id == audience_id)
        .order_by(CitizenMessage.created_at.asc())
        .all()
    )

    aud = db.query(Audience).filter(Audience.id == audience_id).first()
    aud_name = f"{aud.first_name} {aud.last_name}" if aud else "Unknown"

    return {
        "audience_id": audience_id,
        "audience_name": aud_name,
        "messages": [
            {
                "id": m.id,
                "direction": m.direction,
                "channel": m.channel,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.post("/telegram")
def handle_telegram_webhook(update: dict):
    """
    Receive inbound Telegram Bot webhook update events.
    """
    from app.services.telegram_bot_listener import process_telegram_update
    from app.config import settings
    import os

    token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")
    process_telegram_update(update, token)
    return {"status": "ok"}


class DeliveryStatusCallbackRequest(BaseModel):
    delivery_log_id: Optional[str] = None
    recipient: Optional[str] = None
    channel: Optional[str] = None
    status: str  # sent, delivered, read, failed
    error_message: Optional[str] = None
    campaign_id: Optional[str] = None


@router.post("/delivery-status")
def handle_delivery_status_callback(
    payload: DeliveryStatusCallbackRequest,
    db: Session = Depends(get_db),
):
    """
    Generic delivery status callback endpoint for external gateways (Twilio, Meta, SMS/Email providers).
    Updates DeliveryLog status from sent -> delivered -> read -> failed.
    """
    valid_statuses = ["sent", "delivered", "read", "failed"]
    new_status = payload.status.lower().strip()
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid delivery status '{payload.status}'. Allowed: {valid_statuses}"
        )

    log = None
    if payload.delivery_log_id:
        log = db.query(DeliveryLog).filter(DeliveryLog.id == payload.delivery_log_id).first()

    if not log and payload.recipient:
        query = db.query(DeliveryLog).filter(DeliveryLog.recipient_info == payload.recipient)
        if payload.campaign_id:
            query = query.filter(DeliveryLog.campaign_id == payload.campaign_id)
        if payload.channel:
            query = query.filter(DeliveryLog.channel == payload.channel)
        log = query.order_by(DeliveryLog.sent_at.desc()).first()

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matching DeliveryLog entry not found for callback."
        )

    old_status = log.status
    log.status = new_status
    if payload.error_message:
        log.error_message = payload.error_message

    db.commit()
    logger.info(f"[WEBHOOK-DELIVERY] Log {log.id} updated: {old_status} -> {new_status}")

    return {
        "status": "success",
        "delivery_log_id": log.id,
        "old_status": old_status,
        "new_status": new_status,
        "updated_at": datetime.datetime.utcnow().isoformat()
    }


@router.get("/pixel/{delivery_id}")
def email_open_tracking_pixel(
    delivery_id: str,
    db: Session = Depends(get_db),
):
    """
    1x1 transparent GIF tracking pixel. Triggered when recipient opens campaign email.
    Updates DeliveryLog status to 'read' (open rate tracking).
    """
    log = db.query(DeliveryLog).filter(DeliveryLog.id == delivery_id).first()
    if log and log.status in ["sent", "delivered"]:
        log.status = "read"
        db.commit()
        logger.info(f"[TRACKING-PIXEL] Email opened for log {delivery_id}")

    # 1x1 transparent GIF binary
    pixel_bytes = bytes.fromhex("47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b")
    return Response(content=pixel_bytes, media_type="image/gif")


@router.get("/click/{delivery_id}")
def link_click_tracking(
    delivery_id: str,
    target_url: Optional[str] = "https://gov.in",
    db: Session = Depends(get_db),
):
    """
    Track click-throughs (CTR) in campaign messages.
    Updates DeliveryLog status to 'read' and redirects recipient to target URL.
    """
    log = db.query(DeliveryLog).filter(DeliveryLog.id == delivery_id).first()
    if log and log.status in ["sent", "delivered"]:
        log.status = "read"
        db.commit()
        logger.info(f"[TRACKING-CLICK] Link clicked for log {delivery_id}")

    return RedirectResponse(url=target_url)


def process_inbound_rumor_check(content: str, audience_id: str):
    """
    Background task to scan inbound message content for rumors,
    query the RAG knowledge base for context, and update/create RumorFlag records.
    """
    from app.database import SessionLocal
    from app.models import RumorFlag, Audience
    from app.services.ai_service import analyze_message_for_rumor, generate_fact_check_draft
    from app.services.rag_service import get_knowledge_base
    import datetime

    db = SessionLocal()
    try:
        # 1. Analyze message for rumor
        analysis = analyze_message_for_rumor(content)
        if not analysis.get("is_rumor"):
            return

        claim = analysis.get("claim_summary")
        category = analysis.get("category") or "general"
        state = analysis.get("state")
        district = analysis.get("district")
        city = analysis.get("city")
        pincode = analysis.get("pincode")

        # Fallback to audience location if not parsed in message
        audience = db.query(Audience).filter(Audience.id == audience_id).first()
        if audience:
            if not state: state = audience.state
            if not district: district = audience.district
            if not city: city = audience.city

        # 2. Check for similar existing active rumors to cluster/increment virality
        # Check rumors created in the last 48 hours with matching category and district
        forty_eight_hours_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=48)
        existing_rumor = db.query(RumorFlag).filter(
            RumorFlag.category == category,
            RumorFlag.district == district,
            RumorFlag.status == "pending",
            RumorFlag.created_at >= forty_eight_hours_ago
        ).first()

        if existing_rumor:
            existing_rumor.virality_score += 1
            existing_rumor.updated_at = datetime.datetime.utcnow()
            db.commit()
            logger.info(f"[Rumor Webhook] Incremented virality for existing rumor: {existing_rumor.id}")
            return

        # 3. Fetch context from RAG knowledge base to verify
        kb = get_knowledge_base()
        # Retrieve the top 5 documents
        rag_results = kb.retrieve(claim, top_k=5)
        context_list = []
        for doc, meta, score in rag_results:
            if score > 0.05:  # filter low confidence matches
                context_list.append(f"Source ({meta.get('type')}): {doc}")
        
        refuted_context = "\n".join(context_list) if context_list else "No official bulletins or guidelines confirm or deny this claim."

        # 4. Draft official fact check correction
        fact_check_msg = generate_fact_check_draft(claim, refuted_context)

        # 5. Create new RumorFlag record
        new_rumor = RumorFlag(
            claim_summary=claim,
            category=category,
            suspected_rumor_text=content,
            state=state,
            district=district,
            city=city,
            pincode=pincode,
            status="pending",
            virality_score=1,
            official_fact_check=fact_check_msg
        )
        db.add(new_rumor)
        db.commit()
        logger.info(f"[Rumor Webhook] Flagged new rumor: {new_rumor.id} - {claim}")

    except Exception as e:
        logger.error(f"[Rumor Webhook] Error processing rumor check: {e}", exc_info=True)
    finally:
        db.close()


