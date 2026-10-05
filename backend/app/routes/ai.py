from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from typing import Optional, List
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Audience
from app.routes.audience import build_segment_filter_query
from app.services.nl_segment import parse_natural_language_filter, generate_segment_explanation
from app.auth import require_any_authenticated, require_manager_or_higher
from app.services.ai_service import (
    generate_campaign_content,
    optimize_content,
    translate_content,
    personalize_content,
    check_compliance_and_quality,
    plan_complete_campaign,
    refine_campaign_plan,
    generate_chat_reply,
    process_voice_command,
)

router = APIRouter(prefix="/ai", tags=["AI Content Engine"])

MAX_INPUT_CHARS = 6000


# ---------------------------------------------------------------------------
# Request / Response Schemas
# ---------------------------------------------------------------------------
class GenerateRequest(BaseModel):
    prompt: str
    category: Optional[str] = "awareness"
    channel: Optional[str] = "email"
    tone: Optional[str] = "formal"

    @validator("prompt")
    def prompt_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Prompt cannot be empty")
        if len(v) > MAX_INPUT_CHARS:
            raise ValueError(f"Prompt exceeds maximum length of {MAX_INPUT_CHARS} characters")
        return v.strip()

class GenerateResponse(BaseModel):
    subject: Optional[str] = ""
    body: Optional[str] = ""
    error: Optional[str] = None


class OptimizeRequest(BaseModel):
    text: str
    target_tone: Optional[str] = "formal"

    @validator("text")
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Text cannot be empty")
        if len(v) > MAX_INPUT_CHARS:
            raise ValueError(f"Text exceeds maximum length of {MAX_INPUT_CHARS} characters")
        return v.strip()

class OptimizeResponse(BaseModel):
    optimized_text: Optional[str] = ""
    error: Optional[str] = None


class TranslateRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = "English"

    @validator("text")
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Text cannot be empty")
        if len(v) > MAX_INPUT_CHARS:
            raise ValueError(f"Text exceeds maximum length of {MAX_INPUT_CHARS} characters")
        return v.strip()

class TranslateResponse(BaseModel):
    translated_text: Optional[str] = ""
    error: Optional[str] = None


class PersonalizeRequest(BaseModel):
    text: str
    audience_profile: Optional[str] = "general"
    communication_objective: Optional[str] = "awareness"

    @validator("text")
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Text cannot be empty")
        if len(v) > MAX_INPUT_CHARS:
            raise ValueError(f"Text exceeds maximum length of {MAX_INPUT_CHARS} characters")
        return v.strip()

class PersonalizeResponse(BaseModel):
    personalized_text: Optional[str] = ""
    error: Optional[str] = None


class ComplianceIssue(BaseModel):
    severity: str
    message: str

class ComplianceRequest(BaseModel):
    text: str
    category: Optional[str] = "awareness"

    @validator("text")
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Text cannot be empty")
        return v.strip()

class ComplianceResponse(BaseModel):
    score: int = 100
    char_count: Optional[int] = 0
    word_count: Optional[int] = 0
    placeholder_count: Optional[int] = 0
    issues: List[ComplianceIssue] = []
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/generate", response_model=GenerateResponse)
def ai_generate(
    request: GenerateRequest,
    current_user=Depends(require_any_authenticated),
):
    """Generate campaign subject + body from a text prompt."""
    result = generate_campaign_content(
        prompt=request.prompt,
        category=request.category,
        channel=request.channel,
        tone=request.tone,
    )
    return GenerateResponse(**result)


@router.post("/optimize", response_model=OptimizeResponse)
def ai_optimize(
    request: OptimizeRequest,
    current_user=Depends(require_manager_or_higher),
):
    """Rewrite text to match a target tone."""
    result = optimize_content(
        text=request.text,
        target_tone=request.target_tone,
    )
    return OptimizeResponse(**result)


@router.post("/translate", response_model=TranslateResponse)
def ai_translate(
    request: TranslateRequest,
    current_user=Depends(require_manager_or_higher),
):
    """Translate text into a target language."""
    result = translate_content(
        text=request.text,
        target_language=request.target_language,
        source_language=request.source_language,
    )
    return TranslateResponse(**result)


