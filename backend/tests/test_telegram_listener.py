import json
import pytest
from app.database import SessionLocal
from app.models import Audience
from app.services import telegram_bot_listener

def test_extract_phone_digits():
    assert telegram_bot_listener.extract_phone_digits("+917569567472") == "7569567472"
    assert telegram_bot_listener.extract_phone_digits("9876543210") == "9876543210"
    assert telegram_bot_listener.extract_phone_digits("") == ""

def test_process_telegram_contact_update(monkeypatch):
    db = SessionLocal()
    # Create test audience profile
    test_phone = "+919988776655"
    aud = db.query(Audience).filter(Audience.phone == test_phone).first()
    if not aud:
        aud = Audience(
            first_name="TestLink",
            last_name="User",
            phone=test_phone,
            preferred_languages=json.dumps(["English"]),
            occupation="General Public",
            age=25,
            gender="Male",
            state="Punjab",
            district="Ludhiana",
            city="Ludhiana",
            preferred_channels=json.dumps(["email"])
        )
        db.add(aud)
        db.commit()
        db.refresh(aud)

    # Mock send_telegram_reply to avoid real HTTP requests
    replies = []
    def mock_reply(chat_id, text, bot_token):
        replies.append((chat_id, text))

    monkeypatch.setattr(telegram_bot_listener, "send_telegram_reply", mock_reply)

    # Simulate Telegram contact update payload
    fake_update = {
        "update_id": 1001,
        "message": {
            "chat": {"id": 999111222},
            "contact": {
                "phone_number": "+919988776655",
                "first_name": "TestLink"
            }
        }
    }

    telegram_bot_listener.process_telegram_update(fake_update, bot_token="fake_token")

    # Re-fetch audience profile from DB
    db.expire_all()
    updated_aud = db.query(Audience).filter(Audience.phone == test_phone).first()
    custom = json.loads(updated_aud.custom_fields) if updated_aud.custom_fields else {}
    channels = json.loads(updated_aud.preferred_channels) if updated_aud.preferred_channels else []

    assert custom.get("telegram_chat_id") == "999111222"
    assert "telegram" in channels
    assert len(replies) == 1
    assert "Account Successfully Linked" in replies[0][1]

    # Clean up
    db.delete(updated_aud)
    db.commit()
    db.close()
