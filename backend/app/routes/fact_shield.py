from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime
import json
import uuid

from app.database import get_db
from app.models import RumorFlag, Segment, Campaign, Template, User, AuditLog, SupportQuery, EmergencyContact, CampaignFeedback
from app.schemas import RumorFlagResponse, RumorFlagUpdate
from app.auth import require_manager_or_higher
from app.services.dispatcher import dispatch_campaign
from app.routes.campaign import calculate_reach

router = APIRouter(prefix="/fact-shield", tags=["AI Fact Shield"])

@router.get("/rumors", response_model=List[RumorFlagResponse])
def list_flaged_rumors(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher)
):
    """List all flagged suspected rumors with optional status filtering."""
    query = db.query(RumorFlag)
    if status_filter:
        query = query.filter(RumorFlag.status == status_filter)
    
    return query.order_by(RumorFlag.virality_score.desc(), RumorFlag.created_at.desc()).all()


@router.get("/rumors/{id}", response_model=RumorFlagResponse)
def get_rumor_details(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher)
):
    """Retrieve details of a specific rumor."""
    rumor = db.query(RumorFlag).filter(RumorFlag.id == id).first()
    if not rumor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rumor flag not found")
    return rumor


@router.put("/rumors/{id}", response_model=RumorFlagResponse)
def update_rumor(
    id: str,
    rumor_in: RumorFlagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher)
):
    """Update details or manual classification of a rumor."""
    rumor = db.query(RumorFlag).filter(RumorFlag.id == id).first()
    if not rumor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rumor flag not found")

    for field, value in rumor_in.dict(exclude_unset=True).items():
        setattr(rumor, field, value)

    rumor.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(rumor)
    return rumor


from pydantic import BaseModel

class NeutralizeRequest(BaseModel):
    channels: List[str]


@router.post("/rumors/{id}/neutralize", response_model=dict)
def neutralize_rumor(
    id: str,
    payload: NeutralizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher)
):
    """
    Neutralize a rumor by automatically creating a localized targeted Segment and Campaign,
    and launching a multi-channel broadcast of the refutation update.
    """
    rumor = db.query(RumorFlag).filter(RumorFlag.id == id).first()
    if not rumor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rumor flag not found")

    if not rumor.official_fact_check:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Cannot neutralize rumor without an official fact check refutation text. Please edit the rumor first."
        )

    # 1. Resolve targeted channel preferences (defaults to SMS & Email)
    dispatch_channels = payload.channels or ["sms", "email"]

    # 2. Build geofenced segment filter criteria
    filter_rules = {"logic": "AND"}
    location_desc = "All Locations"
    
    if rumor.city:
        filter_rules["cities"] = [rumor.city]
        location_desc = f"City: {rumor.city}"
    elif rumor.district:
        filter_rules["districts"] = [rumor.district]
        location_desc = f"District: {rumor.district}"
    elif rumor.state:
        filter_rules["states"] = [rumor.state]
        location_desc = f"State: {rumor.state}"

    # 3. Create dynamic Segment in database
    unique_suffix = str(uuid.uuid4())[:8]
    segment_name = f"FactShield: {rumor.claim_summary[:30]} ({unique_suffix})"
    
    segment = Segment(
        name=segment_name,
        description=f"Auto-generated segment for neutralizing rumor in {location_desc}",
        filter_criteria=json.dumps(filter_rules),
        is_dynamic=True,
        last_refreshed=datetime.datetime.utcnow()
    )
    db.add(segment)
    db.commit()
    db.refresh(segment)

    # 4. Generate the shadow template for dispatch
    adhoc_template = Template(
        title=f"Adhoc Template: Fact Check refutation for '{rumor.claim_summary[:30]}'",
        description=f"Auto-generated refutation template",
        category="emergency",
        channel=dispatch_channels[0],
        default_language="English",
        subject_template=f"📢 Fact-Check: {rumor.claim_summary[:40]}",
        body_template=rumor.official_fact_check,
        translations="{}",
        is_ai_generated=True,
        version=1,
        created_by=current_user.id
    )
    db.add(adhoc_template)
    db.commit()
    db.refresh(adhoc_template)

    # Calculate reach
    target_count, reach_count = calculate_reach(db, segment.id, dispatch_channels, override_channel_preferences=False)

    # Fallback to broader reach if specific city filter yields 0 matches in current audience database
    if target_count == 0:
        if rumor.district and "cities" in filter_rules:
            filter_rules = {"districts": [rumor.district], "logic": "AND"}
            segment.filter_criteria = json.dumps(filter_rules)
            db.commit()
            target_count, reach_count = calculate_reach(db, segment.id, dispatch_channels, override_channel_preferences=False)

        if target_count == 0:
            filter_rules = {"logic": "AND"}
            segment.filter_criteria = json.dumps(filter_rules)
            db.commit()
            target_count, reach_count = calculate_reach(db, segment.id, dispatch_channels, override_channel_preferences=False)

    # 5. Create emergency campaign
    campaign = Campaign(
        title=f"🛡️ Fact Shield: {rumor.claim_summary[:40]}",
        description=f"Emergency warning neutralizing fake rumors: '{rumor.suspected_rumor_text[:100]}'",
        objective=f"Stop misinformation spread and clarify facts regarding '{rumor.claim_summary}' in {location_desc}",
        campaign_type="emergency_alert",
        status="active",  # set straight to active to trigger background dispatcher!
        segment_id=segment.id,
        template_id=adhoc_template.id,
        channel_preferences=json.dumps(dispatch_channels),
        override_channel_preferences=False,
        target_audience_count=target_count,
        estimated_reach=reach_count,
        created_by=current_user.id
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    # Log action in AuditLog
    audit = AuditLog(
        user_id=current_user.id,
        campaign_id=campaign.id,
        action="STATUS_CHANGE",
        old_status="draft",
        new_status="active",
        changes=json.dumps({"fact_shield_neutralization": rumor.id})
    )
    db.add(audit)

    # 6. Update the RumorFlag status and link to the campaign
    rumor.status = "verified_fake"
    rumor.campaign_id = campaign.id
    rumor.updated_at = datetime.datetime.utcnow()
    db.commit()

    # 7. Trigger the background delivery immediately
    dispatch_campaign(campaign.id)

    return {
        "status": "success",
        "message": f"Fact check campaign created and launched to {reach_count} citizens.",
        "campaign_id": campaign.id,
        "segment_id": segment.id,
        "target_count": reach_count
    }


@router.delete("/rumors/{id}", status_code=status.HTTP_200_OK)
def delete_rumor(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher)
):
    """Dismiss or ignore a rumor."""
    rumor = db.query(RumorFlag).filter(RumorFlag.id == id).first()
    if not rumor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rumor flag not found")

    rumor.status = "ignored"
    rumor.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Rumor has been dismissed."}


