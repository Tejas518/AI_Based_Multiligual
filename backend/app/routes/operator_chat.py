from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime
import logging

from app.database import get_db
from app.models import User, OperatorMessage
from app.schemas import OperatorMessageCreate, OperatorMessageResponse
from app.auth import require_manager_or_higher

logger = logging.getLogger("commai.operator_chat")

router = APIRouter(prefix="/operator-chat", tags=["Operator Staff Chat"])

@router.get("/staff")
def get_operator_staff(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """
    Fetch all active Admins and Campaign Managers for staff list & direct messaging.
    """
    staff_members = (
        db.query(User)
        .filter(
            User.role.in_(["admin", "campaign_manager"]),
            User.is_active == True,
            User.is_deleted == False
        )
        .all()
    )
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "organization": u.organization,
            "designation": u.designation,
        }
        for u in staff_members
    ]

@router.get("/messages", response_model=List[OperatorMessageResponse])
def get_operator_messages(
    channel: Optional[str] = Query(default="general"),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """
    Fetch chat messages for internal staff/operator coordination.
    STRICTLY restricted to Admins and Campaign Managers only.
    For DM channels (dm:id1:id2), verifies current user is one of the participants.
    """
    if channel and channel.startswith("dm:"):
        parts = channel.split(":")
        if len(parts) != 3 or current_user.id not in (parts[1], parts[2]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this private direct message channel."
            )

    messages = (
        db.query(OperatorMessage)
        .filter(OperatorMessage.channel == channel)
        .order_by(OperatorMessage.created_at.asc())
        .limit(limit)
        .all()
    )
    return messages

@router.post("/messages", response_model=OperatorMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_operator_message(
    msg_in: OperatorMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """
    Send an internal chat message between Admins and Campaign Managers.
    Supports public channels and private 1-on-1 DMs (dm:id1:id2).
    Broadcasts message via WebSocket for instant real-time delivery.
    """
    channel = msg_in.channel or "general"
    if channel.startswith("dm:"):
        parts = channel.split(":")
        if len(parts) != 3 or current_user.id not in (parts[1], parts[2]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to send messages in this DM channel."
            )

    msg = OperatorMessage(
        sender_id=current_user.id,
        sender_name=current_user.full_name,
        sender_role=current_user.role,
        channel=channel,
        message=msg_in.message.strip()
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Broadcast real-time WebSocket payload to all staff
    try:
        from app.services.websocket_manager import bulletin_manager
        await bulletin_manager.broadcast({
            "type": "operator_chat",
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": msg.sender_name,
            "sender_role": msg.sender_role,
            "channel": msg.channel,
            "message": msg.message,
            "created_at": msg.created_at.isoformat() if msg.created_at else datetime.datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Failed to broadcast operator chat message via WebSocket: {e}")

    return msg

@router.delete("/messages/{message_id}", status_code=status.HTTP_200_OK)
async def delete_operator_message(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """
    Delete an operator message. Only the message sender or an Admin can delete.
    Broadcasts deletion event via WebSocket.
    """
    msg = db.query(OperatorMessage).filter(OperatorMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    
    if current_user.role != "admin" and msg.sender_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own messages unless you are an Admin."
        )
    
    channel = msg.channel
    db.delete(msg)
    db.commit()

    try:
        from app.services.websocket_manager import bulletin_manager
        await bulletin_manager.broadcast({
            "type": "operator_chat_delete",
            "id": message_id,
            "channel": channel
        })
    except Exception as e:
        logger.error(f"Failed to broadcast operator chat delete via WebSocket: {e}")

    return {"message": "Message deleted successfully"}

