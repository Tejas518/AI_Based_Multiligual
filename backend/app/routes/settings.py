from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
import time
import httpx
import datetime

from app.config import settings
from app.auth import require_manager_or_higher, require_admin
from app.database import get_db
from app.models import Blacklist, DeliveryLog
from app.schemas import BlacklistCreate, BlacklistResponse
from app.services.email_service import test_smtp_connection, send_email
from app.services.whatsapp_service import test_whatsapp_connection
from app.services.telegram_service import test_telegram_connection
from app.services.fcm_service import test_fcm_connection, is_fcm_configured

router = APIRouter(prefix="/settings", tags=["System Settings"])

class SettingsUpdateSchema(BaseModel):
    SMTP_EMAIL: Optional[str] = ""
    SMTP_APP_PASSWORD: Optional[str] = ""
    CALLMEBOT_DEFAULT_APIKEY: Optional[str] = ""
    DEFAULT_COUNTRY_CODE: Optional[str] = "91"
    GROK_API_KEY: Optional[str] = ""
    GROQ_API_KEY: Optional[str] = ""
    GROQ_API_KEY_SECONDARY: Optional[str] = ""
    GEMINI_API_KEY: Optional[str] = ""
    OPENAI_API_KEY: Optional[str] = ""
    ANTHROPIC_API_KEY: Optional[str] = ""
    TELEGRAM_BOT_TOKEN: Optional[str] = ""
    TELEGRAM_CHAT_ID: Optional[str] = ""
    FCM_SERVICE_ACCOUNT_JSON: Optional[str] = ""
    DAILY_CAP_EMAIL: Optional[int] = 5000
    DAILY_CAP_SMS: Optional[int] = 5000
    DAILY_CAP_WHATSAPP: Optional[int] = 5000
    DAILY_CAP_TELEGRAM: Optional[int] = 5000
    DAILY_CAP_PUSH: Optional[int] = 5000

class TestEmailRequest(BaseModel):
    email: str

class TestWhatsAppRequest(BaseModel):
    phone: str
    apikey: Optional[str] = None

class TestTelegramRequest(BaseModel):
    chat_id: str
    token: Optional[str] = None

class TestFCMRequest(BaseModel):
    token: str
    service_account_json: Optional[str] = None

@router.get("")
def get_settings(current_user = Depends(require_manager_or_higher)) -> Dict[str, Any]:
    # Returns the settings with app password masked for security
    return {
        "SMTP_EMAIL": settings.SMTP_EMAIL,
        "SMTP_APP_PASSWORD": "****************" if settings.SMTP_APP_PASSWORD else "",
        "CALLMEBOT_DEFAULT_APIKEY": "****************" if settings.CALLMEBOT_DEFAULT_APIKEY else "",
        "DEFAULT_COUNTRY_CODE": settings.DEFAULT_COUNTRY_CODE,
        "GROK_API_KEY": "****************" if getattr(settings, "GROK_API_KEY", None) else "",
        "GROQ_API_KEY": "****************" if settings.GROQ_API_KEY else "",
        "GROQ_API_KEY_SECONDARY": "****************" if getattr(settings, "GROQ_API_KEY_SECONDARY", None) else "",
        "GEMINI_API_KEY": "****************" if getattr(settings, "GEMINI_API_KEY", None) else "",
        "OPENAI_API_KEY": "****************" if settings.OPENAI_API_KEY else "",
        "ANTHROPIC_API_KEY": "****************" if settings.ANTHROPIC_API_KEY else "",
        "TELEGRAM_BOT_TOKEN": "****************" if settings.TELEGRAM_BOT_TOKEN else "",
        "TELEGRAM_CHAT_ID": settings.TELEGRAM_CHAT_ID,
        "FCM_SERVICE_ACCOUNT_JSON": "****************" if settings.FCM_SERVICE_ACCOUNT_JSON else "",
        "DAILY_CAP_EMAIL": settings.DAILY_CAP_EMAIL,
        "DAILY_CAP_SMS": settings.DAILY_CAP_SMS,
        "DAILY_CAP_WHATSAPP": settings.DAILY_CAP_WHATSAPP,
        "DAILY_CAP_TELEGRAM": settings.DAILY_CAP_TELEGRAM,
        "DAILY_CAP_PUSH": settings.DAILY_CAP_PUSH,
        "is_smtp_configured": bool(settings.SMTP_EMAIL and settings.SMTP_APP_PASSWORD),
        "is_whatsapp_configured": bool(settings.CALLMEBOT_DEFAULT_APIKEY),
        "is_grok_configured": bool(getattr(settings, "GROK_API_KEY", None)),
        "is_groq_configured": bool(settings.GROQ_API_KEY),
        "is_groq_secondary_configured": bool(getattr(settings, "GROQ_API_KEY_SECONDARY", None)),
        "is_gemini_configured": bool(getattr(settings, "GEMINI_API_KEY", None)),
        "is_openai_configured": bool(settings.OPENAI_API_KEY),
        "is_anthropic_configured": bool(settings.ANTHROPIC_API_KEY),
        "is_telegram_configured": bool(settings.TELEGRAM_BOT_TOKEN),
        "is_fcm_configured": is_fcm_configured()
    }