@router.post("/seed-demo", response_model=dict)
def seed_demo_data_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher)
):
    """Seed demo rumors and pending approval campaigns for showcase/demonstrations."""
    # 1. Seed Rumors
    # Clear existing demo rumors to avoid duplicates
    db.query(RumorFlag).delete()
    
    demo_rumors = [
        RumorFlag(
            claim_summary="Contaminated water supply in Sector 5",
            category="water",
            suspected_rumor_text="Urgent notice! The drinking water pipeline in Sector 5 is contaminated with sewage chemical leaks. Do not drink tap water!",
            state="Maharashtra",
            district="Pune",
            city="Pune",
            pincode="411001",
            status="pending",
            virality_score=14,
            official_fact_check="This rumor is false. The Municipal Water Works Department has verified that Sector 5 water filters are fully functional and water quality is within safe standards. Please rely only on official updates."
        ),
        RumorFlag(
            claim_summary="Bridge collapse near Ghats",
            category="disaster",
            suspected_rumor_text="Local WhatsApp groups say the old bridge connecting eastern ghats has cracked and collapsed. Avoid traveling there!",
            state="Uttar Pradesh",
            district="Varanasi",
            city="Varanasi",
            status="pending",
            virality_score=8,
            official_fact_check="Official notice: The Varanasi Traffic Police has confirmed that the Ghats bridge is fully stable. Routine maintenance check was completed this morning and traffic is moving normally. Do not spread panic."
        ),
        RumorFlag(
            claim_summary="School shutdown due to viral epidemic",
            category="medical",
            suspected_rumor_text="There is a new viral disease spreading in children and all schools in Lucknow are ordered to close from Monday.",
            state="Uttar Pradesh",
            district="Lucknow",
            city="Lucknow",
            status="verified_fake",
            virality_score=29,
            official_fact_check="The Department of Health and School Education confirms that no viral outbreak is present in Lucknow. All schools will remain open as per schedule. Please do not forward unverified notifications."
        ),
        RumorFlag(
            claim_summary="GPS microchip in currency notes",
            category="general",
            suspected_rumor_text="Check your wallet, the new notes contain a nano GPS tracking device that reports cash accumulation to income tax.",
            status="ignored",
            virality_score=3,
            official_fact_check="Factual clarification: RBI has clarified that Indian currency notes do not contain any GPS tracking microchips. This is a false rumor."
        )
    ]
    for r in demo_rumors:
        db.add(r)

    # 2. Seed a Campaign with status 'pending_approval' if none exists or generate one
    segment = db.query(Segment).first()
    template = db.query(Template).first()
    
    unique_id = str(uuid.uuid4())[:8]
    app_camp = Campaign(
        title=f"🚨 Emergency evacuation alert (Demo Approval - {unique_id})",
        description="Emergency awareness broadcast for low-lying rural coastal villages regarding flash flood warning.",
        objective="Evacuate people safely to high ground smart shelter centers before water rises.",
        campaign_type="emergency_alert",
        status="pending_approval",  # Populate Approvals queue!
        segment_id=segment.id if segment else None,
        template_id=template.id if template else None,
        channel_preferences=json.dumps(["sms", "whatsapp"]),
        override_channel_preferences=False,
        target_audience_count=120,
        estimated_reach=105,
        created_by=current_user.id
    )
    db.add(app_camp)

    # 3. Seed Support Queries
    db.query(SupportQuery).delete()
    riya = db.query(User).filter(User.email == "riyanshi.verma.5356@gmail.com").first()
    nidhi = db.query(User).filter(User.email == "nidhi140002@gmail.com").first()
    priya_user = db.query(User).filter(User.email == "audience@example.com").first()
    
    q_user_id = riya.id if riya else (priya_user.id if priya_user else current_user.id)
    n_user_id = nidhi.id if nidhi else (priya_user.id if priya_user else current_user.id)
    
    demo_queries = [
        SupportQuery(
            user_id=q_user_id,
            subject="Help with profile preferred language settings",
            message="I am trying to change my language preference to Hindi but the portal settings page says save successful but still displays English. Please check.",
            status="open"
        ),
        SupportQuery(
            user_id=n_user_id,
            subject="How to unsubscribe from daily SMS updates",
            message="The daily notifications are very helpful but I only want them on WhatsApp, not SMS. How do I disable SMS notifications?",
            status="open"
        )
    ]
    for q in demo_queries:
        db.add(q)

    # 4. Seed Emergency Contacts (SOS for Emergency Inbox and Sentiment Map)
    db.query(EmergencyContact).delete()
    demo_emergencies = [
        EmergencyContact(
            user_id=q_user_id,
            subject="Water level rising rapidly in residential compound",
            message="My house is located in a low-lying block. Water has entered our ground floor, need rescue services or evacuation support immediately!",
            urgency="critical",
            status="open"
        ),
        EmergencyContact(
            user_id=n_user_id,
            subject="Road blocked by fallen high-tension electricity pole",
            message="An electric pole has fallen across the main sector road due to heavy storm winds. Sparks are flying, need immediate fire/safety response team.",
            urgency="urgent",
            status="open"
        )
    ]
    for e in demo_emergencies:
        db.add(e)

    # 5. Seed Campaign Feedback to populate Feedback Sentiment Analytics
    db.query(CampaignFeedback).delete()
    camps = db.query(Campaign).filter(Campaign.status.in_(["active", "completed"])).all()
    for c in camps:
        db.add(CampaignFeedback(
            campaign_id=c.id,
            user_id=q_user_id,
            rating=5,
            comment="Extremely helpful advisory! Kept us safe during the heavy rain spells.",
            feedback_type="helpful"
        ))
        db.add(CampaignFeedback(
            campaign_id=c.id,
            user_id=n_user_id,
            rating=2,
            comment="The alert was useful but received it in Marathi whereas I selected Hindi as preference.",
            feedback_type="confusing"
        ))
        if priya_user:
            db.add(CampaignFeedback(
                campaign_id=c.id,
                user_id=priya_user.id,
                rating=4,
                comment="Great initiative by the disaster control room. Very clear warning layout.",
                feedback_type="excellent"
            ))

    db.commit()
    
    return {
        "status": "success",
        "message": "Successfully seeded 4 rumors, 1 pending campaign, 2 support queries, 2 emergencies, and campaign feedback metrics."
    }

