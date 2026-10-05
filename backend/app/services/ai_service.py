import logging
import re
import requests
from typing import List, Optional
from pydantic import BaseModel, Field
from app.config import settings

logger = logging.getLogger("commai.ai_service")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL_PRIMARY = "llama-3.3-70b-versatile"
MODEL_FALLBACK = "llama-3.1-8b-instant"

# ---------------------------------------------------------------------------
# Comprehensive Platform Knowledge — injected into all AI prompts
# ---------------------------------------------------------------------------
PLATFORM_KNOWLEDGE = """
=== CommAI Platform Reference (Authoritative) ===

CommAI is a government mass communication platform that enables organizations to broadcast campaigns 
and public alerts in 23 languages (the 22 Official Scheduled Languages of India + English) across Email, SMS, WhatsApp, Telegram, Push Notifications, 
and Web Broadcasts.

There are THREE user roles with different permissions and UI layouts:

--- ROLE 1: Audience / Citizen ---
Citizens have restricted access. They CANNOT create campaigns, templates, segments, or manage operator directories.
Their sidebar shows these sections:

  CORE DASHBOARD:
    • Dashboard ("Your Portal") — personal overview stats and quick links.
    • Live Bulletins — real-time emergency alert broadcast feed.

  AUDIENCE & INSIGHTS:
    • Campaign Feedback — view received campaigns and provide feedback ratings/comments.

  EMERGENCY OPERATIONS:
    • SOS Reports — submit and track emergency incident alerts.

  HELP DESK & CHAT:
    • Citizen RAG Chat — AI-powered chatbot for platform help and questions.

  PREFERENCES:
    • Settings — edit profile, change password, and customize channels/languages.

--- ROLE 2: Campaign Manager ---
Managers can compose broadcasts, organize templates, build target segments, compile posters, and triage emergencies.
Their sidebar shows these sections:

  CORE DASHBOARD:
    • Dashboard Overview — platform-wide metrics and stats.
    • Live Bulletins — real-time broadcast feed.

  CAMPAIGNS & BROADCASTS:
    • Campaign Planner — create and launch broadcasts (Emergency, Awareness, General) via a wizard.
    • Templates Library — manage templates with built-in AI generators and translation tools.
    • Approvals Queue — view pending approvals or checker reviews.
    • Poster Studio — AI-powered visual flyer design canvas.

  AUDIENCE & INSIGHTS:
    • Audience & Segments — configure demographic targeting.
    • Audience Directory — full list of registered audience users.
    • Sentiment Map — district-level feedback sentiment visualization.
    • Campaign Feedback — view citizen ratings and assistance queries.

  EMERGENCY OPERATIONS:
    • SOS Reports — track hazard reports (medical, fire, flood) with GPS coordinates.
    • Emergency Inbox — respond to citizen emergency messages with AI assistance.
    • AI Fact Shield — monitor rumors, verify claims, and deploy counter-campaigns.

  HELP DESK & CHAT:
    • Citizen RAG Chat — inspect chatbot conversations.
    • Support Queries — resolve customer help queries.
    • Operator Staff Chat — coordinate with other operators in real-time WebSockets.

  PREFERENCES:
    • Settings — configure SMTP, WhatsApp APIs, diagnostics, and daily limits.

--- ROLE 3: Admin ---
Admins have full access to all Campaign Manager panels, plus:

  SYSTEM GOVERNANCE:
    • Campaign Managers — manage campaign manager accounts.
    • Audit Logs — complete activity logs with CSV exporting.

=== KEY NAVIGATION RULES ===
• To submit an SOS / Incident Report (Citizen): Go to "SOS Reports" in the sidebar and fill the distress form.
• To submit an emergency message (Citizen): Go to "Campaign Feedback" → "🚨 Emergency Support" tab.
• To respond to emergencies (Manager/Admin): Go to "Emergency Inbox" in the sidebar under "Emergency Operations".
• To respond to support queries (Manager/Admin): Go to "Support Queries" under "Help Desk & Chat".
• To check rumors & fact checks (Manager/Admin): Go to "AI Fact Shield" under "Emergency Operations".
• To run diagnostics (Manager/Admin): Go to "Settings" under "Preferences".
• To view audit trails (Admin): Go to "Audit Logs" under "System Governance".
"""

PLACEHOLDER_GUARD = (
    "CRITICAL REQUIREMENT: Do NOT translate, modify, replace, or remove any "
    "placeholder variables enclosed in double-curly braces (for example, "
    "{{first_name}}, {{last_name}}, {{city}}, {{occupation}}, {{organization}}, "
    "{{department}}, etc.). Keep them exactly as they are in the source text, "
    "retaining the braces and variable names.\n"
    "CRITICAL SIGN-OFF RULE: Do NOT add bracketed placeholder signatures like '[Your Name]', '[आपका नाम]', "
    "'[Your Title]', '[Organization Name]', or '[Sender Name]' at the end of the text.\n"
)

OUTPUT_GUARD = (
    "Only return the exact output text. Do NOT include any introductions, "
    "explanations, notes, greetings, markdown blocks, or surrounding quotes."
)

# Structured prompt templates keyed by campaign category
CATEGORY_PROMPTS = {
    "awareness": (
        "You are drafting a public awareness campaign message for a government "
        "communication platform. The tone should be clear, informative, and "
        "engaging. Include a call-to-action that empowers the citizen."
    ),
    "emergency": (
        "You are drafting an urgent emergency alert for a government mass "
        "communication system. The tone must convey urgency and clarity. "
        "Include specific action items the citizen must take immediately. "
        "Keep sentences short and impactful."
    ),
    "education": (
        "You are drafting an educational notification for a government outreach "
        "platform. The tone should be informative, accessible, and supportive. "
        "Break complex topics into simple language."
    ),
    "announcement": (
        "You are drafting a formal government announcement. The tone should be "
        "professional, authoritative, and clear. Use structured sentences and "
        "maintain an official register."
    ),
}

TONE_INSTRUCTIONS = {
    "urgent": "Rewrite the text with maximum urgency. Use short imperative sentences, action-oriented language, and stress the time-sensitivity.",
    "empathetic": "Rewrite the text with warmth and empathy. Acknowledge the reader's difficulties and offer reassurance while keeping the core message intact.",
    "formal": "Rewrite the text in a formal, official tone suitable for government gazettes. Use complete sentences, passive voice where appropriate, and precise language.",
    "simplified": "Rewrite the text so that it can be easily understood by a reader with limited literacy. Use very short sentences, common words, and avoid jargon.",
}

AUDIENCE_PROFILES = {
    "healthcare_worker": "Adapt the message for healthcare professionals. Use medical terminology appropriately and reference clinical workflows.",
    "student": "Adapt the message for students (ages 15-25). Use relatable language, add context about how it affects their studies or campus life.",
    "rural_audience": "Adapt the message for rural communities. Use simple, everyday language. Reference agricultural or village life contexts where appropriate.",
    "senior_citizen": "Adapt the message for senior citizens (age 60+). Use larger conceptual framing, be respectful, avoid slang, and add reassurances.",
    "general": "Keep the message suitable for a general audience with diverse backgrounds.",
}

# Compliance rule checkers
SPAM_PHRASES = [
    "win free", "click here now", "limited time offer", "act now",
    "congratulations you have won", "cash prize", "100% free",
    "no obligation", "risk free", "double your", "earn extra cash",
    "make money fast", "be your own boss",
]

SENSITIVE_PHRASES = [
    "caste", "religion", "political party", "vote for",
    "anti-national", "terrorist",
]

MAX_RECOMMENDED_LENGTH = 5000


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
MODEL_LIST = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"]


def _call_groq(system_prompt: str, user_content: str, temperature: float = 0.3, max_tokens: int = 2500) -> str | None:
    """Delegates to the unified multi-provider AI model router."""
    from app.services.ai_provider import call_llm
    res = call_llm(system_prompt, user_content, temperature, max_tokens)
    if res:
        return _clean_output(res)
    return None


def _clean_output(text: str) -> str:
    """Strip stray markdown fences, wrapping quotes, or placeholder signatures at the end."""
    if not text:
        return ""
    if text.startswith("```") and text.endswith("```"):
        lines = text.split("\n")
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()

    # Remove trailing bracketed sign-offs like [Your Name], [आपका नाम], [Insert Name], [Company], etc.
    text = re.sub(
        r'[\r\n]+\s*(?:Regards|Sincerely|Warm regards|Best regards|Thanks|अभिनंदन|सधन्यवाद|शुभकामनाएं)?\s*,?\s*\[[^\]]{1,35}\]\s*$',
        '',
        text,
        flags=re.IGNORECASE
    )
    return text.strip()


def _clean_json_string(text: str) -> str:
    """Clean and repair common LLM JSON errors, especially unicode typos like \\u093i."""
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    
    # Extract JSON object substring matching outer braces
    match = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if match:
        cleaned = match.group(0)
    
    # Replace common LLM Devanagari unicode escape typos (like \u093i instead of \u093f)
    cleaned = cleaned.replace(r"\u093i", r"\u093f")
    cleaned = cleaned.replace(r"\u093I", r"\u093f")
    
    # Generic regex cleanup for other invalid \uXXXX where the 4th char is 'i' or 'I' (common typos)
    cleaned = re.sub(r'\\u([0-9a-fA-F]{3})i', r'\\u\1f', cleaned)
    cleaned = re.sub(r'\\u([0-9a-fA-F]{3})I', r'\\u\1f', cleaned)
    
    return cleaned


