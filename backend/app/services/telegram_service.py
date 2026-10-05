"""
Real Telegram Notification Service using Telegram Bot API.

Sends messages to a Telegram chat/user via a custom Telegram Bot.
"""

import logging
import requests
from typing import Tuple
from app.config import settings

logger = logging.getLogger("commai.telegram")

TELEGRAM_API_BASE_URL = "https://api.telegram.org/bot"


def send_telegram(user_id: str | int, message: str, token: str = None) -> Tuple[bool, str]:
    """
    Send a direct private message to a specific Telegram user (or chat) using the Telegram Bot API.
    
    Args:
        user_id: The numeric Telegram User ID or Chat ID (e.g. 1339647710 or "@username").
                 The Telegram API accepts the numeric user_id directly in the 'chat_id' parameter.
        message: Text content of the message.
        token: Optional Telegram Bot API token. Uses system settings/env if omitted.
        
    Returns:
        Tuple of (success: bool, error_message: str)
    """
    # Convert user_id to string and clean whitespace
    user_id_str = str(user_id).strip()

    # Use default token if none provided
    if not token:
        import os
        token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")

    if not token:
        logger.info(f"[TELEGRAM MOCK] To User ID: {user_id_str} | Message: {message[:100]}...")
        return True, "delivered_mock"

    try:
        url = f"{TELEGRAM_API_BASE_URL}{token}/sendMessage"
        payload = {
            "chat_id": user_id_str,
            "text": message
        }
        
        logger.info(f"[TELEGRAM] Dispatching direct message to User ID / Chat ID: {user_id_str}...")
        
        response = requests.post(url, json=payload, timeout=15)
        
        if response.status_code == 200:
            logger.info(f"[TELEGRAM] Successfully delivered direct message to User ID: {user_id_str}")
            return True, ""
        else:
            error_data = response.json() if response.headers.get("content-type") == "application/json" else {}
            description = error_data.get("description", f"HTTP {response.status_code}: {response.text}")
            
            # Handle specific Telegram error cases gracefully
            if "chat not found" in description.lower():
                error_msg = f"User ({user_id_str}) has not started a conversation with this bot yet. Ask the user to send /start to the bot first."
            elif "bot was blocked by the user" in description.lower():
                error_msg = f"Bot was blocked by user ({user_id_str})."
            else:
                error_msg = f"Telegram API error: {description}"

            logger.error(f"[TELEGRAM] Delivery failed for User ID {user_id_str}: {error_msg}")
            return False, error_msg

    except requests.exceptions.RequestException as e:
        error_msg = f"Network connection error to Telegram API: {str(e)}"
        logger.error(f"[TELEGRAM] Connection error: {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(f"[TELEGRAM] Unexpected error: {error_msg}", exc_info=True)
        return False, error_msg


def test_telegram_connection(chat_id: str, token: str = None) -> Tuple[bool, str]:
    """
    Send a test Telegram message to verify the integration works.

    Args:
        chat_id: Test recipient chat ID
        token: Telegram Bot token (uses default if not provided)

    Returns:
        Tuple of (success, message)
    """
    test_message = "✅ CommAI Telegram Integration Test — This message confirms your Telegram channel is working correctly!"
    success, error = send_telegram(chat_id, test_message, token)

    if success:
        if error == "delivered_mock":
            return True, "Mock delivery — No Telegram Bot token configured. Set up a Telegram bot to enable real notifications."
            
        return True, f"Test message sent successfully to Chat ID: {chat_id}"
    else:
        return False, f"Test failed: {error}"
