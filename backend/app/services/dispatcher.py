"""
Campaign Dispatcher — The Real Delivery Engine.

When a campaign transitions to 'active', this module:
1. Loads the campaign's segment → resolves audience members
2. Loads the template → interpolates placeholders per audience member
3. For each audience × channel, dispatches via the appropriate service
4. Tracks delivery status in DeliveryLog
5. Updates campaign sent/failed counts

Runs in a background thread so the API returns immediately.
"""

import json
import re
import logging
import datetime
import threading
from typing import List, Dict, Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Campaign, Segment, Audience, Template, DeliveryLog, User
from app.services.email_service import send_email
from app.services.sms_service import send_sms
from app.services.whatsapp_service import send_whatsapp
from app.services.telegram_service import send_telegram
from app.services.fcm_service import send_fcm_push, is_fcm_configured
from app.services.voice_service import send_voice_call
from app.routes.audience import build_segment_filter_query
from app.config import settings


logger = logging.getLogger("commai.dispatcher")


def interpolate_template(template_text: str, audience: Audience) -> str:
    """
    Replace {placeholder} variables in a template with audience member data.
    
    Supports both {variable} and {{variable}} syntax, case-insensitively,
    and supports extra spaces inside braces as well as name/place aliases.
    """
    if not template_text:
        return ""

    replacements = {
        "first_name": audience.first_name or "",
        "last_name": audience.last_name or "",
        "name": f"{audience.first_name or ''} {audience.last_name or ''}".strip() or "Citizen",
        "place": audience.city or audience.district or audience.state or "your area",
        "email": audience.email or "",
        "phone": audience.phone or "",
        "city": audience.city or "",
        "district": audience.district or "",
        "state": audience.state or "",
        "occupation": audience.occupation or "",
        "age": str(audience.age) if audience.age else "",
        "gender": audience.gender or "",
        "organization": audience.organization or "",
        "department": audience.department or "",
        "designation": audience.designation or "",
    }

    result = template_text
    for key, value in replacements.items():
        # Match both {key} and {{key}} formats case-insensitively with optional spaces
        pattern_double = re.compile(r"\{\{\s*" + key + r"\s*\}\}", re.IGNORECASE)
        pattern_single = re.compile(r"\{\s*" + key + r"\s*\}", re.IGNORECASE)
        result = pattern_double.sub(value, result)
        result = pattern_single.sub(value, result)

    return result



def resolve_audience_members(db: Session, segment_id: str) -> List[Audience]:
    """
    Get all active, non-deleted audience members matching a segment's filter criteria.
    """
    segment = db.query(Segment).filter(Segment.id == segment_id).first()
    if not segment:
        return []

    criteria = json.loads(segment.filter_criteria)
    query = db.query(Audience).filter(
        Audience.is_deleted == False,
        Audience.is_active == True
    )
    query = build_segment_filter_query(criteria, query)
    return query.all()