# ---------------------------------------------------------------------------
# 1. generate_campaign_content
# ---------------------------------------------------------------------------
def generate_campaign_content(
    prompt: str,
    category: str = "awareness",
    channel: str = "email",
    tone: str = "formal",
) -> dict:
    """
    Generate subject + body for a campaign message.
    Returns {"subject": str, "body": str} or {"error": str}.
    """
    category_guide = CATEGORY_PROMPTS.get(category, CATEGORY_PROMPTS["awareness"])
    tone_guide = TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["formal"])

    channel_note = ""
    if channel == "sms":
        channel_note = "The output is for SMS. Keep the body under 160 characters. No subject line needed."
    elif channel == "whatsapp":
        channel_note = "The output is for WhatsApp. Keep it conversational but concise."
    elif channel == "email":
        channel_note = "The output is for email. Provide a compelling subject line AND a detailed body."
    elif channel == "push":
        channel_note = "The output is for push notification. Keep it ultra-short (max 100 characters body)."

    system = (
        f"{category_guide}\n\n"
        f"Tone: {tone_guide}\n\n"
        f"Channel: {channel_note}\n\n"
        f"{PLACEHOLDER_GUARD}\n"
        "Include placeholder variables like {{first_name}} and {{city}} where contextually appropriate.\n\n"
        "Return your output in EXACTLY this format (no markdown, no extra text):\n"
        "SUBJECT: <subject line here>\n"
        "BODY: <body text here>\n\n"
        f"{OUTPUT_GUARD}"
    )

    result = _call_groq(system, f"Campaign brief: {prompt}", temperature=0.4, max_tokens=1500)
    if result is None:
        return {"error": "AI service is currently unavailable. Please try again later or write manually."}

    # Parse SUBJECT: and BODY: from the output
    subject = ""
    body = result
    subject_match = re.search(r"SUBJECT:\s*(.*?)(?:\nBODY:|\Z)", result, re.DOTALL | re.IGNORECASE)
    body_match = re.search(r"BODY:\s*(.*)", result, re.DOTALL | re.IGNORECASE)
    if subject_match:
        subject = subject_match.group(1).strip()
    if body_match:
        body = body_match.group(1).strip()

    return {"subject": subject, "body": body}


# ---------------------------------------------------------------------------
# 2. optimize_content
# ---------------------------------------------------------------------------
def optimize_content(text: str, target_tone: str = "formal") -> dict:
    """
    Rewrite text in the requested tone while preserving placeholders.
    Returns {"optimized_text": str} or {"error": str}.
    """
    tone_guide = TONE_INSTRUCTIONS.get(target_tone, TONE_INSTRUCTIONS["formal"])

    system = (
        f"You are a professional government communications editor.\n"
        f"Task: {tone_guide}\n\n"
        f"{PLACEHOLDER_GUARD}\n"
        f"{OUTPUT_GUARD}"
    )

    result = _call_groq(system, text, temperature=0.3, max_tokens=1500)
    if result is None:
        return {"error": "AI service is currently unavailable. Please try again later."}
    return {"optimized_text": result}


# ---------------------------------------------------------------------------
# 3. translate_content
# ---------------------------------------------------------------------------
def translate_content(
    text: str,
    target_language: str,
    source_language: str = "English",
) -> dict:
    """
    Translate text while preserving placeholders.
    Returns {"translated_text": str} or {"error": str}.
    """
    if target_language.strip().lower() == source_language.strip().lower():
        return {"translated_text": text}

    system = (
        "You are an expert translator specializing in government public communications.\n"
        f"Translate from {source_language} to {target_language}.\n\n"
        f"{PLACEHOLDER_GUARD}\n"
        f"{OUTPUT_GUARD}"
    )

    result = _call_groq(system, text, temperature=0.1, max_tokens=1500)
    if result is None:
        return {"error": "AI service is currently unavailable. Please try again later."}
    return {"translated_text": result}


# ---------------------------------------------------------------------------
# 4. personalize_content
# ---------------------------------------------------------------------------
def personalize_content(
    text: str,
    audience_profile: str = "general",
    communication_objective: str = "awareness",
) -> dict:
    """
    Adapt the message for a specific audience profile + communication objective.
    Returns {"personalized_text": str} or {"error": str}.
    """
    profile_guide = AUDIENCE_PROFILES.get(audience_profile, AUDIENCE_PROFILES["general"])
    objective_guide = CATEGORY_PROMPTS.get(communication_objective, CATEGORY_PROMPTS["awareness"])

    system = (
        "You are a government communications specialist adapting messages for specific audiences.\n\n"
        f"Target audience: {profile_guide}\n\n"
        f"Communication objective: {objective_guide}\n\n"
        f"{PLACEHOLDER_GUARD}\n"
        "Rewrite the provided text to suit this audience while preserving the core information.\n"
        f"{OUTPUT_GUARD}"
    )

    result = _call_groq(system, text, temperature=0.35, max_tokens=1500)
    if result is None:
        return {"error": "AI service is currently unavailable. Please try again later."}
    return {"personalized_text": result}


# ---------------------------------------------------------------------------
# 5. check_compliance_and_quality
# ---------------------------------------------------------------------------
def check_compliance_and_quality(text: str, category: str = "awareness") -> dict:
    """
    Locally audits text for common compliance issues. Returns a structured report.
    This runs entirely offline — no LLM call needed.
    """
    issues = []
    score = 100  # Start with a perfect score and deduct

    if not text or not text.strip():
        return {"score": 0, "issues": [{"severity": "error", "message": "Message body is empty."}]}

    lower_text = text.lower()

    # 1. Placeholder consistency
    placeholders = re.findall(r"\{\{(\w+)\}\}", text)
    unclosed = re.findall(r"\{\{[^}]*$", text, re.MULTILINE)
    if unclosed:
        issues.append({"severity": "error", "message": f"Found {len(unclosed)} unclosed placeholder braces."})
        score -= 15

    # Check for common broken placeholder patterns
    broken = re.findall(r"\{[^{]|[^}]\}", text)
    single_braces = [b for b in broken if "{{" not in b and "}}" not in b]
    # More targeted: look for single { or } that aren't part of doubles
    if re.search(r"(?<!\{)\{(?!\{)", text) or re.search(r"(?<!\})\}(?!\})", text):
        issues.append({"severity": "warning", "message": "Possible single-brace placeholder detected. Use double braces {{variable}}."})
        score -= 5

    # 2. Empty / duplicate placeholders
    if placeholders:
        seen = set()
        for p in placeholders:
            if p in seen:
                issues.append({"severity": "info", "message": f"Placeholder '{{{{{p}}}}}' appears multiple times."})
            seen.add(p)

    # 3. Excessive length
    char_count = len(text)
    word_count = len(text.split())
    if char_count > MAX_RECOMMENDED_LENGTH:
        issues.append({"severity": "warning", "message": f"Message is {char_count} characters. Recommended max is {MAX_RECOMMENDED_LENGTH}."})
        score -= 10

    # 4. Spam wording
    spam_found = [p for p in SPAM_PHRASES if p in lower_text]
    if spam_found:
        issues.append({"severity": "error", "message": f"Spam-like phrases detected: {', '.join(spam_found)}"})
        score -= 20

    # 5. Sensitive language
    sensitive_found = [p for p in SENSITIVE_PHRASES if p in lower_text]
    if sensitive_found:
        issues.append({"severity": "warning", "message": f"Potentially sensitive terms detected: {', '.join(sensitive_found)}"})
        score -= 15

    # 6. Readability (simple heuristic: average words per sentence)
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if sentences:
        avg_words_per_sentence = word_count / len(sentences)
        if avg_words_per_sentence > 30:
            issues.append({"severity": "info", "message": f"Average sentence length is {avg_words_per_sentence:.0f} words. Consider shortening sentences for readability."})
            score -= 5
    else:
        issues.append({"severity": "info", "message": "No clear sentence boundaries detected."})
        score -= 5

    # 7. Very short content
    if word_count < 5:
        issues.append({"severity": "warning", "message": "Message is very short. Consider adding more detail."})
        score -= 10

    # 8. ALL CAPS abuse
    words = text.split()
    caps_words = [w for w in words if w.isupper() and len(w) > 2]
    if len(caps_words) > max(3, len(words) * 0.3):
        issues.append({"severity": "warning", "message": "Excessive use of ALL CAPS. This may be perceived as shouting."})
        score -= 10

    # 9. Duplicate content (repeated phrases)
    ngram_size = 6
    if word_count >= ngram_size * 2:
        ngrams = [" ".join(words[i:i + ngram_size]) for i in range(len(words) - ngram_size + 1)]
        ngram_set = set()
        duplicates = set()
        for ng in ngrams:
            if ng in ngram_set:
                duplicates.add(ng)
            ngram_set.add(ng)
        if duplicates:
            issues.append({"severity": "info", "message": f"Possible duplicate content detected ({len(duplicates)} repeated phrases)."})
            score -= 5

    score = max(0, score)

    if not issues:
        issues.append({"severity": "success", "message": "Message passes all compliance checks."})

    return {
        "score": score,
        "char_count": char_count,
        "word_count": word_count,
        "placeholder_count": len(placeholders),
        "issues": issues,
    }


