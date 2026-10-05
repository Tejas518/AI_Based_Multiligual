"""
Comprehensive integration tests for the CommAI backend.
Covers: Authentication, RBAC, User Management, Audience CRUD,
CSV Bulk Import, Segmentation, Templates, Campaigns (with state machine),
Audience Analytics, and Config Constants.
"""
import os
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.config import settings

# Use an in-memory database for testing to avoid Docker bind-mount locking errors
TEST_DB_URL = "sqlite://"

from sqlalchemy.pool import StaticPool
engine = create_engine(
    TEST_DB_URL, 
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db dependency
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


def test_direct_channel_dispatch_interpolates_recipient_placeholders(monkeypatch):
    """Direct state/poster messages must render recipient fields before email delivery."""
    from app.models import Audience
    from app.services import dispatcher

    recipient = Audience(
        first_name="Asha", last_name="Patel", email="asha@example.test",
        phone="9000000000", preferred_languages='["English"]', occupation="Resident",
        age=32, gender="Female", state="Maharashtra", district="Pune", city="Pune",
        preferred_channels='["email"]',
    )
    captured = {}

    def capture_email(to_email, subject, body, **kwargs):
        captured.update({"to": to_email, "subject": subject, "body": body})
        return True, ""

    monkeypatch.setattr(dispatcher, "send_email", capture_email)
    success, _, channel = dispatcher.dispatch_to_channel(
        "email",
        recipient,
        "Emergency for {{first_name}} in {city}",
        "{{first_name}} {{last_name}}, evacuate {city} in {state}.",
    )

    assert success is True
    assert channel == "email"
    assert captured == {
        "to": "asha@example.test",
        "subject": "Emergency for Asha in Pune",
        "body": "Asha Patel, evacuate Pune in Maharashtra.",
    }

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    # Create tables
    Base.metadata.create_all(bind=engine)
    # Seed default user profiles in test DB
    from app.auth import get_password_hash
    from app.models import User
    
    db = TestingSessionLocal()
    admin = User(
        email=settings.ADMIN_EMAIL,
        hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
        full_name="Test Administrator",
        role="admin",
        organization="Test Org",
        designation="Admin",
        is_active=True
    )
    db.add(admin)
    
    manager = User(
        email=settings.MANAGER_EMAIL,
        hashed_password=get_password_hash(settings.MANAGER_PASSWORD),
        full_name="Test Manager",
        role="campaign_manager",
        organization="Test Org",
        designation="Manager",
        is_active=True
    )
    db.add(manager)
    
    audience = User(
        email=settings.AUDIENCE_EMAIL,
        hashed_password=get_password_hash(settings.AUDIENCE_PASSWORD),
        full_name="Test Audience",
        role="audience",
        organization="Test Org",
        designation="Audience",
        is_active=True
    )
    db.add(audience)
    
    db.commit()
    db.close()
    
    yield
    
    # Teardown: drop tables and delete test db file
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_comm_platform.db"):
        try:
            os.remove("./test_comm_platform.db")
        except PermissionError:
            pass
            
    # Delete test settings override file
    test_settings_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "settings_test.json")
    if os.path.exists(test_settings_path):
        try:
            os.remove(test_settings_path)
        except Exception:
            pass

