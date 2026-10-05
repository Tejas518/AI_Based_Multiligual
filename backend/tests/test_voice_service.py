"""
Unit tests for Indic AI Voice Bulletin Service and routes.
"""

import os
import pytest
from app.services.voice_service import (
    get_supported_languages,
    normalize_lang_code,
    synthesize_voice_bulletin,
    SUPPORTED_LANGUAGES
)


def test_supported_languages_count():
    """Verify that all 23 official Indian languages + English are registered."""
    langs = get_supported_languages()
    assert len(langs) == 23
    codes = {l["code"] for l in langs}
    assert "hi" in codes
    assert "en" in codes
    assert "bn" in codes
    assert "ta" in codes
    assert "te" in codes
    assert "mr" in codes
    assert "gu" in codes
    assert "pa" in codes
    assert "kn" in codes
    assert "ml" in codes
    assert "or" in codes
    assert "sa" in codes


def test_normalize_lang_code():
    """Test resolution of language codes and names."""
    assert normalize_lang_code("hi") == "hi"
    assert normalize_lang_code("Hindi") == "hi"
    assert normalize_lang_code("Bengali") == "bn"
    assert normalize_lang_code("Sanskrit") == "sa"
    assert normalize_lang_code("unknown_xyz") == "hi"


def test_synthesize_voice_bulletin():
    """Verify audio bulletin synthesis creates an MP3 file."""
    text = "Official Emergency Safety Notice. Please stay indoors during heavy rain."
    filename, translated, lang_code = synthesize_voice_bulletin(text, target_lang="hi", slow=False)
    
    assert filename.endswith(".mp3")
    assert lang_code == "hi"
    assert len(translated) > 0

    from app.services.voice_service import CACHE_DIR
    filepath = os.path.join(CACHE_DIR, filename)
    assert os.path.exists(filepath)
    assert os.path.getsize(filepath) > 0