# ---------------------------------------------------------------------------
# 6. plan_complete_campaign
# ---------------------------------------------------------------------------
def plan_complete_campaign(brief: str, category_hint: str = "awareness_drive", target_language: str = None) -> dict:
    """
    Generate a complete, multi-step structured campaign plan using Groq LLM.
    Returns a structured dictionary matching our JSON schema.
    """
    import json

    valid_types = [
        "awareness_drive",
        "emergency_alert",
        "educational_notification",
        "organizational_announcement"
    ]

    category_mapped = "awareness_drive"
    for vt in valid_types:
        if vt in category_hint or category_hint in vt:
            category_mapped = vt
            break

    lang_mandate = ""
    if target_language and target_language.strip():
        lang_mandate = (
            f"STRICT TARGET LANGUAGE TRANSLATION MANDATE:\n"
            f"The user has explicitly selected target language: '{target_language.strip()}'.\n"
            f"Even if the user brief contains English words or phonetic transliteration (such as 'క్రియేట్ ఏ క్యాంపెయిన్ ఆన్ ఫ్లడ్' or 'create a campaign on flood'), you MUST TRANSLATE ALL CONCEPTS into PROPER, AUTHENTIC NATIVE VOCABULARY AND NATURAL GRAMMAR of {target_language.strip()}.\n"
            f"Do NOT output phonetic English transliteration in foreign scripts (e.g. do NOT write 'క్రియేట్' or 'క్యాంపెయిన్'). Use genuine native words (e.g. for Telugu use 'వరద అత్యవసర ప్రచారం', 'అవగాహన', 'భద్రతా సూచనలు').\n"
            f"Generate ALL text fields (campaign.title, campaign.objective, campaign.description, message.subject, message.body, delivery.schedule.reason, kpis.awareness_goal_description) strictly in native {target_language.strip()}.\n"
        )
    else:
        lang_mandate = (
            "CRITICAL LANGUAGE MATCHING REQUIREMENT:\n"
            "Detect the language of the user brief/prompt.\n"
            "If the brief/prompt is written or spoken in English, generate ALL content strictly in ENGLISH.\n"
            "If the brief/prompt is written or spoken in Hindi, generate content in HINDI.\n"
        )

    system_prompt = (
        "You are an expert Government Campaign Planner and Mass Communication strategist.\n"
        "Your task is to plan, write, audit, and estimate success metrics for a citizen communication campaign.\n"
        "You MUST return a JSON object ONLY. Do not wrap in markdown fences (like ```json), write notes, or introduce your text.\n"
        "\n"
        f"{lang_mandate}\n"
        "\n"
        "CRITICAL: Output Devanagari / Hindi or other non-ASCII text as RAW UTF-8 CHARACTERS (e.g., 'साफ', 'स्थिति', 'స్థानीय') when writing in non-English. Do NOT escape them as unicode sequences (do NOT use \\uXXXX or backslashes).\n"
        "\n"
        "JSON SCHEMA RULES:\n"
        "{\n"
        "  \"campaign\": {\n"
        "    \"title\": \"String (<60 chars) - Clear, catchy campaign title (e.g. Ludhiana Swachh Water 2026)\",\n"
        "    \"objective\": \"String (<150 chars) - Campaign goal\",\n"
        "    \"campaign_type\": \"One of: awareness_drive, emergency_alert, educational_notification, organizational_announcement\",\n"
        "    \"description\": \"String - Detailed campaign contextual description\"\n"
        "  },\n"
        "  \"message\": {\n"
        "    \"subject\": \"String - A concise message subject (for emails or push notifications)\",\n"
        "    \"body\": \"String - The main communication body copy. Include personalization placeholders (e.g., {{first_name}}, {{city}}, {{district}}) where appropriate.\"\n"
        "  },\n"
        "  \"delivery\": {\n"
        "    \"channels\": \"Array of strings (at least 2 from: email, sms, whatsapp, push, website)\",\n"
        "    \"audiences\": \"Array of strings (e.g. ['School Parents', 'Healthcare Workers', 'Farmers', 'General Public'] representing target demographics)\",\n"
        "    \"schedule\": {\n"
        "      \"time\": \"String (e.g. 09:00 AM, 02:30 PM)\",\n"
        "      \"day\": \"String (e.g. Tomorrow, Wednesday, Next Monday)\",\n"
        "      \"reason\": \"String - Briefly explain why this sending time is recommended for this demographic\"\n"
        "    }\n"
        "  },\n"
        "  \"kpis\": {\n"
        "    \"expected_reach_pct\": \"Integer between 1 and 100 - Estimated percentage of reachable members in segment\",\n"
        "    \"ctr_goal_pct\": \"Integer between 1 and 100 - Targeted Click-Through Rate or action response rate\",\n"
        "    \"delivery_goal_pct\": \"Integer between 1 and 100 - Targeted successful delivery percentage\",\n"
        "    \"awareness_goal_description\": \"String - Measurable goal statement\"\n"
        "  },\n"
        "  \"risks\": \"Array of objects. Each object has: {'severity': 'warning' | 'info' | 'error', 'message': 'String'}. Audit the drafted copy for length, missing emergency details, lack of local translation hints, or spelling/formatting issues.\",\n"
        "  \"metadata\": {\n"
        "    \"confidence\": \"Float between 0.0 and 1.0 (e.g. 0.95)\",\n"
        "    \"reasoning\": {\n"
        "      \"campaign_type\": \"Why this category was chosen\",\n"
        "      \"channels\": \"Why these delivery channels are recommended\"\n"
        "    },\n"
        "    \"suggestions\": \"Array of strings - Actionable advice (e.g. 'Translate to Punjabi', 'Add helpline phone number')\"\n"
        "  }\n"
        "}\n"
        "CRITICAL REQUIREMENT: Preserving Placeholders\n"
        "Do NOT translate, modify, or remove placeholder tags in double braces like {{first_name}} or {{city}}.\n"
        "Do NOT escape non-English characters with unicode escapes (like \\u093f). Output raw UTF-8 characters directly inside the JSON string."
    )

    user_content = f"Campaign Brief: {brief}\nCategory Hint: {category_mapped}"

    result = _call_groq(system_prompt, user_content, temperature=0.25, max_tokens=3000)

    if not result:
        lang_lower = (target_language or "").lower()
        if "hindi" in lang_lower or "हिन्दी" in brief or "हिंदी" in brief or "कैंपेन" in brief:
            title = f"{brief[:30]} अभियान 2026"
            obj = f"नागरिकों को {brief} के बारे में जागरूक करना"
            subj = f"महत्वपूर्ण सूचना: {brief[:40]}"
            body = f"प्रिय {{{{first_name}}}},\n\n{brief}। कृपया इस सूचना का ध्यान रखें और आवश्यक कदम उठाएं।\n\nधन्यवाद,\nकॉमएआई टीम"
        elif "telugu" in lang_lower or "తెలుగు" in brief:
            title = f"{brief[:30]} ప్రచారం 2026"
            obj = f"ప్రజలకు {brief} గురించి అవగాహన కల్పించడం"
            subj = f"ముఖ్యమైన సమాచారం: {brief[:40]}"
            body = f"హలో {{{{first_name}}}},\n\n{brief}. దయచేసి ఈ సమాచారాన్ని గమనించండి.\n\nధన్యవాదాలు,\nకామ్ ఏఐ బృందం"
        else:
            title = f"{brief[:30]} Drive 2026"
            obj = f"Raise public awareness regarding {brief}"
            subj = f"Important Notice: {brief[:40]}"
            body = f"Dear {{{{first_name}}}},\n\n{brief}. Please take note of this notice and follow guidelines.\n\nBest regards,\nCommAI Team"

        return {
            "campaign": {
                "title": title,
                "objective": obj,
                "campaign_type": category_mapped,
                "description": f"Targeted awareness drive for {brief}"
            },
            "message": {
                "subject": subj,
                "body": body
            },
            "delivery": {
                "channels": ["email", "sms", "whatsapp"],
                "audiences": ["General Public"],
                "schedule": {
                    "time": "09:00 AM",
                    "day": "Tomorrow",
                    "reason": "Optimal morning hours for public engagement"
                }
            },
            "kpis": {
                "expected_reach_pct": 85,
                "ctr_goal_pct": 25,
                "delivery_goal_pct": 98,
                "awareness_goal_description": f"Achieve public awareness for {brief}"
            },
            "risks": [
                {"severity": "info", "message": "Verify recipient phone numbers and contact details before dispatch."}
            ],
            "metadata": {
                "confidence": 0.9,
                "reasoning": {
                    "campaign_type": "Standard awareness drive category",
                    "channels": "Multi-channel dispatch for maximum reach"
                },
                "suggestions": ["Add local contact number", "Verify translated body copy"]
            }
        }

    try:
        cleaned = _clean_json_string(result)

        try:
            parsed = json.loads(cleaned, strict=False)
        except Exception:
            # Fallback JSON parsing for escaped quotes/newlines
            cleaned_repaired = cleaned.replace('\n', ' ').replace('\r', ' ')
            parsed = json.loads(cleaned_repaired, strict=False)
        if "campaign" in parsed and "campaign_type" in parsed["campaign"]:
            ctype = parsed["campaign"]["campaign_type"]
            if ctype not in valid_types:
                parsed["campaign"]["campaign_type"] = category_mapped
        else:
            if "campaign" not in parsed:
                parsed["campaign"] = {}
            parsed["campaign"]["campaign_type"] = category_mapped

        return parsed
    except Exception as e:
        logger.error(f"[AI] Error parsing JSON campaign plan: {e}. Output was: {result}")
        return {
            "error": "Failed to parse AI response as valid campaign JSON structure. Please try again.",
            "raw_output": result
        }


# ---------------------------------------------------------------------------
# 7. refine_campaign_plan
# ---------------------------------------------------------------------------
def refine_campaign_plan(current_plan_str: str, instruction: str) -> dict:
    """
    Refine an existing campaign plan based on an instruction (e.g., shorten body, change tone, translate).
    Returns a modified structured JSON campaign plan.
    """
    import json

    system_prompt = (
        "You are an expert Government Campaign Planner and Copywriter.\n"
        "You are given a current campaign plan in JSON format, and a refinement instruction.\n"
        "Your task is to modify the relevant parts of the JSON object (e.g. shortening the body text, changing its tone, adjusting KPIs, or altering suggested channels) to fulfill the instruction.\n"
        "Keep other fields unchanged unless they are contextually affected by the instruction.\n"
        "You MUST return a JSON object ONLY matching the same structure. Do not wrap in markdown fences (like ```json), write notes, or introduce your text.\n"
        "\n"
        "CRITICAL: Output Devanagari / Hindi text as RAW UTF-8 CHARACTERS (e.g., 'साफ', 'स्थिति', 'स्थानीय'). Do NOT escape them as unicode sequences (do NOT use \\uXXXX or backslashes). Writing unicode escapes leads to spelling errors.\n"
        "\n"
        "Rules:\n"
        "1. campaign_type must remain one of: awareness_drive, emergency_alert, educational_notification, organizational_announcement.\n"
        "2. Do NOT touch, translate, or remove placeholder tags in double braces like {{first_name}} or {{city}}.\n"
        "3. Do NOT escape non-English characters with unicode escapes (like \\u093f). Output raw UTF-8 characters directly in the JSON object."
    )

    user_content = f"Current Plan JSON:\n{current_plan_str}\n\nRefinement Instruction: {instruction}"

    result = _call_groq(system_prompt, user_content, temperature=0.2, max_tokens=1800)

    if not result:
        return {"error": "AI service is currently unavailable. Please try again later."}

    print(f"[AI] Raw Groq response: {result}")
    try:
        cleaned = _clean_json_string(result)
        print(f"[AI] Cleaned response: {cleaned}")

        parsed = json.loads(cleaned)
        return parsed
    except Exception as e:
        logger.error(f"[AI] Error parsing refined JSON plan: {e}. Output was: {result}")
        return {
            "error": "Failed to parse refined AI response as a valid campaign JSON structure.",
            "raw_output": result
        }


