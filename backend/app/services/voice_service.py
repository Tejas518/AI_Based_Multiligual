"""
Indic AI Voice Bulletin Service & Twilio Outbound Voice Call Service.

Provides:
1. Speech Synthesis & Indic Language Engine (22 scheduled Indian languages + English via gTTS / Edge-TTS).
2. Outbound Emergency Voice Calls via Twilio Voice REST API & TwiML.
"""

import os
import io
import re
import hashlib
import logging
import requests
import xml.etree.ElementTree as ET
from typing import Tuple, Dict, Any, List
try:
    from gtts import gTTS
except ImportError:
    gTTS = None
from dotenv import load_dotenv, find_dotenv

from app.services.translation_service import translate_text
from app.config import settings

logger = logging.getLogger("commai.voice")

# ---------------------------------------------------------------------------
# 1. INDIC AI VOICE BULLETIN ENGINE (gTTS / Edge-TTS)
# ---------------------------------------------------------------------------
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "audio_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

SUPPORTED_LANGUAGES: Dict[str, Dict[str, str]] = {
    "hi": {"name": "Hindi", "native": "हिंदी", "flag": "🇮🇳", "gtts_code": "hi"},
    "en": {"name": "English", "native": "English", "flag": "🇬🇧", "gtts_code": "en"},
    "bn": {"name": "Bengali", "native": "বাংলা", "flag": "🇮🇳", "gtts_code": "bn"},
    "ta": {"name": "Tamil", "native": "தமிழ்", "flag": "🇮🇳", "gtts_code": "ta"},
    "te": {"name": "Telugu", "native": "తెలుగు", "flag": "🇮🇳", "gtts_code": "te"},
    "mr": {"name": "Marathi", "native": "मराठी", "flag": "🇮🇳", "gtts_code": "mr"},
    "gu": {"name": "Gujarati", "native": "ગુજરાતી", "flag": "🇮🇳", "gtts_code": "gu"},
    "pa": {"name": "Punjabi", "native": "ਪੰਜਾਬੀ", "flag": "🇮🇳", "gtts_code": "pa"},
    "kn": {"name": "Kannada", "native": "ಕನ್ನಡ", "flag": "🇮🇳", "gtts_code": "kn"},
    "ml": {"name": "Malayalam", "native": "മലയാളം", "flag": "🇮🇳", "gtts_code": "ml"},
    "or": {"name": "Odia", "native": "ଓଡ଼ିଆ", "flag": "🇮🇳", "gtts_code": "or"},
    "as": {"name": "Assamese", "native": "অসমীয়া", "flag": "🇮🇳", "gtts_code": "bn"},
    "ur": {"name": "Urdu", "native": "اردو", "flag": "🇮🇳", "gtts_code": "ur"},
    "mai": {"name": "Maithili", "native": "मैथिली", "flag": "🇮🇳", "gtts_code": "hi"},
    "sat": {"name": "Santali", "native": "संथाली", "flag": "🇮🇳", "gtts_code": "hi"},
    "ks": {"name": "Kashmiri", "native": "कॉशुर", "flag": "🇮🇳", "gtts_code": "ur"},
    "ne": {"name": "Nepali", "native": "नेपाली", "flag": "🇮🇳", "gtts_code": "ne"},
    "kok": {"name": "Konkani", "native": "कोंकणी", "flag": "🇮🇳", "gtts_code": "mr"},
    "sd": {"name": "Sindhi", "native": "सिंधी", "flag": "🇮🇳", "gtts_code": "sd"},
    "doi": {"name": "Dogri", "native": "डोगरी", "flag": "🇮🇳", "gtts_code": "hi"},
    "mni": {"name": "Manipuri (Meitei)", "native": "मणिपुरी", "flag": "🇮🇳", "gtts_code": "bn"},
    "brx": {"name": "Bodo", "native": "बोडो", "flag": "🇮🇳", "gtts_code": "hi"},
    "sa": {"name": "Sanskrit", "native": "संस्कृतम्", "flag": "🇮🇳", "gtts_code": "hi"},
}


def get_supported_languages() -> List[Dict[str, str]]:
    """Return list of all 23 supported Indic languages."""
    return [
        {
            "code": code,
            "name": info["name"],
            "native": info["native"],
            "flag": info["flag"],
        }
        for code, info in SUPPORTED_LANGUAGES.items()
    ]


def normalize_lang_code(lang_input: str) -> str:
    """Resolve language input (code or name) to normalized language code."""
    if not lang_input:
        return "hi"
    clean = lang_input.strip().lower()
    if clean in SUPPORTED_LANGUAGES:
        return clean
    for code, info in SUPPORTED_LANGUAGES.items():
        if info["name"].lower() == clean or info["native"].lower() == clean:
            return code
    return "hi"


