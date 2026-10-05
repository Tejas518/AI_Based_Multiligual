"""
Real Firebase Cloud Messaging (FCM) Push Service using Firebase Admin SDK.
"""

import os
import json
import logging
from typing import Tuple
from dotenv import load_dotenv, find_dotenv
from app.config import settings

logger = logging.getLogger("commai.fcm")

def get_fcm_credentials(service_account_json: str = None) -> dict:
    """
    Parse FCM Service Account credentials into a dictionary.
    """
    load_dotenv(find_dotenv(), override=True)
    if not service_account_json:
        service_account_json = os.getenv("FCM_SERVICE_ACCOUNT_JSON") or settings.FCM_SERVICE_ACCOUNT_JSON

    if not service_account_json:
        return None

    try:
        if isinstance(service_account_json, dict):
            return service_account_json
        return json.loads(service_account_json)
    except Exception as e:
        logger.error(f"[FCM] Failed to parse Service Account JSON: {e}")
        return None


def is_fcm_configured() -> bool:
    """
    Check if Firebase FCM is configured with valid credentials.
    """
    return get_fcm_credentials() is not None


def send_fcm_push(token: str, title: str, body: str, service_account_json: str = None) -> Tuple[bool, str]:
    """
    Send a push notification to an FCM device token.
    """
    creds_dict = get_fcm_credentials(service_account_json)
    if not creds_dict:
        logger.info(f"[FCM MOCK] Push notification to: {token[:20]}... | Title: {title} | Body: {body}")
        return True, "delivered_mock"

    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
    except ImportError:
        logger.error("[FCM] firebase-admin package is not installed.")
        return False, "firebase-admin SDK is not installed"

    try:
        # Initialize firebase-admin if not already initialized
        # If credentials match a different project, we might need to recreate,
        # but typically during the lifecycle it remains the same.
        if not firebase_admin._apps:
            cred = credentials.Certificate(creds_dict)
            firebase_admin.initialize_app(cred)
        
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            token=token,
        )
        
        logger.info(f"[FCM] Dispatching push notification to {token[:15]}...")
        response = messaging.send(message)
        logger.info(f"[FCM] Push sent successfully: {response}")
        return True, ""
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[FCM] Delivery failed: {error_msg}", exc_info=True)
        return False, error_msg


def test_fcm_connection(token: str, service_account_json: str = None) -> Tuple[bool, str]:
    """
    Send a test FCM push notification.
    """
    test_title = "✅ CommAI Test Alert"
    test_body = "This push notification confirms that your FCM service account integration is functioning correctly!"
    success, error = send_fcm_push(token, test_title, test_body, service_account_json)
    
    if success:
        if error == "delivered_mock":
            return True, "Mock push triggered. (No Firebase configuration saved)."
        return True, "Test push notification sent successfully!"
    else:
        return False, f"Test failed: {error}"
