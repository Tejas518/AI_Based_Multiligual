"""
Unit tests for Twilio Voice Call service module.
"""

import pytest
from unittest.mock import patch, MagicMock
from app.config import settings
settings.GROQ_API_KEY = ""
settings.GROQ_API_KEY_SECONDARY = ""

from app.services.voice_service import (
    clean_phone_number,
    get_voice_language_config,
    generate_twiml,
    send_voice_call
)


def test_clean_phone_number():
    assert clean_phone_number("9876543210") == "919876543210"
    assert clean_phone_number("+919876543210") == "919876543210"
    assert clean_phone_number("17623025600") == "17623025600"
    assert clean_phone_number("") == ""


def test_get_voice_language_config():
    voice, lang_code = get_voice_language_config("Hindi")
    assert voice == "Polly.Aditi"
    assert lang_code == "hi-IN"

    voice_en, lang_en = get_voice_language_config("English")
    assert voice_en == "Polly.Raveena"
    assert lang_en == "en-IN"

    voice_ta, lang_ta = get_voice_language_config("Tamil")
    assert voice_ta == "Polly.Aditi"
    assert lang_ta == "ta-IN"


def test_generate_twiml():
    msg = "Disaster warning: Heavy rains in Varanasi."
    twiml = generate_twiml(msg, "Hindi")
    
    assert '<?xml version="1.0" encoding="UTF-8"?>' in twiml
    assert '<Response>' in twiml
    assert 'voice="Polly.Aditi"' in twiml
    assert 'language="hi-IN"' in twiml
    assert "Disaster warning: Heavy rains in Varanasi." in twiml


@patch("app.services.voice_service.requests.post")
@patch("app.services.voice_service.os.getenv")
def test_send_voice_call_success(mock_getenv, mock_post):
    def getenv_side_effect(key, default=None):
        env_map = {
            "TWILIO_ACCOUNT_SID": "AC1234567890abcdef",
            "TWILIO_AUTH_TOKEN": "mock_token_123",
            "TWILIO_PHONE_NUMBER": "+17623025600"
        }
        return env_map.get(key, default)

    mock_getenv.side_effect = getenv_side_effect

    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {"sid": "CA123456789"}
    mock_post.return_value = mock_resp

    success, err = send_voice_call("9876543210", "Test emergency voice alert", "Hindi")
    assert success is True
    assert err == ""

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert kwargs["data"]["To"] == "+919876543210"
    assert kwargs["data"]["From"] == "+17623025600"
    assert "Test emergency voice alert" in kwargs["data"]["Twiml"]


@patch("app.services.voice_service.requests.post")
@patch("app.services.voice_service.os.getenv")
def test_send_voice_call_unverified_trial_number(mock_getenv, mock_post):
    def getenv_side_effect(key, default=None):
        env_map = {
            "TWILIO_ACCOUNT_SID": "AC1234567890abcdef",
            "TWILIO_AUTH_TOKEN": "mock_token_123",
            "TWILIO_PHONE_NUMBER": "+17623025600"
        }
        return env_map.get(key, default)

    mock_getenv.side_effect = getenv_side_effect

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {
        "code": 21608,
        "message": "The number is unverified."
    }
    mock_post.return_value = mock_resp

    success, err = send_voice_call("9876543210", "Test alert", "English")
    assert success is True
    assert err == "trial_unverified"


def test_process_voice_command_sentiment_map():
    from app.services.ai_service import process_voice_command
    
    cmd = "create a sentiment map emergency alert for uttar pradesh student for flood alert"
    res = process_voice_command(prompt=cmd, user_role="campaign_manager", user_name="Test")
    
    assert res["navigation_target"] == "sentiment_map"
    assert res["location_selected"] == "Uttar Pradesh"
    assert res["recipients_selected"].lower() == "students"
    assert res["action"] == "emergency_broadcast"


def test_process_voice_command_send_to_person():
    from app.services.ai_service import process_voice_command
    
    cmd = "send this to riyanshi verma"
    res = process_voice_command(prompt=cmd, user_role="campaign_manager", user_name="Test")
    
    assert res["navigation_target"] != "operator_chat"
    assert res["recipients_selected"] == "Riyanshi Verma"
    assert res["action"] == "send_alert"


def test_process_voice_command_unspecified_location():
    from app.services.ai_service import process_voice_command
    
    cmd = "create emergency alert for heatwave warning"
    res = process_voice_command(prompt=cmd, user_role="campaign_manager", user_name="Test")
    
    assert "which state or location" in res["spoken_response"].lower()
    assert res["channels"] == ["email", "push"]
    assert "move to higher ground" not in res["description"].lower()


def test_process_voice_command_dm_dictation():
    from app.services.ai_service import process_voice_command
    
    cmd = "send message to Yashvi saying please review the draft campaign"
    res = process_voice_command(prompt=cmd, user_role="campaign_manager", user_name="Test")
    
    assert res["navigation_target"] == "operator_chat"
    assert res["action"] == "navigate"
    assert "yashvi" in res["spoken_response"].lower()


def test_process_voice_command_override_pending_confirmation_on_new_intent():
    from app.services.ai_service import process_voice_command
    
    active_ctx = {
        "data": {
            "navigation_target": "campaigns",
            "action": "emergency_broadcast",
            "title": "Heatwave Advisory",
            "requires_confirmation": True
        }
    }
    
    res = process_voice_command(
        prompt="send message to Ramesh saying hello there",
        user_role="admin",
        user_name="Admin",
        active_context=active_ctx
    )
    
    assert res.get("user_confirmed") is not True
    assert res["action"] == "navigate"
    assert res["navigation_target"] == "operator_chat"
    assert res["target_manager"] == "Ramesh"