INDIC_NEURAL_VOICES = {
    "hi": {"male": "hi-IN-MadhurNeural", "female": "hi-IN-SwaraNeural"},
    "en": {"male": "en-IN-PrabhatNeural", "female": "en-IN-NeerjaNeural"},
    "bn": {"male": "bn-IN-BashkarNeural", "female": "bn-IN-TanishaaNeural"},
    "ta": {"male": "ta-IN-ValluvarNeural", "female": "ta-IN-PallaviNeural"},
    "te": {"male": "te-IN-MohanNeural", "female": "te-IN-ShrutiNeural"},
    "mr": {"male": "mr-IN-ManoharNeural", "female": "mr-IN-AarohiNeural"},
    "gu": {"male": "gu-IN-NiranjanNeural", "female": "gu-IN-DhwaniNeural"},
    "kn": {"male": "kn-IN-GaganNeural", "female": "kn-IN-SapnaNeural"},
    "ml": {"male": "ml-IN-MidhunNeural", "female": "ml-IN-SobhanaNeural"},
    "ur": {"male": "ur-IN-SalmanNeural", "female": "ur-IN-GulNeural"},
}


def _synthesize_edge_tts(text: str, voice_name: str, filepath: str) -> bool:
    """Synthesize speech using Microsoft Neural Edge-TTS."""
    try:
        import asyncio
        import edge_tts
        communicate = edge_tts.Communicate(text, voice_name)
        asyncio.run(communicate.save(filepath))
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            logger.info(f"[VOICE] Successfully synthesized neural audio using {voice_name}")
            return True
    except Exception as e:
        logger.warning(f"[VOICE] edge-tts error for {voice_name}: {e}")
    return False


