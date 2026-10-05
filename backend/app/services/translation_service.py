import logging
import requests
import json
import urllib.request
import urllib.parse
from app.config import settings

logger = logging.getLogger("commai.translation")

LANG_CODE_TO_NAME = {
    "hi": "Hindi", "en": "English", "bn": "Bengali", "ta": "Tamil",
    "te": "Telugu", "mr": "Marathi", "gu": "Gujarati", "pa": "Punjabi",
    "kn": "Kannada", "ml": "Malayalam", "or": "Odia", "as": "Assamese",
    "ur": "Urdu", "mai": "Maithili", "sat": "Santali", "ks": "Kashmiri",
    "ne": "Nepali", "kok": "Konkani", "sd": "Sindhi", "doi": "Dogri",
    "mni": "Manipuri", "brx": "Bodo", "sa": "Sanskrit"
}

NAME_TO_GTX_CODE = {
    "Hindi": "hi", "Bengali": "bn", "Tamil": "ta", "Telugu": "te",
    "Marathi": "mr", "Gujarati": "gu", "Punjabi": "pa", "Kannada": "kn",
    "Malayalam": "ml", "Odia": "or", "Assamese": "as", "Urdu": "ur",
    "Maithili": "hi", "Santali": "hi", "Kashmiri": "ur", "Nepali": "ne",
    "Konkani": "mr", "Sindhi": "sd", "Dogri": "hi", "Manipuri": "bn",
    "Bodo": "hi", "Sanskrit": "sa", "English": "en"
}


def _free_gtx_translate(text: str, target_lang_str: str) -> str:
    """Zero-key free Google Translate endpoint fallback."""
    target_code = "hi"
    if target_lang_str.lower() in LANG_CODE_TO_NAME:
        target_code = target_lang_str.lower()
    else:
        for name, code in NAME_TO_GTX_CODE.items():
            if name.lower() in target_lang_str.lower() or target_lang_str.lower() in name.lower():
                target_code = code
                break

    try:
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={target_code}&dt=t&q={urllib.parse.quote(text)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode('utf-8'))
            parts = [part[0] for part in data[0] if part and part[0]]
            translated = "".join(parts).strip()
            if translated:
                logger.info(f"[TRANSLATE] Free GTX translation succeeded for '{target_code}'")
                return translated
    except Exception as e:
        logger.warning(f"[TRANSLATE] Free GTX fallback error for '{target_lang_str}': {e}")

    return text


def _call_groq_api(api_key: str, text: str, target_language: str, source_language: str) -> str:
    """Call Groq Chat API for translation."""
    model = "llama-3.3-70b-versatile"
    fallback_model = "llama-3.1-8b-instant"

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    system_prompt = (
        "You are an expert translator specializing in government public communications, notices, and citizen alerts.\n"
        f"Translate the provided text from {source_language} to {target_language}.\n"
        "CRITICAL REQUIREMENT: Do NOT translate, modify, replace, or remove any placeholder variables enclosed in double-curly braces "
        "or single-curly braces (for example, {{first_name}}, {{last_name}}, {{city}}, {{occupation}}, {{organization}}, {{department}}, etc.). "
        "Keep them exactly as they are in the source text, retaining the braces and variable names.\n"
        "Only return the exact translated text. Do NOT include any introductions, explanations, notes, greetings, markdown blocks, or surrounding quotes."
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "temperature": 0.1,
        "max_tokens": 1024
    }

    response = requests.post(url, headers=headers, json=payload, timeout=8)
    if response.status_code != 200:
        logger.warning(f"[TRANSLATE] Groq {model} failed with {response.status_code}. Trying {fallback_model}...")
        payload["model"] = fallback_model
        response = requests.post(url, headers=headers, json=payload, timeout=8)

    if response.status_code == 200:
        data = response.json()
        translated = data["choices"][0]["message"]["content"].strip()
        if translated.startswith("```") and translated.endswith("```"):
            lines = translated.split("\n")
            if len(lines) >= 3:
                translated = "\n".join(lines[1:-1]).strip()
        if (translated.startswith('"') and translated.endswith('"')) or (translated.startswith("'") and translated.endswith("'")):
            translated = translated[1:-1].strip()
        return translated
    else:
        raise RuntimeError(f"Groq API error HTTP {response.status_code}: {response.text}")


def translate_text(text: str, target_language: str, source_language: str = "English") -> str:
    """
    Translate text from source_language to target_language using Groq, Gemini, or GTX fallbacks.
    Preserves placeholder variables like {{first_name}}.
    """
    if not text or not text.strip():
        return text

    clean_target = target_language.strip()
    clean_source = source_language.strip()

    # Resolve language code to full name if code was passed (e.g. 'hi' -> 'Hindi')
    if clean_target.lower() in LANG_CODE_TO_NAME:
        clean_target = LANG_CODE_TO_NAME[clean_target.lower()]

    if clean_target.lower() == clean_source.lower() or clean_target.lower() == "english":
        return text

    # Try Primary Groq Key
    if getattr(settings, "GROQ_API_KEY", None):
        try:
            return _call_groq_api(settings.GROQ_API_KEY, text, clean_target, clean_source)
        except Exception as e:
            logger.warning(f"[TRANSLATE] Primary Groq key failed: {e}")

    # Try Secondary Groq Key
    secondary_key = getattr(settings, "GROQ_API_KEY_SECONDARY", None)
    if secondary_key:
        try:
            return _call_groq_api(secondary_key, text, clean_target, clean_source)
        except Exception as e:
            logger.warning(f"[TRANSLATE] Secondary Groq key failed: {e}")

    # Ultimate zero-cost fallback: Free Google Translate API
    logger.info(f"[TRANSLATE] Falling back to free GTX translate engine for target '{clean_target}'...")
    return _free_gtx_translate(text, clean_target)