def auto_tag_audience(db, audience_id: str) -> list:
    """Analyze audience profile demographics and review feedback comments to suggest tags using LLM."""
    from app.models import Audience, CampaignFeedback
    import json
    import re

    aud = db.query(Audience).filter(Audience.id == audience_id).first()
    if not aud:
        return []

    # Get all feedback reviews submitted by this audience member
    feedbacks = db.query(CampaignFeedback).filter(CampaignFeedback.user_id == aud.id).all()
    feedback_text = ""
    if feedbacks:
        feedback_text = "\n".join([f"- Rated {f.rating}/5 stars for Campaign (Feedback Type: {f.feedback_type}): '{f.comment}'" for f in feedbacks])
    else:
        feedback_text = "No feedback comments submitted yet."

    system_prompt = (
        "You are an AI data classifier for a public communication platform. "
        "Your task is to analyze a citizen's profile and feedback history, "
        "and suggest 2 to 4 concise interest/classification tags (e.g., 'Interested in Agriculture', "
        "'Safety Active', 'Prefers Email', 'Frequent Reviewer', 'High Engagement', 'Needs Support'). "
        "Return the output strictly as a JSON array of strings, without any explanation, code blocks, or preamble. "
        "Example: [\"Interested in Farming\", \"Active Reviewer\"]"
    )

    user_content = (
        f"Citizen Demographics:\n"
        f"- Age: {aud.age}\n"
        f"- Gender: {aud.gender}\n"
        f"- Occupation: {aud.occupation}\n"
        f"- Location: {aud.city}, {aud.district}, {aud.state}\n"
        f"- Preferred Channels: {aud.preferred_channels}\n\n"
        f"Recent Feedback & Alert Reactions:\n"
        f"{feedback_text}"
    )

    tags_str = _call_groq(system_prompt, user_content, temperature=0.1, max_tokens=100)
    if not tags_str:
        # Fallback tags if Groq fails or API key is not set
        fallback_tags = ["General Audience"]
        if aud.occupation:
            fallback_tags.append(f"Interested in {aud.occupation}")
        if feedbacks:
            fallback_tags.append("Active Contributor")
        return fallback_tags

    try:
        match = re.search(r'\[.*\]', tags_str, re.DOTALL)
        if match:
            tags = json.loads(match.group(0))
        else:
            tags = json.loads(tags_str)
        if isinstance(tags, list):
            return [str(t).strip() for t in tags]
    except Exception:
        pass

    fallback_tags = ["General Audience"]
    if aud.occupation:
        fallback_tags.append(f"Interested in {aud.occupation}")
    return fallback_tags


def draft_emergency_response(subject: str, message: str, urgency: str) -> str:
    """Generate an AI-assisted response to a citizen emergency message using Groq."""
    system_prompt = (
        "You are an AI assistant for a government and community emergency response desk "
        "on the CommAI mass communication platform. "
        "Your task is to write a helpful, reassuring, clear, and action-oriented response "
        "to a citizen who has reported an emergency or urgent situation. "
        "Keep the response concise (max 3-4 sentences), highly professional, and informative. "
        "Do NOT use any emojis. "
        "Only return the exact message body. Do NOT include greetings like 'Dear citizen', "
        "closing sign-offs, or introductions like 'Here is the response'.\n\n"
        "If you need to tell the citizen how to track their request, tell them to go to "
        "'Campaign Feedback' in the sidebar and click the '🚨 Emergency Support' tab — "
        "their request status and any official replies will appear under 'My Support Requests'.\n\n"
        f"{PLATFORM_KNOWLEDGE}"
    )
    user_content = f"Urgency: {urgency}\nSubject: {subject}\nMessage: {message}"

    draft = _call_groq(system_prompt, user_content, temperature=0.3, max_tokens=300)
    if draft:
        return draft.strip()

    # Dynamic fallback drafts if Groq is unavailable
    if urgency == "critical" or urgency == "urgent":
        return f"Thank you for reporting this issue. We have flagged this report as {urgency.upper()} priority. Our emergency response team has been notified and is looking into the situation. Please stay safe and follow active safety protocols in your area. You can track updates under Campaign Feedback → 🚨 Emergency Support → My Support Requests."
    return "Thank you for sharing this feedback. We have acknowledged your report and regional operators are reviewing the details. We will update you as soon as action is taken. You can track your request under Campaign Feedback → 🚨 Emergency Support → My Support Requests."


def draft_query_response(subject: str, message: str) -> str:
    """Generate an AI-assisted response to a user support query using Groq."""
    system_prompt = (
        "You are an AI assistant helping a platform operator respond to a user "
        "who has sent a support query or expressed confusion about the CommAI mass communication platform. "
        "Provide a clear, helpful, and polite response explaining how to resolve their issue "
        "using the EXACT navigation paths described in the platform reference below. "
        "NEVER fabricate UI elements, buttons, or tabs that don't exist. "
        "If you're unsure, tell the user their query has been noted and a manager is looking into it. "
        "Keep the response concise (max 3-4 sentences) and highly professional. "
        "Only return the exact message body. Do NOT include greetings like 'Dear User', "
        "closing sign-offs, or introductions.\n\n"
        f"{PLATFORM_KNOWLEDGE}"
    )
    user_content = f"Subject: {subject}\nMessage: {message}"

    draft = _call_groq(system_prompt, user_content, temperature=0.3, max_tokens=300)
    if draft:
        return draft.strip()
    return "Thank you for reaching out with your query. We have logged your request in our system and a platform operator is reviewing it. We will get back to you with further instructions shortly."


def _get_offline_chat_reply(message: str, user_role: str = "general") -> str:
    """Offline keyword and rule-based fallback response when LLM is unavailable."""
    msg_lower = message.lower().strip()

    # Greetings / basic orientation in a very user-friendly manner
    if any(g in msg_lower for g in ["hi", "hello", "hey", "good morning", "good evening", "greetings"]):
        return "Hello! 👋 I am your CommAI Assistant. How can I help you today?"

    if any(k in msg_lower for k in ["channel", "medium", "platforms", "sms", "email", "whatsapp", "telegram", "push", "broadcast"]):
        return "CommAI supports the following channels: Email, SMS, WhatsApp, Telegram, Push Notifications, and Web Broadcasts."

    if any(k in msg_lower for k in ["role", "permission", "access level"]):
        return (
            "CommAI has 3 user roles:\n"
            "1. Audience / Citizen: Restricted access to portal dashboard, campaign alerts, submit emergency requests, and give feedback.\n"
            "2. Campaign Manager: Creates campaigns, templates, poster graphics, manages audience segments, and responds to citizen requests.\n"
            "3. Admin: Full platform governance including user directory, manager account creation, audit logs, and campaign approvals."
        )

    if any(k in msg_lower for k in ["emergency", "urgent", "assistance", "alert", "warning"]):
        return (
            "To submit an emergency support request as a Citizen:\n"
            "1. Go to 'Campaign Feedback' in the sidebar.\n"
            "2. Select the '🚨 Emergency Support' tab.\n"
            "3. Fill out the 'Submit Urgent Request' form on the left (Subject, Priority, Message).\n"
            "4. Click 'Send Emergency Message'. Campaign managers monitor these in real time."
        )

    if "feedback" in msg_lower or "rate" in msg_lower or "rating" in msg_lower:
        return (
            "To give feedback on a campaign:\n"
            "1. Go to 'Campaign Feedback' in the sidebar.\n"
            "2. Select the '📬 Received Campaigns' tab.\n"
            "3. Find the campaign and click 'Give Feedback' to submit a 1 to 5 star rating."
        )

    if "campaign" in msg_lower or "template" in msg_lower:
        return (
            "To create a campaign (Campaign Managers & Admins):\n"
            "1. Navigate to 'Campaign Planner' in the sidebar.\n"
            "2. Click 'Create New Campaign'.\n"
            "3. Complete the step-by-step wizard: select template -> choose audience -> configure channels -> launch."
        )

    if "segment" in msg_lower or "audience" in msg_lower:
        return (
            "Campaign Managers can segment citizens by location (state, district, city), age group, occupation, "
            "and language preferences using structured filters or AI natural language queries in 'Audience & Segments'."
        )

    if "poster" in msg_lower or "flyer" in msg_lower:
        return (
            "To generate posters: Go to 'Poster Studio' in the sidebar -> specify campaign topic & tone -> "
            "AI generates visual text-free background posters."
        )

    if "language" in msg_lower or "translate" in msg_lower or "translation" in msg_lower:
        return "CommAI supports 23 languages (the 22 Official Scheduled Languages of India + English) with instant AI translation."

    if "bulletin" in msg_lower or "notice" in msg_lower or "announcement" in msg_lower:
        return "Official announcements and emergency warnings appear on the 'Live Bulletins' feed accessible from the sidebar."

    return "Please ask me relevant questions related to CommAI, emergency alerts, campaign management, or platform navigation."


