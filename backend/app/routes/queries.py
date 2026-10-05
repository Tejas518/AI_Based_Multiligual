from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from app.database import get_db
from app.models import User, SupportQuery
from app.schemas import SupportQueryCreate, SupportQueryResponse, SupportQueryReply
from app.auth import require_any_authenticated, require_manager_or_higher
from app.services.ai_service import draft_query_response

router = APIRouter(prefix="/queries", tags=["Support Queries"])

@router.post("", response_model=SupportQueryResponse, status_code=status.HTTP_201_CREATED)
def submit_support_query(
    q_in: SupportQueryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Submit a support query or request assistance. Any logged-in user can submit."""
    query = SupportQuery(
        user_id=current_user.id,
        subject=q_in.subject,
        message=q_in.message,
        status="open"
    )
    db.add(query)
    db.commit()
    db.refresh(query)

    return SupportQueryResponse(
        id=query.id,
        user_id=query.user_id,
        user_name=current_user.full_name,
        subject=query.subject,
        message=query.message,
        status=query.status,
        admin_reply=query.admin_reply,
        replied_at=query.replied_at,
        created_at=query.created_at
    )

@router.get("", response_model=List[SupportQueryResponse])
def list_support_queries(
    status_filter: Optional[str] = None,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """
    List support queries.
    Audience users can only see their own queries.
    Managers and Admins can see all queries with optional filters.
    """
    query = db.query(SupportQuery, User.full_name).join(User, User.id == SupportQuery.user_id)

    # Audience filter
    if current_user.role == "audience":
        query = query.filter(SupportQuery.user_id == current_user.id)
    else:
        # Operator specific filters
        if user_id:
            query = query.filter(SupportQuery.user_id == user_id)

    if status_filter:
        query = query.filter(SupportQuery.status == status_filter)

    results = query.order_by(SupportQuery.created_at.desc()).all()

    return [
        SupportQueryResponse(
            id=q.id,
            user_id=q.user_id,
            user_name=user_name,
            subject=q.subject,
            message=q.message,
            status=q.status,
            admin_reply=q.admin_reply,
            replied_at=q.replied_at,
            created_at=q.created_at
        )
        for q, user_name in results
    ]

@router.put("/{query_id}/reply", response_model=SupportQueryResponse)
def reply_to_support_query(
    query_id: str,
    reply_in: SupportQueryReply,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Reply to a support query. Only Campaign Managers or Admins are allowed."""
    query = db.query(SupportQuery).filter(SupportQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support query not found")

    query.admin_reply = reply_in.admin_reply
    query.status = reply_in.status or "acknowledged"
    query.replied_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(query)

    # Get user who submitted the query to fetch user_name
    submitting_user = db.query(User).filter(User.id == query.user_id).first()
    user_name = submitting_user.full_name if submitting_user else "Unknown User"

    return SupportQueryResponse(
        id=query.id,
        user_id=query.user_id,
        user_name=user_name,
        subject=query.subject,
        message=query.message,
        status=query.status,
        admin_reply=query.admin_reply,
        replied_at=query.replied_at,
        created_at=query.created_at
    )

@router.post("/{query_id}/ai-reply", response_model=dict)
def get_ai_suggested_reply(
    query_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Get an AI suggested reply draft for a support query using Groq."""
    query = db.query(SupportQuery).filter(SupportQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support query not found")

    draft = draft_query_response(query.subject, query.message)
    return {"draft_reply": draft}
