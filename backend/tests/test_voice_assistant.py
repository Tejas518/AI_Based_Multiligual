"""
Unit tests for Hands-Free Voice-to-Campaign AI Assistant feature.
"""

import pytest
from unittest.mock import patch, MagicMock
from app.config import settings
settings.GROQ_API_KEY = ""
settings.GROQ_API_KEY_SECONDARY = ""

from app.services.ai_service import plan_complete_campaign


@patch("app.services.ai_service._call_groq")
def test_voice_campaign_plan_generation(mock_call_groq):
    mock_json_response = """
    {
      "campaign": {
        "title": "Varanasi Flood Relief Emergency Drive",
        "objective": "Provide immediate flood evacuation warnings and shelter info",
        "campaign_type": "emergency_alert",
        "description": "Urgent evacuation notice for citizens near Ganges riverbanks"
      },
      "target_segment": {
        "suggested_name": "Varanasi Ganges Riverbank Residents",
        "description": "Citizens living in flood-prone districts of Varanasi"
      },
      "delivery": {
        "channels": ["voice", "sms", "whatsapp"],
        "schedule": "immediate"
      },
      "message": {
        "subject": "🚨 Flood Evacuation Alert - Varanasi",
        "body": "Dear {{first_name}}, a flood warning has been issued for {{city}}. Please evacuate to nearest relief shelter immediately."
      }
    }
    """
    mock_call_groq.return_value = mock_json_response

    plan = plan_complete_campaign(
        brief="Create an emergency flood alert campaign for Varanasi in Hindi",
        category_hint="emergency"
    )

    assert plan is not None
    assert plan["campaign"]["title"] == "Varanasi Flood Relief Emergency Drive"
    assert plan["campaign"]["campaign_type"] == "emergency_alert"
    assert "voice" in plan["delivery"]["channels"]
    assert "flood" in plan["message"]["body"].lower() or "evacuate" in plan["message"]["body"].lower()


def test_process_voice_command_staff_chat_dm_dictation():
    from app.services.ai_service import process_voice_command

    cmd = "open staff chat and message Ramesh Manager is everything good at your end?"
    res = process_voice_command(
        prompt=cmd,
        user_role="admin",
        user_name="Riyanshi",
        known_recipients=["Ramesh Sharma", "Yashvi", "All Citizens"]
    )

    assert res["navigation_target"] == "operator_chat"
    assert res["action"] == "navigate"
    assert res["target_manager"] is not None
    assert "is everything good at your end" in res["message_text"].lower() or "ramesh" in res["spoken_response"].lower()
    assert res["requires_confirmation"] is True


def test_process_voice_command_operator_chat_emergency_keyword_preservation():
    from app.services.ai_service import process_voice_command

    cmd = "staff update flood warning in district 4 resolved"
    active_ctx = {"active_tab": "operator_chat", "target_manager": "Yashvi", "target_channel": "general"}
    
    res = process_voice_command(
        prompt=cmd,
        user_role="campaign_manager",
        user_name="Riyanshi",
        active_context=active_ctx
    )

    assert res["navigation_target"] == "operator_chat"
    assert res["action"] == "navigate"
    assert "flood warning" in res["message_text"].lower()


def test_process_voice_command_affirmative_confirmation_schema():
    from app.services.ai_service import process_voice_command

    active_ctx = {
        "data": {
            "navigation_target": "campaigns",
            "action": "emergency_broadcast",
            "title": "Heatwave Advisory",
            "location_selected": "Uttar Pradesh",
            "recipients_selected": "Farmers",
            "subject": "[Uttar Pradesh] Heatwave Alert",
            "category": "emergency_alert",
            "locations_list": ["Uttar Pradesh", "All Locations"],
            "recipients_list": ["Farmers", "All Citizens"],
            "channels": ["email", "push"],
            "description": "Stay hydrated and avoid afternoon direct heat exposure."
        }
    }

    res = process_voice_command(
        prompt="yes send it now",
        user_role="admin",
        user_name="Admin",
        active_context=active_ctx
    )

    assert res["user_confirmed"] is True
    assert res["action"] == "emergency_broadcast"
    assert res["navigation_target"] == "campaigns"
    assert res["location_selected"] == "Uttar Pradesh"
    assert res["recipients_selected"] == "Farmers"
    assert res["subject"] == "[Uttar Pradesh] Heatwave Alert"
    assert res["category"] == "emergency_alert"
    assert "locations_list" in res
    assert "recipients_list" in res


def test_process_voice_command_agricultural_water_drive():
    from app.services.ai_service import process_voice_command

    cmd = "Create an agricultural water drive campaign for Uttar Pradesh farmers"
    res = process_voice_command(
        prompt=cmd,
        user_role="admin",
        user_name="Admin"
    )

    assert res["action"] == "create_campaign"
    assert res["navigation_target"] == "campaigns"
    assert res["location_selected"] == "Uttar Pradesh"
    assert res["recipients_selected"] == "Farmers"
    assert res["subject"] is not None and len(res["subject"]) > 5
    assert res["body"] is not None and len(res["body"]) > 20
    assert res["objective"] is not None
    assert res["requires_confirmation"] is True
    assert "drafted" in res["spoken_response"].lower() or "review" in res["spoken_response"].lower() or "uttar pradesh" in res["spoken_response"].lower()

    # Test Hinglish confirmation phrase "ha send kr de"
    confirm_ctx = {"data": res, "type": "campaign"}
    confirm_res = process_voice_command(
        prompt="ha send kr de",
        user_role="admin",
        user_name="Admin",
        active_context=confirm_ctx
    )

    assert confirm_res["user_confirmed"] is True
    assert confirm_res["action"] == "create_campaign"
    assert confirm_res["location_selected"] == "Uttar Pradesh"
    assert confirm_res["recipients_selected"] == "Farmers"