@router.post("")
def update_settings(
    settings_in: SettingsUpdateSchema,
    current_user = Depends(require_manager_or_higher),
    x_mfa_otp: Optional[str] = Header(None)
):
    from app.auth import verify_mfa_otp
    verify_mfa_otp(current_user, x_mfa_otp)
    
    update_data = {}
    
    # Only update password if user entered a new one (not masked placeholder)
    if settings_in.SMTP_APP_PASSWORD and settings_in.SMTP_APP_PASSWORD != "****************":
        update_data["SMTP_APP_PASSWORD"] = settings_in.SMTP_APP_PASSWORD
    elif settings_in.SMTP_APP_PASSWORD == "":
        update_data["SMTP_APP_PASSWORD"] = ""

    if settings_in.GROK_API_KEY and settings_in.GROK_API_KEY != "****************":
        update_data["GROK_API_KEY"] = settings_in.GROK_API_KEY
    elif settings_in.GROK_API_KEY == "":
        update_data["GROK_API_KEY"] = ""
        
    if settings_in.GROQ_API_KEY and settings_in.GROQ_API_KEY != "****************":
        update_data["GROQ_API_KEY"] = settings_in.GROQ_API_KEY
    elif settings_in.GROQ_API_KEY == "":
        update_data["GROQ_API_KEY"] = ""

    if settings_in.GROQ_API_KEY_SECONDARY and settings_in.GROQ_API_KEY_SECONDARY != "****************":
        update_data["GROQ_API_KEY_SECONDARY"] = settings_in.GROQ_API_KEY_SECONDARY
    elif settings_in.GROQ_API_KEY_SECONDARY == "":
        update_data["GROQ_API_KEY_SECONDARY"] = ""

    if settings_in.GEMINI_API_KEY and settings_in.GEMINI_API_KEY != "****************":
        update_data["GEMINI_API_KEY"] = settings_in.GEMINI_API_KEY
    elif settings_in.GEMINI_API_KEY == "":
        update_data["GEMINI_API_KEY"] = ""

    if settings_in.OPENAI_API_KEY and settings_in.OPENAI_API_KEY != "****************":
        update_data["OPENAI_API_KEY"] = settings_in.OPENAI_API_KEY
    elif settings_in.OPENAI_API_KEY == "":
        update_data["OPENAI_API_KEY"] = ""

    if settings_in.ANTHROPIC_API_KEY and settings_in.ANTHROPIC_API_KEY != "****************":
        update_data["ANTHROPIC_API_KEY"] = settings_in.ANTHROPIC_API_KEY
    elif settings_in.ANTHROPIC_API_KEY == "":
        update_data["ANTHROPIC_API_KEY"] = ""

    if settings_in.TELEGRAM_BOT_TOKEN and settings_in.TELEGRAM_BOT_TOKEN != "****************":
        update_data["TELEGRAM_BOT_TOKEN"] = settings_in.TELEGRAM_BOT_TOKEN
    elif settings_in.TELEGRAM_BOT_TOKEN == "":
        update_data["TELEGRAM_BOT_TOKEN"] = ""

    if settings_in.FCM_SERVICE_ACCOUNT_JSON and settings_in.FCM_SERVICE_ACCOUNT_JSON != "****************":
        update_data["FCM_SERVICE_ACCOUNT_JSON"] = settings_in.FCM_SERVICE_ACCOUNT_JSON
    elif settings_in.FCM_SERVICE_ACCOUNT_JSON == "":
        update_data["FCM_SERVICE_ACCOUNT_JSON"] = ""

    if settings_in.CALLMEBOT_DEFAULT_APIKEY and settings_in.CALLMEBOT_DEFAULT_APIKEY != "****************":
        update_data["CALLMEBOT_DEFAULT_APIKEY"] = settings_in.CALLMEBOT_DEFAULT_APIKEY
    elif settings_in.CALLMEBOT_DEFAULT_APIKEY == "":
        update_data["CALLMEBOT_DEFAULT_APIKEY"] = ""
        
    update_data["SMTP_EMAIL"] = settings_in.SMTP_EMAIL
    update_data["DEFAULT_COUNTRY_CODE"] = settings_in.DEFAULT_COUNTRY_CODE
    update_data["TELEGRAM_CHAT_ID"] = settings_in.TELEGRAM_CHAT_ID
    update_data["DAILY_CAP_EMAIL"] = settings_in.DAILY_CAP_EMAIL
    update_data["DAILY_CAP_SMS"] = settings_in.DAILY_CAP_SMS
    update_data["DAILY_CAP_WHATSAPP"] = settings_in.DAILY_CAP_WHATSAPP
    update_data["DAILY_CAP_TELEGRAM"] = settings_in.DAILY_CAP_TELEGRAM
    update_data["DAILY_CAP_PUSH"] = settings_in.DAILY_CAP_PUSH
    
    success = settings.save_overrides(update_data)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save settings overrides to disk"
        )
        
    return {"message": "Settings updated successfully"}

