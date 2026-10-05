import os
from dotenv import load_dotenv, find_dotenv

# Load .env file searching upwards
load_dotenv(find_dotenv())


class Settings:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "72210fafca4045a19f2a95b15deb9108comm-ai-secret-key-super-secure")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    # Resolve database path relative to the backend app root folder
    _base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _default_db = f"sqlite:///{os.path.join(_base_dir, 'comm_platform.db')}"
    DATABASE_URL: str = os.getenv("DATABASE_URL", _default_db)
    
    # Pre-seeded Operator Credentials
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "AdminPassword123!"
    
    MANAGER_EMAIL: str = "manager@example.com"
    MANAGER_PASSWORD: str = "ManagerPassword123!"
    
    AUDIENCE_EMAIL: str = "audience@example.com"
    AUDIENCE_PASSWORD: str = "AudiencePass123!"

    # --- SMTP Email Configuration (Gmail) ---
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_EMAIL: str = os.getenv("SMTP_EMAIL", "")
    SMTP_APP_PASSWORD: str = os.getenv("SMTP_APP_PASSWORD", "")

    # --- WhatsApp Configuration (CallMeBot) ---
    CALLMEBOT_DEFAULT_APIKEY: str = os.getenv("CALLMEBOT_DEFAULT_APIKEY", "")

    # --- Telegram Configuration ---
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # --- SMS Gateway Configuration (Twilio SMS) ---
    FAST2SMS_API_KEY: str = os.getenv("FAST2SMS_API_KEY", "")
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")

    # --- WhatsApp Gateway Configuration (Twilio WhatsApp) ---
    TWILIO_WHATSAPP_ACCOUNT_SID: str = os.getenv("TWILIO_WHATSAPP_ACCOUNT_SID", "")
    TWILIO_WHATSAPP_AUTH_TOKEN: str = os.getenv("TWILIO_WHATSAPP_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_NUMBER: str = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+17372508034")
    # Approved WhatsApp Content Template SID (HXxxx). Required for WhatsApp Business API accounts.
    # Create a free-text template (body={{1}}) at console.twilio.com → Content Template Builder.
    TWILIO_WHATSAPP_CONTENT_SID: str = os.getenv("TWILIO_WHATSAPP_CONTENT_SID", "")

    # --- Firebase FCM Configuration ---
    FCM_SERVICE_ACCOUNT_JSON: str = os.getenv("FCM_SERVICE_ACCOUNT_JSON", "")

    # --- Grok (xAI) Configuration ---
    GROK_API_KEY: str = os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY") or ""

    # --- Groq Translation Configuration ---
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # --- Secondary Groq API Key (Fallback) ---
    GROQ_API_KEY_SECONDARY: str = os.getenv("GROQ_API_KEY_SECONDARY", "")

    # --- Google Gemini API Key ---
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # --- OpenAI API Key ---
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # --- Anthropic API Key ---
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # --- Country Code for Phone Numbers ---
    DEFAULT_COUNTRY_CODE: str = os.getenv("DEFAULT_COUNTRY_CODE", "91")  # India

    # --- Daily Send Caps Guardrails ---
    DAILY_CAP_EMAIL: int = 5000
    DAILY_CAP_SMS: int = 5000
    DAILY_CAP_WHATSAPP: int = 5000
    DAILY_CAP_TELEGRAM: int = 5000
    DAILY_CAP_PUSH: int = 5000

    # --- External backend & frontend URLs (for emails, SMS, and hyperlinks) ---
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8001")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "https://comm-ai-nine.vercel.app")

    # Supported System Constants
    ROLES = ["admin", "campaign_manager", "audience"]
    
    LANGUAGES = [
        "English", "Hindi", "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", 
        "Kannada", "Kashmiri", "Konkani", "Maithili", "Malayalam", "Manipuri", 
        "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi", 
        "Tamil", "Telugu", "Urdu"
    ]
    
    OCCUPATIONS = [
        "Farmer", "Student", "Teacher", "Healthcare Worker", 
        "NGO Worker", "Administrator", "General Public", "Business Owner"
    ]
    
    CATEGORIES = ["emergency", "awareness", "education", "announcement"]
    
    CHANNELS = ["email", "sms", "push", "website", "telegram"]

    def load_overrides(self):
        import json
        import sys
        config_name = "settings_test.json" if "pytest" in sys.modules else "settings.json"
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), config_name)
        if os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    data = json.load(f)
                
                # Use falsy fallbacks so empty strings in settings.json fall back to .env configuration
                self.SMTP_HOST = data.get("SMTP_HOST") or self.SMTP_HOST
                
                port_val = data.get("SMTP_PORT")
                if port_val is not None and port_val != "":
                    self.SMTP_PORT = int(port_val)
                    
                self.SMTP_EMAIL = data.get("SMTP_EMAIL") or self.SMTP_EMAIL
                self.SMTP_APP_PASSWORD = data.get("SMTP_APP_PASSWORD") or self.SMTP_APP_PASSWORD
                self.CALLMEBOT_DEFAULT_APIKEY = data.get("CALLMEBOT_DEFAULT_APIKEY") or self.CALLMEBOT_DEFAULT_APIKEY
                
                self.TELEGRAM_BOT_TOKEN = data.get("TELEGRAM_BOT_TOKEN") or self.TELEGRAM_BOT_TOKEN
                self.TELEGRAM_CHAT_ID = data.get("TELEGRAM_CHAT_ID") or self.TELEGRAM_CHAT_ID
                self.FCM_SERVICE_ACCOUNT_JSON = data.get("FCM_SERVICE_ACCOUNT_JSON") or self.FCM_SERVICE_ACCOUNT_JSON
                
                self.GROK_API_KEY = data.get("GROK_API_KEY") or self.GROK_API_KEY
                self.GROQ_API_KEY = data.get("GROQ_API_KEY") or self.GROQ_API_KEY
                self.GROQ_API_KEY_SECONDARY = data.get("GROQ_API_KEY_SECONDARY") or self.GROQ_API_KEY_SECONDARY
                self.GEMINI_API_KEY = data.get("GEMINI_API_KEY") or self.GEMINI_API_KEY
                self.OPENAI_API_KEY = data.get("OPENAI_API_KEY") or self.OPENAI_API_KEY
                self.ANTHROPIC_API_KEY = data.get("ANTHROPIC_API_KEY") or self.ANTHROPIC_API_KEY
                self.DEFAULT_COUNTRY_CODE = data.get("DEFAULT_COUNTRY_CODE") or self.DEFAULT_COUNTRY_CODE
                self.BACKEND_URL = data.get("BACKEND_URL") or self.BACKEND_URL
                self.TWILIO_WHATSAPP_CONTENT_SID = data.get("TWILIO_WHATSAPP_CONTENT_SID") or self.TWILIO_WHATSAPP_CONTENT_SID
                
                cap_email = data.get("DAILY_CAP_EMAIL")
                if cap_email is not None and cap_email != "":
                    self.DAILY_CAP_EMAIL = int(cap_email)
                    
                cap_sms = data.get("DAILY_CAP_SMS")
                if cap_sms is not None and cap_sms != "":
                    self.DAILY_CAP_SMS = int(cap_sms)
                    
                cap_wa = data.get("DAILY_CAP_WHATSAPP")
                if cap_wa is not None and cap_wa != "":
                    self.DAILY_CAP_WHATSAPP = int(cap_wa)
                    
                cap_tg = data.get("DAILY_CAP_TELEGRAM")
                if cap_tg is not None and cap_tg != "":
                    self.DAILY_CAP_TELEGRAM = int(cap_tg)
                    
                cap_push = data.get("DAILY_CAP_PUSH")
                if cap_push is not None and cap_push != "":
                    self.DAILY_CAP_PUSH = int(cap_push)
            except Exception as e:
                print(f"[CONFIG] Error loading settings overrides: {e}")

    def save_overrides(self, data: dict):
        import json
        import sys
        config_name = "settings_test.json" if "pytest" in sys.modules else "settings.json"
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), config_name)
        try:
            # Merge with existing file if it exists
            existing = {}
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    existing = json.load(f)
            
            existing.update(data)
            
            with open(config_path, "w") as f:
                json.dump(existing, f, indent=4)
            
            # Reload settings
            self.load_overrides()
            return True
        except Exception as e:
            print(f"[CONFIG] Error saving settings overrides: {e}")
            return False

settings = Settings()
settings.load_overrides()


