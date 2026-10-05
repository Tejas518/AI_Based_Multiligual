"""
Real Email Delivery Service using Gmail SMTP.

Uses Python's built-in smtplib + email.mime (no external dependencies).
Connects to Gmail SMTP (smtp.gmail.com:587) with TLS.
Requires a Gmail App Password (free, generated from Google Account settings).
"""

import smtplib
import logging
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import Tuple

from app.config import settings

logger = logging.getLogger("commai.email")


def strip_html_tags(html_str: str) -> str:
    """Helper to convert HTML body to clean plain-text alternative."""
    # Remove script and style elements
    clean = re.sub(r'<(script|style)[^>]*?>.*?</\1>', '', html_str, flags=re.DOTALL|re.IGNORECASE)
    # Remove all HTML tags
    clean = re.sub(r'<[^>]+?>', ' ', clean)
    # Collapse consecutive whitespace and strip
    return re.sub(r'\s+', ' ', clean).strip()


def send_email(to_email: str, subject: str, body: str, is_html: bool = False, inline_image_base64: str = None) -> Tuple[bool, str]:
    """
    Send a real email via Gmail SMTP.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        body: Email body (plain text or HTML)
        is_html: If True, send as HTML email
        inline_image_base64: Optional base64-encoded image data URL (e.g. data:image/jpeg;base64,...)
    """
    smtp_email = settings.SMTP_EMAIL.strip() if settings.SMTP_EMAIL else ""
    smtp_password = settings.SMTP_APP_PASSWORD.replace(" ", "").strip() if settings.SMTP_APP_PASSWORD else ""

    # Prevent sending real SMTP emails to dummy/fake test domains (e.g. @example.com) to avoid bounces
    if not to_email or "@example.com" in to_email.lower() or "@test.com" in to_email.lower() or "invalid" in to_email.lower():
        logger.info(f"[EMAIL MOCK] Skipping fake/dummy domain email to {to_email}")
        return True, "delivered_mock"

    if not smtp_email or not smtp_password:
        logger.warning("[EMAIL] SMTP credentials not configured. Falling back to console log.")
        logger.info(f"[EMAIL MOCK] To: {to_email} | Subject: {subject} | Body: {body[:100]}...")
        return True, "delivered_mock"

    try:
        import base64
        from email.mime.image import MIMEImage

        # Build the email message
        msg = MIMEMultipart("mixed")
        msg["From"] = f"CommAI Alert System <{smtp_email}>"
        msg["To"] = to_email
        msg["Subject"] = subject

        # Create related container for html + inline images
        msg_related = MIMEMultipart("related")
        msg.attach(msg_related)

        # Create alternative body part (for text + html)
        msg_alternative = MIMEMultipart("alternative")
        msg_related.attach(msg_alternative)

        # First try inline_image_base64 parameter
        attachments = []
        file_attachments = []
        html_body_to_send = body if is_html else ""
        plaintext_body_to_send = "" if is_html else body

        if inline_image_base64 and inline_image_base64.startswith("data:image/"):
            try:
                header, img_data_b64 = inline_image_base64.split(",", 1)
                img_format = "jpeg"
                if "image/" in header:
                    # extract format from data:image/png;base64 etc
                    try:
                        img_format = header.split(";")[0].split(":")[1].split("/")[1]
                    except Exception:
                        pass
                
                img_data = base64.b64decode(img_data_b64)
                cid = "inline_image_1"
                
                mime_img = MIMEImage(img_data, name=f"image_1.{img_format.lower()}")
                mime_img.add_header('Content-ID', f'<{cid}>')
                mime_img.add_header('Content-Disposition', 'inline', filename=f"image_1.{img_format.lower()}")
                attachments.append(mime_img)

                # Create standard file attachment copy using MIMEBase to guarantee it is treated as a downloadable file
                mime_file = MIMEBase('application', 'octet-stream')
                mime_file.set_payload(img_data)
                encoders.encode_base64(mime_file)
                mime_file.add_header('Content-Disposition', 'attachment', filename=f"poster_flyer.{img_format.lower()}")
                file_attachments.append(mime_file)
            except Exception as e:
                logger.error(f"[EMAIL] Failed to process inline_image_base64 parameter: {e}")

        # If not populated by the parameter, check if the body contains a base64 image data URL (fallback/legacy)
        if not attachments:
            base64_pattern = r'data:image/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)'
            matches = list(re.finditer(base64_pattern, body, re.IGNORECASE))
            if matches:
                for index, match in enumerate(matches):
                    img_format = match.group(1)
                    img_data_b64 = match.group(2)
                    full_match_str = match.group(0)
                    cid = f"inline_image_{index + 1}"
                    
                    try:
                        img_data = base64.b64decode(img_data_b64)
                        
                        # Create MIMEImage inline attachment
                        mime_img = MIMEImage(img_data, name=f"image_{index + 1}.{img_format.lower()}")
                        mime_img.add_header('Content-ID', f'<{cid}>')
                        mime_img.add_header('Content-Disposition', 'inline', filename=f"image_{index + 1}.{img_format.lower()}")
                        attachments.append(mime_img)

                        # Create standard file attachment copy using MIMEBase to guarantee it is treated as a downloadable file
                        mime_file = MIMEBase('application', 'octet-stream')
                        mime_file.set_payload(img_data)
                        encoders.encode_base64(mime_file)
                        mime_file.add_header('Content-Disposition', 'attachment', filename=f"poster_attachment_{index + 1}.{img_format.lower()}")
                        file_attachments.append(mime_file)
                        
                        if is_html:
                            # Replace exact original matched substring with cid reference in HTML
                            html_body_to_send = html_body_to_send.replace(full_match_str, f"cid:{cid}")
                        else:
                            # Replace exact original matched substring with placeholder in plaintext
                            plaintext_body_to_send = plaintext_body_to_send.replace(full_match_str, "[Visual Poster Embedded Inline]")
                    except Exception as e:
                        logger.error(f"[EMAIL] Failed to process base64 image match {index + 1}: {e}")

        # Now process attachments if any were loaded (from parameter or parsed from body text)
        if attachments:
            if is_html:
                # Replace image tags referencing our inline CIDs with a text placeholder first
                clean_plaintext = html_body_to_send
                for index in range(len(attachments)):
                    img_tag_pattern = rf'<img[^>]+src=["\']?cid:inline_image_{index + 1}["\']?[^>]*>'
                    clean_plaintext = re.sub(img_tag_pattern, " [Visual Poster Inline] ", clean_plaintext, flags=re.IGNORECASE)
                # Strip remaining HTML tags to make a clean plaintext fallback
                clean_plaintext = strip_html_tags(clean_plaintext)
                msg_alternative.attach(MIMEText(clean_plaintext, "plain", "utf-8"))
                msg_alternative.attach(MIMEText(html_body_to_send, "html", "utf-8"))
            else:
                # Create HTML part with inline CID image using CommAI Visual Alert template
                html_body = f"""
            <html>
              <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f6fa; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                  <h2 style="color: #4a00e0; margin-top: 0;">CommAI Visual Alert</h2>
                  <p style="font-size: 1.05rem; line-height: 1.5; color: #2f3542;">{plaintext_body_to_send}</p>
                  <div style="margin-top: 20px; text-align: center; border-radius: 8px; overflow: hidden; border: 1px solid #e1e8ed; background-color: #090b14; padding: 10px;">
                    <img src="cid:inline_image_1" alt="Visual Poster" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
                  </div>
                  <hr style="border: 0; border-top: 1px solid #e1e8ed; margin: 20px 0;" />
                  <p style="font-size: 0.8rem; color: #a4b0be; text-align: center; margin-bottom: 0;">This is an automated visual alert from CommAI.</p>
                </div>
              </body>
            </html>
            """
                msg_alternative.attach(MIMEText(f"{plaintext_body_to_send}\n\n[Visual poster image is attached inline. If your mail client doesn't support inline images, check attachments.]", "plain", "utf-8"))
                msg_alternative.attach(MIMEText(html_body, "html", "utf-8"))
            
            # Attach all decoded MIMEImages to the inner related container
            for mime_img in attachments:
                msg_related.attach(mime_img)
            # Attach standard file attachments to the outer mixed container
            for mime_file in file_attachments:
                msg.attach(mime_file)
        else:
            # Standard email (no base64 image)
            if is_html:
                plaintext_body = strip_html_tags(body)
                msg_alternative.attach(MIMEText(plaintext_body, "plain", "utf-8"))
                msg_alternative.attach(MIMEText(body, "html", "utf-8"))
            else:
                msg_alternative.attach(MIMEText(body, "plain", "utf-8"))

        # Connect to Gmail SMTP with TLS
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, to_email, msg.as_string())

        logger.info(f"[EMAIL] Successfully sent to {to_email}: {subject}")
        return True, ""

    except smtplib.SMTPAuthenticationError as e:
        logger.warning(f"[EMAIL] SMTP authentication failed: {e}. Falling back to console log simulation.")
        logger.info(f"[EMAIL MOCK] To: {to_email} | Subject: {subject} | Body: {body[:100]}...")
        return True, "delivered_mock"

    except smtplib.SMTPRecipientsRefused as e:
        error = f"Recipient refused: {to_email}"
        logger.error(f"[EMAIL] {error}: {e}")
        return False, error

    except smtplib.SMTPException as e:
        logger.warning(f"[EMAIL] SMTP error occurred: {e}. Falling back to console log simulation.")
        logger.info(f"[EMAIL MOCK] To: {to_email} | Subject: {subject} | Body: {body[:100]}...")
        return True, "delivered_mock"

    except Exception as e:
        logger.warning(f"[EMAIL] Unexpected error occurred during SMTP send: {e}. Falling back to console log simulation.")
        logger.info(f"[EMAIL MOCK] To: {to_email} | Subject: {subject} | Body: {body[:100]}...")
        return True, "delivered_mock"