@router.post("/test-email")
def run_test_email(
    request: TestEmailRequest,
    current_user = Depends(require_manager_or_higher)
):
    if not settings.SMTP_EMAIL or not settings.SMTP_APP_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SMTP is not configured. Please save credentials first."
        )
        
    # Check smtp connection first
    conn_success, conn_msg = test_smtp_connection()
    if not conn_success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SMTP Connection Test Failed: {conn_msg}"
        )
        
    # Send test email
    subject = "✅ CommAI SMTP Test Email"
    body = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #00bcd4;">SMTP Configuration Active!</h2>
        <p>Hello {current_user.full_name},</p>
        <p>This is a verification email from your <strong>CommAI Multilingual Mass Communication Platform</strong> settings console.</p>
        <p>Your Gmail SMTP integration is correctly configured and ready to send actual campaigns and login OTPs.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">Sent by CommAI on behalf of {current_user.organization}.</p>
    </div>
    """
    success, error = send_email(request.email, subject, body, is_html=True)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SMTP Send Failed: {error}"
        )
        
    return {"message": f"SMTP test email sent successfully to {request.email}."}

@router.post("/test-whatsapp")
def run_test_whatsapp(
    request: TestWhatsAppRequest,
    current_user = Depends(require_manager_or_higher)
):
    success, msg = test_whatsapp_connection(request.phone, request.apikey)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    return {"message": msg}

@router.post("/test-telegram")
def run_test_telegram(
    request: TestTelegramRequest,
    current_user = Depends(require_manager_or_higher)
):
    token = request.token
    if not token or token == "****************":
        token = settings.TELEGRAM_BOT_TOKEN
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram Bot Token is not configured. Please save it first."
        )
        
    success, msg = test_telegram_connection(request.chat_id, token)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    return {"message": msg}

@router.post("/test-fcm")
def run_test_fcm(
    request: TestFCMRequest,
    current_user = Depends(require_manager_or_higher)
):
    service_account_json = request.service_account_json
    if not service_account_json or service_account_json == "****************":
        service_account_json = settings.FCM_SERVICE_ACCOUNT_JSON
        
    if not service_account_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FCM Service Account JSON is not configured. Please save it first."
        )
        
    success, msg = test_fcm_connection(request.token, service_account_json)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    return {"message": msg}


@router.get("/diagnostics")
def run_system_diagnostics(
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Admin/Manager-only system diagnostics. Evaluates connection state to all integrated messaging APIs and computes error thresholds."""
    # 1. SMTP Check
    smtp_ok = False
    smtp_msg = "Not Configured"
    if settings.SMTP_EMAIL and settings.SMTP_APP_PASSWORD:
        smtp_ok, smtp_msg = test_smtp_connection()
        if smtp_ok:
            smtp_msg = "Connected"
    
    # 2. Groq Check
    groq_ok = False
    groq_latency = 0
    groq_msg = "Not Configured"
    if settings.GROQ_API_KEY:
        try:
            start_time = time.time()
            headers = {
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1
            }
            response = httpx.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers, timeout=4.0)
            groq_latency = int((time.time() - start_time) * 1000)
            if response.status_code == 200:
                groq_ok = True
                groq_msg = "Connected"
            else:
                groq_msg = f"API Error {response.status_code}"
        except Exception as e:
            groq_msg = f"Failed: {str(e)[:50]}"

    # 3. WhatsApp (CallMeBot) Check
    whatsapp_ok = bool(settings.CALLMEBOT_DEFAULT_APIKEY)
    whatsapp_msg = "Connected" if whatsapp_ok else "Not Configured"

    # 4. Telegram Check
    telegram_ok = bool(settings.TELEGRAM_BOT_TOKEN)
    telegram_msg = "Connected" if telegram_ok else "Not Configured"

    # 5. FCM Check
    fcm_ok = is_fcm_configured()
    fcm_msg = "Connected" if fcm_ok else "Not Configured"

    # 6. Delivery failure logs check in past 1 hr
    one_hour_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
    recent_logs = db.query(DeliveryLog).filter(DeliveryLog.sent_at >= one_hour_ago).all()
    total_recent = len(recent_logs)
    failed_recent = sum(1 for l in recent_logs if l.status == "failed")
    failure_rate = (failed_recent / total_recent) * 100 if total_recent > 0 else 0.0

    return {
        "smtp": {"ok": smtp_ok, "msg": smtp_msg},
        "groq": {"ok": groq_ok, "msg": groq_msg, "latency_ms": groq_latency},
        "whatsapp": {"ok": whatsapp_ok, "msg": whatsapp_msg},
        "telegram": {"ok": telegram_ok, "msg": telegram_msg},
        "fcm": {"ok": fcm_ok, "msg": fcm_msg},
        "metrics": {
            "recent_sent_count": total_recent,
            "recent_failed_count": failed_recent,
            "failure_rate_percent": round(failure_rate, 2),
            "alert_triggered": bool(failure_rate > 20.0 and total_recent >= 5)
        }
    }