def get_auth_headers(email: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": password}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ========================================================================
# 1. AUTHENTICATION TESTS
# ========================================================================

class TestAuthentication:
    def test_login_success(self):
        response = client.post(
            "/api/auth/login",
            data={"username": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == settings.ADMIN_EMAIL

    def test_login_wrong_password(self):
        response = client.post(
            "/api/auth/login",
            data={"username": settings.ADMIN_EMAIL, "password": "WrongPassword"}
        )
        assert response.status_code == 401

    def test_login_json_endpoint(self):
        response = client.post(
            "/api/auth/login-json",
            json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_get_current_user(self):
        headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["role"] == "admin"

    def test_unauthorized_access(self):
        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_invalid_token(self):
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert response.status_code == 401

    def test_register_new_user(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "email": "newuser@test.com",
            "password": "TestPass123!",
            "full_name": "New Test User",
            "role": "audience",
            "phone": "9876543209",
            "organization": "Test Org",
            "designation": "Tester"
        }
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 201
        assert response.json()["email"] == "newuser@test.com"

    def test_register_duplicate_email(self):
        payload = {
            "email": settings.ADMIN_EMAIL,
            "password": "AnyPassword123!",
            "full_name": "Duplicate",
            "role": "audience",
            "phone": "9876543208"
        }
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"]


# ========================================================================
# 2. RBAC TESTS
# ========================================================================

class TestRBAC:
    def test_audience_cannot_create_audience(self):
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        payload = {
            "first_name": "Test", "last_name": "Audience", "email": "testaud@test.com", "phone": "9876543210",
            "preferred_languages": ["English"], "occupation": "Student",
            "age": 21, "gender": "Male", "state": "Maharashtra",
            "district": "Pune", "city": "Pune", "preferred_channels": ["email"]
        }
        response = client.post("/api/audiences", json=payload, headers=aud_headers)
        assert response.status_code == 403

    def test_admin_can_create_audience(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "first_name": "Test", "last_name": "Audience", "email": "test@domain.com",
            "phone": "9876543210",
            "preferred_languages": ["English", "Hindi"], "occupation": "Student",
            "age": 21, "gender": "Male", "state": "Maharashtra",
            "district": "Pune", "city": "Pune", "preferred_channels": ["email", "sms"],
            "is_active": True
        }
        response = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert response.status_code == 201
        assert response.json()["first_name"] == "Test"

    def test_audience_cannot_list_users(self):
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/users", headers=aud_headers)
        assert response.status_code == 403

    def test_manager_can_list_audience_users(self):
        mgr_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/users", headers=mgr_headers)
        assert response.status_code == 200
        data = response.json()
        assert all(u["role"] == "audience" for u in data)


# ========================================================================
# 3. USER MANAGEMENT TESTS (Admin-only)
# ========================================================================

class TestUserManagement:
    def test_admin_list_users(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        response = client.get("/api/users", headers=admin_headers)
        assert response.status_code == 200
        users = response.json()
        assert len(users) >= 3  # admin, manager, audience + possibly newuser

    def test_admin_list_users_filter_by_role(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        response = client.get("/api/users?role=admin", headers=admin_headers)
        assert response.status_code == 200
        for user in response.json():
            assert user["role"] == "admin"

    def test_admin_list_users_search(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        response = client.get("/api/users?search=Manager", headers=admin_headers)
        assert response.status_code == 200
        assert any("Manager" in u["full_name"] for u in response.json())

    def test_admin_update_user_role(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        # Get the audience user
        response = client.get("/api/users?role=audience", headers=admin_headers)
        users = response.json()
        # Find newuser@test.com or any audience that's not the seeded one
        target = None
        for u in users:
            if u["email"] == "newuser@test.com":
                target = u
                break
        if target:
            response = client.put(
                f"/api/users/{target['id']}",
                json={"role": "campaign_manager"},
                headers=admin_headers
            )
            assert response.status_code == 200
            assert response.json()["role"] == "campaign_manager"
            # Revert
            client.put(
                f"/api/users/{target['id']}",
                json={"role": "audience"},
                headers=admin_headers
            )

    def test_admin_cannot_deactivate_self(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        # Get admin's own user ID
        me_resp = client.get("/api/auth/me", headers=admin_headers)
        admin_id = me_resp.json()["id"]
        response = client.put(
            f"/api/users/{admin_id}",
            json={"is_active": False},
            headers=admin_headers
        )
        assert response.status_code == 400
        assert "own account" in response.json()["detail"]


# ========================================================================
# 4. AUDIENCE CRUD TESTS
# ========================================================================

class TestAudienceCRUD:
    def test_reject_invalid_email(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "first_name": "Bad", "last_name": "Format", "email": "not-an-email",
            "phone": "9876543211", "preferred_languages": ["English"],
            "occupation": "Student", "age": 25, "gender": "Female",
            "state": "Bihar", "district": "Patna", "city": "Patna",
            "preferred_channels": ["email"]
        }
        response = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert response.status_code == 422

    def test_reject_short_phone(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "first_name": "Bad", "last_name": "Phone", "email": "valid@email.com",
            "phone": "123", "preferred_languages": ["English"],
            "occupation": "Student", "age": 25, "gender": "Female",
            "state": "Bihar", "district": "Patna", "city": "Patna",
            "preferred_channels": ["email"]
        }
        response = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert response.status_code == 422

    def test_create_and_get_audience(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "first_name": "Riya", "last_name": "Sharma", "email": "riya@test.com",
            "phone": "9876543212", "preferred_languages": ["English", "Hindi"],
            "occupation": "Student", "age": 22, "gender": "Female",
            "state": "Bihar", "district": "Patna", "city": "Patna",
            "preferred_channels": ["email", "whatsapp"]
        }
        response = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert response.status_code == 201
        created_id = response.json()["id"]

        # GET by ID
        response = client.get(f"/api/audiences/{created_id}", headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["first_name"] == "Riya"

    def test_duplicate_phone_rejected(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "first_name": "Dup", "last_name": "Phone", "email": "dup@test.com",
            "phone": "9876543210",  # already exists from RBAC test
            "preferred_languages": ["English"], "occupation": "Student",
            "age": 21, "gender": "Male", "state": "Maharashtra",
            "district": "Pune", "city": "Pune", "preferred_channels": ["email"]
        }
        response = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert response.status_code == 400
        assert "Phone number already exists" in response.json()["detail"]

    def test_list_audiences_with_filters(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        response = client.get("/api/audiences?occupation=Student", headers=admin_headers)
        assert response.status_code == 200
        for aud in response.json()["results"]:
            assert aud["occupation"] == "Student"

    def test_patch_audience(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        # Get first audience
        response = client.get("/api/audiences", headers=admin_headers)
        auds = response.json()["results"]
        if auds:
            aud_id = auds[0]["id"]
            response = client.patch(
                f"/api/audiences/{aud_id}",
                json={"occupation": "Teacher"},
                headers=admin_headers
            )
            assert response.status_code == 200
            assert response.json()["occupation"] == "Teacher"

    def test_delete_audience(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        # Create one to delete
        payload = {
            "first_name": "Delete", "last_name": "Me", "email": "delete@test.com",
            "phone": "9876543299", "preferred_languages": ["English"],
            "occupation": "Student", "age": 20, "gender": "Male",
            "state": "Delhi", "district": "Delhi", "city": "Delhi",
            "preferred_channels": ["sms"]
        }
        create_resp = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert create_resp.status_code == 201
        del_id = create_resp.json()["id"]

        response = client.delete(f"/api/audiences/{del_id}", headers=admin_headers)
        assert response.status_code == 200
        assert "permanently deleted" in response.json()["message"]

        # Verify it's gone from list
        get_resp = client.get(f"/api/audiences/{del_id}", headers=admin_headers)
        assert get_resp.status_code == 404


# ========================================================================
# 5. CSV BULK IMPORT TESTS
# ========================================================================

class TestBulkImport:
    def test_csv_import(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        csv_data = (
            "first_name,last_name,email,phone,preferred_languages,occupation,age,gender,state,district,city,preferred_channels\n"
            'Rajesh,Kumar,rajesh@agri.in,9900112233,"Hindi,Punjabi",Farmer,45,Male,Punjab,Ludhiana,Ludhiana,"sms,whatsapp"\n'
            'Sita,Devi,sita@health.org,9900112244,"Hindi,English",Healthcare Worker,38,Female,Uttar Pradesh,Varanasi,Varanasi,"email,whatsapp"\n'
            ",LastName,missing@email.com,9900112255,English,Student,20,Female,Punjab,Ludhiana,Ludhiana,email\n"  # fail: no first_name
            "BadLanguage,User,bad@email.com,9900112266,French,Teacher,35,Male,Delhi,Delhi,Delhi,email\n"  # fail: bad language
        )
        files = {"file": ("test_import.csv", csv_data, "text/csv")}
        response = client.post("/api/audiences/import", files=files, headers=manager_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["fail_count"] == 2


# ========================================================================
# 6. SEGMENTATION TESTS
# ========================================================================

class TestSegmentation:
    def test_evaluate_segment_criteria(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        criteria = {"occupations": ["Farmer"], "logic": "AND"}
        response = client.post("/api/segments/evaluate", json=criteria, headers=manager_headers)
        assert response.status_code == 200
        assert response.json()["estimated_size"] >= 1

    def test_create_segment(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        payload = {
            "name": "Punjab Farmers Segment",
            "description": "Dynamic segment targeting Punjab farmers",
            "filter_criteria": {"states": ["Punjab"], "occupations": ["Farmer"]},
            "is_dynamic": True
        }
        response = client.post("/api/segments", json=payload, headers=manager_headers)
        assert response.status_code == 201
        assert response.json()["name"] == "Punjab Farmers Segment"
        assert response.json()["estimated_size"] >= 1

    def test_duplicate_segment_name_rejected(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        payload = {
            "name": "Punjab Farmers Segment",  # same name
            "description": "Duplicate",
            "filter_criteria": {"occupations": ["Farmer"]},
            "is_dynamic": True
        }
        response = client.post("/api/segments", json=payload, headers=manager_headers)
        assert response.status_code == 400

    def test_list_segments(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/segments", headers=manager_headers)
        assert response.status_code == 200
        assert len(response.json()) >= 1

        # Audience cannot list segments
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/segments", headers=aud_headers)
        assert response.status_code == 403

    def test_preview_segment(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        segments = client.get("/api/segments", headers=manager_headers).json()
        seg_id = segments[0]["id"]
        response = client.get(f"/api/segments/{seg_id}/preview", headers=manager_headers)
        assert response.status_code == 200
        assert "estimated_size" in response.json()
        assert "preview" in response.json()

    def test_update_segment(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        segments = client.get("/api/segments", headers=manager_headers).json()
        seg_id = segments[0]["id"]
        response = client.put(
            f"/api/segments/{seg_id}",
            json={"description": "Updated description for testing"},
            headers=manager_headers
        )
        assert response.status_code == 200
        assert response.json()["description"] == "Updated description for testing"

    def test_get_single_segment(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        segments = client.get("/api/segments", headers=manager_headers).json()
        seg_id = segments[0]["id"]
        response = client.get(f"/api/segments/{seg_id}", headers=manager_headers)
        assert response.status_code == 200
        assert response.json()["id"] == seg_id

        # Audience cannot get segment
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get(f"/api/segments/{seg_id}", headers=aud_headers)
        assert response.status_code == 403


# ========================================================================
# 7. TEMPLATE TESTS
# ========================================================================

class TestTemplates:
    def test_create_template(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        payload = {
            "title": "Alert Warning",
            "description": "Standard alert template",
            "category": "emergency",
            "channel": "sms",
            "default_language": "Hindi",
            "body_template": "Namaste {{first_name}}, emergency alert regarding heavy rain."
        }
        response = client.post("/api/templates", json=payload, headers=manager_headers)
        assert response.status_code == 201
        assert response.json()["title"] == "Alert Warning"

    def test_invalid_category_rejected(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        payload = {
            "title": "Bad Category",
            "category": "invalid_category",
            "channel": "sms",
            "default_language": "Hindi",
            "body_template": "Test"
        }
        response = client.post("/api/templates", json=payload, headers=manager_headers)
        assert response.status_code == 400

    def test_list_templates(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/templates", headers=manager_headers)
        assert response.status_code == 200
        assert len(response.json()) >= 1

        # Audience cannot list templates
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/templates", headers=aud_headers)
        assert response.status_code == 403

    def test_update_template(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        templates = client.get("/api/templates", headers=manager_headers).json()
        tpl_id = templates[0]["id"]
        response = client.put(
            f"/api/templates/{tpl_id}",
            json={"title": "Updated Alert Warning"},
            headers=manager_headers
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Updated Alert Warning"
        assert response.json()["version"] >= 2

    def test_audience_cannot_create_template(self):
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        payload = {
            "title": "Unauthorized Template",
            "category": "awareness",
            "channel": "email",
            "default_language": "English",
            "body_template": "Test body"
        }
        response = client.post("/api/templates", json=payload, headers=aud_headers)
        assert response.status_code == 403


# ========================================================================
# 8. CAMPAIGN TESTS (with state machine)
# ========================================================================

class TestCampaigns:
    def test_create_campaign_draft(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)

        # Get segment and template IDs
        segments = client.get("/api/segments", headers=manager_headers).json()
        templates = client.get("/api/templates", headers=manager_headers).json()
        seg_id = segments[0]["id"]
        tpl_id = templates[0]["id"]

        payload = {
            "title": "Test Campaign - Monsoon Alert",
            "description": "Test storm warning",
            "objective": "Alert farmers",
            "campaign_type": "emergency_alert",
            "segment_id": seg_id,
            "template_id": tpl_id,
            "channel_preferences": ["sms", "whatsapp"],
        }
        # Manager succeeds
        response = client.post("/api/campaigns", json=payload, headers=manager_headers)
        assert response.status_code == 201
        assert response.json()["status"] == "draft"
        assert response.json()["target_audience_count"] >= 1

        # Audience fails
        response = client.post("/api/campaigns", json=payload, headers=aud_headers)
        assert response.status_code == 403

    def test_list_campaigns(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/campaigns", headers=manager_headers)
        assert response.status_code == 200
        assert len(response.json()) >= 1

        # Audience fails
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/campaigns", headers=aud_headers)
        assert response.status_code == 403

    def test_campaign_state_machine_valid_transitions(self):
        import datetime
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        campaigns = client.get("/api/campaigns", headers=admin_headers).json()
        camp_id = campaigns[0]["id"]

        # draft -> scheduled (valid)
        future_time = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).isoformat()
        response = client.put(
            f"/api/campaigns/{camp_id}",
            json={"status": "scheduled", "scheduled_at": future_time},
            headers=admin_headers
        )
        assert response.status_code == 200
        assert response.json()["status"] == "scheduled"

        # scheduled -> active (valid)
        response = client.put(
            f"/api/campaigns/{camp_id}",
            json={"status": "active"},
            headers=admin_headers
        )
        assert response.status_code == 200
        assert response.json()["status"] == "active"

        # active -> completed (valid)
        response = client.put(
            f"/api/campaigns/{camp_id}",
            json={"status": "completed"},
            headers=admin_headers
        )
        assert response.status_code == 200
        assert response.json()["status"] == "completed"

    def test_campaign_state_machine_invalid_transition(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)

        # Create a fresh campaign
        segments = client.get("/api/segments", headers=manager_headers).json()
        templates = client.get("/api/templates", headers=manager_headers).json()

        payload = {
            "title": "State Machine Test Campaign",
            "campaign_type": "awareness_drive",
            "segment_id": segments[0]["id"],
            "template_id": templates[0]["id"],
            "channel_preferences": ["email"],
        }
        create_resp = client.post("/api/campaigns", json=payload, headers=manager_headers)
        assert create_resp.status_code == 201
        camp_id = create_resp.json()["id"]

        # completed transition from draft is not valid (must go through scheduled/active first)
        response = client.put(
            f"/api/campaigns/{camp_id}",
            json={"status": "completed"},
            headers=manager_headers
        )
        assert response.status_code == 400
        assert "Invalid status transition" in response.json()["detail"]

    def test_audience_cannot_schedule_campaign(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        campaigns = client.get("/api/campaigns", headers=manager_headers).json()
        # Find a draft campaign
        draft = None
        for c in campaigns:
            if c["status"] == "draft":
                draft = c
                break
        if draft:
            response = client.put(
                f"/api/campaigns/{draft['id']}",
                json={"status": "scheduled"},
                headers=aud_headers
            )
            assert response.status_code == 403

    def test_campaign_audit_logs(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        campaigns = client.get("/api/campaigns", headers=manager_headers).json()
        camp_id = campaigns[0]["id"]
        response = client.get(f"/api/campaigns/{camp_id}/audit-logs", headers=manager_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ========================================================================
# 9. CONFIG CONSTANTS TESTS
# ========================================================================

class TestConfigConstants:
    def test_get_constants(self):
        response = client.get("/api/config/constants")
        assert response.status_code == 200
        data = response.json()
        assert "languages" in data
        assert "occupations" in data
        assert "channels" in data
        assert "categories" in data
        assert "roles" in data
        assert "campaign_types" in data
        assert "campaign_statuses" in data
        assert "genders" in data
        assert "Hindi" in data["languages"]
        assert "admin" in data["roles"]


# ========================================================================
# 10. DASHBOARD & ANALYTICS TESTS
# ========================================================================

class TestDashboardAnalytics:
    def test_dashboard_stats(self):
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/dashboard/stats", headers=aud_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_audiences" in data
        assert "total_campaigns" in data
        assert "total_templates" in data
        assert "recent_activities" in data

    def test_audience_analytics(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/audiences/analytics", headers=manager_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "active" in data
        assert "by_occupation" in data
        assert "by_state" in data
        assert "by_gender" in data
        assert "by_language" in data
        assert "by_channel" in data
        assert "by_age" in data

        # Audience cannot get analytics
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/audiences/analytics", headers=aud_headers)
        assert response.status_code == 403

    def test_analytics_requires_auth(self):
        response = client.get("/api/audiences/analytics")
        assert response.status_code == 401


# ========================================================================
# 11. SEGMENT DELETE TEST
# ========================================================================

class TestSegmentDelete:
    def test_cannot_delete_segment_linked_to_campaign(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        segments = client.get("/api/segments", headers=admin_headers).json()
        # The first segment is linked to campaigns from earlier tests
        seg_id = segments[0]["id"]
        response = client.delete(f"/api/segments/{seg_id}", headers=admin_headers)
        assert response.status_code == 400
        assert "active campaign" in response.json()["detail"]

    def test_audience_cannot_delete_segment(self):
        aud_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        segments = client.get("/api/segments", headers=manager_headers).json()
        seg_id = segments[0]["id"]
        response = client.delete(f"/api/segments/{seg_id}", headers=aud_headers)
        assert response.status_code == 403


# ========================================================================
# 12. OPTION B ENHANCEMENT TESTS
# ========================================================================

class TestOptionBEnhancements:
    def test_custom_fields_crud(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "first_name": "Metadata",
            "last_name": "User",
            "email": "meta@test.com",
            "phone": "9876543231",
            "preferred_languages": ["English"],
            "occupation": "Student",
            "age": 22,
            "gender": "Female",
            "state": "Maharashtra",
            "district": "Pune",
            "city": "Pune",
            "preferred_channels": ["email"],
            "custom_fields": {"Aadhaar": "Verified", "Crop": "Rice"}
        }
        # 1. Create with custom fields
        response = client.post("/api/audiences", json=payload, headers=admin_headers)
        assert response.status_code == 201
        created = response.json()
        assert created["custom_fields"]["Aadhaar"] == "Verified"
        assert created["custom_fields"]["Crop"] == "Rice"
        user_id = created["id"]

        # 2. Patch update custom fields
        patch_response = client.patch(
            f"/api/audiences/{user_id}",
            json={"custom_fields": {"Aadhaar": "Pending", "Zone": "North"}},
            headers=admin_headers
        )
        assert patch_response.status_code == 200
        patched = patch_response.json()
        assert patched["custom_fields"]["Aadhaar"] == "Pending"
        assert patched["custom_fields"]["Zone"] == "North"
        assert "Crop" not in patched["custom_fields"]  # fully overwritten

    def test_download_csv_template(self):
        response = client.get("/api/audiences/import/template")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "sample_audience.csv" in response.headers["content-disposition"]
        content = response.text
        assert "first_name,last_name,email,phone" in content

    def test_get_all_audit_logs(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/campaigns/audit-logs/all", headers=manager_headers)
        assert response.status_code == 403
        
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        response_admin = client.get("/api/campaigns/audit-logs/all", headers=admin_headers)
        assert response_admin.status_code == 200
        logs = response_admin.json()
        assert len(logs) >= 1
        assert "action" in logs[0]
        assert "user_name" in logs[0]

    def test_segment_eval_breakdowns(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        criteria = {"occupations": ["Farmer"], "logic": "AND"}
        response = client.post("/api/segments/evaluate", json=criteria, headers=manager_headers)
        assert response.status_code == 200
        data = response.json()
        assert "breakdowns" in data
        assert "languages" in data["breakdowns"]
        assert "occupations" in data["breakdowns"]
        assert "states" in data["breakdowns"]

    def test_all_channels_and_categories_templates(self):
        from app.seed_all_templates import seed_all_templates
        db = TestingSessionLocal()
        seed_all_templates(db)
        db.close()

        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.get("/api/templates", headers=manager_headers)
        assert response.status_code == 200
        templates = response.json()
        
        # Collect distinct channel-category combinations
        combos = set((t["channel"], t["category"]) for t in templates)
        
        expected_channels = {"email", "sms", "whatsapp", "push", "website"}
        expected_categories = {"emergency", "awareness", "education", "announcement"}
        
        found_channels = set(t["channel"] for t in templates)
        found_categories = set(t["category"] for t in templates)
        
        assert expected_channels.issubset(found_channels)
        assert expected_categories.issubset(found_categories)
        assert len(combos) >= 20


# ========================================================================
# 10. MFA AND DYNAMIC OTP TESTS
# ========================================================================

class TestMFAAndOTP:
    def test_request_otp_returns_otp_when_mocked(self):
        # Trigger OTP request for admin email
        response = client.post(f"/api/auth/request-otp?email={settings.ADMIN_EMAIL}")
        assert response.status_code == 200
        data = response.json()
        assert data["mocked"] is True
        assert "otp" in data
        assert len(data["otp"]) == 6

    def test_settings_update_triggers_mfa_challenge(self):
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        payload = {
            "SMTP_EMAIL": "test@test.com",
            "SMTP_APP_PASSWORD": "xyz",
            "DAILY_CAP_EMAIL": 1000
        }
        
        # 1. Update settings without X-MFA-OTP header -> Should yield 403 Forbidden with mfa_required
        response = client.post("/api/settings", json=payload, headers=admin_headers)
        assert response.status_code == 403
        data = response.json()
        assert data["detail"]["mfa_required"] is True
        assert "otp" in data["detail"]
        mfa_otp = data["detail"]["otp"]
        
        # 2. Resubmit with the correct X-MFA-OTP header -> Should succeed
        headers_with_mfa = {**admin_headers, "X-MFA-OTP": mfa_otp}
        response_success = client.post("/api/settings", json=payload, headers=headers_with_mfa)
        assert response_success.status_code == 200
        assert response_success.json()["message"] == "Settings updated successfully"


# ========================================================================
# 11. AI CAMPAIGN PLANNER CO-PILOT TESTS
# ========================================================================

class TestAICampaignPlanner:
    def test_plan_campaign_unauthorized(self):
        response = client.post("/api/ai/plan", json={"prompt": "Water drive", "category": "awareness_drive"})
        assert response.status_code == 401

    def test_plan_campaign_with_mocked_ai(self, monkeypatch):
        from app.routes import ai
        
        mock_plan = {
            "campaign": {
                "title": "Clean Water Ludhiana 2026",
                "objective": "Prevent waterborne diseases",
                "campaign_type": "awareness_drive",
                "description": "Targeting rural districts of Ludhiana"
            },
            "message": {
                "subject": "Swachh Ludhiana",
                "body": "Dear {{first_name}}, please boil water in {{city}}."
            },
            "delivery": {
                "channels": ["email", "sms"],
                "audiences": ["Rural Residents"],
                "schedule": {
                    "time": "09:00 AM",
                    "day": "Tomorrow",
                    "reason": "Mornings have high read rates."
                }
            },
            "kpis": {
                "expected_reach_pct": 90,
                "ctr_goal_pct": 12,
                "delivery_goal_pct": 98,
                "awareness_goal_description": "Educate residents"
            },
            "risks": [],
            "metadata": {
                "confidence": 0.95,
                "reasoning": {},
                "suggestions": []
            }
        }
        
        monkeypatch.setattr(ai, "plan_complete_campaign", lambda brief, category_hint, target_language=None: mock_plan)
        
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.post(
            "/api/ai/plan",
            json={"prompt": "Plan a clean water drive for Ludhiana farmers during monsoon.", "category": "awareness_drive"},
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["campaign"]["title"] == "Clean Water Ludhiana 2026"
        assert data["metadata"]["confidence"] == 0.95

    def test_refine_campaign_unauthorized(self):
        response = client.post("/api/ai/plan/refine", json={"current_plan": {}, "instruction": "Make it short"})
        assert response.status_code == 401

    def test_refine_campaign_with_mocked_ai(self, monkeypatch):
        from app.routes import ai
        
        mock_refine = {
            "campaign": {
                "title": "Clean Water Ludhiana 2026 (Urgent)",
                "campaign_type": "awareness_drive"
            },
            "message": {
                "subject": "URGENT: boil water",
                "body": "boil water in {{city}}"
            }
        }
        
        monkeypatch.setattr(ai, "refine_campaign_plan", lambda current_plan_str, instruction: mock_refine)
        
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.post(
            "/api/ai/plan/refine",
            json={"current_plan": {"title": "Clean Water"}, "instruction": "Make it urgent"},
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["campaign"]["title"] == "Clean Water Ludhiana 2026 (Urgent)"


class TestSupportQueries:
    def test_queries_workflow(self, monkeypatch):
        # Authenticate users
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)

        # 1. Submit query as audience
        response = client.post(
            "/api/queries",
            json={"subject": "Confused about WhatsApp template", "message": "I don't understand how to insert city placeholder."},
            headers=audience_headers
        )
        assert response.status_code == 201
        query_data = response.json()
        assert query_data["subject"] == "Confused about WhatsApp template"
        assert query_data["status"] == "open"
        query_id = query_data["id"]

        # 2. List queries as audience - should see 1 query
        response = client.get("/api/queries", headers=audience_headers)
        assert response.status_code == 200
        queries_list = response.json()
        assert len(queries_list) >= 1
        assert any(q["id"] == query_id for q in queries_list)

        # 3. List open queries as manager - should see the query
        response = client.get("/api/queries?status_filter=open", headers=manager_headers)
        assert response.status_code == 200
        manager_queries = response.json()
        assert any(q["id"] == query_id for q in manager_queries)

        # 4. Generate AI reply draft
        from app.routes import queries
        monkeypatch.setattr(queries, "draft_query_response", lambda subject, message: "Use {{city}} placeholder.")
        
        response = client.post(
            f"/api/queries/{query_id}/ai-reply",
            headers=manager_headers
        )
        assert response.status_code == 200
        ai_reply_data = response.json()
        assert "draft_reply" in ai_reply_data
        assert ai_reply_data["draft_reply"] == "Use {{city}} placeholder."

        # 5. Reply to query as manager
        response = client.put(
            f"/api/queries/{query_id}/reply",
            json={"admin_reply": "Here is how you do it: Use the double curly braces.", "status": "resolved"},
            headers=manager_headers
        )
        assert response.status_code == 200
        updated_query = response.json()
        assert updated_query["status"] == "resolved"
        assert updated_query["admin_reply"] == "Here is how you do it: Use the double curly braces."

        # 6. Verify dashboard stats return correct counts
        response = client.get("/api/dashboard/stats", headers=manager_headers)
        assert response.status_code == 200
        stats = response.json()
        assert "open_queries_count" in stats

    def test_chatbot_endpoint(self, monkeypatch):
        from app.routes import ai
        monkeypatch.setattr(ai, "generate_chat_reply", lambda message, history, user_role=None: "This is a chat reply helper.")
        
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.post(
            "/api/ai/chat",
            json={"message": "What is CommAI?", "history": []},
            headers=audience_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["reply"] == "This is a chat reply helper."

    def test_new_mind_blowing_features_endpoints(self, monkeypatch):
        # Authenticate users
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)

        # 1. Test Poster Studio Prompt + URL Generation (authenticated)
        from app.routes import poster
        monkeypatch.setattr(poster, "generate_poster_prompt", lambda title, description, category, tone, language: "Visual prompt composition helper")
        response = client.post(
            "/api/poster/generate",
            json={"title": "Test Poster Title", "description": "Visual flyer description block", "language": "Hindi"},
            headers=manager_headers
        )
        assert response.status_code == 200
        poster_data = response.json()
        assert "image_url" in poster_data
        assert "prompt_used" in poster_data
        assert poster_data["language"] == "Hindi"

        # Test Poster Send Endpoint
        poster_id = poster_data["id"]
        assert poster_id is not None

        send_resp = client.post(
            f"/api/poster/{poster_id}/send",
            json={
                "image_url": "http://pollinations.ai/p/test-modified-data",
                "audience_ids": [],
                "segment_id": None,
                "channels": ["email"]
            },
            headers=manager_headers
        )
        assert send_resp.status_code == 200
        assert send_resp.json()["status"] == "success"

        # Test Poster availability query
        avail_resp = client.get("/api/poster/available", headers=audience_headers)
        assert avail_resp.status_code == 200
        assert isinstance(avail_resp.json(), list)

        # 2. Test Sentiment Map aggregations (manager/admin restricted)
        map_resp = client.get("/api/sentiment-map/data", headers=manager_headers)
        assert map_resp.status_code == 200
        assert isinstance(map_resp.json(), list)

        # 2b. State emergency broadcasts are manager-only and persist only for
        # the selected state's audience.
        from app.models import Audience, Poster
        from app.routes import sentiment_map

        db = TestingSessionLocal()
        citizen = db.query(Audience).filter(Audience.email == settings.AUDIENCE_EMAIL).first()
        if not citizen:
            citizen = Audience(
                first_name="State", last_name="Citizen", email=settings.AUDIENCE_EMAIL,
                phone="9000000001", preferred_languages=json.dumps(["Hindi"]),
                occupation="Resident", age=30, gender="Other", state="Maharashtra",
                district="Pune", city="Pune", preferred_channels=json.dumps(["email"]),
                is_active=True, is_deleted=False,
            )
            db.add(citizen)
            db.commit()
        citizen_id = citizen.id
        db.close()

        delivered_payloads = []

        async def capture_bulletin(payload):
            delivered_payloads.append(payload)

        monkeypatch.setattr(sentiment_map, "generate_poster_prompt", lambda **kwargs: "emergency visual prompt")
        monkeypatch.setattr(sentiment_map, "generate_poster_url", lambda prompt: "https://example.test/emergency.png")
        monkeypatch.setattr(sentiment_map.bulletin_manager, "broadcast", capture_bulletin)
        monkeypatch.setattr(sentiment_map, "dispatch_state_emergency_in_background", lambda *args: None)
        import app.database as database_module
        monkeypatch.setattr(database_module, "SessionLocal", TestingSessionLocal)

        denied_resp = client.post(
            "/api/sentiment-map/broadcast-emergency",
            json={"state": "Maharashtra", "title": "Flood warning", "description": "Move to higher ground immediately.", "channels": ["email"]},
            headers=audience_headers,
        )
        assert denied_resp.status_code == 403

        broadcast_resp = client.post(
            "/api/sentiment-map/broadcast-emergency",
            json={"state": "Maharashtra", "title": "Flood warning", "description": "Move to higher ground immediately.", "channels": ["email"], "urgency": "critical"},
            headers=manager_headers,
        )
        assert broadcast_resp.status_code == 200
        assert broadcast_resp.json()["target_count"] >= 1
        assert delivered_payloads[-1]["target_state"] == "Maharashtra"

        db = TestingSessionLocal()
        saved_poster = db.query(Poster).filter(Poster.id == broadcast_resp.json()["poster_id"]).first()
        assert citizen_id in json.loads(saved_poster.target_audience_ids)
        db.close()

        targeted_flyers = client.get("/api/poster/available", headers=audience_headers)
        assert any(p["id"] == saved_poster.id for p in targeted_flyers.json())

        # 3. Test Webhook Citizen Reply RAG Pipeline (requires valid audience phone/email match)
        # Seed an audience for mapping
        aud_payload = {
            "first_name": "TestCitizen", "last_name": "RAG", "email": "rag_citizen@domain.com",
            "phone": "9998887770", "preferred_languages": ["Hindi"], "occupation": "Farmer",
            "age": 30, "gender": "Male", "state": "Punjab", "district": "Ludhiana", "city": "Ludhiana",
            "preferred_channels": ["whatsapp"]
        }
        client.post("/api/audiences", json=aud_payload, headers=admin_headers)

        from app.routes import webhook
        monkeypatch.setattr(webhook, "generate_rag_response", lambda query, db: "RAG matching response answer")
        web_resp = client.post(
            "/api/webhook/citizen-reply",
            json={"phone": "9998887770", "content": "How do I create dynamic audience?", "channel": "whatsapp"}
        )
        assert web_resp.status_code == 200
        web_data = web_resp.json()
        assert web_data["auto_reply"] == "RAG matching response answer"

        # Check conversations feed list
        conv_list_resp = client.get("/api/webhook/conversations", headers=manager_headers)
        assert conv_list_resp.status_code == 200
        assert len(conv_list_resp.json()) >= 1

        # 4. Test AI-powered NL segmentation criteria parse
        from app.routes import ai as ai_route
        monkeypatch.setattr(ai_route, "parse_natural_language_filter", lambda q: {"states": ["Punjab"], "occupation": "Farmer", "logic": "AND"})
        monkeypatch.setattr(ai_route, "generate_segment_explanation", lambda q, f: "Explains segment")
        nl_resp = client.post(
            "/api/ai/nl-segment",
            json={"query": "Farmers in Punjab under 40"},
            headers=manager_headers
        )
        assert nl_resp.status_code == 200
        nl_data = nl_resp.json()
        assert "filter_criteria" in nl_data
        assert nl_data["estimated_size"] >= 0

class TestEmergencyContacts:
    """Comprehensive tests for emergency contact submit, list, reply, status update, and AI draft."""

    def test_emergency_contact_full_workflow(self, monkeypatch):
        # Authenticate users
        admin_headers = get_auth_headers(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)

        # 1. Submit emergency contact as audience
        response = client.post(
            "/api/emergency-contact",
            json={
                "subject": "Flooding near river bank",
                "message": "Water level rising rapidly near village. 50 families affected. Need immediate evacuation support.",
                "urgency": "critical"
            },
            headers=audience_headers
        )
        assert response.status_code == 201
        ec_data = response.json()
        assert ec_data["subject"] == "Flooding near river bank"
        assert ec_data["urgency"] == "critical"
        assert ec_data["status"] == "open"
        assert ec_data["admin_reply"] is None
        contact_id = ec_data["id"]

        # 2. Submit another emergency as audience (normal priority)
        response2 = client.post(
            "/api/emergency-contact",
            json={
                "subject": "Street light not working",
                "message": "The street light near main road junction has been off for 3 days.",
                "urgency": "normal"
            },
            headers=audience_headers
        )
        assert response2.status_code == 201
        contact_id_2 = response2.json()["id"]

        # 3. List emergency contacts as audience - should see own contacts only
        response = client.get("/api/emergency-contact", headers=audience_headers)
        assert response.status_code == 200
        audience_list = response.json()
        assert len(audience_list) >= 2
        audience_ids = {ec["id"] for ec in audience_list}
        assert contact_id in audience_ids
        assert contact_id_2 in audience_ids

        # 4. List emergency contacts as manager - should see all
        response = client.get("/api/emergency-contact", headers=manager_headers)
        assert response.status_code == 200
        manager_list = response.json()
        assert len(manager_list) >= 2
        manager_ids = {ec["id"] for ec in manager_list}
        assert contact_id in manager_ids

        # 5. List with status filter
        response = client.get("/api/emergency-contact?status_filter=open", headers=manager_headers)
        assert response.status_code == 200
        open_list = response.json()
        assert all(ec["status"] == "open" for ec in open_list)

        # 6. Update status to acknowledged as manager
        response = client.put(
            f"/api/emergency-contact/{contact_id}/status?new_status=acknowledged",
            headers=manager_headers
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Status updated to 'acknowledged'"

        # 7. Verify status changed
        response = client.get("/api/emergency-contact", headers=audience_headers)
        updated_ec = next(ec for ec in response.json() if ec["id"] == contact_id)
        assert updated_ec["status"] == "acknowledged"

        # 8. Generate AI draft response (with monkeypatch)
        from app.routes import feedback as feedback_mod
        monkeypatch.setattr(
            feedback_mod, "draft_emergency_response",
            lambda subject, message, urgency: "Your report has been received. Emergency teams are mobilizing."
        )
        response = client.post(
            f"/api/emergency-contact/{contact_id}/generate-draft",
            headers=manager_headers
        )
        assert response.status_code == 200
        draft_data = response.json()
        assert "draft" in draft_data
        assert draft_data["draft"] == "Your report has been received. Emergency teams are mobilizing."

        # 9. Reply to emergency contact as manager and resolve
        response = client.put(
            f"/api/emergency-contact/{contact_id}/reply",
            json={
                "admin_reply": "Evacuation teams dispatched to your location. Please move to higher ground immediately.",
                "status": "resolved"
            },
            headers=manager_headers
        )
        assert response.status_code == 200
        reply_data = response.json()
        assert reply_data["status"] == "resolved"
        assert reply_data["admin_reply"] == "Evacuation teams dispatched to your location. Please move to higher ground immediately."
        assert reply_data["replied_at"] is not None

        # 10. Verify resolved contact visible to audience
        response = client.get("/api/emergency-contact", headers=audience_headers)
        resolved_ec = next(ec for ec in response.json() if ec["id"] == contact_id)
        assert resolved_ec["status"] == "resolved"
        assert resolved_ec["admin_reply"] is not None

    def test_emergency_contact_invalid_urgency(self):
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.post(
            "/api/emergency-contact",
            json={
                "subject": "Testing invalid urgency level",
                "message": "This message tests that an invalid urgency value is rejected properly.",
                "urgency": "super_critical"
            },
            headers=audience_headers
        )
        # Route validates urgency after Pydantic passes schema validation
        assert response.status_code == 400
        assert "Invalid urgency" in response.json()["detail"]

    def test_emergency_contact_invalid_status_update(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)

        # Create a contact first
        response = client.post(
            "/api/emergency-contact",
            json={"subject": "Status Test", "message": "Testing invalid status", "urgency": "normal"},
            headers=audience_headers
        )
        cid = response.json()["id"]

        # Try invalid status
        response = client.put(
            f"/api/emergency-contact/{cid}/status?new_status=invalid_status",
            headers=manager_headers
        )
        assert response.status_code == 400
        assert "Invalid status" in response.json()["detail"]

    def test_emergency_contact_not_found(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.put(
            "/api/emergency-contact/nonexistent-id-12345/status?new_status=resolved",
            headers=manager_headers
        )
        assert response.status_code == 404

    def test_emergency_draft_not_found(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.post(
            "/api/emergency-contact/nonexistent-id-12345/generate-draft",
            headers=manager_headers
        )
        assert response.status_code == 404

    def test_ai_voice_command_parsing(self):
        manager_headers = get_auth_headers(settings.MANAGER_EMAIL, settings.MANAGER_PASSWORD)
        response = client.post(
            "/api/ai/voice-command",
            json={"command": "Emergency! Flash flood warning for Assam, send immediately to all audiences"},
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "action" in data
        assert "spoken_response" in data
        assert data["location_selected"] in ["Assam", "All Locations"]

    def test_voice_stream_path_traversal_prevention(self):
        response = client.get("/api/voice/stream/../../.env")
        assert response.status_code == 404

    def test_conversation_thread_bola_prevention(self):
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.get("/api/webhook/conversations/some-audience-id", headers=audience_headers)
        assert response.status_code == 403

    def test_poster_generation_privilege_escalation_prevention(self):
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.post("/api/poster/generate", json={"title": "Test Title", "description": "Test Desc", "category": "emergency", "tone": "formal", "language": "Hindi"}, headers=audience_headers)
        assert response.status_code == 403

    def test_ai_voice_command_privilege_escalation_prevention(self):
        audience_headers = get_auth_headers(settings.AUDIENCE_EMAIL, settings.AUDIENCE_PASSWORD)
        response = client.post("/api/ai/voice-command", json={"command": "Navigate to dashboard"}, headers=audience_headers)
        assert response.status_code == 403


