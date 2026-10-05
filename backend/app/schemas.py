from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

class CustomBaseModel(BaseModel):
    @field_validator(
        "created_at", "updated_at", "scheduled_at", "dispatched_at",
        "timestamp", "sent_at", "last_refreshed", "replied_at", "deleted_at",
        check_fields=False
    )
    @classmethod
    def serialize_naive_datetime(cls, v):
        if isinstance(v, datetime):
            if v.tzinfo is None:
                # Database stores naive UTC datetimes
                v = v.replace(tzinfo=timezone.utc)
            else:
                v = v.astimezone(timezone.utc)
        return v

    @field_validator("age", "target_audience_count", "estimated_reach", "sent_count", "failed_count", mode="before", check_fields=False)
    @classmethod
    def coerce_empty_numeric(cls, v):
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError:
                return v
        return v

# --- AUTH SCHEMAS ---

class UserBase(CustomBaseModel):
    email: str
    full_name: str
    role: str
    organization: Optional[str] = None
    designation: Optional[str] = None
    preferred_languages: Optional[List[str]] = Field(default_factory=list)

    @field_validator("preferred_languages", mode="before", check_fields=False)
    @classmethod
    def parse_preferred_languages(cls, v):
        if isinstance(v, str):
            try:
                import json
                return json.loads(v) if v else []
            except Exception:
                return []
        return v or []

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_username: Optional[str] = None
    occupation: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    preferred_channels: Optional[List[str]] = Field(default_factory=list)
    custom_fields: Optional[Dict[str, Any]] = Field(default_factory=dict)

class UserUpdate(CustomBaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    organization: Optional[str] = None
    designation: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6, description="New password (min 6 chars)")
    preferred_languages: Optional[List[str]] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_username: Optional[str] = None
    occupation: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    preferred_channels: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None

