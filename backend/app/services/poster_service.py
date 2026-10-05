"""
Poster Generation Service — Hybrid Architecture
=================================================
Layer 1: AI generates a TEXT-FREE visual background (no words, no letters).
Layer 2: Groq LLM generates structured poster content translated into the
         selected language (headline, body points, CTA, helpline, footer).
Layer 3: Frontend Canvas composites the translated text on the background
         using proper font rendering (Noto Sans for all Indic scripts).

This approach solves the fundamental problem of AI image generators producing
garbled/misspelled text — especially in non-Latin scripts like Devanagari,
Tamil, Telugu, etc.
"""
import json
import logging
import re
import urllib.parse
from app.services.ai_service import _call_groq, _clean_json_string

logger = logging.getLogger("commai.poster_service")


# ---------------------------------------------------------------------------
# Category → visual theme mapping for image prompts
# ---------------------------------------------------------------------------
CATEGORY_VISUALS = {
    "emergency": (
        "high-visibility red and orange alert tones, warning symbols, urgent design cues, "
        "bold geometric shapes, clean vector graphics, high contrast, dark sky gradients"
    ),
    "awareness": (
        "bright and positive community setting, clean environment, public-spirited illustrations, "
        "modern vector icons, abstract shapes, uplifting lighting, welcoming colors"
    ),
    "education": (
        "warm and inspiring learning environment, educational motifs, growth symbols, "
        "scholarly illustrations, clean vector shapes, golden/warm lighting"
    ),
    "announcement": (
        "official blue and white styling, professional abstract backdrop, formal geometric layout, "
        "podium or public forum silhouettes, clean official presentation"
    ),
}

# Category → translated category label prefix (for poster content)
CATEGORY_CONTEXT = {
    "emergency": "emergency alert / disaster warning",
    "awareness": "public awareness campaign",
    "education": "educational outreach program",
    "announcement": "official government announcement",
}

TONE_ADJECTIVES = {
    "formal": "professional, authoritative, and official",
    "urgent": "urgent, impactful, and action-oriented",
    "empathetic": "warm, reassuring, and supportive",
    "simplified": "simple, clear, and easy to understand",
}


def _strip_text_references(prompt: str) -> str:
    """
    Aggressively strip any sentence or clause from the prompt that references
    text, headlines, fonts, buttons-with-text, labels, captions, slogans,
    typography, or anything that would cause the image model to render text.
    
    Works by splitting into sentences, then filtering out any sentence
    containing text-related keywords.
    """
    # Keywords that indicate a sentence is describing text on the image
    TEXT_KEYWORDS = [
        'headline', 'heading', 'title text', 'subtitle', 'subheading',
        'reads', 'reading', 'says', 'saying', 'displays text',
        'font', 'typography', 'typeface', 'lettering', 'calligraphy',
        'body text', 'text overlay', 'text box', 'text area',
        'caption', 'label', 'slogan', 'tagline', 'motto',
        'call-to-action', 'call to action', 'cta button',
        'button reads', 'button says', 'banner reads', 'banner says',
        'written in', 'written on', 'inscribed', 'engraved',
        'bold white font', 'bold font', 'large font', 'clear font',
        'in bold', 'bold text', 'italic text',
        'words', 'word ', 'worded',
        'learn more', 'click here', 'visit us', 'contact us',
        'sign reads', 'signage reads', 'poster reads',
    ]
    
    # Split into sentences by period, preserving some structure
    sentences = re.split(r'(?<=[.!?])\s+', prompt)
    
    filtered = []
    for sentence in sentences:
        sentence_lower = sentence.lower().strip()
        # Skip empty sentences
        if not sentence_lower:
            continue
        # Check if this sentence contains any text-related keywords
        has_text_ref = any(kw in sentence_lower for kw in TEXT_KEYWORDS)
        if not has_text_ref:
            filtered.append(sentence.strip())
    
    result = ' '.join(filtered)
    
    # Also remove any inline quoted text like "Get Ready" or 'Learn More'
    result = re.sub(r'"[^"]*"', '', result)
    result = re.sub(r"'[^']*'", '', result)
    
    # Remove dangling phrases like "in bold" or "in white"
    result = re.sub(r'\bin\s+bold\b', '', result, flags=re.IGNORECASE)
    
    # Clean up double spaces and trailing commas
    result = re.sub(r'\s{2,}', ' ', result)
    result = re.sub(r',\s*,', ',', result)
    result = re.sub(r',\s*\.', '.', result)
    
    return result.strip()


