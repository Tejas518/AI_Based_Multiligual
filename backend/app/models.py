import datetime
import uuid
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)  # admin, campaign_manager, audience
    organization = Column(String(255), nullable=True)
    designation = Column(String(255), nullable=True)
    preferred_languages = Column(Text, nullable=True)  # JSON serialized array of strings, e.g., '["Hindi", "English"]'
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    templates = relationship("Template", back_populates="creator")
    created_campaigns = relationship("Campaign", foreign_keys="Campaign.created_by", back_populates="creator")
    updated_campaigns = relationship("Campaign", foreign_keys="Campaign.updated_by", back_populates="updater")
    feedback = relationship("CampaignFeedback", back_populates="user", cascade="all, delete-orphan")


class Audience(Base):
    __tablename__ = "audiences"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(20), nullable=True, index=True)
    preferred_languages = Column(Text, nullable=False)  # JSON serialized array of strings, e.g., '["Hindi", "English"]'
    occupation = Column(String(100), nullable=False, index=True)
    age = Column(Integer, nullable=False, index=True)
    gender = Column(String(10), nullable=False, index=True)
    state = Column(String(100), nullable=False, index=True)
    district = Column(String(100), nullable=False, index=True)
    city = Column(String(100), nullable=False)
    organization = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)
    designation = Column(String(255), nullable=True)
    preferred_channels = Column(Text, nullable=False)  # JSON serialized array of strings, e.g., '["email", "whatsapp"]'
    custom_fields = Column(Text, nullable=True)  # JSON serialized dictionary for dynamic properties
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


class Segment(Base):
    __tablename__ = "segments"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    filter_criteria = Column(Text, nullable=False)  # JSON serialized rules
    is_dynamic = Column(Boolean, default=True, nullable=False)
    estimated_size = Column(Integer, default=0, nullable=False)
    last_refreshed = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    campaigns = relationship("Campaign", back_populates="segment")