@router.post("/personalize", response_model=PersonalizeResponse)
def ai_personalize(
    request: PersonalizeRequest,
    current_user=Depends(require_manager_or_higher),
):
    """Personalize text for a specific audience profile."""
    result = personalize_content(
        text=request.text,
        audience_profile=request.audience_profile,
        communication_objective=request.communication_objective,
    )
    return PersonalizeResponse(**result)


@router.post("/check-compliance", response_model=ComplianceResponse)
def ai_check_compliance(
    request: ComplianceRequest,
    current_user=Depends(require_manager_or_higher),
):
    """Run offline compliance and quality audit on message text."""
    result = check_compliance_and_quality(
        text=request.text,
        category=request.category,
    )
    return ComplianceResponse(**result)


# --- Plan & Refine Request Schemas ---

class PlanRequest(BaseModel):
    prompt: str
    category: Optional[str] = "awareness_drive"
    target_language: Optional[str] = None

    @validator("prompt")
    def prompt_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Prompt cannot be empty")
        return v.strip()

class PlanRefineRequest(BaseModel):
    current_plan: dict
    instruction: str

    @validator("instruction")
    def instruction_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Instruction cannot be empty")
        return v.strip()


@router.post("/plan")
def ai_plan_campaign(
    request: PlanRequest,
    current_user=Depends(require_manager_or_higher),
):
    """Generate a complete structured campaign plan from a brief prompt."""
    result = plan_complete_campaign(
        brief=request.prompt,
        category_hint=request.category,
        target_language=request.target_language,
    )
    return result


@router.post("/plan/refine")
def ai_refine_campaign(
    request: PlanRefineRequest,
    current_user=Depends(require_manager_or_higher),
):
    """Refine an existing campaign plan JSON object based on prompt instructions."""
    import json
    try:
        plan_str = json.dumps(request.current_plan)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid current plan object")

    result = refine_campaign_plan(
        current_plan_str=plan_str,
        instruction=request.instruction,
    )
    return result


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []

@router.post("/chat")
def ai_chat(
    request: ChatRequest,
    current_user=Depends(require_any_authenticated),
):
    """Chat with the CommAI assistant helper."""
    history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
    reply = generate_chat_reply(message=request.message, history=history_dicts, user_role=current_user.role)
    return {"reply": reply}


class NLSegmentRequest(BaseModel):
    query: str

    @validator("query")
    def query_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Query cannot be empty")
        return v.strip()

@router.post("/nl-segment")
def ai_nl_segment(
    request: NLSegmentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_higher),
):
    """Convert natural language query into filter criteria and return matching audience count."""
    filter_criteria = parse_natural_language_filter(request.query)
    if not filter_criteria:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to parse natural language filter criteria. Please make your query more descriptive."
        )
    
    explanation = generate_segment_explanation(request.query, filter_criteria)
    
    # Calculate estimated audience size
    query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
    try:
        query = build_segment_filter_query(filter_criteria, query)
        size = query.count()
    except Exception:
        size = 0
        
    return {
        "filter_criteria": filter_criteria,
        "explanation": explanation,
        "estimated_size": size
    }


class VoiceCommandRequest(BaseModel):
    command: str
    active_context: Optional[dict] = None

    @validator("command")
    def command_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Voice command cannot be empty")
        return v.strip()


from app.models import Segment

@router.post("/voice-command")
def ai_voice_command(
    request: VoiceCommandRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_higher),
):
    """Process Admin/Manager Voice Command and return navigation target, pre-selected location/recipients, and spoken response."""
    user_name = getattr(current_user, "full_name", "Manager")
    user_role = getattr(current_user, "role", "campaign_manager")

    audiences = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True).all()
    recipient_names = [f"{a.first_name} {a.last_name}" for a in audiences]
    segments = db.query(Segment).all()
    segment_names = [s.name for s in segments]

    combined_recipients = list(dict.fromkeys(recipient_names + segment_names + ["All Citizens", "Educational Institutions", "Farmers", "Healthcare Workers", "Local Authorities"]))

    result = process_voice_command(
        prompt=request.command,
        user_role=user_role,
        user_name=user_name,
        known_recipients=combined_recipients,
        active_context=request.active_context
    )

    existing = result.get("recipients_list", [])
    result["recipients_list"] = list(dict.fromkeys(existing + combined_recipients))

    return result




