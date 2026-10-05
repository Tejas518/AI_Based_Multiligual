import datetime
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from jose import jwt

from app.database import get_db
from app.models import SOSReport, User
from app.schemas import SOSReportCreate, SOSReportTriage, SOSReportResponse
from app.auth import require_manager_or_higher, require_any_authenticated
from app.config import settings

router = APIRouter(prefix="/sos", tags=["SOS Emergency Operations"])
logger = logging.getLogger("commai.sos")

def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    try:
        parts = auth_header.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = payload.get("user_id")
            if user_id:
                return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    except Exception as e:
        logger.debug(f"Optional authentication parsing failed: {e}")
    return None

def format_sos_response(report: SOSReport) -> SOSReportResponse:
    return SOSReportResponse(
        id=report.id,
        title=report.title,
        description=report.description,
        report_type=report.report_type,
        status=report.status,
        latitude=report.latitude,
        longitude=report.longitude,
        location_name=report.location_name,
        reporter_name=report.reporter_name,
        reporter_phone=report.reporter_phone,
        reporter_email=report.reporter_email,
        created_by=report.created_by,
        staff_reply=report.staff_reply,
        replied_by=report.replied_by,
        replied_at=report.replied_at,
        created_at=report.created_at,
        updated_at=report.updated_at
    )

@router.post("", response_model=SOSReportResponse, status_code=status.HTTP_201_CREATED)
def submit_sos_report(
    report_in: SOSReportCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Submits a public emergency distress signal or hazard report.
    Allows both authenticated users and anonymous citizens.
    """
    reporter_id = current_user.id if current_user else None
    
    # Pre-fill reporter fields from user profile if authenticated and not manually provided
    name = report_in.reporter_name
    email = report_in.reporter_email
    phone = report_in.reporter_phone
    
    if current_user:
        if not name:
            name = current_user.full_name
        if not email:
            email = current_user.email

    report = SOSReport(
        title=report_in.title,
        description=report_in.description,
        report_type=report_in.report_type,
        status="reported",  # reported -> acknowledged -> resolved
        latitude=str(report_in.latitude) if report_in.latitude is not None else None,
        longitude=str(report_in.longitude) if report_in.longitude is not None else None,
        location_name=report_in.location_name,
        reporter_name=name,
        reporter_phone=phone,
        reporter_email=email,
        created_by=reporter_id
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return format_sos_response(report)


@router.get("", response_model=List[SOSReportResponse])
def list_sos_reports(
    status_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """
    Retrieves all SOS reports. Restricted to operators (admin or manager).
    Supports filtering by triage status.
    """
    query = db.query(SOSReport)
    if status_filter:
        query = query.filter(SOSReport.status == status_filter)
        
    reports = query.order_by(SOSReport.created_at.desc()).all()
    return [format_sos_response(r) for r in reports]


@router.get("/mine", response_model=List[SOSReportResponse])
def get_my_sos_reports(
    db: Session = Depends(get_db),
    current_user = Depends(require_any_authenticated)
):
    """
    Retrieves SOS reports filed by the logged-in citizen/user.
    """
    reports = db.query(SOSReport).filter(SOSReport.created_by == current_user.id).order_by(SOSReport.created_at.desc()).all()
    return [format_sos_response(r) for r in reports]


@router.put("/{id}/triage", response_model=SOSReportResponse)
def triage_sos_report(
    id: str,
    triage_in: SOSReportTriage,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """
    Updates the status or reply comments on a reported SOS ticket.
    Restricted to operators (admin or manager).
    """
    report = db.query(SOSReport).filter(SOSReport.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOS report ticket not found")

    if triage_in.status:
        val = triage_in.status.lower()
        if val not in ["reported", "acknowledged", "resolved"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid triage status. Choose reported, acknowledged, or resolved.")
        report.status = val

    if triage_in.staff_reply is not None:
        report.staff_reply = triage_in.staff_reply
        report.replied_by = current_user.id
        report.replied_at = datetime.datetime.utcnow()

    report.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(report)
    return format_sos_response(report)