class Template(Base):
    __tablename__ = "templates"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    category = Column(String(50), nullable=False)  # emergency, awareness, education, announcement
    channel = Column(String(50), nullable=False)  # email, sms, whatsapp, push, website
    default_language = Column(String(50), nullable=False)
    subject_template = Column(Text, nullable=True)
    body_template = Column(Text, nullable=False)
    translations = Column(Text, nullable=True, default="{}")
    is_ai_generated = Column(Boolean, default=False, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    creator = relationship("User", back_populates="templates")
    campaigns = relationship("Campaign", back_populates="template")


class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    objective = Column(Text, nullable=True)
    campaign_type = Column(String(50), nullable=False)  # awareness_drive, emergency_alert, educational_notification, organizational_announcement
    status = Column(String(50), default="draft", nullable=False)  # draft, scheduled, active, completed, cancelled
    segment_id = Column(String(36), ForeignKey("segments.id"), nullable=True)
    template_id = Column(String(36), ForeignKey("templates.id"), nullable=True)
    channel_preferences = Column(Text, nullable=False)  # JSON serialized array of strings
    override_channel_preferences = Column(Boolean, default=False, nullable=True)
    target_audience_count = Column(Integer, default=0, nullable=False)
    estimated_reach = Column(Integer, default=0, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    updated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    scheduled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    
    # Real delivery tracking fields
    sent_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    dispatched_at = Column(DateTime, nullable=True)
    
    # Review details for citizen-submitted campaigns
    reviewer_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    review_remark = Column(Text, nullable=True)
    
    # Relationships
    segment = relationship("Segment", back_populates="campaigns")
    template = relationship("Template", back_populates="campaigns")
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_campaigns")
    updater = relationship("User", foreign_keys=[updated_by], back_populates="updated_campaigns")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    audit_logs = relationship("AuditLog", back_populates="campaign", cascade="all, delete-orphan")
    delivery_logs = relationship("DeliveryLog", back_populates="campaign", cascade="all, delete-orphan")
    feedback = relationship("CampaignFeedback", back_populates="campaign", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    campaign_id = Column(String(36), ForeignKey("campaigns.id"), nullable=True)
    action = Column(String(100), nullable=False)  # CREATE, UPDATE, STATUS_CHANGE, DELETE
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    changes = Column(Text, nullable=True)  # JSON representation of changed fields
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")
    campaign = relationship("Campaign", back_populates="audit_logs")


class DeliveryLog(Base):
    """Tracks every individual message delivery attempt."""
    __tablename__ = "delivery_logs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    campaign_id = Column(String(36), ForeignKey("campaigns.id"), nullable=False)
    audience_id = Column(String(36), ForeignKey("audiences.id"), nullable=False)
    channel = Column(String(50), nullable=False)       # email, whatsapp, sms, push, website
    status = Column(String(20), nullable=False)         # sent, failed, pending
    recipient_info = Column(String(255), nullable=True) # email address or phone number used
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="delivery_logs")
    audience = relationship("Audience")


class Blacklist(Base):
    """Stores unsubscribed/opt-out recipient values (emails or phone numbers)."""
    __tablename__ = "blacklist"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    type = Column(String(20), nullable=False)           # email or phone
    value = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class CampaignFeedback(Base):
    """Stores audience feedback and ratings for campaigns they received."""
    __tablename__ = "campaign_feedback"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    campaign_id = Column(String(36), ForeignKey("campaigns.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)             # 1-5 star rating
    comment = Column(Text, nullable=True)                # optional detailed feedback
    feedback_type = Column(String(50), nullable=False)   # helpful, not_relevant, too_frequent, confusing, excellent
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="feedback")
    user = relationship("User", back_populates="feedback")


class EmergencyContact(Base):
    """Allows audience members to send emergency contact requests to campaign managers."""
    __tablename__ = "emergency_contacts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    urgency = Column(String(20), nullable=False, default="normal")  # normal, urgent, critical
    status = Column(String(20), nullable=False, default="open")     # open, acknowledged, resolved
    admin_reply = Column(Text, nullable=True)
    replied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")


class SupportQuery(Base):
    """Allows users/audience members to send support/confusion queries to campaign managers."""
    __tablename__ = "support_queries"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="open")     # open, acknowledged, resolved
    admin_reply = Column(Text, nullable=True)
    replied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")


class CitizenMessage(Base):
    """Tracks direct citizen inbound messages and automatic outbound RAG replies."""
    __tablename__ = "citizen_messages"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    audience_id = Column(String(36), ForeignKey("audiences.id"), nullable=False)
    direction = Column(String(20), nullable=False)          # inbound or outbound
    channel = Column(String(50), nullable=False)            # whatsapp, sms, etc.
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    audience = relationship("Audience")


class Poster(Base):
    """Stores AI-generated public posters and warning flyers."""
    __tablename__ = "posters"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)
    tone = Column(String(50), nullable=False)
    language = Column(String(50), nullable=False)
    image_url = Column(Text, nullable=False)
    prompt_used = Column(Text, nullable=False)
    target_audience_ids = Column(Text, nullable=True)  # JSON-serialized array of targeted audience member IDs
    target_segment_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class OperatorMessage(Base):
    """Internal chat messages strictly between Admins and Campaign Managers."""
    __tablename__ = "operator_messages"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    sender_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    sender_name = Column(String(255), nullable=False)
    sender_role = Column(String(50), nullable=False)  # admin or campaign_manager
    channel = Column(String(50), default="general", nullable=False)  # general, urgent, announcements
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    
    sender = relationship("User")


class RumorFlag(Base):
    """Tracks active and suspected rumors flagged from citizen messages."""
    __tablename__ = "rumor_flags"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    claim_summary = Column(String(255), nullable=False)  # Short AI summary of the rumor
    category = Column(String(50), nullable=False)        # water, medical, disaster, general, etc.
    suspected_rumor_text = Column(Text, nullable=False) # Representative message body
    
    # Geolocation fields
    state = Column(String(100), nullable=True)
    district = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    pincode = Column(String(20), nullable=True)
    
    status = Column(String(50), default="pending", nullable=False)      # pending, verified_fake, verified_true, ignored
    virality_score = Column(Integer, default=1, nullable=False)          # Count of matching citizen reports
    
    official_fact_check = Column(Text, nullable=True)   # Official refuted response template
    campaign_id = Column(String(36), ForeignKey("campaigns.id"), nullable=True) # Linked neutralization campaign
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    campaign = relationship("Campaign")


class SOSReport(Base):
    __tablename__ = "sos_reports"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    report_type = Column(String(50), nullable=False)  # hazard, medical, fire, accident, other
    status = Column(String(50), default="reported", nullable=False)  # reported, acknowledged, resolved
    latitude = Column(String(30), nullable=True)
    longitude = Column(String(30), nullable=True)
    location_name = Column(String(255), nullable=True)
    reporter_name = Column(String(100), nullable=True)
    reporter_phone = Column(String(20), nullable=True)
    reporter_email = Column(String(255), nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    staff_reply = Column(Text, nullable=True)
    replied_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    replied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    
    # Relationships
    reporter = relationship("User", foreign_keys=[created_by])
    replier = relationship("User", foreign_keys=[replied_by])