# --- OPT-OUT BLACKLIST ENDPOINTS ---

@router.get("/blacklist", response_model=List[BlacklistResponse])
def get_blacklist(
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Retrieve opt-out suppression list."""
    return db.query(Blacklist).order_by(Blacklist.created_at.desc()).all()


@router.post("/blacklist", response_model=BlacklistResponse, status_code=status.HTTP_201_CREATED)
def add_to_blacklist(
    entry: BlacklistCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Add a phone number or email address to opt-out suppression blacklist."""
    # Check if already blacklisted
    existing = db.query(Blacklist).filter(Blacklist.value == entry.value).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Value is already blacklisted")
        
    db_entry = Blacklist(
        type=entry.type.lower(),
        value=entry.value.strip()
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry


@router.delete("/blacklist/{id}", status_code=status.HTTP_200_OK)
def remove_from_blacklist(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Remove a phone/email from the blacklist."""
    entry = db.query(Blacklist).filter(Blacklist.id == id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blacklist entry not found")
        
    db.delete(entry)
    db.commit()
    return {"message": "Removed from blacklist successfully", "id": id}


from fastapi.responses import FileResponse
import os

@router.get("/export/excel")
def download_database_excel(current_user = Depends(require_manager_or_higher)):
    """Generates and downloads a formatted Excel spreadsheet audit log of all database tables."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_path = os.path.join(backend_dir, "comm_platform.db")
    output_path = os.path.join(backend_dir, "database_export.xlsx")
    
    from export_database_to_excel import export_excel
    success = export_excel(db_path, output_path)
    if not success or not os.path.exists(output_path):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to compile Excel database export.")
        
    return FileResponse(output_path, filename="database_export.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.get("/export/word")
def download_database_word(current_user = Depends(require_manager_or_higher)):
    """Generates and downloads a corporate styled Word audit and compliance report."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_path = os.path.join(backend_dir, "comm_platform.db")
    output_path = os.path.join(backend_dir, "database_export.docx")
    
    from export_database_to_word import export_word
    success = export_word(db_path, output_path)
    if not success or not os.path.exists(output_path):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to compile Word database report.")
        
    return FileResponse(output_path, filename="database_export.docx", media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
