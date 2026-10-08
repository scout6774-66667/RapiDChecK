"""
auth_service.py — JWT Authentication & Role-Based Access Control (RBAC)
=======================================================================
Implements TASK-010 & TASK-011:
1. Password hashing via PBKDF2-HMAC-SHA256 (600,000 iterations).
2. JWT Access Token generation & validation with PyJWT.
3. RBAC Permission Matrix for ASHA_WORKER, PHC_DOCTOR, DISTRICT_OFFICER, SYSTEM_ADMIN.
4. FastAPI dependency injection for user authentication & permission enforcement.
5. Default user seeding for development and pilot testing.
"""

import os
import hmac
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta
from typing import List, Optional, Set
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db, UserModel

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "rapidcheck-dev-secret-key-2026-secure-jwt-signing")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24 hours

security_bearer = HTTPBearer(auto_error=False)

# ─── RBAC PERMISSION MATRIX ───────────────────────────────────────────────────

ROLE_PERMISSIONS: dict[str, Set[str]] = {
    "ASHA_WORKER": {
        "patients:create",
        "patients:read",
        "assessments:create",
        "assessments:read",
        "appointments:create",
        "appointments:read",
        "resources:read",
        "sync:push",
        "sync:pull",
    },
    "PHC_DOCTOR": {
        "patients:create",
        "patients:read",
        "patients:update",
        "assessments:create",
        "assessments:read",
        "assessments:update",
        "reviews:view_queue",
        "reviews:perform",
        "reviews:override",
        "referrals:update",
        "appointments:create",
        "appointments:read",
        "appointments:manage",
        "resources:read",
        "resources:write",
        "resources:review",
        "sync:push",
        "sync:pull",
    },
    "DISTRICT_OFFICER": {
        "patients:read",
        "assessments:read",
        "reviews:view_queue",
        "analytics:view",
        "audit:read",
        "resources:read",
        "resources:write",
        "sync:pull",
    },
    "SYSTEM_ADMIN": {
        "patients:create",
        "patients:read",
        "patients:update",
        "patients:delete",
        "assessments:create",
        "assessments:read",
        "assessments:update",
        "assessments:delete",
        "reviews:view_queue",
        "reviews:perform",
        "reviews:override",
        "referrals:update",
        "appointments:create",
        "appointments:read",
        "appointments:manage",
        "appointments:delete",
        "admin:manage_users",
        "admin:system_config",
        "analytics:view",
        "audit:read",
        "resources:read",
        "resources:write",
        "resources:review",
        "resources:publish",
        "resources:admin",
        "sync:push",
        "sync:pull",
    }
}

# ─── PASSWORD HASHING UTILITIES ──────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a unique 16-byte salt."""
    salt = secrets.token_bytes(16)
    iterations = 600000
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored PBKDF2-HMAC-SHA256 string."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_dk = bytes.fromhex(parts[3])
        actual_dk = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual_dk, expected_dk)
    except Exception:
        return False

# ─── JWT TOKEN MANAGEMENT ────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ─── FASTAPI DEPENDENCIES & AUTHORIZATION ────────────────────────────────────

def get_current_user(
    auth_credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> UserModel:
    """
    Dependency that extracts and validates the Bearer JWT token.
    Falls back to a default active demo user if no token is passed (for backward dev compatibility).
    """
    if not auth_credentials or not auth_credentials.credentials:
        # Check if default demo doctor exists or fallback
        demo_user = db.query(UserModel).filter(UserModel.username == "dr.sharma").first()
        if demo_user:
            return demo_user
        # Create or return fallback demo user
        return UserModel(
            id="usr_demo_doctor",
            username="dr.sharma",
            email="dr.sharma@phc.in",
            password_hash=hash_password("doctor123"),
            full_name="Dr. R. Sharma, MBBS",
            role="PHC_DOCTOR",
            license_number="MCI-2018-88491",
            facility_id="PHC_SONPUR",
            is_active=1
        )

    token = auth_credentials.credentials
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials token payload",
        )
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account does not exist or is disabled",
        )
    return user

def get_strict_current_user(
    auth_credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> UserModel:
    """
    Strict dependency that mandates a valid Bearer JWT token (no fallback to demo user).
    Raises 401 UNAUTHORIZED if token is missing, expired, or invalid.
    """
    if not auth_credentials or not auth_credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer JWT token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth_credentials.credentials
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials token payload",
        )
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account does not exist or is disabled",
        )
    return user

def require_roles(*allowed_roles: str, strict: bool = True):
    """Factory dependency that restricts access to users with specific roles."""
    def role_checker(
        current_user: UserModel = Depends(get_strict_current_user if strict else get_current_user)
    ) -> UserModel:
        if current_user.role not in allowed_roles and current_user.role != "SYSTEM_ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {list(allowed_roles)}. Current user role: '{current_user.role}'.",
            )
        return current_user
    return role_checker

def require_permissions(*required_permissions: str):
    """Factory dependency that checks if current user's role has the required permissions."""
    def permission_checker(current_user: UserModel = Depends(get_current_user)) -> UserModel:
        user_permissions = ROLE_PERMISSIONS.get(current_user.role, set())
        for perm in required_permissions:
            if perm not in user_permissions and current_user.role != "SYSTEM_ADMIN":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied. Required permission: '{perm}'. User role '{current_user.role}' lacks this permission.",
                )
        return current_user
    return permission_checker

# ─── SEED DEFAULT SYSTEM USERS ───────────────────────────────────────────────

def seed_default_users(db: Session):
    """Populates development/pilot users into the database if not present."""
    default_users = [
        {
            "id": "usr_asha_anita",
            "username": "asha.anita",
            "email": "anita.roy@health.gov.in",
            "password": "asha123",
            "full_name": "Anita Roy",
            "role": "ASHA_WORKER",
            "license_number": "ASHA-WB-44021",
            "facility_id": "SC_SONPUR",
            "assigned_villages": ["Sonpur", "Bishnupur", "Ramnagar"],
        },
        {
            "id": "usr_dr_sharma",
            "username": "dr.sharma",
            "email": "dr.sharma@phc.in",
            "password": "doctor123",
            "full_name": "Dr. Rajesh Sharma, MBBS",
            "role": "PHC_DOCTOR",
            "license_number": "MCI-2018-88491",
            "facility_id": "PHC_SONPUR",
            "assigned_villages": ["Sonpur", "Bishnupur", "Ramnagar", "Kalyanpur"],
        },
        {
            "id": "usr_officer_patel",
            "username": "officer.patel",
            "email": "patel.cmo@district.gov.in",
            "password": "officer123",
            "full_name": "Dr. V. K. Patel (CMO)",
            "role": "DISTRICT_OFFICER",
            "license_number": "MCI-2005-12903",
            "facility_id": "DH_DISTRICT_HQ",
            "assigned_villages": [],
        },
        {
            "id": "usr_admin",
            "username": "admin",
            "email": "admin@rapidcheck.org",
            "password": "admin123",
            "full_name": "System Administrator",
            "role": "SYSTEM_ADMIN",
            "license_number": None,
            "facility_id": "CENTRAL_OPS",
            "assigned_villages": [],
        },
    ]

    for u in default_users:
        existing = db.query(UserModel).filter(UserModel.username == u["username"]).first()
        if not existing:
            new_user = UserModel(
                id=u["id"],
                username=u["username"],
                email=u["email"],
                password_hash=hash_password(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                license_number=u["license_number"],
                facility_id=u["facility_id"],
                assigned_villages_json=str(u["assigned_villages"]).replace("'", '"'),
                is_active=1
            )
            db.add(new_user)
    db.commit()
