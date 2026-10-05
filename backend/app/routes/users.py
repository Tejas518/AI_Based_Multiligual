"""
User & Audience Management Routes — Role-based management for platform users.
Provides listing, full profile inspection, updating roles/status, soft deletion, and restoration.
"""
import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Any

from app.database import get_db
from app.models import User, Audience
from app.schemas import UserResponse, UserUpdate, UserCreate
from app.auth import (
    get_password_hash,
    require_admin,
    require_manager_or_higher,
    get_current_user,
)
from app.config import settings
from app.routes.audience import deserialize_list, serialize_list

router = APIRouter(prefix="/users", tags=["User Management"])


def format_user_response(user: User, db: Session) -> dict:
    """Helper to merge User and Audience tables into a complete profile dictionary."""
    res = {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "organization": user.organization,
        "designation": user.designation,
        "preferred_languages": deserialize_list(user.preferred_languages),
        "is_active": user.is_active,
        "is_deleted": getattr(user, "is_deleted", False),
        "deleted_at": getattr(user, "deleted_at", None),
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "first_name": None,
        "last_name": None,
        "phone": None,
        "telegram_username": None,
        "occupation": None,
        "age": None,
        "gender": None,
        "state": None,
        "district": None,
        "city": None,
        "preferred_channels": [],
    }

    if user.email:
        aud = db.query(Audience).filter(Audience.email == user.email).first()
        if aud:
            res["first_name"] = aud.first_name
            res["last_name"] = aud.last_name
            res["phone"] = aud.phone
            res["occupation"] = aud.occupation
            res["age"] = aud.age
            res["gender"] = aud.gender
            res["state"] = aud.state
            res["district"] = aud.district
            res["city"] = aud.city
            res["preferred_channels"] = deserialize_list(aud.preferred_channels)
            if aud.custom_fields:
                try:
                    cf = json.loads(aud.custom_fields)
                    if isinstance(cf, dict) and "telegram_username" in cf:
                        res["telegram_username"] = cf.get("telegram_username")
                except Exception:
                    pass

    return res


@router.get("", response_model=List[UserResponse])
def list_users(
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_deleted: Optional[bool] = False,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """List platform users. Admins can see all; Campaign Managers can see audience users."""
    query = db.query(User)

    # Restrict campaign managers to audience users only
    if current_user.role == "campaign_manager":
        query = query.filter(User.role == "audience")
    elif role:
        if role not in settings.ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role filter. Allowed: {settings.ROLES}",
            )
        query = query.filter(User.role == role)

    if is_deleted is not None:
        query = query.filter(User.is_deleted == is_deleted)

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.filter(
            or_(
                User.full_name.ilike(search_term),
                User.email.ilike(search_term),
                User.organization.ilike(search_term),
            )
        )

    users = query.order_by(User.created_at.desc()).all()
    return [format_user_response(u, db) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Get full detailed profile of a specific user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if current_user.role == "campaign_manager" and user.role != "audience":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign Managers can only view audience profiles.",
        )

    return format_user_response(user, db)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Update user profile details or active status."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if current_user.role == "campaign_manager" and user.role != "audience":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign Managers can only update audience users.",
        )

    # Prevent deactivating self
    if user.id == current_user.id and user_in.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    # Prevent changing self role
    if user.id == current_user.id and user_in.role is not None and user_in.role != user.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.role is not None:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can modify user roles.",
            )
        if user_in.role not in settings.ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role. Allowed: {settings.ROLES}",
            )
        user.role = user_in.role
    if user_in.organization is not None:
        user.organization = user_in.organization
    if user_in.designation is not None:
        user.designation = user_in.designation
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.password is not None and user_in.password.strip():
        user.hashed_password = get_password_hash(user_in.password)

    # Sync matching Audience record if present
    if user.role == "audience" and user.email:
        aud = db.query(Audience).filter(Audience.email == user.email).first()
        if aud:
            if user_in.full_name is not None:
                parts = user_in.full_name.strip().split(maxsplit=1)
                f_name = user_in.first_name if user_in.first_name is not None else (parts[0] if parts else "")
                l_name = user_in.last_name if user_in.last_name is not None else (parts[1] if len(parts) > 1 else "")
                aud.first_name = f_name
                aud.last_name = l_name
            else:
                if user_in.first_name is not None:
                    aud.first_name = user_in.first_name
                if user_in.last_name is not None:
                    aud.last_name = user_in.last_name

            if user_in.first_name is not None or user_in.last_name is not None:
                full_name = f"{aud.first_name} {aud.last_name}".strip()
                if full_name:
                    user.full_name = full_name

            if user_in.phone is not None:
                aud.phone = user_in.phone
            if user_in.occupation is not None:
                aud.occupation = user_in.occupation
            if user_in.age is not None:
                aud.age = user_in.age
            if user_in.gender is not None:
                aud.gender = user_in.gender
            if user_in.state is not None:
                aud.state = user_in.state
            if user_in.district is not None:
                aud.district = user_in.district
            if user_in.city is not None:
                aud.city = user_in.city
            if user_in.preferred_channels is not None:
                aud.preferred_channels = serialize_list(user_in.preferred_channels)
            if user_in.preferred_languages is not None:
                aud.preferred_languages = serialize_list(user_in.preferred_languages)
            if user_in.telegram_username is not None or user_in.custom_fields is not None:
                cf = {}
                if aud.custom_fields:
                    try:
                        cf = json.loads(aud.custom_fields)
                    except Exception:
                        cf = {}
                if user_in.custom_fields:
                    cf.update(user_in.custom_fields)
                if user_in.telegram_username is not None:
                    clean_tg = user_in.telegram_username.lstrip('@').strip()
                    if clean_tg:
                        cf["telegram_username"] = f"@{clean_tg}"
                    else:
                        cf.pop("telegram_username", None)
                aud.custom_fields = json.dumps(cf) if cf else None
            if user_in.is_active is not None:
                aud.is_active = user_in.is_active

    user.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)
    return format_user_response(user, db)


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def soft_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Soft-delete a user (preserve historical data, stop all notifications, move to past archive)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    if current_user.role == "campaign_manager" and user.role != "audience":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign Managers can only delete audience users.",
        )

    now = datetime.datetime.utcnow()
    user.is_deleted = True
    user.is_active = False
    user.deleted_at = now

    # Also soft-delete linked Audience record so dispatchers skip sending alerts
    if user.email:
        aud = db.query(Audience).filter(Audience.email == user.email).first()
        if aud:
            aud.is_deleted = True
            aud.is_active = False
            aud.deleted_at = now

    db.commit()
    return {
        "message": f"User '{user.full_name}' has been moved to past records. All alerts suppressed.",
        "id": user_id,
        "role": user.role,
        "full_name": user.full_name
    }