def synthesize_voice_bulletin(
    text: str,
    target_lang: str = "hi",
    slow: bool = False,
    source_lang: str = "en",
    gender: str = "male"
) -> Tuple[str, str, str]:
    """
    Synthesize spoken audio for a bulletin text.
    
    Returns: (audio_filename, translated_text, resolved_lang_code)
    """
    if not text or not text.strip():
        raise ValueError("Cannot synthesize audio for empty text.")

    clean_gender = "female" if str(gender).lower() == "female" else "male"
    lang_code = normalize_lang_code(target_lang)
    lang_info = SUPPORTED_LANGUAGES.get(lang_code, SUPPORTED_LANGUAGES["hi"])
    gtts_lang = lang_info["gtts_code"]

    translated_text = text
    if lang_code != source_lang and lang_code != "en":
        try:
            t = translate_text(text, target_language=lang_info["name"], source_language=source_lang)
            if t and t.strip():
                translated_text = t
        except Exception as e:
            logger.warning(f"[VOICE] Translation error: {e}")

    text_hash = hashlib.md5(f"{translated_text}_{lang_code}_{clean_gender}_{slow}".encode("utf-8")).hexdigest()
    filename = f"bulletin_{lang_code}_{clean_gender}_{text_hash[:12]}.mp3"
    filepath = os.path.join(CACHE_DIR, filename)

    if not os.path.exists(filepath):
        logger.info(f"[VOICE] Synthesizing speech for language '{lang_info['name']}' ({lang_code}, {clean_gender})...")
        success = False
        
        if lang_code in INDIC_NEURAL_VOICES:
            voice_pair = INDIC_NEURAL_VOICES[lang_code]
            voice_name = voice_pair.get(clean_gender, voice_pair["male"])
            success = _synthesize_edge_tts(translated_text, voice_name, filepath)

        if not success:
            try:
                tts = gTTS(text=translated_text, lang=gtts_lang, slow=slow)
                tts.save(filepath)
            except Exception as ex:
                logger.error(f"[VOICE] gTTS synthesis error for {lang_code}: {ex}")
                try:
                    fallback_lang = "hi" if lang_code != "en" else "en"
                    tts = gTTS(text=translated_text, lang=fallback_lang, slow=slow)
                    tts.save(filepath)
                except Exception as ex_fallback:
                    logger.error(f"[VOICE] gTTS synthesis fallback failed: {ex_fallback}. Writing dummy offline audio file.")
                    with open(filepath, "wb") as f:
                        # Write minimal valid dummy bytes header
                        f.write(b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\x00" * 100)

    return filename, translated_text, lang_code


# ---------------------------------------------------------------------------
# 2. TWILIO OUTBOUND EMERGENCY VOICE CALL SERVICE
# ---------------------------------------------------------------------------
def clean_phone_number(phone: str) -> str:
    """Format raw phone string into clean digit format with country code."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) == 10:
        return "91" + digits
    return digits


def get_voice_language_config(lang: str = "Hindi") -> Tuple[str, str]:
    """
    Map target language name to Twilio TTS Voice & Language specifiers.
    Returns (voice_name, language_code).
    """
    lang_lower = (lang or "").strip().lower()

    if any(k in lang_lower for k in ["hindi", "hi"]):
        return "Polly.Aditi", "hi-IN"
    elif any(k in lang_lower for k in ["tamil", "ta"]):
        return "Polly.Aditi", "ta-IN"
    elif any(k in lang_lower for k in ["telugu", "te"]):
        return "Polly.Aditi", "te-IN"
    elif any(k in lang_lower for k in ["marathi", "mr"]):
        return "Polly.Aditi", "mr-IN"
    elif any(k in lang_lower for k in ["bengali", "bn"]):
        return "Polly.Aditi", "bn-IN"
    elif any(k in lang_lower for k in ["gujarati", "gu"]):
        return "Polly.Aditi", "gu-IN"
    elif any(k in lang_lower for k in ["kannada", "kn"]):
        return "Polly.Aditi", "kn-IN"
    elif any(k in lang_lower for k in ["malayalam", "ml"]):
        return "Polly.Aditi", "ml-IN"
    else:
        return "Polly.Raveena", "en-IN"


def generate_twiml(message: str, lang: str = "Hindi") -> str:
    """
    Generate TwiML XML instructions for Twilio Text-to-Speech playback.
    Optimized for prominent campaign alert announcement and trial account keypress handling.
    """
    voice, lang_code = get_voice_language_config(lang)
    
    clean_msg = (
        message.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
        .strip()
    )

    alert_intro = "Attention! Official CommAI Emergency Public Notice." if lang_code.startswith("en") else "सावधान! आधिकारिक सार्वजनिक सुरक्षा चेतावनी।"

    twiml = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<Response>'
        f'<Pause length="5"/>'
        f'<Say voice="{voice}" language="{lang_code}">{alert_intro} {clean_msg}</Say>'
        f'<Gather numDigits="1" timeout="8">'
        f'<Say voice="{voice}" language="{lang_code}">{clean_msg}</Say>'
        f'</Gather>'
        f'<Pause length="2"/>'
        f'<Say voice="{voice}" language="{lang_code}">{clean_msg}</Say>'
        f'<Pause length="1"/>'
        f'<Say voice="{voice}" language="{lang_code}">Thank you for listening. Goodbye.</Say>'
        f'</Response>'
    )

    return twiml



def send_voice_call(to_phone: str, message: str, lang: str = "Hindi") -> Tuple[bool, str]:
    """
    Dispatch an outbound Twilio Voice call using Text-to-Speech playback.
    """
    load_dotenv(find_dotenv(), override=True)

    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID") or getattr(settings, "TWILIO_ACCOUNT_SID", "")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN") or getattr(settings, "TWILIO_AUTH_TOKEN", "")
    twilio_phone = os.getenv("TWILIO_PHONE_NUMBER") or getattr(settings, "TWILIO_PHONE_NUMBER", "")

    if not twilio_sid or not twilio_token or not twilio_phone:
        logger.warning("[VOICE] Twilio credentials not configured. Returning mock call status.")
        logger.info(f"[VOICE MOCK] To: {to_phone} | Language: {lang} | Message: {message[:80]}...")
        return True, "delivered_mock"

    clean_digits = clean_phone_number(to_phone)
    if not clean_digits:
        return False, "Invalid phone number format"

    formatted_to = "+" + clean_digits
    formatted_from = twilio_phone if twilio_phone.startswith("+") else "+" + twilio_phone

    twiml_payload = generate_twiml(message, lang)

    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Calls.json"
        payload = {
            "To": formatted_to,
            "From": formatted_from,
            "Twiml": twiml_payload
        }

        logger.info(f"[VOICE] Placing Twilio Voice call to {formatted_to} ({lang})...")
        resp = requests.post(url, data=payload, auth=(twilio_sid, twilio_token), timeout=12)

        if resp.status_code in [200, 201]:
            res_data = resp.json() if resp.headers.get("content-type") == "application/json" else {}
            call_sid = res_data.get("sid", "N/A")
            logger.info(f"[VOICE] Outbound call placed successfully! Call SID: {call_sid}")
            return True, ""
        else:
            err_data = resp.json() if resp.headers.get("content-type") == "application/json" else {}
            err_code = err_data.get("code")
            err_msg = err_data.get("message", f"HTTP {resp.status_code}: {resp.text}")

            if err_code == 21608:
                logger.warning(f"[VOICE TRIAL LIMIT] Recipient {formatted_to} is unverified in Twilio Trial account.")
                return True, "trial_unverified"

            logger.warning(f"[VOICE] Twilio Voice call failed ({err_code}): {err_msg}")
            return False, err_msg

    except Exception as ex:
        logger.error(f"[VOICE] Exception while dispatching voice call: {ex}")
        return False, str(ex)