def dispatch_to_channel(
    channel: str,
    audience: Audience,
    subject: str,
    body: str,
    inline_image_base64: str = None
) -> tuple:
    """
    Dispatch a message to a specific channel for a specific audience member.
    
    Returns (success: bool, error: str, actual_channel: str)
    """
    # Some direct-send paths (state emergencies and posters) reach this
    # function without going through the campaign template renderer. Render at
    # the delivery boundary so every recipient receives their own details.
    subject = interpolate_template(subject, audience)
    body = interpolate_template(body, audience)

    if channel == "email":
        if not audience.email:
            return False, "No email address on file", "email"
        success, error = send_email(audience.email, subject, body, inline_image_base64=inline_image_base64)
        return success, error, "email"

    elif channel == "whatsapp":
        if not audience.phone:
            return False, "No phone number on file", "whatsapp"
        
        # Check for per-recipient CallMeBot API key in custom_fields
        apikey = None
        if audience.custom_fields:
            try:
                custom = json.loads(audience.custom_fields) if isinstance(audience.custom_fields, str) else audience.custom_fields
                apikey = custom.get("callmebot_apikey")
            except (json.JSONDecodeError, AttributeError):
                pass

        success, error = send_whatsapp(audience.phone, body, apikey)
        return success, error, "whatsapp"

    elif channel == "sms":
        success, error = send_sms(audience.phone, body, email=audience.email, subject=subject)
        return success, error, "sms"

    elif channel == "voice":
        if not audience.phone:
            return False, "No phone number on file for voice call", "voice"
        target_lang = getattr(audience, "preferred_language", "Hindi") or "Hindi"
        voice_text = f"{subject}. {body}" if (subject and subject.strip() and not body.startswith(subject.strip())) else body
        success, error = send_voice_call(audience.phone, voice_text, lang=target_lang)
        return success, error, "voice"


    elif channel == "push":
        # Check for per-recipient FCM token in custom_fields
        fcm_token = None
        if audience.custom_fields:
            try:
                custom = json.loads(audience.custom_fields) if isinstance(audience.custom_fields, str) else audience.custom_fields
                fcm_token = custom.get("fcm_token")
            except (json.JSONDecodeError, AttributeError):
                pass

        if fcm_token and is_fcm_configured():
            success, error = send_fcm_push(fcm_token, subject, body)
            if success:
                return True, "delivered_fcm", "push"
            else:
                return False, f"FCM error: {error}", "push"

        # Fallback: Send push notification content as email
        if not audience.email:
            return False, "No email or FCM token for push delivery", "push"
        push_subject = f"🔔 [PUSH] {subject}"
        push_body = f"--- Push Notification ---\n\n{body}\n\n--- This push notification was delivered via email ---"
        success, error = send_email(audience.email, push_subject, push_body)
        return success, error, "push"

    elif channel == "telegram":
        # Check for per-recipient telegram_chat_id or telegram_username in custom_fields
        chat_id = None
        if audience.custom_fields:
            try:
                custom = json.loads(audience.custom_fields) if isinstance(audience.custom_fields, str) else audience.custom_fields
                chat_id = custom.get("telegram_chat_id") or custom.get("telegram_username")
                if chat_id and isinstance(chat_id, str) and not chat_id.replace('-', '').isdigit() and not chat_id.startswith("@"):
                    chat_id = f"@{chat_id}"
            except (json.JSONDecodeError, AttributeError):
                pass

        if not chat_id:
            return False, "No Telegram Chat ID or Username linked to profile", "telegram"

        success, error = send_telegram(chat_id, body)
        return success, error, "telegram"

    elif channel == "website":
        # Website channel: log to server output and automatically broadcast to connected WebSockets in realtime
        logger.info(f"[WEBSITE] Banner content for {audience.first_name} ({audience.state}): {body[:80]}...")
        
        try:
            import asyncio
            from app.services.websocket_manager import bulletin_manager

            payload = {
                "type": "campaign_alert",
                "id": f"web_{audience.id}_{int(datetime.datetime.utcnow().timestamp())}",
                "title": subject or "Website Broadcast Banner",
                "message": body,
                "description": body,
                "urgency": "critical" if any(w in (subject or "").lower() for w in ["emergency", "critical", "warning", "alert"]) else "normal",
                "channel": "website",
                "target_state": audience.state,
                "created_at": datetime.datetime.utcnow().isoformat()
            }

            try:
                loop = asyncio.get_running_loop()
                loop.create_task(bulletin_manager.broadcast(payload))
            except RuntimeError:
                asyncio.run(bulletin_manager.broadcast(payload))
        except Exception as ws_err:
            logger.error(f"[WEBSITE-WS] Failed to broadcast website channel alert via WebSocket: {ws_err}")

        return True, "website_broadcast_sent", "website"

    else:
        return False, f"Unknown channel: {channel}", channel


