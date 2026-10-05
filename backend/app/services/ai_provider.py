import logging
import requests
import json
from app.config import settings

logger = logging.getLogger("commai.ai_provider")

def call_llm(
    system_prompt: str,
    user_content: str,
    temperature: float = 0.3,
    max_tokens: int = 2500,
    response_format: dict = None
) -> str | None:
    """
    Unified multi-provider AI model router.
    Attempts generation across xAI Grok, Groq (Primary & Secondary), Google Gemini, OpenAI, and Anthropic
    based on configured environment variables.
    Returns generated content string or None if all providers fail.
    """
    providers = []
    
    # 1. Grok (xAI Primary)
    if getattr(settings, "GROK_API_KEY", None):
        providers.append(("Grok", _call_grok_api))

    # 2. Groq (Primary)
    if getattr(settings, "GROQ_API_KEY", None):
        providers.append(("Groq", _call_groq_api))
        
    # 3. Groq-Secondary (Fallback)
    if getattr(settings, "GROQ_API_KEY_SECONDARY", None):
        providers.append(("Groq-Secondary", _call_groq_secondary_api))

    # 4. Google Gemini
    if getattr(settings, "GEMINI_API_KEY", None):
        providers.append(("Gemini", _call_gemini_api))
        
    # 5. OpenAI
    if getattr(settings, "OPENAI_API_KEY", None):
        providers.append(("OpenAI", _call_openai_api))
        
    # 6. Anthropic
    if getattr(settings, "ANTHROPIC_API_KEY", None):
        providers.append(("Anthropic", _call_anthropic_api))

    if not providers:
        logger.error("[AI-ROUTER] No AI provider API keys configured in settings.")
        return None

    # Try each configured provider in sequence
    for name, api_func in providers:
        try:
            logger.info(f"[AI-ROUTER] Attempting AI generation via {name}...")
            result = api_func(system_prompt, user_content, temperature, max_tokens, response_format)
            if result and result.strip():
                logger.info(f"[AI-ROUTER] Generation succeeded via {name}.")
                return result.strip()
            logger.warning(f"[AI-ROUTER] {name} returned empty result. Trying next provider...")
        except Exception as e:
            logger.error(f"[AI-ROUTER] Exception calling {name}: {e}")

    logger.error("[AI-ROUTER] All AI model providers failed.")
    return None


def _call_grok_api(system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    url = "https://api.x.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.GROK_API_KEY}",
        "Content-Type": "application/json"
    }
    models = ["grok-2-latest", "grok-beta"]
    last_err = None
    for model in models:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if response_format:
            payload["response_format"] = response_format

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=25)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            else:
                last_err = Exception(f"Grok API {model} returned code {resp.status_code}: {resp.text}")
                logger.warning(f"[AI-ROUTER] Grok model {model} failed. Trying next model...")
        except Exception as e:
            last_err = e
            logger.warning(f"[AI-ROUTER] Grok model {model} error: {e}")
            
    raise last_err if last_err else Exception("Grok failed")


def _call_gemini_api(system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    
    generation_config = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens
    }
    if response_format and response_format.get("type") == "json_object":
        generation_config["responseMimeType"] = "application/json"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_content}]
            }
        ],
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "generationConfig": generation_config
    }
    
    headers = {"Content-Type": "application/json"}
    resp = requests.post(url, json=payload, headers=headers, timeout=25)
    if resp.status_code == 200:
        data = resp.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            logger.error(f"[AI-ROUTER] Failed parsing Gemini response body: {data}")
            return None
    else:
        logger.warning(f"[AI-ROUTER] Gemini API returned status {resp.status_code}: {resp.text}")
        raise Exception(f"Gemini API returned code {resp.status_code}")


def _call_groq_api_with_key(key: str, system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    
    # Try llama-3.3-70b-versatile first, fallback to llama-3.1-8b-instant if it fails
    models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    
    last_err = None
    for model in models:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if response_format:
            payload["response_format"] = response_format

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=25)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            else:
                last_err = Exception(f"Groq API {model} returned code {resp.status_code}: {resp.text}")
                logger.warning(f"[AI-ROUTER] Groq model {model} failed. Trying next model...")
        except Exception as e:
            last_err = e
            logger.warning(f"[AI-ROUTER] Groq model {model} error: {e}")
            
    raise last_err if last_err else Exception("Groq failed")


def _call_groq_api(system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    return _call_groq_api_with_key(settings.GROQ_API_KEY, system_prompt, user_content, temperature, max_tokens, response_format)


def _call_groq_secondary_api(system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    return _call_groq_api_with_key(settings.GROQ_API_KEY_SECONDARY, system_prompt, user_content, temperature, max_tokens, response_format)


def _call_openai_api(system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    if response_format:
        payload["response_format"] = response_format

    resp = requests.post(url, json=payload, headers=headers, timeout=25)
    if resp.status_code == 200:
        return resp.json()["choices"][0]["message"]["content"]
    else:
        logger.warning(f"[AI-ROUTER] OpenAI API returned status {resp.status_code}: {resp.text}")
        raise Exception(f"OpenAI API returned code {resp.status_code}")


def _call_anthropic_api(system_prompt: str, user_content: str, temperature: float, max_tokens: int, response_format: dict) -> str | None:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    payload = {
        "model": "claude-3-5-sonnet-20241022",
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_content}
        ],
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    
    resp = requests.post(url, json=payload, headers=headers, timeout=25)
    if resp.status_code == 200:
        return resp.json()["content"][0]["text"]
    else:
        logger.warning(f"[AI-ROUTER] Anthropic API returned status {resp.status_code}: {resp.text}")
        raise Exception(f"Anthropic API returned code {resp.status_code}")
