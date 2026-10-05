from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.auth import require_manager_or_higher
from app.services.translation_service import translate_text

router = APIRouter(prefix="/translate", tags=["Translation Service"])

class TranslationRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = "English"

class TranslationResponse(BaseModel):
    translated_text: str

@router.post("", response_model=TranslationResponse)
def translate(
    request: TranslationRequest,
    current_user = Depends(require_manager_or_higher)
):
    """
    Translate text interactively. Requires authentication (Communicator role or higher).
    """
    if not request.text or not request.text.strip():
        return TranslationResponse(translated_text="")
        
    translated = translate_text(
        text=request.text,
        target_language=request.target_language,
        source_language=request.source_language
    )
    
    return TranslationResponse(translated_text=translated)
