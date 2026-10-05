"""
Indic AI Voice Bulletin Routes — Audio Speech Synthesis Endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
import os

from app.database import get_db
from app.models import Campaign, Poster
from app.auth import require_any_authenticated
from app.services.voice_service import (
    get_supported_languages,
    synthesize_voice_bulletin,
    CACHE_DIR
)

router = APIRouter(prefix="/api/voice", tags=["Voice Bulletin Engine"])


class VoiceSynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500, description="Text to convert to speech audio")
    language: Optional[str] = Field("hi", description="Language code or name (e.g. 'hi', 'en', 'bn', 'ta', 'Hindi')")
    gender: Optional[str] = Field("male", description="Voice gender model ('male' or 'female')")
    slow: Optional[bool] = Field(False, description="True for slow speech mode (rural/accessibility)")
    source_lang: Optional[str] = Field("en", description="Source language of the input text")


class VoiceSynthesizeResponse(BaseModel):
    audio_url: str
    filename: str
    translated_text: str
    language_code: str


@router.get("/languages", response_model=List[Dict[str, str]])
def list_supported_voice_languages():
    """Return all 23 supported official Indian languages & dialects with native script names."""
    return get_supported_languages()


@router.post("/synthesize", response_model=VoiceSynthesizeResponse)
def synthesize_speech(
    req: VoiceSynthesizeRequest,
    current_user = Depends(require_any_authenticated)
):
    """Synthesize input text into spoken audio bulletin in any of the 23 supported Indic languages."""
    try:
        filename, translated_text, lang_code = synthesize_voice_bulletin(
            text=req.text,
            target_lang=req.language or "hi",
            slow=req.slow or False,
            source_lang=req.source_lang or "en",
            gender=req.gender or "male"
        )
        return VoiceSynthesizeResponse(
            audio_url=f"/static/audio_cache/{filename}",
            filename=filename,
            translated_text=translated_text,
            language_code=lang_code
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis error: {str(e)}"
        )



@router.get("/bulletin/{campaign_id}")
def get_campaign_voice_bulletin(
    campaign_id: str,
    lang: str = Query("hi", description="Target language code (e.g., 'hi', 'en', 'bn', 'ta')"),
    slow: bool = Query(False, description="Playback speed mode"),
    db: Session = Depends(get_db)
):
    """Generate or retrieve cached audio bulletin for a specific campaign or emergency alert."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    text_to_speak = ""
    if campaign:
        text_to_speak = f"{campaign.title}. {campaign.description or ''}"
    else:
        # Check poster if campaign not found
        poster = db.query(Poster).filter(Poster.id == campaign_id).first()
        if poster:
            text_to_speak = f"{poster.title}. {poster.description or ''}"
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign or bulletin notice not found")

    try:
        filename, translated_text, lang_code = synthesize_voice_bulletin(
            text=text_to_speak,
            target_lang=lang,
            slow=slow
        )
        return {
            "campaign_id": campaign_id,
            "audio_url": f"/static/audio_cache/{filename}",
            "filename": filename,
            "translated_text": translated_text,
            "language_code": lang_code
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to synthesize campaign bulletin audio: {str(e)}"
        )


@router.get("/stream/{filename}")
def stream_audio_file(filename: str):
    """Stream audio MP3 file directly from cache."""
    # Prevent directory traversal by sanitizing the filename
    clean_filename = os.path.basename(filename)
    filepath = os.path.join(CACHE_DIR, clean_filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found")
    return FileResponse(filepath, media_type="audio/mpeg", filename=clean_filename)
