import datetime
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger("commai.campaign")
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple

from app.database import get_db
from app.models import Campaign, Segment, Audience, Template, AuditLog, DeliveryLog
from app.schemas import CampaignCreate, CampaignUpdate, CampaignResponse, AuditLogResponse, DeliveryLogResponse, CampaignDeliverySummary
from app.auth import require_admin, require_manager_or_higher, require_any_authenticated
from app.routes.audience import build_segment_filter_query


router = APIRouter(prefix="/campaigns", tags=["Campaign Planning"])

# --- Campaign State Machine ---
# Defines valid status transitions. Any transition not listed here is rejected.
VALID_TRANSITIONS = {
    "draft":            ["pending_approval", "scheduled", "active", "cancelled"],
    "pending_approval": ["scheduled", "active", "draft", "cancelled"],
    "scheduled":        ["active", "cancelled", "draft"],
    "active":           ["completed", "cancelled"],
    "completed":        [],            # terminal state
    "cancelled":        ["draft"],     # can be re-drafted
}

def validate_status_transition(old_status: str, new_status: str):
    """Raises HTTPException if the requested status transition is not allowed."""
    allowed = VALID_TRANSITIONS.get(old_status, [])
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition: '{old_status}' → '{new_status}'. "
                   f"Allowed from '{old_status}': {allowed if allowed else 'none (terminal state)'}."
        )

# Helper function to serialize lists to JSON string
def serialize_list(lst: List[str]) -> str:
    return json.dumps([x.strip() for x in lst if x.strip()])

# Helper function to deserialize lists from JSON string
def deserialize_list(s: str) -> List[str]:
    try:
        return json.loads(s) if s else []
    except Exception:
        return []

def calculate_reach(db: Session, segment_id: Optional[str], campaign_channels: List[str], override_channel_preferences: bool = False) -> Tuple[int, int]:
    """
    Given a segment and campaign channel choices, returns (target_audience_count, estimated_reach).
    - target_audience_count: count of active users in the segment.
    - estimated_reach: count of target users who have at least one channel in campaign_channels
      matching their preferred_channels list, or full target count if override is enabled.
    """
    if not segment_id:
        return 0, 0
        
    segment = db.query(Segment).filter(Segment.id == segment_id).first()
    if not segment:
        return 0, 0
        
    criteria = json.loads(segment.filter_criteria)
    
    # Target count query
    query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
    query = build_segment_filter_query(criteria, query)
    target_count = query.count()
    
    if override_channel_preferences or not campaign_channels:
        return target_count, target_count

    # Estimated reach calculation
    audiences = query.all()
    reach_count = 0
    for aud in audiences:
        preferred = deserialize_list(aud.preferred_channels)
        has_intersection = False
        for channel in campaign_channels:
            if not preferred or channel in preferred:
                has_intersection = True
                break
        if has_intersection:
            reach_count += 1
            
    return target_count, reach_count

def calculate_campaign_cost(db: Session, segment_id: Optional[str], campaign_channels: List[str], override_channel_preferences: bool = False) -> float:
    if not segment_id or not campaign_channels:
        return 0.0
        
    segment = db.query(Segment).filter(Segment.id == segment_id).first()
    if not segment:
        return 0.0
        
    criteria = json.loads(segment.filter_criteria)
    query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
    query = build_segment_filter_query(criteria, query)
    audiences = query.all()
    
    total_cost = 0.0
    for aud in audiences:
        preferred = deserialize_list(aud.preferred_channels)
        for ch in campaign_channels:
            if override_channel_preferences or not preferred or ch in preferred:
                if ch == "sms":
                    total_cost += 0.02
                elif ch == "whatsapp":
                    total_cost += 0.04
    return round(total_cost, 2)

def format_campaign_response(camp: Campaign) -> CampaignResponse:
    from sqlalchemy.orm import object_session
    db = object_session(camp)
    estimated_cost = 0.0
    if db and camp.segment_id:
        estimated_cost = calculate_campaign_cost(
            db, 
            camp.segment_id, 
            deserialize_list(camp.channel_preferences),
            bool(camp.override_channel_preferences)
        )

    custom_subject = None
    custom_body = None
    template_id = camp.template_id
    if camp.template and camp.template.title.startswith("Adhoc Template:"):
        custom_subject = camp.template.subject_template
        custom_body = camp.template.body_template
        template_id = None

    return CampaignResponse(
        id=camp.id,
        title=camp.title,
        description=camp.description,
        objective=camp.objective,
        campaign_type=camp.campaign_type,
        status=camp.status,
        segment_id=camp.segment_id,
        template_id=template_id,
        custom_subject=custom_subject,
        custom_body=custom_body,
        channel_preferences=deserialize_list(camp.channel_preferences),
        override_channel_preferences=bool(camp.override_channel_preferences),
        target_audience_count=camp.target_audience_count,
        estimated_reach=camp.estimated_reach,
        estimated_cost=estimated_cost,
        sent_count=camp.sent_count or 0,
        failed_count=camp.failed_count or 0,
        dispatched_at=camp.dispatched_at,
        reviewer_id=camp.reviewer_id,
        review_remark=camp.review_remark,
        created_by=camp.created_by,
        updated_by=camp.updated_by,
        scheduled_at=camp.scheduled_at,
        created_at=camp.created_at,
        updated_at=camp.updated_at
    )

