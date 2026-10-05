import time
import datetime
import logging
import threading
import json
from app.database import SessionLocal
from app.models import Campaign, AuditLog
from app.services.dispatcher import dispatch_campaign

logger = logging.getLogger("commai.scheduler")

def check_scheduled_campaigns():
    """
    Background worker loop that checks for campaigns with status 'scheduled'
    whose scheduled_at time is in the past, and triggers them.
    """
    logger.info("[SCHEDULER] Background scheduler thread started.")
    while True:
        try:
            db = SessionLocal()
            now = datetime.datetime.utcnow()
            
            # Find campaigns that are scheduled and due (scheduled_at <= now)
            due_campaigns = db.query(Campaign).filter(
                Campaign.status == "scheduled",
                Campaign.scheduled_at <= now,
                Campaign.is_deleted == False
            ).all()
            
            for camp in due_campaigns:
                # Atomically claim this campaign by updating status to active ONLY if it is still scheduled
                affected = db.query(Campaign).filter(
                    Campaign.id == camp.id,
                    Campaign.status == "scheduled"
                ).update({
                    "status": "active",
                    "updated_at": now
                })
                db.commit()

                if affected == 1:
                    logger.info(f"[SCHEDULER] Successfully claimed and triggering due campaign: '{camp.title}' (ID: {camp.id})")
                    
                    # Create status change audit log on behalf of the creator/updater
                    audit = AuditLog(
                        user_id=camp.updated_by or camp.created_by,
                        campaign_id=camp.id,
                        action="STATUS_CHANGE",
                        old_status="scheduled",
                        new_status="active",
                        changes=json.dumps({
                            "status": {"old": "scheduled", "new": "active"},
                            "reason": "Automated system schedule dispatch"
                        })
                    )
                    db.add(audit)
                    db.commit()
                    
                    # Dispatch campaign (will run in background thread via dispatcher)
                    dispatch_campaign(camp.id)
                else:
                    logger.info(f"[SCHEDULER] Campaign '{camp.title}' (ID: {camp.id}) was already claimed by another scheduler instance.")
                    
            db.close()
        except Exception as e:
            logger.error(f"[SCHEDULER] Error in background scheduler loop: {e}", exc_info=True)
            
        # Check every 10 seconds
        time.sleep(10)

def start_scheduler():
    thread = threading.Thread(
        target=check_scheduled_campaigns,
        daemon=True,
        name="scheduler-worker"
    )
    thread.start()
