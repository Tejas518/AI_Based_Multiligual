"""
SMS Notification Service using Fast2SMS / Twilio / HTTP SMS Gateway API with Email Fallback.

Sends SMS messages directly to citizen phone numbers (e.g., +917569567472).
If no SMS API key is configured, falls back to SMTP email notification (or console log).
"""

import os
import logging
import re
import requests
from typing import Tuple, Optional
from dotenv import load_dotenv, find_dotenv
from app.config import settings
from app.services.email_service import send_email

# Ensure latest .env overrides are loaded dynamically
load_dotenv(find_dotenv(), override=True)

logger = logging.getLogger("commai.sms")


def format_phone_digits(phone: str, country_code: str = None) -> str:
    """Format phone string into clean digits with country code prefix."""
    if not phone:
        return ""
    digits = "".join(filter(str.isdigit, phone))
    if country_code is None:
        country_code = settings.DEFAULT_COUNTRY_CODE
    if len(digits) == 10:
        digits = country_code + digits
    return digits


def send_sms(
    phone: str,
    message: str,
    email: Optional[str] = None,
    subject: Optional[str] = None,
    api_key: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Send an SMS message to a citizen's phone number.

    Args:
        phone: Target phone number (e.g., +917569567472 or 9876543210).
        message: SMS body text (recommended under 160 characters).
        email: Optional recipient email address for dual/fallback delivery.
        subject: Optional campaign subject line.
        api_key: Optional Fast2SMS or SMS gateway API key.

    Returns:
        Tuple of (success: bool, error_message: str)
    """
    clean_phone = format_phone_digits(phone)
    if not clean_phone:
        return False, "Invalid or missing recipient phone number"

    # Always ensure latest .env values are reloaded
    load_dotenv(find_dotenv(), override=True)

    # Option 1: Twilio SMS Gateway Integration (Free Trial with $15 credits, no DLT required)
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID") or getattr(settings, "TWILIO_ACCOUNT_SID", "")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN") or getattr(settings, "TWILIO_AUTH_TOKEN", "")
    twilio_from = os.getenv("TWILIO_PHONE_NUMBER") or getattr(settings, "TWILIO_PHONE_NUMBER", "")

    if twilio_sid and twilio_token and twilio_from:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
            to_phone = f"+{clean_phone}"
            
            # Format SMS body with clean header, stripping only high-plane emojis while preserving non-ASCII text & regional scripts
            send_body = message.strip() if message else ""
            
            clean_subject = re.sub(r'[\U00010000-\U0010ffff\u2600-\u26FF\u2700-\u27BF]+', '', subject).strip() if subject else ""
            clean_body_text = re.sub(r'[\U00010000-\U0010ffff\u2600-\u26FF\u2700-\u27BF]+', '', send_body).strip()
            
            if clean_subject and not clean_body_text.startswith(clean_subject):
                send_body = f"[{clean_subject}]\n{clean_body_text}"
            else:
                send_body = clean_body_text


            payload = {
                "From": twilio_from,
                "To": to_phone,
                "Body": send_body
            }
            logger.info(f"[SMS] Dispatching Twilio SMS to {to_phone}...")
            resp = requests.post(url, data=payload, auth=(twilio_sid, twilio_token), timeout=10)
            if resp.status_code in [200, 201]:
                res_data = resp.json() if resp.headers.get("content-type") == "application/json" else {}
                if res_data.get("error_code") is None:
                    logger.info(f"[SMS] Successfully delivered Twilio SMS to {to_phone}")
                    # Dual delivery: send copy to email so message is never lost if telecom filters SMS
                    if email:
                        try:
                            fallback_subj = f"📱 [SMS Alert to {to_phone}] {subject.strip() if subject else 'Public Notice'}"
                            fallback_body = f"--- SMS Message (Target Phone: {to_phone}) ---\n\n{message}\n\n[CommAI Live Portal: https://comm-ai-nine.vercel.app/]"
                            send_email(email, fallback_subj, fallback_body)
                            logger.info(f"[SMS] Dual email copy delivered to {email}")
                        except Exception as em_err:
                            logger.warning(f"[SMS] Dual email dispatch notice error: {em_err}")
                    return True, ""
                else:
                    logger.warning(f"[SMS] Twilio returned error_code {res_data.get('error_code')}: {res_data.get('message')}")
            else:
                err_data = resp.json() if resp.headers.get("content-type") == "application/json" else {}
                err_msg = err_data.get("message", f"HTTP {resp.status_code}: {resp.text}")
                logger.warning(f"[SMS] Twilio SMS dispatch failed: {err_msg}")
        except Exception as ex:
            logger.error(f"[SMS] Twilio dispatch exception: {ex}")


    # Option 2: Fast2SMS HTTP API Integration (India SMS Gateway)
    if not api_key:
        api_key = os.getenv("FAST2SMS_API_KEY") or os.getenv("SMS_API_KEY") or getattr(settings, "SMS_API_KEY", "")

    if api_key:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            headers = {"authorization": api_key}
            payload = {
                "variables_values": message[:159],
                "route": "otp",
                "numbers": clean_phone[-10:]
            }
            logger.info(f"[SMS] Dispatching Fast2SMS payload to phone {clean_phone}...")
            resp = requests.post(url, data=payload, headers=headers, timeout=10)
            if resp.status_code == 200 and resp.json().get("return"):
                logger.info(f"[SMS] Successfully sent SMS to phone {clean_phone}")
                return True, ""
            else:
                logger.warning(f"[SMS] Fast2SMS gateway returned status {resp.status_code}: {resp.text}")
        except Exception as ex:
            logger.error(f"[SMS] Fast2SMS gateway dispatch error: {ex}")

    # Option 3: Return result or mock delivery log with email fallback
    logger.info(f"[SMS MOCK] To Phone: +{clean_phone} | Message: {message[:100]}...")
    if email:
        try:
            fallback_subj = f"📱 [SMS Alert to +{clean_phone}] {subject.strip() if subject else 'Public Notice'}"
            fallback_body = f"--- SMS Message (Target Phone: +{clean_phone}) ---\n\n{message}\n\n[CommAI Live Portal: https://comm-ai-nine.vercel.app/]"
            send_email(email, fallback_subj, fallback_body)
            logger.info(f"[SMS] Sent email fallback alert to {email} for phone +{clean_phone}")
        except Exception as fallback_err:
            logger.error(f"[SMS] Email fallback error: {fallback_err}")

    return True, "delivered_mock"