@router.post("/{user_id}/restore", status_code=status.HTTP_200_OK)
def restore_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Restore a soft-deleted user back to active directory."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if current_user.role == "campaign_manager" and user.role != "audience":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign Managers can only restore audience users.",
        )

    user.is_deleted = False
    user.is_active = True
    user.deleted_at = None

    if user.email:
        aud = db.query(Audience).filter(Audience.email == user.email).first()
        if aud:
            aud.is_deleted = False
            aud.is_active = True
            aud.deleted_at = None

    db.commit()
    return {
        "message": f"User '{user.full_name}' has been restored to the active directory.",
        "id": user_id,
        "role": user.role,
        "full_name": user.full_name
    }


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_higher),
):
    """Create a new user or audience member."""
    if current_user.role == "campaign_manager" and user_in.role != "audience":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign Managers can only create audience user accounts.",
        )

    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    if user_in.role not in settings.ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Allowed: {settings.ROLES}",
        )

    db_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        organization=user_in.organization,
        designation=user_in.designation,
        is_active=True,
        is_deleted=False,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # If role is audience, also create corresponding Audience record so dispatchers find them
    if db_user.role == "audience":
        aud_existing = db.query(Audience).filter(Audience.email == db_user.email).first()
        if not aud_existing:
            parts = db_user.full_name.split(' ')
            fn = user_in.first_name or parts[0]
            ln = user_in.last_name or (' '.join(parts[1:]) if len(parts) > 1 else 'User')
            custom_dict = user_in.custom_fields or {}
            if user_in.telegram_username:
                clean_tg = user_in.telegram_username.lstrip('@').strip()
                if clean_tg:
                    custom_dict["telegram_username"] = f"@{clean_tg}"

            aud = Audience(
                first_name=fn,
                last_name=ln,
                email=db_user.email,
                phone=user_in.phone or "0000000000",
                preferred_languages=serialize_list(user_in.preferred_languages or ["English"]),
                occupation=user_in.occupation or "General Public",
                age=user_in.age or 25,
                gender=user_in.gender or "Other",
                state=user_in.state or "Delhi",
                district=user_in.district or "Central",
                city=user_in.city or "New Delhi",
                organization=user_in.organization,
                designation=user_in.designation,
                preferred_channels=serialize_list(user_in.preferred_channels or ["email"]),
                custom_fields=json.dumps(custom_dict) if custom_dict else None,
                is_active=True,
                is_deleted=False,
            )
            db.add(aud)
            db.commit()

    return format_user_response(db_user, db)