@router.get("", response_model=List[CampaignResponse])
def list_campaigns(
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    try:
        from app.services.dispatcher import check_and_dispatch_scheduled_campaigns
        check_and_dispatch_scheduled_campaigns()
    except Exception as ex:
        logger.error(f"[CAMPAIGN-LIST] Auto-scheduler check exception: {ex}")

    campaigns = db.query(Campaign).filter(Campaign.is_deleted == False).order_by(Campaign.created_at.desc()).all()
    return [format_campaign_response(c) for c in campaigns]

@router.get("/active-bulletins", response_model=List[CampaignResponse])
def list_active_bulletins(
    db: Session = Depends(get_db),
    current_user = Depends(require_any_authenticated)
):
    """Retrieve all active, pending, or scheduled campaigns for the live broadcast bulletins feed."""
    try:
        from app.services.dispatcher import check_and_dispatch_scheduled_campaigns
        check_and_dispatch_scheduled_campaigns()
    except Exception as ex:
        logger.error(f"[BULLETIN-LIST] Auto-scheduler check exception: {ex}")

    campaigns = db.query(Campaign).filter(
        Campaign.is_deleted == False
    ).order_by(Campaign.created_at.desc()).all()
    return [format_campaign_response(c) for c in campaigns]

@router.get("/audit-logs/all", response_model=List[AuditLogResponse])
def get_all_audit_logs(
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Retrieve all operational audit logs. Restricted to Administrators."""
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    results = []
    for l in logs:
        results.append(AuditLogResponse(
            id=l.id,
            user_id=l.user_id,
            user_name=l.user.full_name if l.user else "System",
            campaign_id=l.campaign_id,
            action=l.action,
            old_status=l.old_status,
            new_status=l.new_status,
            changes=l.changes,
            timestamp=l.timestamp
        ))
    return results

@router.get("/mine", response_model=List[CampaignResponse])
def get_my_submitted_campaigns(
    db: Session = Depends(get_db),
    current_user = Depends(require_any_authenticated)
):
    """Retrieve proposed campaigns submitted by the currently logged-in citizen."""
    camps = db.query(Campaign).filter(Campaign.created_by == current_user.id, Campaign.is_deleted == False).order_by(Campaign.created_at.desc()).all()
    return [format_campaign_response(c) for c in camps]

@router.get("/{id}", response_model=CampaignResponse)
def get_campaign(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return format_campaign_response(camp)

@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    camp_in: CampaignCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    # Verify segment and template if provided
    if camp_in.segment_id:
        seg = db.query(Segment).filter(Segment.id == camp_in.segment_id).first()
        if not seg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target segment not found")
            
    template_id = camp_in.template_id
    if template_id:
        tpl = db.query(Template).filter(Template.id == template_id, Template.is_deleted == False).first()
        if not tpl:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
            
    # Auto-generate a shadow Template if custom body is provided
    if not template_id and camp_in.custom_body:
        pref_channel = camp_in.channel_preferences[0] if camp_in.channel_preferences else "sms"
        adhoc_tpl = Template(
            title=f"Adhoc Template: {camp_in.title}",
            description=f"Auto-generated template for campaign '{camp_in.title}'",
            category="awareness",
            channel=pref_channel,
            default_language="English",
            subject_template=camp_in.custom_subject,
            body_template=camp_in.custom_body,
            translations="{}",
            is_ai_generated=False,
            version=1,
            created_by=current_user.id
        )
        db.add(adhoc_tpl)
        db.commit()
        db.refresh(adhoc_tpl)
        template_id = adhoc_tpl.id

    override_pref = bool(camp_in.override_channel_preferences)
    target_count, reach_count = calculate_reach(db, camp_in.segment_id, camp_in.channel_preferences, override_pref)
    
    camp = Campaign(
        title=camp_in.title,
        description=camp_in.description,
        objective=camp_in.objective,
        campaign_type=camp_in.campaign_type,
        status="draft",
        segment_id=camp_in.segment_id,
        template_id=template_id,
        channel_preferences=serialize_list(camp_in.channel_preferences),
        override_channel_preferences=override_pref,
        target_audience_count=target_count,
        estimated_reach=reach_count,
        created_by=current_user.id,
        scheduled_at=camp_in.scheduled_at
    )
    
    db.add(camp)
    db.commit()
    db.refresh(camp)

    # Write CREATE audit log
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="CREATE",
        new_status="draft",
        changes=json.dumps({"title": camp.title})
    )
    db.add(audit)
    db.commit()

    return format_campaign_response(camp)

@router.put("/{id}", response_model=CampaignResponse)
def update_campaign(
    id: str,
    camp_in: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    # 1. State Machine transition RBAC check
    if camp_in.status is not None and camp_in.status != camp.status:
        # Validate transition is allowed by the state machine
        validate_status_transition(camp.status, camp_in.status)

        # Require admin or manager to transition to live state
        if camp_in.status in ["scheduled", "active"]:
            if current_user.role not in ["admin", "campaign_manager"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Permission denied: Only Campaign Managers and Admins can publish or schedule campaigns"
                )
            
            # Require segment and template before publishing
            target_seg = camp_in.segment_id if camp_in.segment_id is not None else camp.segment_id
            target_tpl = camp_in.template_id if camp_in.template_id is not None else camp.template_id
            if not target_seg or not target_tpl:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot publish campaign: Both Target Segment and Message Template must be set."
                )

            # --- Maker-Checker Approval Escalation ---
            # If the user is not an admin, and the campaign is emergency or has a target count >= 100,
            # force state to pending_approval when creating/editing drafts.
            template = db.query(Template).filter(Template.id == target_tpl).first()
            is_emergency = template and template.category == "emergency"
            
            channels_list = camp_in.channel_preferences if camp_in.channel_preferences is not None else deserialize_list(camp.channel_preferences)
            target_count, _ = calculate_reach(db, target_seg, channels_list)
            
            if current_user.role != "admin" and (is_emergency or target_count >= 100):
                if camp.status in ["draft", "pending_approval"]:
                    camp_in.status = "pending_approval"
            
            if camp_in.status == "scheduled":
                target_sched = camp_in.scheduled_at if camp_in.scheduled_at is not None else camp.scheduled_at
                if not target_sched:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot schedule campaign: A valid scheduled date/time is required."
                    )
                # Ensure date comparison handles IST (UTC+05:30) and UTC correctly
                if target_sched.tzinfo is not None:
                    sched_utc_naive = target_sched.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                else:
                    ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
                    sched_utc_naive = target_sched.replace(tzinfo=ist_tz).astimezone(datetime.timezone.utc).replace(tzinfo=None)

                if sched_utc_naive <= datetime.datetime.utcnow():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot schedule campaign: Scheduled time must be in the future (IST / UTC)."
                    )
                
    # 2. Verify relationships if updated
    if camp_in.segment_id is not None:
        if camp_in.segment_id:
            seg = db.query(Segment).filter(Segment.id == camp_in.segment_id).first()
            if not seg:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target segment not found")
            
    if camp_in.template_id is not None:
        if camp_in.template_id:
            tpl = db.query(Template).filter(Template.id == camp_in.template_id, Template.is_deleted == False).first()
            if not tpl:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
            
            # Clean up old shadow template if we are switching away from it to a normal template
            if camp.template_id and camp.template_id != camp_in.template_id:
                old_tpl = db.query(Template).filter(Template.id == camp.template_id).first()
                if old_tpl and old_tpl.title.startswith("Adhoc Template:"):
                    old_tpl.is_deleted = True
                    old_tpl.deleted_at = datetime.datetime.utcnow()
                    db.commit()

    # Handle custom message body/subject update logic
    if (camp_in.custom_body is not None) or (camp_in.custom_subject is not None):
        has_shadow_tpl = False
        if camp.template_id:
            # Check if current template is already a shadow template
            tpl = db.query(Template).filter(Template.id == camp.template_id).first()
            if tpl and tpl.title.startswith("Adhoc Template:"):
                if camp_in.custom_body is not None:
                    tpl.body_template = camp_in.custom_body
                if camp_in.custom_subject is not None:
                    tpl.subject_template = camp_in.custom_subject
                tpl.version += 1
                tpl.updated_at = datetime.datetime.utcnow()
                db.commit()
                has_shadow_tpl = True
                
        if not has_shadow_tpl and camp_in.custom_body:
            # Switched from reusable template to custom message, or new custom message -> create a new shadow template
            pref_channels = camp_in.channel_preferences if camp_in.channel_preferences is not None else deserialize_list(camp.channel_preferences)
            pref_channel = pref_channels[0] if pref_channels else "sms"
            tpl_title = camp_in.title if camp_in.title is not None else camp.title
            
            adhoc_tpl = Template(
                title=f"Adhoc Template: {tpl_title}",
                description=f"Auto-generated template for campaign '{tpl_title}'",
                category="awareness",
                channel=pref_channel,
                default_language="English",
                subject_template=camp_in.custom_subject,
                body_template=camp_in.custom_body,
                translations="{}",
                is_ai_generated=False,
                version=1,
                created_by=current_user.id
            )
            db.add(adhoc_tpl)
            db.commit()
            db.refresh(adhoc_tpl)
            camp.template_id = adhoc_tpl.id

    # 3. Track diff for audit logs
    changes_dict = {}
    if camp_in.title is not None and camp_in.title != camp.title:
        changes_dict["title"] = {"old": camp.title, "new": camp_in.title}
    if camp_in.description is not None and camp_in.description != camp.description:
        changes_dict["description"] = {"old": camp.description, "new": camp_in.description}
    if camp_in.objective is not None and camp_in.objective != camp.objective:
        changes_dict["objective"] = {"old": camp.objective, "new": camp_in.objective}
    if camp_in.campaign_type is not None and camp_in.campaign_type != camp.campaign_type:
        changes_dict["campaign_type"] = {"old": camp.campaign_type, "new": camp_in.campaign_type}
    if camp_in.segment_id is not None and camp_in.segment_id != camp.segment_id:
        changes_dict["segment_id"] = {"old": camp.segment_id, "new": camp_in.segment_id}
    if camp_in.template_id is not None and camp_in.template_id != camp.template_id:
        changes_dict["template_id"] = {"old": camp.template_id, "new": camp_in.template_id}
    if camp_in.channel_preferences is not None and camp_in.channel_preferences != deserialize_list(camp.channel_preferences):
        changes_dict["channel_preferences"] = {"old": deserialize_list(camp.channel_preferences), "new": camp_in.channel_preferences}
    if camp_in.scheduled_at is not None and camp_in.scheduled_at != camp.scheduled_at:
        changes_dict["scheduled_at"] = {"old": camp.scheduled_at.isoformat() if camp.scheduled_at else None, "new": camp_in.scheduled_at.isoformat() if camp_in.scheduled_at else None}

    # 4. Apply edits
    if camp_in.segment_id is not None:
        camp.segment_id = camp_in.segment_id if camp_in.segment_id else None
    if camp_in.template_id is not None:
        camp.template_id = camp_in.template_id if camp_in.template_id else None
    if camp_in.title is not None:
        camp.title = camp_in.title
    if camp_in.description is not None:
        camp.description = camp_in.description
    if camp_in.objective is not None:
        camp.objective = camp_in.objective
    if camp_in.campaign_type is not None:
        camp.campaign_type = camp_in.campaign_type
        
    old_status = camp.status
    new_status = camp_in.status
    status_changed = False
    if new_status is not None and new_status != old_status:
        camp.status = new_status
        status_changed = True
        
    if camp_in.channel_preferences is not None:
        camp.channel_preferences = serialize_list(camp_in.channel_preferences)
    if camp_in.override_channel_preferences is not None:
        camp.override_channel_preferences = camp_in.override_channel_preferences
    if camp_in.scheduled_at is not None:
        camp.scheduled_at = camp_in.scheduled_at
        
    # Re-evaluate numbers
    channels = deserialize_list(camp.channel_preferences)
    override_pref = bool(camp.override_channel_preferences)
    target_count, reach_count = calculate_reach(db, camp.segment_id, channels, override_pref)
    camp.target_audience_count = target_count
    camp.estimated_reach = reach_count
    
    # Audit log fields
    camp.updated_by = current_user.id
    camp.updated_at = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(camp)

    # Trigger real-time campaign delivery if transitioning to active
    if status_changed and new_status == "active":
        from app.services.dispatcher import dispatch_campaign
        dispatch_campaign(camp.id)


    # 5. Write audit entry for changes
    if status_changed:
        audit = AuditLog(
            user_id=current_user.id,
            campaign_id=camp.id,
            action="STATUS_CHANGE",
            old_status=old_status,
            new_status=new_status,
            changes=json.dumps(changes_dict) if changes_dict else None
        )
        db.add(audit)
        db.commit()
    elif changes_dict:
        audit = AuditLog(
            user_id=current_user.id,
            campaign_id=camp.id,
            action="UPDATE",
            changes=json.dumps(changes_dict)
        )
        db.add(audit)
        db.commit()
        
    return format_campaign_response(camp)

@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_campaign(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    camp.is_deleted = True
    camp.deleted_at = datetime.datetime.utcnow()
    camp.updated_by = current_user.id
    
    # Soft delete associated shadow template if present
    if camp.template_id:
        shadow = db.query(Template).filter(Template.id == camp.template_id).first()
        if shadow and shadow.title.startswith("Adhoc Template:"):
            shadow.is_deleted = True
            shadow.deleted_at = datetime.datetime.utcnow()
            db.commit()
    
    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="DELETE",
        changes=json.dumps({"title": camp.title})
    )
    db.add(audit)
    db.commit()
    return {"message": "Campaign soft deleted successfully", "id": id}

@router.get("/{id}/audit-logs", response_model=List[AuditLogResponse])
def get_campaign_audit_logs(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    logs = db.query(AuditLog).filter(AuditLog.campaign_id == id).order_by(AuditLog.timestamp.desc()).all()
    
    results = []
    for l in logs:
        results.append(AuditLogResponse(
            id=l.id,
            user_id=l.user_id,
            user_name=l.user.full_name if l.user else "System",
            campaign_id=l.campaign_id,
            action=l.action,
            old_status=l.old_status,
            new_status=l.new_status,
            changes=l.changes,
            timestamp=l.timestamp
        ))
    return results


@router.get("/{id}/delivery-summary", response_model=CampaignDeliverySummary)
def get_campaign_delivery_summary(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    logs = db.query(DeliveryLog).filter(DeliveryLog.campaign_id == id).all()
    total_logs = len(logs)
    delivered_count = sum(1 for l in logs if l.status in ["sent", "delivered", "read"])
    read_count = sum(1 for l in logs if l.status == "read")
    unique_recipients_reached = len(set(l.audience_id for l in logs if l.status in ["sent", "delivered", "read"]))
    
    from app.models import CampaignFeedback
    feedback_count = db.query(CampaignFeedback).filter(CampaignFeedback.campaign_id == id).count()
    
    target_count = camp.target_audience_count or 1
    delivery_rate_pct = round((delivered_count / total_logs * 100), 1) if total_logs > 0 else 0.0
    open_rate_pct = round((read_count / delivered_count * 100), 1) if delivered_count > 0 else 0.0
    feedback_participation_pct = round((feedback_count / target_count * 100), 1) if target_count > 0 else 0.0
    
    # Composite Effectiveness Index formula: Open Rate (35%) + Delivery Rate (35%) + Positive Sentiment / Feedback (30%)
    positive_feedbacks = db.query(CampaignFeedback).filter(
        CampaignFeedback.campaign_id == id,
        CampaignFeedback.feedback_type.in_(["helpful", "excellent"])
    ).count()
    pos_sentiment_pct = round((positive_feedbacks / feedback_count * 100), 1) if feedback_count > 0 else 0.0
    
    effectiveness_score = min(100, max(0, int(round(
        (open_rate_pct * 0.35) + (delivery_rate_pct * 0.35) + (pos_sentiment_pct * 0.30)
    ))))
    if total_logs == 0:
        effectiveness_score = 0

    overall_engagement_pct = round(
        (delivery_rate_pct * 0.4) + (open_rate_pct * 0.4) + (min(feedback_participation_pct * 5, 100) * 0.2),
        1
    )

    participation_count = feedback_count
    participation_rate = feedback_participation_pct

    return CampaignDeliverySummary(
        id=camp.id,
        title=camp.title,
        status=camp.status,
        target_count=camp.target_audience_count,
        sent_count=camp.sent_count,
        failed_count=camp.failed_count,
        total_dispatches=total_logs,
        unique_recipients_reached=unique_recipients_reached,
        delivered_count=delivered_count,
        read_count=read_count,
        delivery_rate_pct=delivery_rate_pct,
        open_rate_pct=open_rate_pct,
        feedback_participation_pct=feedback_participation_pct,
        overall_engagement_pct=overall_engagement_pct,
        effectiveness_score=effectiveness_score,
        participation_count=participation_count,
        participation_rate=participation_rate,
        dispatched_at=camp.dispatched_at
    )


@router.post("/{id}/retry-failed")
def retry_failed_campaign_deliveries(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """
    Retry all failed delivery log entries for a given campaign.
    """
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    failed_logs = db.query(DeliveryLog).filter(
        DeliveryLog.campaign_id == id,
        DeliveryLog.status == "failed"
    ).all()

    if not failed_logs:
        return {
            "message": "No failed delivery logs found for retry",
            "retried_count": 0,
            "campaign_id": id
        }

    from app.services.dispatcher import retry_failed_deliveries
    retry_failed_deliveries(id)

    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="RETRY_FAILED_DELIVERIES",
        old_status=camp.status,
        new_status=camp.status,
        changes=json.dumps({"failed_count": len(failed_logs), "note": "Triggered manual delivery retry"})
    )
    db.add(audit)
    db.commit()

    return {
        "message": f"Successfully queued retry for {len(failed_logs)} failed delivery logs.",
        "retried_count": len(failed_logs),
        "campaign_id": id
    }



@router.get("/{id}/participation-metrics")
def get_campaign_participation_metrics(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """
    Get detailed aggregated survey/event participation & engagement metrics for a campaign.
    """
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    logs = db.query(DeliveryLog).filter(DeliveryLog.campaign_id == id).all()
    total_dispatched = len(logs)

    status_counts = {"sent": 0, "delivered": 0, "read": 0, "failed": 0}
    channel_metrics = {}

    for l in logs:
        st = l.status if l.status in status_counts else "sent"
        status_counts[st] += 1

        ch = l.channel or "unknown"
        if ch not in channel_metrics:
            channel_metrics[ch] = {"total": 0, "delivered": 0, "read": 0, "failed": 0}
        channel_metrics[ch]["total"] += 1
        if l.status in ["sent", "delivered", "read"]:
            channel_metrics[ch]["delivered"] += 1
        if l.status == "read":
            channel_metrics[ch]["read"] += 1
        if l.status == "failed":
            channel_metrics[ch]["failed"] += 1

    delivered_total = status_counts["sent"] + status_counts["delivered"] + status_counts["read"]
    read_total = status_counts["read"]

    from app.models import CampaignFeedback
    feedbacks = db.query(CampaignFeedback).filter(CampaignFeedback.campaign_id == id).all()
    feedback_count = len(feedbacks)
    
    avg_rating = round(sum(f.rating for f in feedbacks) / feedback_count, 2) if feedback_count > 0 else 0.0
    
    type_breakdown = {}
    for f in feedbacks:
        type_breakdown[f.feedback_type] = type_breakdown.get(f.feedback_type, 0) + 1

    target_pop = camp.target_audience_count or total_dispatched or 1

    delivery_rate_pct = round((delivered_total / total_dispatched * 100), 1) if total_dispatched > 0 else 0.0
    open_rate_pct = round((read_total / delivered_total * 100), 1) if delivered_total > 0 else 0.0
    participation_pct = round((feedback_count / target_pop * 100), 1) if target_pop > 0 else 0.0

    overall_engagement_index = round(
        (delivery_rate_pct * 0.35) + (open_rate_pct * 0.35) + (min(participation_pct * 5, 100) * 0.3),
        1
    )

    return {
        "campaign_id": camp.id,
        "campaign_title": camp.title,
        "status": camp.status,
        "target_audience_count": camp.target_audience_count,
        "total_dispatched": total_dispatched,
        "delivered_count": delivered_total,
        "read_count": read_total,
        "failed_count": status_counts["failed"],
        "delivery_rate_pct": delivery_rate_pct,
        "open_rate_pct": open_rate_pct,
        "feedback_responses_count": feedback_count,
        "feedback_participation_pct": participation_pct,
        "average_user_rating": avg_rating,
        "feedback_type_breakdown": type_breakdown,
        "overall_engagement_pct": overall_engagement_index,
        "channel_metrics": channel_metrics,
        "dispatched_at": camp.dispatched_at.isoformat() if camp.dispatched_at else None
    }


@router.get("/{id}/delivery-logs", response_model=List[DeliveryLogResponse])
def get_campaign_delivery_logs(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    logs = db.query(DeliveryLog).filter(DeliveryLog.campaign_id == id).order_by(DeliveryLog.sent_at.desc()).all()
    
    results = []
    for l in logs:
        # Resolve audience name safely
        aud_name = "Unknown Recipient"
        if l.audience:
            aud_name = f"{l.audience.first_name} {l.audience.last_name}"
            
        results.append(DeliveryLogResponse(
            id=l.id,
            campaign_id=l.campaign_id,
            audience_id=l.audience_id,
            audience_name=aud_name,
            channel=l.channel,
            status=l.status,
            recipient_info=l.recipient_info,
            error_message=l.error_message,
            sent_at=l.sent_at
        ))
    return results


# --- MAKER-CHECKER APPROVALS & CSV EXPORTS ---
from fastapi.responses import StreamingResponse
import io
import csv

@router.post("/{id}/approve", response_model=CampaignResponse)
def approve_campaign(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Admin approves a campaign that is pending approval. Moves it to scheduled (if scheduled_at in future) or active."""
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    if camp.status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Campaign is not pending approval")

    old_status = camp.status
    new_status = "active"
    if camp.scheduled_at:
        if camp.scheduled_at.tzinfo is not None:
            sched_utc_naive = camp.scheduled_at.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        else:
            ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
            sched_utc_naive = camp.scheduled_at.replace(tzinfo=ist_tz).astimezone(datetime.timezone.utc).replace(tzinfo=None)

        if sched_utc_naive > datetime.datetime.utcnow():
            new_status = "scheduled"

    camp.status = new_status
    camp.updated_by = current_user.id
    camp.updated_at = datetime.datetime.utcnow()
    
    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="STATUS_CHANGE",
        old_status=old_status,
        new_status=new_status,
        changes=json.dumps({"status": {"old": old_status, "new": new_status}, "note": "Approved by administrator"})
    )
    db.add(audit)
    db.commit()
    db.refresh(camp)

    # If it became active immediately, dispatch it!
    if new_status == "active":
        from app.services.dispatcher import dispatch_campaign
        dispatch_campaign(camp.id)

    return format_campaign_response(camp)


@router.post("/{id}/reject", response_model=CampaignResponse)
def reject_campaign(
    id: str,
    rejection_note: Dict[str, str], # Expects {"reason": "string"}
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Admin rejects a campaign that is pending approval. Moves it back to draft."""
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    if camp.status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Campaign is not pending approval")

    old_status = camp.status
    new_status = "draft"
    reason = rejection_note.get("reason", "No reason provided")

    camp.status = new_status
    camp.review_remark = reason
    camp.reviewer_id = current_user.id
    camp.updated_by = current_user.id
    camp.updated_at = datetime.datetime.utcnow()
    
    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="STATUS_CHANGE",
        old_status=old_status,
        new_status=new_status,
        changes=json.dumps({"status": {"old": old_status, "new": new_status}, "note": f"Rejected by administrator. Reason: {reason}"})
    )
    db.add(audit)
    db.commit()
    db.refresh(camp)

    return format_campaign_response(camp)


@router.post("/batch-approve")
def batch_approve_campaigns(
    payload: Dict[str, List[str]],
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Admin approves multiple pending campaigns in a single batch operation."""
    campaign_ids = payload.get("campaign_ids", [])
    if not campaign_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No campaign IDs provided for batch approval")
        
    campaigns = db.query(Campaign).filter(
        Campaign.id.in_(campaign_ids),
        Campaign.status == "pending_approval",
        Campaign.is_deleted == False
    ).all()

    if not campaigns:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending campaigns found matching the provided IDs")

    approved_campaigns = []
    for camp in campaigns:
        old_status = camp.status
        new_status = "active"
        if camp.scheduled_at:
            if camp.scheduled_at.tzinfo is not None:
                sched_utc_naive = camp.scheduled_at.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            else:
                ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
                sched_utc_naive = camp.scheduled_at.replace(tzinfo=ist_tz).astimezone(datetime.timezone.utc).replace(tzinfo=None)

            if sched_utc_naive > datetime.datetime.utcnow():
                new_status = "scheduled"

        camp.status = new_status
        camp.reviewer_id = current_user.id
        camp.updated_by = current_user.id
        camp.updated_at = datetime.datetime.utcnow()

        # Write audit log
        audit = AuditLog(
            user_id=current_user.id,
            campaign_id=camp.id,
            action="STATUS_CHANGE",
            old_status=old_status,
            new_status=new_status,
            changes=json.dumps({"status": {"old": old_status, "new": new_status}, "note": "Batch approved by administrator"})
        )
        db.add(audit)
        
        if new_status == "active":
            try:
                from app.services.dispatcher import dispatch_campaign
                dispatch_campaign(camp.id)
            except Exception as ex:
                logger.error(f"Error dispatching batch approved campaign {camp.id}: {ex}")

        approved_campaigns.append(camp)

    db.commit()
    for c in approved_campaigns:
        db.refresh(c)

    return {
        "message": f"Successfully approved {len(approved_campaigns)} campaign(s)",
        "approved_count": len(approved_campaigns),
        "approved_campaigns": [format_campaign_response(c) for c in approved_campaigns]
    }


@router.get("/{id}/export-delivery-logs")
def export_delivery_logs(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Export delivery logs for a campaign as CSV."""
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
    logs = db.query(DeliveryLog).filter(DeliveryLog.campaign_id == id).order_by(DeliveryLog.sent_at.desc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["Log ID", "Recipient Name", "Channel", "Status", "Recipient Info", "Error Message", "Sent At"])
    
    for l in logs:
        aud_name = f"{l.audience.first_name} {l.audience.last_name}" if l.audience else "Unknown"
        writer.writerow([
            l.id,
            aud_name,
            l.channel,
            l.status,
            l.recipient_info or "",
            l.error_message or "",
            l.sent_at.isoformat() if l.sent_at else ""
        ])
        
    output.seek(0)
    filename = f"delivery_logs_{id[:8]}.csv"
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
    }
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/audit-logs/export/all")
def export_audit_logs(
    campaign_id: Optional[str] = None,
    action_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Export all or filtered audit logs as CSV. Restricted to Administrators."""
    query = db.query(AuditLog)
    if campaign_id:
        query = query.filter(AuditLog.campaign_id == campaign_id)
    if action_type:
        query = query.filter(AuditLog.action == action_type)
        
    logs = query.order_by(AuditLog.timestamp.desc()).all()

    if search and search.strip():
        s = search.strip().lower()
        filtered_logs = []
        for l in logs:
            user_name = (l.user.full_name if l.user else "System").lower()
            user_email = (l.user.email if l.user else "System").lower()
            action_name = l.action.lower()
            changes_text = (l.changes or "").lower()
            if s in user_name or s in user_email or s in action_name or s in changes_text:
                filtered_logs.append(l)
        logs = filtered_logs

    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["Log ID", "User Name", "Email", "Action", "Campaign ID", "Old Status", "New Status", "Changes Details", "Timestamp"])
    
    for l in logs:
        user_name = l.user.full_name if l.user else "System"
        user_email = l.user.email if l.user else "System"
        writer.writerow([
            l.id,
            user_name,
            user_email,
            l.action,
            l.campaign_id or "",
            l.old_status or "",
            l.new_status or "",
            l.changes or "",
            l.timestamp.isoformat() if l.timestamp else ""
        ])
        
    output.seek(0)
    filename = "audit_logs_export.csv" if not action_type else f"audit_logs_{action_type.lower()}.csv"
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
    }
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


from pydantic import BaseModel

class CampaignReviewRequest(BaseModel):
    action: str  # "approve" or "reject"
    remark: Optional[str] = None

@router.get("/mine", response_model=List[CampaignResponse])
def get_my_submitted_campaigns(
    db: Session = Depends(get_db),
    current_user = Depends(require_any_authenticated)
):
    """Retrieve proposed campaigns submitted by the currently logged-in citizen."""
    camps = db.query(Campaign).filter(Campaign.created_by == current_user.id, Campaign.is_deleted == False).order_by(Campaign.created_at.desc()).all()
    return [format_campaign_response(c) for c in camps]


@router.post("/propose", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def propose_campaign(
    camp_in: CampaignCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_any_authenticated)
):
    """Allows citizens or authenticated users to propose public awareness campaigns. Set status to 'pending_review'."""
    # Verify segment and template if provided
    if camp_in.segment_id:
        seg = db.query(Segment).filter(Segment.id == camp_in.segment_id).first()
        if not seg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target segment not found")
            
    template_id = camp_in.template_id
    if template_id:
        tpl = db.query(Template).filter(Template.id == template_id, Template.is_deleted == False).first()
        if not tpl:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
            
    # Auto-generate shadow Template if custom body is provided
    if not template_id and camp_in.custom_body:
        pref_channel = camp_in.channel_preferences[0] if camp_in.channel_preferences else "sms"
        adhoc_tpl = Template(
            title=f"Adhoc Template: {camp_in.title}",
            description=f"Auto-generated template for proposed campaign '{camp_in.title}'",
            category="awareness",
            channel=pref_channel,
            default_language="English",
            subject_template=camp_in.custom_subject,
            body_template=camp_in.custom_body,
            translations="{}",
            is_ai_generated=False,
            version=1,
            created_by=current_user.id
        )
        db.add(adhoc_tpl)
        db.commit()
        db.refresh(adhoc_tpl)
        template_id = adhoc_tpl.id

    override_pref = bool(camp_in.override_channel_preferences)
    
    # Resolve calculate_reach from module level helpers
    from app.routes.campaign import calculate_reach
    target_count, reach_count = calculate_reach(db, camp_in.segment_id, camp_in.channel_preferences, override_pref)
    
    camp = Campaign(
        title=camp_in.title,
        description=camp_in.description,
        objective=camp_in.objective,
        campaign_type=camp_in.campaign_type,
        status="pending_review",  # initial review status
        segment_id=camp_in.segment_id,
        template_id=template_id,
        channel_preferences=serialize_list(camp_in.channel_preferences),
        override_channel_preferences=override_pref,
        target_audience_count=target_count,
        estimated_reach=reach_count,
        created_by=current_user.id,
        scheduled_at=camp_in.scheduled_at
    )
    
    db.add(camp)
    db.commit()
    db.refresh(camp)

    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="CREATE",
        new_status="pending_review",
        changes=json.dumps({"title": camp.title, "note": "Campaign proposed by citizen"})
    )
    db.add(audit)
    db.commit()

    return format_campaign_response(camp)