def generate_poster_prompt(
    title: str,
    description: str,
    category: str = "awareness",
    tone: str = "formal",
    language: str = "English",
) -> str | None:
    """
    Use Groq to craft a detailed image-generation prompt that produces a
    TEXT-FREE visual background. The prompt explicitly excludes all text,
    typography, words, letters, and numbers from the generated image.
    """
    visual_theme = CATEGORY_VISUALS.get(category, CATEGORY_VISUALS["awareness"])

    # Key insight: Ask the LLM to describe a SCENE or ILLUSTRATION,
    # NOT a "poster" — because describing a "poster" triggers the LLM
    # to include text elements like headlines, buttons, captions, etc.
    system_prompt = (
        "You are an expert at writing prompts for AI image generation.\n"
        "Your task: Describe a vivid SCENIC ILLUSTRATION or LANDSCAPE ARTWORK.\n\n"
        "## CRITICAL CONSTRAINTS ##\n"
        "- You are describing a SCENE, NOT a poster. NOT a flyer. NOT a document.\n"
        "- Do NOT mention ANY text, headlines, titles, fonts, captions, labels,\n"
        "  buttons, slogans, banners with writing, or any form of written words.\n"
        "- Do NOT use phrases like 'headline reads', 'text says', 'button reads',\n"
        "  'body text', 'caption', 'in bold font', 'call to action', or similar.\n"
        "- Describe ONLY: colors, shapes, illustrations, icons, silhouettes,\n"
        "  landscapes, weather, people (as silhouettes), nature, abstract patterns.\n"
        "- The scene should have a darker/simpler bottom 40% area (gradient to dark).\n"
        "- Style: digital illustration, vector art, modern, clean.\n"
        "- Keep under 80 words.\n"
        "- Return ONLY the scene description. No explanations.\n"
    )

    user_content = (
        f"Create a scene illustration inspired by: {title}\n"
        f"Context: {description}\n"
        f"Visual mood: {visual_theme}\n"
        f"IMPORTANT: Describe ONLY the visual scene. No text, no words, no headlines."
    )

    prompt = _call_groq(system_prompt, user_content, temperature=0.5, max_tokens=200)
    
    if prompt:
        # AGGRESSIVE POST-PROCESSING: Strip any sentence that mentions text
        prompt = _strip_text_references(prompt)
        
        # Ensure the prompt still has meaningful content after stripping
        if len(prompt.split()) < 10:
            # If too much was stripped, fall back to a template-based prompt
            prompt = (
                f"A vivid digital illustration depicting {visual_theme}, "
                f"inspired by the theme of {title.lower()}. "
                f"Modern vector art style, clean composition, vibrant colors, "
                f"professional government infographic quality. "
                f"The bottom 40% of the image fades to a dark gradient."
            )

        # Always append the negative constraint suffix
        prompt += (
            ", digital illustration, purely visual, no text, no words, "
            "no letters, no numbers, no typography, no writing, no signage, "
            "no labels, no captions, no watermarks, text-free background"
        )
    
    return prompt