class UserResponse(UserBase):
    id: str
    is_active: bool
    is_deleted: Optional[bool] = False
    deleted_at: Optional[datetime] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_username: Optional[str] = None
    occupation: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    preferred_channels: Optional[List[str]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Token(CustomBaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(CustomBaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    user_id: Optional[str] = None

class OTPVerify(CustomBaseModel):
    email: EmailStr
    otp: str


# --- AUDIENCE SCHEMAS ---

class AudienceBase(CustomBaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: EmailStr
    phone: Optional[str] = ""
    preferred_languages: List[str] = Field(default_factory=list)
    occupation: str
    age: int = Field(..., ge=0, le=120)
    gender: str
    state: str
    district: str
    city: str
    organization: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    preferred_channels: List[str] = Field(default_factory=list)
    custom_fields: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_active: bool = True

class AudienceCreate(AudienceBase):
    @field_validator("phone")
    def validate_phone(cls, v):
        if not v or not v.strip():
            return ""
        # Allow numbers with optional country prefix like +91
        digits = "".join(filter(str.isdigit, v))
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Phone number must contain between 10 and 15 digits")
        return v

class AudienceUpdate(CustomBaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    preferred_languages: Optional[List[str]] = None
    occupation: Optional[str] = None
    age: Optional[int] = Field(None, ge=0, le=120)
    gender: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    preferred_channels: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class AudienceResponse(AudienceBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- SEGMENT SCHEMAS ---

class SegmentBase(CustomBaseModel):
    name: str
    description: Optional[str] = None
    filter_criteria: Dict[str, Any]  # Dictionary representing the filter logic (e.g. {"state": "UP", "age_gte": 40})
    is_dynamic: bool = True

class SegmentCreate(SegmentBase):
    pass

class SegmentUpdate(CustomBaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    filter_criteria: Optional[Dict[str, Any]] = None
    is_dynamic: Optional[bool] = None

class SegmentResponse(SegmentBase):
    id: str
    estimated_size: int
    last_refreshed: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# --- TEMPLATE SCHEMAS ---

class TemplateBase(CustomBaseModel):
    title: str
    description: Optional[str] = None
    category: str  # emergency, awareness, education, announcement
    channel: str  # email, sms, whatsapp, push, website
    default_language: str
    subject_template: Optional[str] = None
    body_template: str
    translations: Optional[str] = "{}"

class TemplateCreate(TemplateBase):
    pass

class TemplateUpdate(CustomBaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    channel: Optional[str] = None
    default_language: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    translations: Optional[str] = None

class TemplateResponse(TemplateBase):
    id: str
    is_ai_generated: bool
    version: int
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- CAMPAIGN SCHEMAS ---

class CampaignBase(CustomBaseModel):
    title: str
    description: Optional[str] = None
    objective: Optional[str] = None
    campaign_type: str  # awareness_drive, emergency_alert, educational_notification, organizational_announcement
    segment_id: Optional[str] = None
    template_id: Optional[str] = None
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None
    channel_preferences: List[str] = Field(default_factory=list)
    override_channel_preferences: Optional[bool] = False
    scheduled_at: Optional[datetime] = None

class CampaignCreate(CampaignBase):
    pass

class CampaignUpdate(CustomBaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    objective: Optional[str] = None
    campaign_type: Optional[str] = None
    status: Optional[str] = None  # draft, scheduled, active, completed, cancelled
    segment_id: Optional[str] = None
    template_id: Optional[str] = None
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None
    channel_preferences: Optional[List[str]] = None
    override_channel_preferences: Optional[bool] = None
    scheduled_at: Optional[datetime] = None

class CampaignResponse(CampaignBase):
    id: str
    status: str
    target_audience_count: int
    estimated_reach: int
    estimated_cost: float = 0.0
    sent_count: Optional[int] = 0
    failed_count: Optional[int] = 0
    dispatched_at: Optional[datetime] = None
    override_channel_preferences: Optional[bool] = False
    reviewer_id: Optional[str] = None
    review_remark: Optional[str] = None
    created_by: str
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class CampaignBatchApprove(CustomBaseModel):
    campaign_ids: List[str]


# --- STATS/DASHBOARD SCHEMAS ---

class DashboardStats(CustomBaseModel):
    total_audiences: int
    active_audiences: int
    total_managers: Optional[int] = 0
    total_segments: int
    draft_campaigns: int
    total_campaigns: int
    total_templates: int
    recent_activities: List[Dict[str, Any]]


# --- AUDIT LOG SCHEMAS ---

class AuditLogResponse(CustomBaseModel):
    id: str
    user_id: str
    user_name: str
    campaign_id: Optional[str] = None
    action: str
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    changes: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


# --- DELIVERY LOG SCHEMAS ---

class DeliveryLogResponse(CustomBaseModel):
    id: str
    campaign_id: str
    audience_id: str
    audience_name: str
    channel: str
    status: str
    recipient_info: Optional[str] = None
    error_message: Optional[str] = None
    sent_at: datetime

    class Config:
        from_attributes = True

class CampaignDeliverySummary(CustomBaseModel):
    id: str
    title: str
    status: str
    target_count: int
    sent_count: int
    failed_count: int
    total_dispatches: int = 0
    unique_recipients_reached: int = 0
    delivered_count: int = 0
    read_count: int = 0
    delivery_rate_pct: float = 0.0
    open_rate_pct: float = 0.0
    feedback_participation_pct: float = 0.0
    overall_engagement_pct: float = 0.0
    effectiveness_score: int = 0
    participation_count: int = 0
    participation_rate: float = 0.0
    dispatched_at: Optional[datetime] = None


# --- BLACKLIST SCHEMAS ---

class BlacklistCreate(CustomBaseModel):
    type: str  # "email" or "phone"
    value: str

class BlacklistResponse(CustomBaseModel):
    id: str
    type: str
    value: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- CAMPAIGN FEEDBACK SCHEMAS ---

class CampaignFeedbackCreate(CustomBaseModel):
    campaign_id: str
    rating: int = Field(..., ge=1, le=5, description="Star rating from 1 to 5")
    comment: Optional[str] = None
    feedback_type: str = Field(..., description="One of: helpful, not_relevant, too_frequent, confusing, excellent")

class CampaignFeedbackResponse(CustomBaseModel):
    id: str
    campaign_id: str
    campaign_title: Optional[str] = None
    user_id: str
    user_name: Optional[str] = None
    rating: int
    comment: Optional[str] = None
    feedback_type: str
    created_at: datetime

    class Config:
        from_attributes = True

class CampaignFeedbackSummary(CustomBaseModel):
    campaign_id: str
    campaign_title: str
    total_feedback: int
    average_rating: float
    rating_distribution: Dict[str, int]  # {"1": count, "2": count, ...}
    type_distribution: Dict[str, int]    # {"helpful": count, "confusing": count, ...}


# --- EMERGENCY CONTACT SCHEMAS ---

class EmergencyContactCreate(CustomBaseModel):
    subject: str = Field(..., min_length=5, max_length=255)
    message: str = Field(..., min_length=10)
    urgency: str = Field(default="normal", description="One of: normal, urgent, critical")

class EmergencyContactResponse(CustomBaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    subject: str
    message: str
    urgency: str
    status: str
    admin_reply: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class EmergencyContactReply(CustomBaseModel):
    admin_reply: str = Field(..., min_length=1)
    status: Optional[str] = Field(default="acknowledged", description="One of: open, acknowledged, resolved")


class ForgotPasswordReset(CustomBaseModel):
    email: EmailStr
    otp: str
    new_password: str = Field(..., min_length=6, description="Password must be at least 6 characters")


# --- SUPPORT QUERY SCHEMAS ---

class SupportQueryCreate(CustomBaseModel):
    subject: str = Field(..., min_length=5, max_length=255)
    message: str = Field(..., min_length=10)

class SupportQueryResponse(CustomBaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    subject: str
    message: str
    status: str
    admin_reply: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SupportQueryReply(CustomBaseModel):
    admin_reply: str = Field(..., min_length=1)
    status: Optional[str] = Field(default="acknowledged", description="One of: open, acknowledged, resolved")


# --- OPERATOR CHAT SCHEMAS ---

class OperatorMessageCreate(CustomBaseModel):
    message: str = Field(..., min_length=1)
    channel: Optional[str] = Field(default="general")

class OperatorMessageResponse(CustomBaseModel):
    id: str
    sender_id: str
    sender_name: str
    sender_role: str
    channel: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- RUMOR FLAG / FACT SHIELD SCHEMAS ---

class RumorFlagBase(CustomBaseModel):
    claim_summary: str
    category: str
    suspected_rumor_text: str
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    status: str = "pending"
    virality_score: int = 1
    official_fact_check: Optional[str] = None
    campaign_id: Optional[str] = None

class RumorFlagCreate(RumorFlagBase):
    pass

class RumorFlagUpdate(CustomBaseModel):
    claim_summary: Optional[str] = None
    category: Optional[str] = None
    suspected_rumor_text: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    status: Optional[str] = None
    virality_score: Optional[int] = None
    official_fact_check: Optional[str] = None
    campaign_id: Optional[str] = None

class RumorFlagResponse(RumorFlagBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- SOS EMERGENCY REPORT SCHEMAS ---

class SOSReportBase(CustomBaseModel):
    title: str
    description: str
    report_type: str
    latitude: Optional[Union[str, float]] = None
    longitude: Optional[Union[str, float]] = None
    location_name: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None
    reporter_email: Optional[str] = None

class SOSReportCreate(SOSReportBase):
    pass

class SOSReportTriage(CustomBaseModel):
    status: Optional[str] = None
    staff_reply: Optional[str] = None

class SOSReportResponse(SOSReportBase):
    id: str
    status: str
    created_by: Optional[str] = None
    staff_reply: Optional[str] = None
    replied_by: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True