def dispatch_campaign(campaign_id: str):
    """
    Execute campaign delivery in a background thread.
    
    This is the main entry point called from the campaign route
    when status transitions to 'active'.
    """
    thread = threading.Thread(
        target=_dispatch_campaign_worker,
        args=(campaign_id,),
        daemon=True,
        name=f"dispatcher-{campaign_id[:8]}"
    )
    thread.start()
    logger.info(f"[DISPATCHER] Started background dispatch for campaign {campaign_id}")


def _dispatch_campaign_worker(campaign_id: str):
    """
    Background worker that performs the actual delivery.
    Uses its own DB session (since we're in a separate thread).
    """
    db = SessionLocal()

    try:
        # 1. Load campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error(f"[DISPATCHER] Campaign {campaign_id} not found")
            return

        # Broadcast campaign alerts via WebSockets if it's an emergency alert
        if campaign.campaign_type == "emergency_alert":
            import asyncio
            from app.services.websocket_manager import bulletin_manager

            # Strip template placeholders from broadcast content since bulletins
            # go to all recipients at once and cannot be personalised per-user.
            def strip_placeholders(text):
                if not text:
                    return ""
                result = re.sub(r'\{\{(\w+)\}\}', '', text)
                result = re.sub(r'\{(\w+)\}', '', result)
                # Collapse any resulting double-spaces
                return re.sub(r'  +', ' ', result).strip()

            payload = {
                "type": "campaign_alert",
                "id": campaign.id,
                "title": strip_placeholders(campaign.title),
                "description": strip_placeholders(campaign.description),
                "objective": strip_placeholders(campaign.objective),
                "campaign_type": campaign.campaign_type,
                "created_at": datetime.datetime.utcnow().isoformat()
            }
            try:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(bulletin_manager.broadcast(payload))
                except RuntimeError:
                    asyncio.run(bulletin_manager.broadcast(payload))
            except Exception as e:
                logger.error(f"[WS] Failed to broadcast campaign alert: {e}")


        # 2. Load template (or fallback to custom subject/body)
        template = db.query(Template).filter(Template.id == campaign.template_id).first() if campaign.template_id else None
        
        raw_subject = (template.subject_template if template else None) or getattr(campaign, 'custom_subject', None) or campaign.title
        raw_body = (template.body_template if template else None) or getattr(campaign, 'custom_body', None) or campaign.description or campaign.title
        default_lang = (template.default_language if template else None) or "English"

        # 3. Resolve audience
        print(f"[DISPATCHER-DEBUG] Campaign ID: {campaign_id}")
        print(f"[DISPATCHER-DEBUG] Segment ID: {campaign.segment_id}")
        segment = db.query(Segment).filter(Segment.id == campaign.segment_id).first()
        if segment:
            print(f"[DISPATCHER-DEBUG] Segment Name: {segment.name}")
            print(f"[DISPATCHER-DEBUG] Segment Criteria: {segment.filter_criteria}")
        else:
            print(f"[DISPATCHER-DEBUG] Segment NOT found in database!")

        audience_members = resolve_audience_members(db, campaign.segment_id)
        print(f"[DISPATCHER-DEBUG] Resolved audience members count: {len(audience_members)}")
        if not audience_members:
            logger.warning(f"[DISPATCHER] No audience members found for campaign {campaign_id}")
            campaign.dispatched_at = datetime.datetime.utcnow()
            db.commit()
            return

        # Ensure target_audience_count reflects the exact count of resolved audience members
        campaign.target_audience_count = len(audience_members)

        # 4. Parse campaign channels
        channels = json.loads(campaign.channel_preferences) if campaign.channel_preferences else []
        if not channels:
            logger.error(f"[DISPATCHER] No channels configured for campaign {campaign_id}")
            return

        logger.info(
            f"[DISPATCHER] Campaign '{campaign.title}': "
            f"Sending to {len(audience_members)} members via {channels}"
        )

        # --- Daily Caps Check ---
        today_start = datetime.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from sqlalchemy import func
        sent_counts_today = db.query(
            DeliveryLog.channel, 
            func.count(DeliveryLog.id)
        ).filter(
            DeliveryLog.status == "sent", 
            DeliveryLog.sent_at >= today_start
        ).group_by(DeliveryLog.channel).all()
        
        sent_today = {channel: count for channel, count in sent_counts_today}
        
        caps = {
            "email": settings.DAILY_CAP_EMAIL,
            "sms": settings.DAILY_CAP_SMS,
            "whatsapp": settings.DAILY_CAP_WHATSAPP,
            "telegram": settings.DAILY_CAP_TELEGRAM,
            "push": settings.DAILY_CAP_PUSH
        }
        
        caps_breached = []
        for channel in channels:
            if channel in caps:
                planned_send = 0
                for member in audience_members:
                    pref_ch = []
                    if member.preferred_channels:
                        try:
                            pref_ch = json.loads(member.preferred_channels) if isinstance(member.preferred_channels, str) else member.preferred_channels
                        except Exception:
                            pref_ch = []
                    if not pref_ch or channel in pref_ch:
                        planned_send += 1
                
                already_sent = sent_today.get(channel, 0)
                limit = caps[channel]
                if already_sent + planned_send > limit:
                    caps_breached.append(f"{channel.upper()} (Limit: {limit}, Already Sent: {already_sent}, Planned: {planned_send})")
                    
        if caps_breached:
            logger.error(f"[DISPATCHER] Campaign {campaign_id} aborted due to Daily Send Caps breach: {', '.join(caps_breached)}")
            campaign.status = "failed"
            campaign.failed_count = len(audience_members) * len(channels)
            
            from app.models import AuditLog
            audit = AuditLog(
                user_id="SYSTEM",
                campaign_id=campaign_id,
                action="STATUS_CHANGE",
                old_status="active",
                new_status="failed",
                changes=json.dumps({"reason": f"Daily Send Cap Breached: {', '.join(caps_breached)}"})
            )
            db.add(audit)
            db.commit()
            return

        # Fetch the opt-out blacklist
        from app.models import Blacklist
        blacklist_entries = db.query(Blacklist.value).all()
        blacklist_set = {entry[0].strip().lower() for entry in blacklist_entries}

        # 4.5. Pre-group and pre-translate unique languages to avoid per-recipient API calls
        unique_target_langs = set()
        for member in audience_members:
            pref_langs = []
            if member.preferred_languages:
                try:
                    pref_langs = json.loads(member.preferred_languages) if isinstance(member.preferred_languages, str) else member.preferred_languages
                except Exception:
                    pref_langs = []
            if pref_langs and isinstance(pref_langs, list) and len(pref_langs) > 0:
                primary_lang = pref_langs[0].strip()
                if primary_lang and primary_lang.lower() != default_lang.strip().lower():
                    unique_target_langs.add(primary_lang)

        # Read template's existing pre-translations from DB
        translations_dict = {}
        if template and template.translations:
            try:
                translations_dict = json.loads(template.translations) if isinstance(template.translations, str) else template.translations
            except Exception:
                translations_dict = {}

        # Dynamically pre-translate unique languages that are missing from template cache
        dynamic_translations = {}
        for target_lang in unique_target_langs:
            if target_lang not in translations_dict and settings.GROQ_API_KEY:
                try:
                    logger.info(f"[DISPATCHER] Pre-translating campaign text for target language '{target_lang}' to prevent loop rate-limiting...")
                    from app.services.translation_service import translate_text
                    t_subject = ""
                    if raw_subject:
                        t_subject = translate_text(raw_subject, target_lang, default_lang)
                    t_body = translate_text(raw_body, target_lang, default_lang)
                    
                    if t_body and t_body.strip() != raw_body.strip():
                        dynamic_translations[target_lang] = {
                            "subject": t_subject,
                            "body": t_body
                        }
                except Exception as ex:
                    logger.error(f"[DISPATCHER] Failed dynamic pre-translation for '{target_lang}': {ex}")

        sent_count = 0
        failed_count = 0

        # 5. Dispatch to each audience member × channel
        for member in audience_members:
            # Check blacklist
            is_blacklisted = False
            if member.email and member.email.strip().lower() in blacklist_set:
                is_blacklisted = True
            if member.phone and member.phone.strip().lower() in blacklist_set:
                is_blacklisted = True
                
            if is_blacklisted:
                logger.info(f"[DISPATCHER] Skipping dispatch for {member.first_name} {member.last_name} due to opt-out blacklist")
                for channel in channels:
                    log = DeliveryLog(
                        campaign_id=campaign_id,
                        audience_id=member.id,
                        channel=channel,
                        status="failed",
                        recipient_info=member.email if channel in ["email", "sms", "push"] else member.phone,
                        error_message="Recipient has opted out (blacklisted)",
                        sent_at=datetime.datetime.utcnow()
                    )
                    db.add(log)
                    failed_count += 1
                continue

            # Interpolate template for this member
            subject = interpolate_template(raw_subject, member)
            body = interpolate_template(raw_body, member)

            # Resolve recipient preferred languages
            pref_langs = []
            if member.preferred_languages:
                try:
                    pref_langs = json.loads(member.preferred_languages) if isinstance(member.preferred_languages, str) else member.preferred_languages
                except Exception:
                    pref_langs = []

            # Fallback to User table preferred_languages if audience record didn't have it
            if not pref_langs and member.email:
                usr = db.query(User).filter(User.email == member.email).first()
                if usr and usr.preferred_languages:
                    try:
                        pref_langs = json.loads(usr.preferred_languages) if isinstance(usr.preferred_languages, str) else usr.preferred_languages
                    except Exception:
                        pref_langs = []

            # Determine target translation language
            target_lang = None
            if pref_langs and isinstance(pref_langs, list) and len(pref_langs) > 0:
                primary_lang = pref_langs[0]
                if primary_lang and primary_lang.strip().lower() != default_lang.strip().lower():
                    target_lang = primary_lang.strip()

            subject_to_send = subject
            body_to_send = body

            # Look up translation in template cache or dynamic pre-cache
            translated_subject_raw = None
            translated_body_raw = None

            if target_lang:
                if target_lang in translations_dict:
                    translated_subject_raw = translations_dict[target_lang].get("subject", "")
                    translated_body_raw = translations_dict[target_lang].get("body", "")
                elif target_lang in dynamic_translations:
                    translated_subject_raw = dynamic_translations[target_lang].get("subject", "")
                    translated_body_raw = dynamic_translations[target_lang].get("body", "")

                # Fallback translation if missing
                if not translated_body_raw and settings.GROQ_API_KEY:
                    try:
                        from app.services.translation_service import translate_text
                        t_subj = translate_text(raw_subject, target_lang, default_lang) if raw_subject else ""
                        t_b = translate_text(raw_body, target_lang, default_lang)
                        if t_b and "429" not in str(t_b):
                            translated_subject_raw = t_subj
                            translated_body_raw = t_b
                            dynamic_translations[target_lang] = {"subject": t_subj, "body": t_b}
                    except Exception as ex:
                        logger.warning(f"[DISPATCHER] Translation fallback skipped for '{target_lang}': {ex}")

            if translated_body_raw:
                subject_to_send = interpolate_template(translated_subject_raw, member)
                body_to_send = interpolate_template(translated_body_raw, member)
                logger.info(f"[DISPATCHER] Used pre-generated or pre-cached translation for {member.first_name} {member.last_name} in {target_lang}")

            for channel in channels:
                # Check if member has this channel in their preferences
                member_channels = []
                try:
                    member_channels = json.loads(member.preferred_channels) if member.preferred_channels else []
                except (json.JSONDecodeError, TypeError):
                    member_channels = []

                # Filter by preferences: if they specified preferred channels,
                # they must only receive on those channels unless override_channel_preferences is enabled.
                if not getattr(campaign, 'override_channel_preferences', False) and member_channels and channel not in member_channels:
                    logger.info(f"[DISPATCHER] Channel '{channel}' failed for {member.first_name} as it is not in their preferences {member_channels}")
                    rec_info = member.email if channel == "email" else (member.phone or "No Phone")
                    fail_log = DeliveryLog(
                        campaign_id=campaign.id,
                        audience_id=member.id,
                        channel=channel,
                        recipient_info=rec_info,
                        status="failed",
                        error_message=f"Failed: Recipient preferred channel is {member_channels}, which does not include selected channel '{channel}'. Add '{member_channels[0] if member_channels else 'preferred'}' to campaign channels or check Override Channel Preferences.",
                        sent_at=datetime.datetime.utcnow()
                    )
                    db.add(fail_log)
                    failed_count += 1
                    continue

                success, error, actual_channel = dispatch_to_channel(
                    channel, member, subject_to_send, body_to_send
                )

                # Log the delivery
                rec_info = member.phone
                if channel in ["email"]:
                    rec_info = member.email or "No Email Provided"
                elif channel in ["sms", "whatsapp"]:
                    rec_info = member.phone or "No Phone Provided"
                elif channel == "push":
                    rec_info = member.email or "No FCM Token / Email"
                    if member.custom_fields:
                        try:
                            custom = json.loads(member.custom_fields) if isinstance(member.custom_fields, str) else member.custom_fields
                            fcm_tok = custom.get("fcm_token")
                            if fcm_tok:
                                rec_info = f"FCM:{fcm_tok[:15]}..."
                        except Exception:
                            pass
                elif channel == "telegram":
                    rec_info = "No Telegram ID"
                    if member.custom_fields:
                        try:
                            custom = json.loads(member.custom_fields) if isinstance(member.custom_fields, str) else member.custom_fields
                            rec_info = custom.get("telegram_chat_id") or custom.get("telegram_username") or "No Telegram ID"
                        except Exception:
                            pass

                log = DeliveryLog(
                    campaign_id=campaign_id,
                    audience_id=member.id,
                    channel=actual_channel,
                    status="sent" if success else "failed",
                    recipient_info=rec_info,
                    error_message=error if not success else None,
                    sent_at=datetime.datetime.utcnow()
                )
                db.add(log)

                if success:
                    sent_count += 1
                else:
                    failed_count += 1

        # 6. Update campaign counters
        campaign.sent_count = sent_count
        campaign.failed_count = failed_count
        campaign.dispatched_at = datetime.datetime.utcnow()

        # Auto-mark as completed after dispatch
        if sent_count > 0:
            campaign.status = "completed"

        db.commit()

        logger.info(
            f"[DISPATCHER] Campaign '{campaign.title}' complete: "
            f"{sent_count} sent, {failed_count} failed"
        )

    except Exception as e:
        logger.error(f"[DISPATCHER] Fatal error in campaign {campaign_id}: {e}", exc_info=True)
        try:
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if campaign:
                campaign.failed_count = -1  # Signal error
                db.commit()
        except Exception:
            pass

    finally:
        db.close()