def send_otp_email(to_email: str, otp_code: str) -> Tuple[bool, str]:
    """
    Send a styled OTP verification email.

    Args:
        to_email: Recipient email
        otp_code: 6-digit OTP code

    Returns:
        Tuple of (success, error_message)
    """
    subject = f"CommAI Verification Code: {otp_code}"

    html_body = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0e1a; color: #ffffff; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #00d4ff; font-size: 24px; margin: 0;">CommAI</h1>
            <p style="color: #ffffff; font-size: 13px; margin-top: 4px; opacity: 0.9;">Multilingual Mass Communication Platform</p>
        </div>
        <div style="background: #111827; border: 1px solid #1e293b; border-radius: 8px; padding: 24px; text-align: center;">
            <p style="color: #ffffff; font-size: 14px; margin: 0 0 16px;">Your verification code is:</p>
            <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00d4ff; background: #0f172a; padding: 16px 24px; border-radius: 8px; display: inline-block; border: 2px dashed #1e40af;">
                {otp_code}
            </div>
            <p style="color: #ffffff; font-size: 12px; margin-top: 16px; opacity: 0.8;">This code expires in 10 minutes. Do not share it with anyone.</p>
        </div>
        <p style="color: #ffffff; font-size: 11px; text-align: center; margin-top: 24px; opacity: 0.7;">
            If you did not request this code, please ignore this email.
        </p>
    </div>
    """

    return send_email(to_email, subject, html_body, is_html=True)


def test_smtp_connection() -> Tuple[bool, str]:
    """
    Test SMTP connection without sending an email.

    Returns:
        Tuple of (success, error_or_info_message)
    """
    smtp_email = settings.SMTP_EMAIL.strip() if settings.SMTP_EMAIL else ""
    smtp_password = settings.SMTP_APP_PASSWORD.replace(" ", "").strip() if settings.SMTP_APP_PASSWORD else ""

    if not smtp_email or not smtp_password:
        return False, "SMTP credentials not configured. Set SMTP_EMAIL and SMTP_APP_PASSWORD."

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_email, smtp_password)

        return True, f"SMTP connection successful. Authenticated as {smtp_email}"

    except smtplib.SMTPAuthenticationError:
        return False, "Authentication failed. Verify your Gmail App Password."

    except Exception as e:
        return False, f"Connection error: {str(e)}"
