import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_password_hash
from app.database import get_db, Base, engine, SessionLocal
from app.models import User, Audience, CitizenMessage

client = TestClient(app)

# Helper function to resolve the active DB session (reusing override if present)
def get_test_db():
    if get_db in app.dependency_overrides:
        override_func = app.dependency_overrides[get_db]
        gen = override_func()
        db = next(gen)
        if db.bind:
            Base.metadata.create_all(bind=db.bind)
        return db
    else:
        # Fallback to local session
        Base.metadata.create_all(bind=engine)
        return SessionLocal()

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    db = get_test_db()
    
    # Clean up any leftover test data
    db.query(Audience).filter(Audience.id == "aud_123_test").delete()
    db.query(User).filter(User.email == "operator_test@example.com").delete()
    db.commit()

    # Create operator user
    manager = User(
        email="operator_test@example.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="Operator Test",
        role="campaign_manager",
        is_active=True
    )
    db.add(manager)
    
    # Create audience member
    aud = Audience(
        id="aud_123_test",
        first_name="Ramesh",
        last_name="Kumar",
        email="ramesh@example.test",
        phone="9876543210",
        preferred_languages='["Hindi"]',
        occupation="Farmer",
        age=45,
        gender="Male",
        state="Uttar Pradesh",
        district="Varanasi",
        city="Varanasi",
        preferred_channels='["whatsapp"]',
        is_active=True
    )
    db.add(aud)
    
    db.commit()
    # Close session if it was generated locally
    if get_db not in app.dependency_overrides:
        db.close()

def get_auth_headers():
    resp = client.post(
        "/api/auth/login",
        data={"username": "operator_test@example.com", "password": "Password123!"}
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_manual_reply_success(monkeypatch):
    called_dispatch = []
    def mock_dispatch(channel, audience, subject, body, **kwargs):
        called_dispatch.append((channel, audience.id, subject, body))
        return True, "", channel

    from app.services import dispatcher
    monkeypatch.setattr(dispatcher, "dispatch_to_channel", mock_dispatch)

    headers = get_auth_headers()
    payload = {
        "audience_id": "aud_123_test",
        "content": "Hello Ramesh, this is a manual operator reply.",
        "channel": "whatsapp"
    }

    response = client.post(
        "/api/webhook/manual-reply",
        json=payload,
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["audience_id"] == "aud_123_test"
    assert data["direction"] == "outbound"
    assert data["content"] == "Hello Ramesh, this is a manual operator reply."
    assert data["auto_reply"] is None

    # Check dispatcher was called
    assert len(called_dispatch) == 1
    assert called_dispatch[0][1] == "aud_123_test"
    assert called_dispatch[0][3] == "Hello Ramesh, this is a manual operator reply."

    # Verify message is stored in database
    db = get_test_db()
    msg = db.query(CitizenMessage).filter(CitizenMessage.id == data["id"]).first()
    assert msg is not None
    assert msg.direction == "outbound"
    assert msg.content == "Hello Ramesh, this is a manual operator reply."
    if get_db not in app.dependency_overrides:
        db.close()

def test_manual_reply_invalid_audience():
    headers = get_auth_headers()
    payload = {
        "audience_id": "non_existent_audience",
        "content": "Should fail",
        "channel": "whatsapp"
    }
    response = client.post(
        "/api/webhook/manual-reply",
        json=payload,
        headers=headers
    )
    assert response.status_code == 404
    assert "Audience member not found" in response.json()["detail"]

def test_manual_reply_unauthorized():
    payload = {
        "audience_id": "aud_123_test",
        "content": "Should fail",
        "channel": "whatsapp"
    }
    response = client.post(
        "/api/webhook/manual-reply",
        json=payload
    )
    assert response.status_code == 401