@router.post("/{id}/review", response_model=CampaignResponse)
def review_proposed_campaign(
    id: str,
    req: CampaignReviewRequest,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Allows administrators or campaign managers to review proposed campaigns."""
    camp = db.query(Campaign).filter(Campaign.id == id, Campaign.is_deleted == False).first()
    if not camp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposed campaign not found")
        
    if camp.status != "pending_review":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Campaign is not in pending_review status")

    action = req.action.lower()
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action: choose 'approve' or 'reject'")

    old_status = camp.status
    if action == "approve":
        # Move it to draft/scheduled status
        new_status = "draft"
        if camp.scheduled_at:
            new_status = "scheduled"
        camp.status = new_status
        camp.reviewer_id = current_user.id
        camp.review_remark = req.remark or "Approved by operator"
    else:
        # Reject
        if not req.remark or not req.remark.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rejection remark notes are mandatory")
        new_status = "rejected"
        camp.status = new_status
        camp.reviewer_id = current_user.id
        camp.review_remark = req.remark

    camp.updated_by = current_user.id
    camp.updated_at = datetime.datetime.utcnow()
    
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=camp.id,
        action="STATUS_CHANGE",
        old_status=old_status,
        new_status=new_status,
        changes=json.dumps({
            "status": {"old": old_status, "new": new_status},
            "reviewer_id": current_user.id,
            "remark": camp.review_remark
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(camp)
    return format_campaign_response(camp)

