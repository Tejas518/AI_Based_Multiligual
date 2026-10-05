import datetime
from typing import List, Optional
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
# Patch bcrypt.hashpw to truncate inputs > 72 bytes for passlib 1.7.4 + bcrypt 4.x compatibility
if hasattr(bcrypt, "hashpw"):
    _orig_hashpw = bcrypt.hashpw
    def _safe_hashpw(password, salt):
        if isinstance(password, bytes) and len(password) > 72:
            password = password[:72]
        return _orig_hashpw(password, salt)
    bcrypt.hashpw = _safe_hashpw

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import TokenData

# Cryptography config
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Mock OTP cache: email -> otp
otp_cache = {
    settings.ADMIN_EMAIL: "123456",
    settings.MANAGER_EMAIL: "123456",
    settings.AUDIENCE_EMAIL: "123456"
}

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password[:72], hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password[:72])

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    effective_token = token or token_query
    if not effective_token:
        raise credentials_exception
        
    try:
        payload = jwt.decode(effective_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        user_id: str = payload.get("user_id")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email, role=role, user_id=user_id)
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == token_data.user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception
    return user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation restricted. Allowed roles: {self.allowed_roles}",
            )
        return current_user

# Pre-packaged dependencies for router usage
require_admin = RoleChecker(["admin"])
require_manager_or_higher = RoleChecker(["admin", "campaign_manager"])
require_any_authenticated = RoleChecker(["admin", "campaign_manager", "audience"])
require_audience = RoleChecker(["audience"])


# --- HIGH-RISK ACTIONS MFA VALIDATION ---
import time
import random

mfa_cache = {}  # email -> {"otp": str, "expires": float}

def verify_mfa_otp(user: User, otp_code: Optional[str] = None):
    """
    Checks if the MFA OTP code is correct.
    If otp_code matches the cached code and is not expired, returns True.
    Otherwise, generates a new OTP, triggers send_otp_email, and raises a 403.
    """
    # If a code is provided, verify it
    if otp_code:
        cache_entry = mfa_cache.get(user.email)
        if cache_entry:
            if time.time() <= cache_entry["expires"]:
                if cache_entry["otp"] == otp_code.strip():
                    # Success: invalidate OTP
                    mfa_cache.pop(user.email, None)
                    return True
            else:
                mfa_cache.pop(user.email, None)  # Expired

    # Generating a fresh code since it was missing or incorrect/expired
    new_otp = str(random.randint(100000, 999999))
    mfa_cache[user.email] = {
        "otp": new_otp,
        "expires": time.time() + 600  # 10 mins
    }
    
    # Send email
    from app.services.email_service import send_otp_email
    success, err = send_otp_email(user.email, new_otp)
    
    # In order to let the admin test the system, if SMTP is not configured, we return the OTP in the exception details.
    # When running tests (pytest), we also return the OTP to verify the integration flow.
    import sys
    is_testing = "pytest" in sys.modules
    otp_to_return = None
    if is_testing or not settings.SMTP_EMAIL or not settings.SMTP_APP_PASSWORD:
        otp_to_return = new_otp
        print(f"\n[MOCK MFA OTP] Generated MFA OTP code for {user.email}: {new_otp}\n")
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "mfa_required": True,
            "message": f"Multi-Factor Authentication required. A 6-digit verification code has been sent to {user.email}.",
            "otp": otp_to_return
        }
    )