def generate_chat_reply(message: str, history: list, user_role: str = "general") -> str:
    """Generate an AI assistant response for chatbot widget using Groq or offline RAG/fallback."""
    if not settings.GROQ_API_KEY:
        logger.warning("[AI] Groq API Key is not set. Using offline platform context fallback.")
        return _get_offline_chat_reply(message, user_role)

    if user_role == "audience":
        role_context = (
            "You are chatting with a Citizen / Audience member. They have RESTRICTED access to the platform. "
            "They CANNOT create campaigns, templates, segments, or manage other users. "
            "When guiding them, ONLY reference pages and tabs they can actually see. "
            "Make sure your guidance reflects their citizen-level permissions."
        )
    else:
        role_context = (
            "You are chatting with a Platform Operator (Admin or Campaign Manager). They have access to administrative features: "
            "creating campaigns, managing templates, defining audience segments, reviewing approvals, and configuring integrations. "
            "When guiding them, reference the exact sidebar items and page names from the platform reference below."
        )

    CHAT_SYSTEM_PROMPT = (
        "You are the CommAI Assistant, an AI helper for the CommAI mass communication platform.\n\n"
        f"{role_context}\n\n"
        f"{PLATFORM_KNOWLEDGE}\n\n"
        "IMPORTANT RULES:\n"
        "1. ONLY reference navigation paths, tabs, buttons, and pages that ACTUALLY EXIST in the platform reference above.\n"
        "2. NEVER fabricate or guess UI elements. If unsure, say so honestly.\n"
        "3. Avoid providing technical or implementation details about database schemas, code internals, or uvicorn commands "
        "unless the user explicitly asks about them.\n"
        "4. GREETINGS: If the user says a greeting (e.g. 'hi', 'hello', 'hey', 'good morning', etc.), respond warmly and in a user-friendly manner: 'Hello! 👋 I am your CommAI Assistant. How can I help you today?'\n"
        "5. If asked 'What channels does CommAI support?', answer directly: 'CommAI supports the following channels: Email, SMS, WhatsApp, Telegram, Push Notifications, and Web Broadcasts.'\n"
        "6. STRICT RELEVANCE GUARDRAIL: You are strictly a CommAI platform assistant. If the user asks ANY off-topic, unrelated, or general knowledge question (such as 'who is the prime minister of india', general trivia, recipes, general non-CommAI programming, math, sports, external news, personal advice, etc.), DO NOT answer the question under any circumstances. Instead, reply politely: 'Please ask me relevant questions related to CommAI, emergency alerts, campaign management, or platform navigation.'\n"
        "7. If you cannot help, or if the user is frustrated with platform issues, tell them they can click the thumbs-down icon below "
        "your reply to submit a support query to a campaign manager who will respond personally."
    )

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    
    # Construct full list of messages
    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    for msg in history:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    
    messages.append({"role": "user", "content": message})

    payload = {
        "model": MODEL_PRIMARY,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 400,
    }

    try:
        resp = requests.post(GROQ_URL, json=payload, headers=headers, timeout=30)
        if resp.status_code != 200:
            logger.warning(f"[AI] Primary model failed in chat ({resp.status_code}). Trying fallback...")
            payload["model"] = MODEL_FALLBACK
            resp = requests.post(GROQ_URL, json=payload, headers=headers, timeout=30)

        if resp.status_code == 200:
            text = resp.json()["choices"][0]["message"]["content"].strip()
            return _clean_output(text)
        else:
            logger.error(f"[AI] Groq chat call failed: {resp.text}")
            return _get_offline_chat_reply(message, user_role)
    except Exception as e:
        logger.error(f"[AI] Error calling Groq API for chat: {e}", exc_info=True)
        return _get_offline_chat_reply(message, user_role)


class VoiceCommandResponse(BaseModel):
    action: str = Field(description="Action to perform")
    navigation_target: str = Field(description="Target screen tab")
    target_channel: Optional[str] = "general"
    target_manager: Optional[str] = None
    message_text: Optional[str] = None
    requires_confirmation: bool = True
    spoken_response: str = Field(description="Response spoken back to the user")
    title: Optional[str] = "Voice Alert"
    objective: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    location_selected: Optional[str] = "All Locations"
    locations_list: Optional[List[str]] = ["All Locations"]
    recipients_selected: Optional[str] = "All Citizens"
    recipients_list: Optional[List[str]] = ["All Citizens"]
    category: Optional[str] = "announcement"
    urgency: Optional[str] = "normal"
    description: Optional[str] = None
    channels: Optional[List[str]] = ["email", "push"]
    auto_trigger: bool = False