def retry_failed_deliveries(campaign_id: str) -> Dict[str, Any]:
    """
    Background trigger to retry failed delivery logs for a given campaign.
    """
    thread = threading.Thread(
        target=_retry_failed_deliveries_worker,
        args=(campaign_id,),
        daemon=True,
        name=f"retry-dispatcher-{campaign_id[:8]}"
    )
    thread.start()
    logger.info(f"[DISPATCHER-RETRY] Started retry background worker for campaign {campaign_id}")
    return {"status": "started", "campaign_id": campaign_id}


def _retry_failed_deliveries_worker(campaign_id: str):
    """
    Worker that re-attempts delivery for all failed DeliveryLog records of a campaign.
    """
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error(f"[DISPATCHER-RETRY] Campaign {campaign_id} not found")
            return

        template = db.query(Template).filter(Template.id == campaign.template_id).first() if campaign.template_id else None

        failed_logs = db.query(DeliveryLog).filter(
            DeliveryLog.campaign_id == campaign_id,
            DeliveryLog.status == "failed"
        ).all()

        if not failed_logs:
            logger.info(f"[DISPATCHER-RETRY] No failed logs to retry for campaign {campaign_id}")
            return

        logger.info(f"[DISPATCHER-RETRY] Retrying {len(failed_logs)} failed logs for campaign '{campaign.title}'")

        newly_sent = 0
        still_failed = 0

        for log in failed_logs:
            audience = db.query(Audience).filter(Audience.id == log.audience_id).first()
            if not audience:
                continue

            subject = template.subject_template if template else campaign.title
            body = template.body_template if template else (campaign.description or campaign.title)

            success, error, actual_channel = dispatch_to_channel(
                channel=log.channel,
                audience=audience,
                subject=subject,
                body=body
            )

            if success:
                log.status = "sent"
                log.error_message = None
                log.sent_at = datetime.datetime.utcnow()
                newly_sent += 1
            else:
                log.error_message = f"[RETRY FAILED] {error}"
                log.sent_at = datetime.datetime.utcnow()
                still_failed += 1

        # Recalculate campaign counts
        total_sent = db.query(DeliveryLog).filter(
            DeliveryLog.campaign_id == campaign_id,
            DeliveryLog.status.in_(["sent", "delivered", "read"])
        ).count()
        total_failed = db.query(DeliveryLog).filter(
            DeliveryLog.campaign_id == campaign_id,
            DeliveryLog.status == "failed"
        ).count()

        campaign.sent_count = total_sent
        campaign.failed_count = total_failed
        db.commit()

        logger.info(f"[DISPATCHER-RETRY] Finished retry for campaign {campaign_id}: {newly_sent} recovered, {still_failed} failed")

    except Exception as e:
        logger.error(f"[DISPATCHER-RETRY] Error retrying campaign {campaign_id}: {e}", exc_info=True)
    finally:
        db.close()


IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


def to_utc_datetime(dt):
    """Normalize a string or datetime object (naive or aware) to UTC datetime."""
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    if isinstance(dt, datetime.datetime):
        if dt.tzinfo is None:
            # Database stores naive UTC datetimes
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc)
    return None


def check_and_dispatch_scheduled_campaigns():
    """
    Background checker that queries campaigns scheduled to run at or before current UTC time
    and triggers dispatch_campaign for each due campaign.
    """
    db = SessionLocal()
    try:
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        scheduled_campaigns = db.query(Campaign).filter(
            Campaign.status == "scheduled",
            Campaign.is_deleted == False
        ).all()

        due_campaigns = []
        for camp in scheduled_campaigns:
            if not camp.scheduled_at:
                due_campaigns.append(camp)
                continue

            sched_utc = to_utc_datetime(camp.scheduled_at)
            if sched_utc and sched_utc <= now_utc:
                due_campaigns.append(camp)

        for camp in due_campaigns:
            logger.info(f"[SCHEDULER] Scheduled time reached for campaign '{camp.title}' (ID: {camp.id}). Auto-dispatching...")
            camp.status = "active"
            camp.dispatched_at = datetime.datetime.utcnow()
            db.commit()

            from app.services.dispatcher import dispatch_campaign
            dispatch_campaign(camp.id)

    except Exception as e:
        logger.error(f"[SCHEDULER] Error checking scheduled campaigns: {e}")
    finally:
        db.close()


def start_campaign_scheduler(interval_seconds: int = 15):
    """
    Start background daemon scheduler thread that runs every interval_seconds.
    """
    import time
    def _loop():
        logger.info(f"[SCHEDULER] Background campaign scheduler loop started (checking every {interval_seconds}s)")
        while True:
            try:
                check_and_dispatch_scheduled_campaigns()
            except Exception as e:
                logger.error(f"[SCHEDULER] Exception in scheduler loop: {e}")
            time.sleep(interval_seconds)

    thread = threading.Thread(target=_loop, daemon=True, name="campaign-scheduler-worker")
    thread.start()


