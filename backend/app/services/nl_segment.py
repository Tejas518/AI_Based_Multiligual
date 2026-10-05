"""
Natural Language Segment Service — Converts plain-English audience queries
into structured filter_criteria JSON using Groq.
"""
import json
import logging
import re
from app.services.ai_service import _call_groq
from app.config import settings

logger = logging.getLogger("commai.nl_segment")


def parse_natural_language_filter(query: str) -> dict | None:
    """
    Send a natural-language audience query to Groq and get back a structured
    filter_criteria dict compatible with build_segment_filter_query().
    """
    system_prompt = (
        "You are an AI assistant for a government mass-communication platform. "
        "Your task is to convert a natural-language audience query into a structured JSON filter.\n\n"
        "Available filter fields:\n"
        f"- states: Array of Indian state names (e.g. {json.dumps(settings.LANGUAGES[:5])}...)\n"
        f"- occupations: Array from {json.dumps(settings.OCCUPATIONS)}\n"
        "- language: A single language string for preferred_languages match\n"
        "- genders: Array of 'Male', 'Female', 'Other'\n"
        "- age_gte: Minimum age (integer)\n"
        "- age_lte: Maximum age (integer)\n"
        "- districts: Array of district names\n"
        "- cities: Array of city names\n"
        "- channels: Array from ['email', 'sms', 'whatsapp', 'push', 'website']\n"
        "- logic: Always 'AND'\n\n"
        "Rules:\n"
        "1. Return ONLY a JSON object. No markdown fences, no explanation.\n"
        "2. Only include fields that the user's query explicitly or implicitly references.\n"
        "3. Always include 'logic': 'AND'.\n"
        "4. Use proper Indian state names (e.g. 'Uttar Pradesh', not 'UP').\n"
        "5. Map common aliases: 'doctors'/'nurses'/'medical staff' → 'Healthcare Worker', "
        "'teachers'/'educators' → 'Teacher', 'youth'/'students' → 'Student', etc.\n"
        "6. If the user says 'under 30' → age_lte: 30. 'above 40' → age_gte: 40. "
        "'between 20 and 40' → age_gte: 20, age_lte: 40."
    )

    result = _call_groq(system_prompt, query, temperature=0.1, max_tokens=500)
    if not result:
        return None

    try:
        # Extract JSON from possible surrounding text
        match = re.search(r'\{.*\}', result, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
        else:
            parsed = json.loads(result)

        # Ensure logic field exists
        if "logic" not in parsed:
            parsed["logic"] = "AND"

        return parsed
    except Exception as e:
        logger.error(f"[NL-Segment] Failed to parse filter: {e}. Raw: {result}")
        return None


def generate_segment_explanation(query: str, filter_criteria: dict) -> str:
    """Generate a human-readable explanation of the parsed filter."""
    system_prompt = (
        "You are an assistant. Given a natural language query and its parsed filter criteria, "
        "write a brief 1-2 sentence explanation of what audience this filter targets. "
        "Be specific and clear. Do not use markdown."
    )
    user_content = (
        f"Query: {query}\n"
        f"Parsed Filter: {json.dumps(filter_criteria)}"
    )
    explanation = _call_groq(system_prompt, user_content, temperature=0.2, max_tokens=150)
    return explanation or "Filter parsed from your natural language query."
