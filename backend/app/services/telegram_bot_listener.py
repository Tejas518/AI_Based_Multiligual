"""
Telegram Bot Listener & Auto-Contact Matcher

Listens for incoming Telegram messages / contact sharing updates.
Automatically matches shared phone numbers with Audience database records
and links their Telegram Chat ID without manual input.
"""

import os
import json
import time
import datetime
import re
import logging
import threading
import requests
from sqlalchemy import or_

from app.config import settings
from app.database import SessionLocal
from app.models import Audience

logger = logging.getLogger("commai.telegram_listener")

TELEGRAM_API_BASE_URL = "https://api.telegram.org/bot"
_polling_thread = None
_polling_active = False


def extract_phone_digits(phone_str: str) -> str:
    """Extract clean digits from a phone string. Returns last 10 digits if available."""
    if not phone_str:
        return ""
    digits = re.sub(r"\D", "", phone_str)
    return digits[-10:] if len(digits) >= 10 else digits


def send_contact_request_prompt(chat_id: str, bot_token: str):
    """Sends a message prompting the user to share their phone number via a custom contact request button."""
    url = f"{TELEGRAM_API_BASE_URL}{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": (
            "👋 *Welcome to CommAI Emergency Alert System!*\n\n"
            "To receive personalized real-time safety alerts and campaign broadcasts, "
            "please tap the button below to link your account."
        ),
        "parse_mode": "Markdown",
        "reply_markup": {
            "keyboard": [
                [
                    {
                        "text": "📱 Share Phone Number to Link CommAI Account",
                        "request_contact": True
                    }
                ]
            ],
            "resize_keyboard": True,
            "one_time_keyboard": True
        }
    }
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        logger.error(f"[TELEGRAM LISTENER] Failed to send contact prompt: {e}")


def send_telegram_reply(chat_id: str, text: str, bot_token: str):
    """Sends a standard text message reply."""
    url = f"{TELEGRAM_API_BASE_URL}{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": {"remove_keyboard": True}
    }
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        logger.error(f"[TELEGRAM LISTENER] Failed to send reply: {e}")


def process_telegram_update(update: dict, bot_token: str):
    """
    Process a single update payload from Telegram API (webhook or polling).
    """
    message = update.get("message") or update.get("edited_message")
    if not message:
        return

    chat = message.get("chat", {})
    chat_id = str(chat.get("id"))
    if not chat_id:
        return

    contact = message.get("contact")
    text = message.get("text", "")

    # Case 1: User shared their contact phone number
    if contact:
        raw_phone = contact.get("phone_number", "")
        phone_digits = extract_phone_digits(raw_phone)
        logger.info(f"[TELEGRAM LISTENER] Received shared contact from Chat ID {chat_id}: phone={raw_phone} (digits={phone_digits})")

        db = SessionLocal()
        try:
            matched_aud = None
            if phone_digits:
                # Query DB for matching active, non-deleted audience profile
                all_auds = db.query(Audience).filter(Audience.is_deleted == False).all()
                for aud in all_auds:
                    aud_digits = extract_phone_digits(aud.phone)
                    if aud_digits and aud_digits == phone_digits:
                        matched_aud = aud
                        break

            if matched_aud:
                # 1. Update custom_fields with telegram_chat_id
                custom = {}
                if matched_aud.custom_fields:
                    try:
                        custom = json.loads(matched_aud.custom_fields) if isinstance(matched_aud.custom_fields, str) else matched_aud.custom_fields
                    except Exception:
                        custom = {}
                
                custom["telegram_chat_id"] = chat_id
                matched_aud.custom_fields = json.dumps(custom)

                # 2. Ensure 'telegram' is in preferred_channels
                channels = []
                if matched_aud.preferred_channels:
                    try:
                        channels = json.loads(matched_aud.preferred_channels) if isinstance(matched_aud.preferred_channels, str) else matched_aud.preferred_channels
                    except Exception:
                        channels = []
                
                if "telegram" not in channels:
                    channels.append("telegram")
                    matched_aud.preferred_channels = json.dumps(channels)

                matched_aud.updated_at = datetime.datetime.utcnow()
                db.commit()

                reply_msg = (
                    f"✅ Account Successfully Linked!\n\n"
                    f"Hello {matched_aud.first_name} {matched_aud.last_name}! "
                    f"Your Telegram account has been linked to your CommAI profile ({matched_aud.city}, {matched_aud.state}).\n\n"
                    f"You will now receive personalized real-time safety advisories and official announcements directly in this chat."
                )
                send_telegram_reply(chat_id, reply_msg, bot_token)
                logger.info(f"[TELEGRAM LISTENER] Successfully linked Chat ID {chat_id} to Audience ID {matched_aud.id} ({matched_aud.first_name} {matched_aud.last_name})")
            else:
                reply_msg = (
                    f"⚠️ Phone Number Not Found\n\n"
                    f"The phone number ({raw_phone}) was not found in our CommAI citizen directory.\n\n"
                    f"Please ask your organization administrator to add your profile ({raw_phone}) to the Audience Directory first, then try linking again!"
                )
                send_telegram_reply(chat_id, reply_msg, bot_token)
                logger.warning(f"[TELEGRAM LISTENER] Shared phone {raw_phone} did not match any profile in database")

        except Exception as ex:
            logger.error(f"[TELEGRAM LISTENER] Error processing contact matching: {ex}")
            db.rollback()
        finally:
            db.close()

    # Case 2: Standard text message or /start command -> Send contact button prompt
    elif text:
        send_contact_request_prompt(chat_id, bot_token)


def _telegram_polling_worker():
    """Background polling loop for Telegram Bot updates."""
    global _polling_active
    offset = 0

    logger.info("[TELEGRAM LISTENER] Background polling worker started.")

    while _polling_active:
        token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")
        if not token:
            time.sleep(5)
            continue

        try:
            url = f"{TELEGRAM_API_BASE_URL}{token}/getUpdates"
            params = {"offset": offset, "timeout": 5}
            resp = requests.get(url, params=params, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                if data.get("ok"):
                    updates = data.get("result", [])
                    for up in updates:
                        offset = up["update_id"] + 1
                        process_telegram_update(up, token)
            elif resp.status_code == 409:
                # Webhook active conflict, wait longer
                logger.warning("[TELEGRAM LISTENER] Webhook conflict detected, pausing polling for 15s...")
                time.sleep(15)
        except Exception as e:
            logger.debug(f"[TELEGRAM LISTENER] Polling iteration error: {e}")

        time.sleep(2)


def start_telegram_polling():
    """Starts the background Telegram polling worker thread if not already running."""
    global _polling_thread, _polling_active
    token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.info("[TELEGRAM LISTENER] No TELEGRAM_BOT_TOKEN configured. Polling thread skipped.")
        return

    if _polling_thread and _polling_thread.is_alive():
        return

    _polling_active = True
    _polling_thread = threading.Thread(
        target=_telegram_polling_worker,
        daemon=True,
        name="telegram-polling-listener"
    )
    _polling_thread.start()
    logger.info("[TELEGRAM LISTENER] Background polling listener thread initialized.")


def stop_telegram_polling():
    """Stops the background Telegram polling worker thread."""
    global _polling_active
    _polling_active = False