def process_voice_command(prompt: str, user_role: str = "campaign_manager", user_name: str = "Manager", known_recipients: list = None, active_context: dict = None) -> dict:
    """
    Process high-level voice command for Admin/Manager Voice Cockpit.
    Parses spoken intent, extracts locations/recipients, returns navigation target, 
    pre-selected parameters, full Groq generated subject & body, and spoken voice response.
    """
    import json

    title_role = "Admin" if user_role == "admin" else "Manager"
    display_name = f"{title_role} {user_name}" if user_name else title_role

    prompt_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', prompt).strip().lower()
    prompt_clean = re.sub(r'\s+', ' ', prompt_clean)

    confirm_words = [
        "yes", "yeah", "yep", "sure", "confirm", "proceed", "go ahead", "do it", "ok", "okay",
        "broadcast", "send", "send it", "yes send", "yes send it", "do broadcast", "send message",
        "ha", "haan", "ha send kr de", "ha send kar de", "haan send kr de", "bhej do", "ha bhej do", "send kar do"
    ]
    # Detect if the user is clearly initiating a new command rather than confirming
    is_new_command = any(
        w in prompt_clean for w in ["create", "launch", "open", "message", "chat", "navigate", "search", "show", "find", "go to"]
    ) or ("send to" in prompt_clean) or ("send message to" in prompt_clean) or ("tell" in prompt_clean and "saying" in prompt_clean)

    is_affirmative = any(
        prompt_clean == w or prompt_clean.startswith(w + " ") or prompt_clean.endswith(" " + w) or re.search(r'\b(yes|confirm|proceed|ok|okay|send|bhej)\b', prompt_clean)
        for w in confirm_words
    ) if not is_new_command else False

    has_pending_confirmation = False
    ctx_data = {}
    if active_context and isinstance(active_context, dict):
        ctx_data = active_context.get("data") or active_context.get("active_result") or active_context
        if isinstance(ctx_data, dict):
            has_pending_confirmation = bool(ctx_data.get("requires_confirmation") or ctx_data.get("type") in ["operator_chat", "campaign"] or ctx_data.get("action") in ["emergency_broadcast", "create_campaign", "send_alert", "navigate"])

    if is_affirmative and has_pending_confirmation:
        nav_target = ctx_data.get("navigation_target") or "sentiment_map"

        if nav_target == "operator_chat":
            msg_text = ctx_data.get("message_text") or ctx_data.get("body") or ctx_data.get("description")
            target_mgr = ctx_data.get("target_manager")
            target_chan = ctx_data.get("target_channel", "general")
            target_name = target_mgr if target_mgr else f"#{target_chan}"
            spoken_msg = f"Message: '{msg_text}' sent to {target_name}." if msg_text else f"Message sent to {target_name}."
            return {
                "action": "send_operator_chat_message",
                "navigation_target": "operator_chat",
                "user_confirmed": True,
                "message_text": msg_text,
                "target_channel": target_chan,
                "target_manager": target_mgr,
                "spoken_response": f"Confirmed {display_name}! {spoken_msg}",
                "requires_confirmation": False,
                "auto_trigger": True
            }

        action = ctx_data.get("action", "emergency_broadcast")
        title = ctx_data.get("title", "Emergency Broadcast")
        location = ctx_data.get("location_selected") or ctx_data.get("location") or "All Locations"
        recipients = ctx_data.get("recipients_selected", "All Citizens")
        desc = ctx_data.get("description") or ctx_data.get("body") or f"Emergency advisory for {location}."
        subj = ctx_data.get("subject") or f"[{location}] {title}"
        cat = ctx_data.get("category") or ("emergency_alert" if action == "emergency_broadcast" else "awareness_drive")
        locs = ctx_data.get("locations_list") or [location, "All Locations"]
        recs = ctx_data.get("recipients_list") or [recipients, "All Citizens"]

        return {
            "action": action,
            "navigation_target": nav_target,
            "user_confirmed": True,
            "spoken_response": f"Confirmed {display_name}! Executing {title} for {location} targeting {recipients}.",
            "title": title,
            "subject": subj,
            "category": cat,
            "location_selected": location,
            "locations_list": locs,
            "recipients_selected": recipients,
            "recipients_list": recs,
            "requires_confirmation": False,
            "auto_trigger": True,
            "description": desc,
            "body": desc,
            "channels": ctx_data.get("channels", ["email", "push"]),
            "urgency": ctx_data.get("urgency", "critical")
        }

    system_prompt = (
        "You are the Voice Cockpit AI Engine for CommAI, a government mass communication platform.\n"
        "You serve an Admin or Campaign Manager. You must analyze their spoken command and return a structured JSON response ONLY.\n"
        "Do NOT wrap in markdown fences (like ```json). Return raw JSON object.\n"
        "\n"
        "OUTPUT JSON SCHEMA:\n"
        "{\n"
        "  \"action\": \"String - One of: emergency_broadcast, create_campaign, send_alert, navigate, search_audience, approve_campaign, generate_poster, analytics_brief\",\n"
        "  \"navigation_target\": \"String - One of: campaigns, audiences, users, emergency_inbox, approvals, dashboard, poster_studio, sentiment_map, templates, citizen_conversations, operator_chat, support_queries, live_bulletins, sos_reports, feedback, fact_shield, managers, audit_logs, settings\",\n"
        "  \"target_channel\": \"String - Public channel for operator chat e.g. 'general', 'emergency', 'campaigns'\",\n"
        "  \"target_manager\": \"String - Name of specific manager for private DM chat e.g. 'Yashvi', 'Mahesh Sharma' if specified\",\n"
        "  \"message_text\": \"String - Extracted chat message text to send or pre-fill in input box if user dictated a message\",\n"
        "  \"requires_confirmation\": true,\n"
        "  \"spoken_response\": \"String - Professional, clear verbal response addressed to the manager (e.g., 'Yes Manager, I have generated a complete health awareness campaign plan for Maharashtra. All parameters and copy are pre-filled.').\",\n"
        "  \"title\": \"String - Catchy, concise professional campaign title (e.g. 'Maharashtra Health & Wellness Drive 2026')\",\n"
        "  \"objective\": \"String - Clear, high-level goal of the campaign (e.g. 'Promote preventive healthcare guidelines, sanitation, and health services')\",\n"
        "  \"subject\": \"String - Subject line for email and push notifications (e.g. 'Important Health Advisory: Prevention Guidelines')\",\n"
        "  \"body\": \"String - Full detailed message body copy with {{first_name}} placeholders where appropriate\",\n"
        "  \"location_selected\": \"String - Extracted state/city/district (e.g. 'Assam', 'Uttar Pradesh', 'Maharashtra', 'Delhi', 'Varanasi', 'All Locations')\",\n"
        "  \"locations_list\": [\"Array of location strings\"],\n"
        "  \"recipients_selected\": \"String - Extracted target audience (e.g. 'All Citizens', 'Farmers', 'Healthcare Workers', 'Students', 'Educational Institutions')\",\n"
        "  \"recipients_list\": [\"Array of recipient group strings\"],\n"
        "  \"category\": \"String - campaign type e.g. emergency_alert, awareness_drive, announcement\",\n"
        "  \"urgency\": \"String - normal, urgent, critical\",\n"
        "  \"description\": \"String - Full message body or description\",\n"
        "  \"channels\": [\"email\", \"sms\", \"whatsapp\", \"push\"],\n"
        "  \"auto_trigger\": true\n"
        "}\n\n"
        "CRITICAL RULES:\n"
        "1. Extract locations (states, cities, districts like 'Assam', 'Uttar Pradesh', 'Delhi', 'Varanasi', 'Mumbai') accurately if mentioned.\n"
        "2. If user requests to open chat, RAG chat, citizen conversations, or talk to citizens, set action to 'navigate' and navigation_target to 'citizen_conversations'.\n"
        "3. If active_context indicates active_tab is 'operator_chat' (or user is in private DM / operator chat) AND user does NOT explicitly ask to 'create campaign' or 'emergency broadcast', treat the spoken input as a staff message. Set action to 'navigate', navigation_target to 'operator_chat', target_manager to active manager name, message_text to prompt text, set requires_confirmation to true, and set spoken_response to ask: 'I have typed your message: \"[Message]\". Should I send it now, or would you like to edit?'\n"
        "4. If user requests staff chat, operator chat, or private chat with a manager (e.g. 'Yashvi', 'Mahesh Sharma', 'Ramesh Sharma'), set action to 'navigate', navigation_target to 'operator_chat', target_manager to person's name, message_text to dictated message text if present, set requires_confirmation to true, and set spoken_response to ask: 'I have opened chat with [Name] and typed your message: \"[Message]\". Should I send it now, or would you like to edit?'\n"
        "5. DO NOT set action to 'create_campaign' or 'emergency_broadcast' when user is in operator chat or dictating a message, unless user explicitly says 'create campaign', 'launch campaign', or 'emergency broadcast'.\n"
        "6. If user explicitly asks to create a campaign, launch campaign, send broadcast, set action to 'create_campaign' (or 'emergency_broadcast' if urgent/alert) and navigation_target to 'campaigns'.\n"
        "7. IMPORTANT: If user mentions 'sentiment map' along with alert/emergency/broadcast keywords, set action to 'emergency_broadcast' and navigation_target to 'sentiment_map' (NOT campaigns). The user wants to create an emergency alert FROM the sentiment map page.\n"
        "8. IMPORTANT: If user says 'send this to [person name]' or 'send to [person name]' and the context is about a campaign, alert, or broadcast (NOT about opening a chat), treat this as adding a recipient. Set action to 'send_alert', set recipients_selected to the person's name, and keep the navigation_target as the current page (e.g. 'sentiment_map' or 'campaigns'). Do NOT open operator_chat for 'send this to [name]' commands.\n"
        "9. Address the user respectfully as 'Manager' or 'Admin' in spoken_response.\n"
        "10. Output spoken_response in clear, concise natural language suitable for browser SpeechSynthesis.\n"
        "11. DEFAULT CHANNELS RULE: By default, set 'channels' to ONLY ['email', 'push'] (representing Email and Website Push/Bulletin). ONLY include extra channels like 'sms', 'whatsapp', 'telegram', or 'voice' if the user explicitly specifies them in their spoken command (e.g., 'via whatsapp', 'on sms', 'phone call').\n"
        "12. DETAILED DESCRIPTION RULE: NEVER set 'description' or 'body' to just the title or short user command prompt. Always compose a detailed, professional, 3-4 sentence public advisory message body in 'description' and 'body' with emergency safety instructions, action steps, website update links, and {{phone_number}} / {{first_name}} placeholders.\n"
        "13. LOCATION PROMPTING RULE: If the user requests a campaign or emergency alert but does NOT specify a target state or location in their spoken command or context, set 'location_selected' to 'Unspecified' and make 'spoken_response' explicitly ask: 'Which state or location would you like to target for this alert?'\n"
        "14. FOLLOW-UP PROMPT RULE: For campaign creation and emergency broadcast actions, set 'spoken_response' to EXACTLY: 'Do you want to edit, or should I proceed?'. Keep spoken responses concise with zero conversational filler or markdown.\n"
        "15. NAVIGATION ONLY RULE: For navigation-only commands (e.g. 'show me approvals', 'open sentiment map', 'navigate to dashboard', 'find farmers in Gujarat') where the user is NOT composing a message/campaign or initiating a broadcast, ALWAYS set 'requires_confirmation' to false.\n"
        "16. NAVIGATION RULES — navigation_target MUST be one of these exact strings:\n"
        "    campaigns, audiences, users, emergency_inbox, approvals, dashboard, poster_studio,\n"
        "    sentiment_map, templates, citizen_conversations, operator_chat, support_queries,\n"
        "    live_bulletins, sos_reports, feedback, fact_shield, managers, audit_logs, settings.\n"
        "    Mapping guide:\n"
        "    - 'audience directory' or 'audience list' or 'citizen list' → 'users'\n"
        "    - 'audit logs' or 'audit trail' or 'system logs' → 'audit_logs'\n"
        "    - 'campaign managers' or 'managers directory' or 'staff list' → 'managers'\n"
        "    - 'campaign feedback' or 'citizen feedback' → 'feedback'\n"
        "    - 'sos reports' or 'sos alerts' or 'distress signals' → 'sos_reports'\n"
        "    - 'fact shield' or 'fact check' or 'rumor control' → 'fact_shield'\n"
        "    - 'settings' or 'preferences' or 'profile' → 'settings'\n"
        "    - 'templates' or 'message templates' → 'templates'\n"
        "    - 'live bulletins' or 'bulletins' or 'published' → 'live_bulletins'\n"
        "    - 'approvals' or 'pending approvals' or 'review queue' → 'approvals'\n"
        "    - 'poster' or 'poster studio' or 'design poster' → 'poster_studio'\n"
        "    - 'citizen chat' or 'rag chat' or 'citizen ai' → 'citizen_conversations'\n"
        "    - 'support queries' or 'help desk' or 'citizen support' → 'support_queries'\n"
        "    - 'emergency inbox' or 'emergency messages' → 'emergency_inbox'\n"
        "    - 'operator chat' or 'staff chat' or 'team chat' → 'operator_chat'\n"
        "    - 'sentiment map' or 'sentiment alarms' → 'sentiment_map'\n"
        "    - 'audience segments' or 'audience groups' → 'audiences'\n"
        "    - 'dashboard' or 'home' or 'overview' → 'dashboard'\n"
        "17. CAMPAIGN GENERATION RULE: When action is 'create_campaign' or 'emergency_broadcast', NEVER repeat the user's raw spoken prompt (e.g. 'create me a campaign on health awareness') as the title, objective, description, subject, or body. Generate a clean professional Campaign Title (e.g. 'Public Health & Wellness Drive 2026'), Campaign Objective (e.g. 'Promote preventive healthcare guidelines, sanitation, and health services'), Email Subject (e.g. 'Health Advisory: Guidelines for Prevention & Wellness'), and detailed 3-4 sentence message body copy with {{first_name}} placeholders.\n"
    )

    user_content = f"Manager Name/Role: {display_name} ({user_role})\nActive Context: {json.dumps(active_context) if active_context else 'None'}\nSpoken Command: \"{prompt}\""

    result_json = None
    try:
        from app.services.ai_provider import call_llm
        raw_text = call_llm(
            system_prompt=system_prompt,
            user_content=user_content,
            temperature=0.0,
            max_tokens=1200,
            response_format={"type": "json_object"}
        )
        if raw_text:
            raw_text = raw_text.strip()
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)
            parsed_val = json.loads(raw_text)
            # Strict validation check
            validated_obj = VoiceCommandResponse.model_validate(parsed_val)
            result_json = validated_obj.model_dump()
    except Exception as e:
        logger.warning(f"[Voice AI] Unified AI router voice command parsing or validation failed: {e}")

    # Fallback heuristic parser if AI API fails or is offline
    if not result_json:
        prompt_lower = prompt.lower()
        active_tab = (active_context or {}).get("active_tab") or (active_context or {}).get("navigation_target")
        is_on_operator_chat = (active_tab == "operator_chat")
        
        # Detect explicit campaign / emergency request
        is_explicit_campaign = "create campaign" in prompt_lower or "new campaign" in prompt_lower or "launch campaign" in prompt_lower
        is_emergency = ("emergency" in prompt_lower or "flood" in prompt_lower or "alert" in prompt_lower or "warning" in prompt_lower or "disaster" in prompt_lower)
        
        # Detect navigation-only intents first (these must take priority over is_emergency!)
        is_emergency_inbox_nav = (
            ("inbox" in prompt_lower or "emergency inbox" in prompt_lower or "sos request" in prompt_lower or "citizen emergenc" in prompt_lower)
            and not any(kw in prompt_lower for kw in ["send", "broadcast", "launch", "create", "dispatch"])
        )
        
        # Detect if user wants sentiment map
        is_sentiment_map = "sentiment" in prompt_lower or "sentiment map" in prompt_lower
        
        # Detect "send this to [person]" / "send to [person]" — means add recipient, NOT open chat
        send_to_person_match = re.search(r'send\s+(?:this|it|that|the alert|the campaign)?\s*to\s+([a-zA-Z][a-zA-Z\s]+)', prompt, re.IGNORECASE)
        person_name = None
        if send_to_person_match:
            raw_p = send_to_person_match.group(1).strip()
            raw_p = re.sub(r'\s+(via|on|by|using)\s+(email|sms|whatsapp|telegram|push|voice).*$', '', raw_p, flags=re.IGNORECASE).strip().title()
            if raw_p and raw_p.lower() not in ["the", "a", "an", "all", "our", "staff", "this", "it"]:
                person_name = raw_p

        is_send_to_person = bool(person_name) and not ("operator" in prompt_lower or "staff chat" in prompt_lower or "private chat" in prompt_lower or "message" in prompt_lower or is_on_operator_chat or is_explicit_campaign or is_emergency or "create" in prompt_lower)
        
        # Detect location dynamically
        location = "All Locations"
        if "uttar pradesh" in prompt_lower or "up" in prompt_lower:
            location = "Uttar Pradesh"
        elif "assam" in prompt_lower:
            location = "Assam"
        elif "delhi" in prompt_lower:
            location = "Delhi"
        elif "mumbai" in prompt_lower:
            location = "Mumbai"
        elif "varanasi" in prompt_lower:
            location = "Varanasi"
            
        has_location = location != "All Locations"

        # Detect recipients
        recipients = person_name if person_name else ("Farmers" if "farmer" in prompt_lower else ("Students" if "student" in prompt_lower else "All Citizens"))
        
        # Detect channels (default strictly to ONLY email & push/website unless explicitly requested)
        detected_channels = []
        if "sms" in prompt_lower or "text message" in prompt_lower or "text" in prompt_lower:
            detected_channels.append("sms")
        if "whatsapp" in prompt_lower:
            detected_channels.append("whatsapp")
        if "telegram" in prompt_lower:
            detected_channels.append("telegram")
        if "voice" in prompt_lower or "phone call" in prompt_lower or "call" in prompt_lower:
            detected_channels.append("voice")
        if "email" in prompt_lower:
            detected_channels.append("email")
        if "push" in prompt_lower or "bulletin" in prompt_lower or "website" in prompt_lower:
            detected_channels.append("push")

        if not detected_channels:
            detected_channels = ["email", "push"]

        clean_topic = prompt.strip()
        clean_topic = re.sub(r'^(?:create|launch|send)\s+(?:an?|the)?\s*(?:emergency|urgent)?\s*(?:alert|broadcast|notice|campaign)?\s*(?:for|on|about)?\s*', '', clean_topic, flags=re.IGNORECASE).strip()
        clean_topic = re.sub(r'\s+and\s+send\s+.*$', '', clean_topic, flags=re.IGNORECASE).strip()

        detailed_description = (
            f"Dear {{first_name}},\n\n"
            f"This is an urgent public advisory regarding {clean_topic or 'emergency situation'} in {location}. "
            f"Please take immediate protective precautions, monitor official updates, and contact {{phone_number}} for assistance.\n\n"
            f"Best regards,\nCommAI Emergency Services"
        )

        # Priority 0: Active in Operator Chat and user dictates message (without explicitly launching a campaign)
        is_explicit_broadcast = "broadcast alert" in prompt_lower or "send emergency broadcast" in prompt_lower or "launch emergency alert" in prompt_lower
        if is_on_operator_chat and not is_explicit_campaign and not is_explicit_broadcast:
            target_mgr = (active_context or {}).get("target_manager")
            target_chan = (active_context or {}).get("target_channel", "general")
            spoken = f"I have typed your message: \"{prompt.strip()}\". Should I send it now, or would you like to edit?"
            result_json = {
                "action": "navigate",
                "navigation_target": "operator_chat",
                "target_channel": target_chan,
                "target_manager": target_mgr,
                "message_text": prompt.strip(),
                "requires_confirmation": True,
                "spoken_response": spoken,
                "title": "Operator Staff Chat",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        # Priority 1: "send this/it to [person name]" — add person as recipient, stay on current page
        elif is_send_to_person:
            current_page = (active_context or {}).get("active_tab") or "campaigns"
            result_json = {
                "action": "send_alert",
                "navigation_target": current_page,
                "spoken_response": f"Do you want to edit, or should I proceed?",
                "title": f"Send to {person_name}",
                "location_selected": location,
                "recipients_selected": person_name,
                "recipients_list": [person_name, "All Citizens"],
                "requires_confirmation": True,
                "category": "emergency_alert" if is_emergency else "awareness_drive",
                "urgency": "critical" if is_emergency else "normal",
                "description": detailed_description,
                "body": detailed_description,
                "channels": detected_channels,
                "auto_trigger": False
            }
        # Priority 1b: Emergency INBOX navigation — must come BEFORE is_emergency check
        elif is_emergency_inbox_nav:
            result_json = {
                "action": "navigate",
                "navigation_target": "emergency_inbox",
                "spoken_response": f"Opening Emergency Inbox for you, {display_name}. Here are the citizen emergency requests.",
                "title": "Emergency Inbox",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        # Priority 2: Sentiment Map + Emergency = open sentiment_map page
        elif is_sentiment_map and is_emergency:
            spoken_text = "Do you want to edit, or should I proceed?"
            result_json = {
                "action": "emergency_broadcast",
                "navigation_target": "sentiment_map",
                "spoken_response": spoken_text,
                "title": f"Emergency Alert: {clean_topic.title()}",
                "location_selected": location if has_location else "Unspecified",
                "locations_list": [location, "All Locations"],
                "recipients_selected": recipients,
                "recipients_list": [recipients, "All Citizens", "Farmers", "Healthcare Workers", "Students", "Local Authorities"],
                "category": "emergency_alert",
                "urgency": "critical",
                "description": detailed_description,
                "body": detailed_description,
                "channels": detected_channels,
                "auto_trigger": True
            }
        # Priority 3: Sentiment Map navigation (no emergency)
        elif is_sentiment_map:
            result_json = {
                "action": "navigate",
                "navigation_target": "sentiment_map",
                "spoken_response": f"Opening Sentiment Map for you, {display_name}.",
                "title": "Sentiment Map",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        # Priority 4: Emergency broadcast (without sentiment map) → campaigns page
        elif is_emergency:
            spoken_text = "Do you want to edit, or should I proceed?"
            if not has_location:
                spoken_text = "Which state or location would you like to target for this alert?"
            result_json = {
                "action": "emergency_broadcast",
                "navigation_target": "campaigns",
                "spoken_response": spoken_text,
                "title": f"Emergency Alert: {clean_topic.title()}",
                "subject": f"🚨 EMERGENCY ALERT ({location}): {clean_topic.title()}",
                "location_selected": location if has_location else "Unspecified",
                "locations_list": [location, "All Locations"],
                "recipients_selected": recipients,
                "recipients_list": [recipients, "All Citizens", "Farmers", "Healthcare Workers", "Students", "Local Authorities"],
                "category": "emergency_alert",
                "urgency": "critical",
                "description": detailed_description,
                "body": detailed_description,
                "channels": detected_channels,
                "auto_trigger": True
            }
        elif "operator chat" in prompt_lower or "staff chat" in prompt_lower or "private chat" in prompt_lower or ("message" in prompt_lower and "send to" not in prompt_lower) or re.search(r'\b(message|tell|dm)\s+[a-zA-Z]', prompt_lower):
            target_mgr = None
            if known_recipients:
                for rec in known_recipients:
                    rec_first = rec.split()[0].lower()
                    if (rec.lower() in prompt_lower or (len(rec_first) > 2 and rec_first in prompt_lower)) and rec not in ["All Citizens", "Educational Institutions", "Farmers", "Healthcare Workers", "Local Authorities"]:
                        target_mgr = rec
                        break

            if not target_mgr:
                mgr_match = re.search(r'(?:message|tell|dm|chat with|send message to)\s+([a-zA-Z]+)', prompt, re.IGNORECASE)
                if mgr_match and mgr_match.group(1).lower() not in ["the", "a", "an", "all", "our", "staff", "this", "it"]:
                    target_mgr = mgr_match.group(1).capitalize()

            target_chan = "general"
            if "emergency" in prompt_lower:
                target_chan = "emergency"
            elif "campaign" in prompt_lower:
                target_chan = "campaigns"

            msg_text = None
            if "message" in prompt_lower or "say" in prompt_lower or "tell" in prompt_lower or "?" in prompt:
                parts = re.split(r'message\s+\w+[\.\,\:]?\s*|message\s*|saying\s*|say\s*|tell\s+', prompt, flags=re.IGNORECASE)
                if len(parts) > 1 and parts[-1].strip():
                    msg_text = parts[-1].strip().strip('"\'')

            spoken = f"Opening Operator Staff Chat for you, {display_name}."
            if target_mgr and msg_text:
                spoken = f"I have opened chat with {target_mgr} and typed your message: \"{msg_text}\". Should I send it now, or would you like to edit?"
            elif msg_text:
                spoken = f"I have opened Operator Staff Chat and typed your message: \"{msg_text}\". Should I send it now, or would you like to edit?"
            elif target_mgr:
                spoken = f"Opening Operator Staff Chat DM with {target_mgr} for you, {display_name}."

            result_json = {
                "action": "navigate",
                "navigation_target": "operator_chat",
                "target_channel": target_chan,
                "target_manager": target_mgr,
                "message_text": msg_text,
                "requires_confirmation": bool(msg_text),
                "spoken_response": spoken,
                "title": "Operator Staff Chat",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "rag" in prompt_lower or "citizen chat" in prompt_lower or "citizen conversation" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "citizen_conversations",
                "spoken_response": f"Opening Citizen RAG Chat for you, {display_name}.",
                "title": "Citizen RAG Chat",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "approval" in prompt_lower or "approve" in prompt_lower:
            result_json = {
                "action": "approve_campaign",
                "navigation_target": "approvals",
                "spoken_response": f"Opening Approvals Queue for you, {display_name}. Here are the pending campaign requests.",
                "title": "Approvals Review",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "template" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "templates",
                "spoken_response": f"Opening Templates Library for you, {display_name}.",
                "title": "Templates Library",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "bulletin" in prompt_lower or "live bulletin" in prompt_lower or "live broadcast" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "live_bulletins",
                "spoken_response": f"Opening Live Bulletins feed for you, {display_name}.",
                "title": "Live Bulletins",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "poster" in prompt_lower:
            result_json = {
                "action": "generate_poster",
                "navigation_target": "poster_studio",
                "spoken_response": f"Opening Poster Studio for you, {display_name}. You can design and generate campaign posters here.",
                "title": "Poster Studio",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "support quer" in prompt_lower or "help ticket" in prompt_lower or "citizen quer" in prompt_lower or "user quer" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "support_queries",
                "spoken_response": f"Opening Support Queries for you, {display_name}. Here are the citizen help tickets.",
                "title": "Support Queries",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "campaign" in prompt_lower or "create" in prompt_lower or ("send" in prompt_lower and "send to" not in prompt_lower and "send this" not in prompt_lower and "send it" not in prompt_lower):
            # Extract main topic from prompt
            topic_clean = re.sub(r'^(?:create|launch|send|start|make|build)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:campaign|drive|alert|advisory|notice)?\s*(?:on|for|about)?\s*', '', prompt, flags=re.IGNORECASE).strip().strip('.')
            if not topic_clean or len(topic_clean) < 3:
                topic_clean = "Public Awareness"

            topic_title = topic_clean.title()
            if not any(kw in topic_title.lower() for kw in ["campaign", "drive", "alert", "notice", "advisory"]):
                topic_title = f"{topic_title} Campaign"

            generated_obj = f"Promote public awareness and provide official guidance regarding {topic_clean} to citizens across {location}."
            generated_subj = f"Important Notice: {topic_title} ({location})"
            generated_body = f"Dear {{first_name}},\n\nThis is an official communication regarding {topic_clean} in {location}. Please follow prescribed guidelines, maintain safety precautions, and contact local support for assistance.\n\nBest regards,\nCommAI Regional Administration"
            generated_desc = f"Targeted awareness drive regarding {topic_clean} for citizens in {location}."

            spoken_text = "Do you want to edit, or should I proceed?" if has_location else "Which state or location would you like to target for this alert?"

            result_json = {
                "action": "create_campaign",
                "navigation_target": "campaigns",
                "spoken_response": spoken_text,
                "title": topic_title,
                "objective": generated_obj,
                "subject": generated_subj,
                "body": generated_body,
                "description": generated_desc,
                "location_selected": location if has_location else "Unspecified",
                "locations_list": [location, "Assam", "Uttar Pradesh", "Delhi", "All Locations"],
                "recipients_selected": recipients,
                "recipients_list": [recipients, "All Citizens", "Farmers", "Healthcare Workers"],
                "category": "emergency_alert" if is_emergency else "awareness_drive",
                "urgency": "critical" if is_emergency else "normal",
                "channels": detected_channels,
                "requires_confirmation": True,
                "auto_trigger": True,
                "kpis": {
                    "expected_reach_pct": 88,
                    "ctr_goal_pct": 28,
                    "delivery_goal_pct": 98,
                    "awareness_goal_description": f"Achieve public awareness regarding {topic_clean}"
                },
                "metadata": {
                    "confidence": 0.92,
                    "reasoning": {
                        "campaign_type": "Auto-selected based on voice intent",
                        "channels": "Selected optimal channels for target demographic"
                    },
                    "suggestions": ["Verify recipient list before launching", "Add local helpline number"]
                }
            }
        elif "audience" in prompt_lower or "farmer" in prompt_lower or "segment" in prompt_lower or "citizen group" in prompt_lower:
            result_json = {
                "action": "search_audience",
                "navigation_target": "audiences",
                "spoken_response": f"Opening Audience & Segments for {location}, {display_name}.",
                "title": "Audience Search",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "audience director" in prompt_lower or "citizen list" in prompt_lower or "citizen director" in prompt_lower or "user list" in prompt_lower or "registered user" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "users",
                "spoken_response": f"Opening Audience Directory for you, {display_name}. Here are all registered citizens.",
                "title": "Audience Directory",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "audit" in prompt_lower or "audit log" in prompt_lower or "system log" in prompt_lower or "activity log" in prompt_lower or "audit trail" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "audit_logs",
                "spoken_response": f"Opening Audit Trail Logs for you, {display_name}. Here is the full system activity history.",
                "title": "Audit Logs",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "manager" in prompt_lower and ("director" in prompt_lower or "list" in prompt_lower or "all manager" in prompt_lower or "campaign manager" in prompt_lower):
            result_json = {
                "action": "navigate",
                "navigation_target": "managers",
                "spoken_response": f"Opening Campaign Managers Directory for you, {display_name}.",
                "title": "Managers Directory",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "sos" in prompt_lower or "distress" in prompt_lower or "sos report" in prompt_lower or "sos alert" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "sos_reports",
                "spoken_response": f"Opening SOS Reports for you, {display_name}. Here are the active distress signals.",
                "title": "SOS Reports",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "feedback" in prompt_lower or "citizen feedback" in prompt_lower or "campaign feedback" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "feedback",
                "spoken_response": f"Opening Campaign Feedback for you, {display_name}.",
                "title": "Campaign Feedback",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "fact shield" in prompt_lower or "fact check" in prompt_lower or "rumor" in prompt_lower or "misinformation" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "fact_shield",
                "spoken_response": f"Opening AI Fact Shield for you, {display_name}. Submit a rumor claim to generate a counter-campaign.",
                "title": "AI Fact Shield",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        elif "setting" in prompt_lower or "preference" in prompt_lower or "profile" in prompt_lower or "account" in prompt_lower:
            result_json = {
                "action": "navigate",
                "navigation_target": "settings",
                "spoken_response": f"Opening Settings for you, {display_name}.",
                "title": "Settings",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }
        else:
            result_json = {
                "action": "navigate",
                "navigation_target": "dashboard",
                "spoken_response": f"Yes {display_name}, how can I help you today?",
                "title": "Voice Cockpit Standby",
                "location_selected": location,
                "recipients_selected": recipients,
                "auto_trigger": False
            }

    # Ultra-fast Enterprise AI Plan enrichment (0ms overhead if single-pass Groq output is complete)
    if result_json and result_json.get("action") in ["create_campaign", "emergency_broadcast"]:
        try:
            title = result_json.get("title") or "Awareness Campaign"
            obj = result_json.get("objective") or f"Promote awareness regarding {prompt}"
            subj = result_json.get("subject") or f"Important Notice: {title}"
            body = result_json.get("body") or f"Dear {{first_name}},\n\nOfficial notice regarding {title}. Please follow prescribed guidelines.\n\nCommAI Administration"

            kpis = result_json.get("kpis") or {
                "expected_reach_pct": 88,
                "ctr_goal_pct": 28,
                "delivery_goal_pct": 98,
                "awareness_goal_description": f"Achieve target public awareness for {title}"
            }
            meta = result_json.get("metadata") or {
                "confidence": 0.95,
                "reasoning": {
                    "campaign_type": "Auto-selected based on voice intent",
                    "channels": "Selected optimal channels for target demographic"
                },
                "suggestions": ["Verify recipient list before launching", "Add local helpline number"]
            }

            full_plan = {
                "campaign": {
                    "title": title,
                    "objective": obj,
                    "campaign_type": result_json.get("category") or "awareness_drive",
                    "description": result_json.get("description") or obj
                },
                "message": {
                    "subject": subj,
                    "body": body
                },
                "delivery": {
                    "channels": result_json.get("channels") or ["email", "push"],
                    "audiences": [result_json.get("recipients_selected") or "All Citizens"],
                    "location": result_json.get("location_selected") or "All Locations"
                },
                "kpis": kpis,
                "metadata": meta,
                "risks": result_json.get("risks") or []
            }

            result_json["kpis"] = kpis
            result_json["metadata"] = meta
            result_json["full_plan"] = full_plan
            if result_json.get("location_selected") != "Unspecified":
                result_json["spoken_response"] = f"Yes {display_name}, I have generated a complete enterprise AI campaign plan for '{title}'. Parameters, message copy, and dispatch rules are pre-filled."
        except Exception as plan_err:
            logger.warning(f"[Voice AI] Fast campaign plan construction error: {plan_err}")

    return result_json


def analyze_message_for_rumor(content: str) -> dict:
    """
    Scan message content using Groq LLM to check if it contains a rumor or emergency claim.
    Returns a dict with rumor indicators and extracted geo coordinates.
    """
    system_prompt = (
        "You are an AI rumor detection system for a municipal/government emergency warning platform. "
        "Your task is to analyze an incoming citizen message and determine if it contains an unverified rumor, "
        "panic statement, or emergency-related claim (e.g. 'water is poisoned', 'bridge collapsed', 'epidemic spreading').\n\n"
        "Return a JSON object with the following fields:\n"
        "1. is_rumor: boolean (true if it represents an unverified alarm, fake news claim, or panic-inducing report; false for simple help queries, platform navigation questions, greetings, or casual talk).\n"
        "2. claim_summary: string (short, concise description of the claim, e.g., 'Contaminated water supply in Sector 5', or null if not a rumor).\n"
        "3. category: string ('water', 'medical', 'disaster', 'security', 'infrastructure', 'general', or null if not a rumor).\n"
        "4. state: string (extracted Indian state name mentioned, e.g. 'Maharashtra', or null if not found).\n"
        "5. district: string (extracted district name, e.g. 'Pune', or null if not found).\n"
        "6. city: string (extracted city or area name, e.g. 'Pimpri-Chinchwad', or null if not found).\n"
        "7. pincode: string (extracted 6-digit postal code, or null if not found).\n\n"
        "Rules:\n"
        "- Respond ONLY with the JSON object. Do not wrap in markdown fences or include any conversational filler.\n"
        "- Be conservative: flag true only if the citizen is reporting a crisis/rumor/danger claim."
    )

    response = _call_groq(system_prompt, f"Citizen message to scan: {content}", temperature=0.1, max_tokens=300)
    if not response:
        return {"is_rumor": False, "claim_summary": None, "category": "general", "state": None, "district": None, "city": None, "pincode": None}

    try:
        # Clean response if markdown blocks exist
        cleaned = response.strip()
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)
        import json
        parsed = json.loads(cleaned)
        return parsed
    except Exception as err:
        logger.warning(f"[Rumor Scan AI] Failed to parse JSON response: {err}. Raw: {response}")
        return {"is_rumor": False, "claim_summary": None, "category": "general", "state": None, "district": None, "city": None, "pincode": None}


def generate_fact_check_draft(claim: str, refuted_context: str) -> str:
    """
    Generate an official fact-check warning using Groq based on RAG knowledge base.
    """
    system_prompt = (
        "You are an official spokesperson for the municipal and emergency communications bureau.\n"
        "Your task is to write a brief, authoritative public alert refuting a rumor. "
        "You must base your response strictly on the verified facts provided below.\n\n"
        "Verified Facts / Official Context:\n"
        f"{refuted_context}\n\n"
        "Instructions:\n"
        "1. Write a direct, clear message (2-4 sentences max).\n"
        "2. State clearly that the rumor is false and provide the official correct info.\n"
        "3. Keep the tone calm, professional, and reassuring. Urge citizens to avoid forwarding unverified alerts.\n"
        "4. Output ONLY the draft text. Do not add salutations, greetings, bracketed placeholder signatures, or explanations."
    )

    user_query = f"Rumor Claim to neutralize: {claim}"
    response = _call_groq(system_prompt, user_query, temperature=0.3, max_tokens=400)
    if response and response.strip():
        return response.strip()

    return f"This rumor regarding '{claim}' is unverified. Please rely only on official government channels for safety and public service updates."