def generate_poster_content(
    title: str,
    description: str,
    category: str = "awareness",
    tone: str = "formal",
    language: str = "English",
) -> dict | None:
    """
    Use Groq LLM to generate structured poster text content TRANSLATED into
    the selected language. Returns a dictionary with headline, subheadline,
    body_points, call_to_action, helpline, and footer — all in the target language.
    """
    category_desc = CATEGORY_CONTEXT.get(category, CATEGORY_CONTEXT["awareness"])
    tone_desc = TONE_ADJECTIVES.get(tone, TONE_ADJECTIVES["formal"])

    system_prompt = (
        "You are an expert government communication content writer and translator.\n"
        "Your task is to generate structured poster/flyer text content for a public "
        f"communication campaign.\n\n"
        f"ALL OUTPUT TEXT MUST BE IN: {language}\n"
        f"If the language is not English, translate ALL fields into {language}.\n"
        f"The tone should be {tone_desc}.\n"
        f"This is a {category_desc}.\n\n"
        "CRITICAL: Output all text as RAW UTF-8 characters. Do NOT use unicode "
        "escape sequences (like \\u0915). Write directly in the target script "
        "(e.g., write 'मानसून' not '\\u092e\\u093e\\u0928\\u0938\\u0942\\u0928').\n\n"
        "Return a JSON object with EXACTLY this structure:\n"
        "{\n"
        '  "headline": "Main poster headline (translated, max 8 words)",\n'
        '  "subheadline": "Secondary tagline or category descriptor (translated, max 12 words)",\n'
        '  "body_points": ["Point 1 (translated)", "Point 2 (translated)", "Point 3 (translated)"],\n'
        '  "call_to_action": "Clear action statement (translated, max 10 words)",\n'
        '  "helpline": "Helpline info if applicable, e.g. Helpline: 1800-XXX-XXXX (use translated label, keep number in digits)",\n'
        '  "footer": "Footer text like department/authority name (translated)"\n'
        "}\n\n"
        "Rules:\n"
        "- body_points must have exactly 3 concise bullet points\n"
        "- Keep each point under 15 words\n"
        "- headline should be impactful and culturally appropriate\n"
        "- helpline should include a realistic number format\n"
        "- Return ONLY the JSON object, no markdown fences, no explanations\n"
    )

    user_content = (
        f"Campaign Title: {title}\n"
        f"Campaign Brief: {description}\n"
        f"Category: {category}\n"
        f"Target Language: {language}\n"
    )

    result = _call_groq(system_prompt, user_content, temperature=0.3, max_tokens=600)

    if not result:
        logger.warning("[POSTER] Groq returned empty result for poster content generation.")
        return _generate_fallback_content(title, description, category, language)

    try:
        cleaned = _clean_json_string(result)
        parsed = json.loads(cleaned)

        # Validate required keys exist
        required_keys = ["headline", "subheadline", "body_points", "call_to_action"]
        for key in required_keys:
            if key not in parsed:
                logger.warning(f"[POSTER] Missing key '{key}' in LLM response. Using fallback.")
                return _generate_fallback_content(title, description, category, language)

        # Ensure body_points is a list
        if not isinstance(parsed.get("body_points"), list):
            parsed["body_points"] = [str(parsed.get("body_points", ""))]

        # Ensure we have at least 3 body points (pad if needed)
        while len(parsed["body_points"]) < 3:
            parsed["body_points"].append("")

        # Set defaults for optional fields
        parsed.setdefault("helpline", "")
        parsed.setdefault("footer", "")

        return parsed

    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"[POSTER] Failed to parse poster content JSON: {e}. Raw: {result}")
        return _generate_fallback_content(title, description, category, language)


def _generate_fallback_content(
    title: str,
    description: str,
    category: str,
    language: str,
) -> dict:
    """
    Generate basic fallback poster content when LLM is unavailable.
    Uses the input title/description as-is (untranslated).
    """
    category_labels = {
        "emergency": "⚠️ Emergency Alert",
        "awareness": "📢 Public Awareness",
        "education": "📚 Educational Notice",
        "announcement": "📋 Official Announcement",
    }

    # Split description into up to 3 bullet points
    sentences = re.split(r'[.!?]+', description)
    sentences = [s.strip() for s in sentences if s.strip()]
    body_points = sentences[:3]
    while len(body_points) < 3:
        body_points.append("")

    return {
        "headline": title,
        "subheadline": category_labels.get(category, "📢 Public Notice"),
        "body_points": body_points,
        "call_to_action": "Stay informed. Stay safe.",
        "helpline": "Helpline: 1800-111-555",
        "footer": f"Generated by CommAI • Language: {language}",
        "_is_fallback": True,
    }


def generate_poster_url(prompt: str, width: int = 1024, height: int = 1024) -> str:
    """Generate a poster image URL using the free Pollinations.ai API.
    
    Uses the Flux model which is significantly better at respecting
    'no text' instructions compared to the default model. Also passes
    an explicit negative prompt to suppress text/typography artifacts.
    """
    encoded = urllib.parse.quote(prompt)
    # Negative prompt to suppress any text/typography the model might generate
    negative = urllib.parse.quote(
        "text, words, letters, numbers, typography, writing, signage, "
        "labels, captions, watermarks, logos with text, headings, titles, "
        "banners with text, blurry text, garbled text, misspelled words"
    )
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}"
        f"&model=flux"
        f"&negative={negative}"
        f"&nologo=true"
    )
    return url
