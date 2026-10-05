import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services import telegram_service, fcm_service, dispatcher
from app.models import Audience

client = TestClient(app)


def test_telegram_service_mock_delivery(monkeypatch):
    """Verify that send_telegram falls back to mock when token is not configured."""
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "")
    old_token = settings.TELEGRAM_BOT_TOKEN
    settings.TELEGRAM_BOT_TOKEN = ""
    try:
        success, msg = telegram_service.send_telegram("12345", "Test Message")
        assert success is True
        assert msg == "delivered_mock"
    finally:
        settings.TELEGRAM_BOT_TOKEN = old_token


def test_telegram_service_api_call(monkeypatch):
    """Verify that send_telegram makes a POST request to Telegram API when token is provided."""
    class MockResponse:
        status_code = 200
        headers = {"content-type": "application/json"}
        def json(self):
            return {"ok": True}

    called = []
    def mock_post(url, json, **kwargs):
        called.append((url, json))
        return MockResponse()

    monkeypatch.setattr("requests.post", mock_post)

    success, msg = telegram_service.send_telegram("12345", "Test Message", token="123456:fake_token")
    assert success is True
    assert msg == ""
    assert len(called) == 1
    assert "https://api.telegram.org/bot123456:fake_token/sendMessage" in called[0][0]
    assert called[0][1]["chat_id"] == "12345"
    assert called[0][1]["text"] == "Test Message"


def test_fcm_service_mock_delivery():
    """Verify that send_fcm_push falls back to mock when FCM is not configured."""
    old_creds = settings.FCM_SERVICE_ACCOUNT_JSON
    settings.FCM_SERVICE_ACCOUNT_JSON = ""
    try:
        success, msg = fcm_service.send_fcm_push("token_123", "Test Title", "Test Body")
        assert success is True
        assert msg == "delivered_mock"
    finally:
        settings.FCM_SERVICE_ACCOUNT_JSON = old_creds


def test_fcm_service_api_call(monkeypatch):
    """Verify send_fcm_push integrates with firebase_admin certificate certificate Certificate configuration certificate and messaging module."""
    import sys
    from types import ModuleType

    # Mock firebase_admin modules
    mock_firebase_admin = ModuleType("firebase_admin")
    mock_firebase_admin._apps = ["mock_app"]
    
    mock_credentials = ModuleType("credentials")
    def mock_cert(info):
        return "mock_cred"
    mock_credentials.Certificate = mock_cert
    mock_firebase_admin.credentials = mock_credentials

    mock_messaging = ModuleType("messaging")
    class MockNotification:
        def __init__(self, title, body):
            self.title = title
            self.body = body
    class MockMessage:
        def __init__(self, notification, token):
            self.notification = notification
            self.token = token
            
    mock_messaging.Notification = MockNotification
    mock_messaging.Message = MockMessage
    
    called_send = []
    def mock_send(msg):
        called_send.append(msg)
        return "projects/test/messages/1"
    mock_messaging.send = mock_send
    
    sys.modules["firebase_admin"] = mock_firebase_admin
    sys.modules["firebase_admin.credentials"] = mock_credentials
    sys.modules["firebase_admin.messaging"] = mock_messaging

    fake_creds = json.dumps({
        "type": "service_account",
        "project_id": "test-project",
        "private_key": "some-key",
        "client_email": "test@test.com"
    })

    success, error = fcm_service.send_fcm_push(
        token="device_token_abc",
        title="Test Title",
        body="Test Body",
        service_account_json=fake_creds
    )

    assert success is True
    assert error == ""
    assert len(called_send) == 1
    assert called_send[0].token == "device_token_abc"
    assert called_send[0].notification.title == "Test Title"
    assert called_send[0].notification.body == "Test Body"


def test_dispatcher_telegram_fallback(monkeypatch):
    """Verify dispatcher targets telegram channel using custom fields or default chat ID."""
    recipient = Audience(
        first_name="John", last_name="Doe", email="john@example.com",
        phone="9876543210", preferred_languages='["English"]', occupation="Resident",
        age=30, gender="Male", state="Delhi", district="New Delhi", city="Delhi",
        preferred_channels='["telegram"]',
        custom_fields=json.dumps({"telegram_chat_id": "998877"})
    )

    called = []
    def mock_send_telegram(chat_id, message, token=None):
        called.append((chat_id, message))
        return True, ""

    monkeypatch.setattr(dispatcher, "send_telegram", mock_send_telegram)

    success, error, actual_channel = dispatcher.dispatch_to_channel(
        "telegram", recipient, "Alert for {{first_name}}", "Hello {{first_name}}"
    )

    assert success is True
    assert actual_channel == "telegram"
    assert len(called) == 1
    assert called[0][0] == "998877"
    assert called[0][1] == "Hello John"


def test_sms_service_mock_delivery():
    """Verify send_sms mock delivery when no external gateway is configured."""
    from app.services.sms_service import send_sms
    success, msg = send_sms("+919876543210", "Test SMS Content")
    assert success is True
    assert msg == "delivered_mock"

