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
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db, UserModel, ClinicModel, ClinicMembershipModel

from config import (
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ISSUER,
    JWT_AUDIENCE,
    ENVIRONMENT
)

security_bearer = HTTPBearer(auto_error=False)

# ─── BRUTE-FORCE PROTECTION & RATE LIMITING ──────────────────────────────────

_FAILED_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 300  # 5 minutes


def check_brute_force_lockout(identifier: str):
    """Enforces temporary account lockout after repeated failed login attempts."""
    now = datetime.utcnow().timestamp()
    attempts = _FAILED_LOGIN_ATTEMPTS.get(identifier, [])
    attempts = [t for t in attempts if now - t < LOCKOUT_WINDOW_SECONDS]
    _FAILED_LOGIN_ATTEMPTS[identifier] = attempts
    if len(attempts) >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Account temporarily locked for 5 minutes for security."
        )


def record_login_failure(identifier: str):
    """Records a failed login attempt for rate-limiting calculations."""
    now = datetime.utcnow().timestamp()
    attempts = _FAILED_LOGIN_ATTEMPTS.get(identifier, [])
    attempts = [t for t in attempts if now - t < LOCKOUT_WINDOW_SECONDS]
    attempts.append(now)
    _FAILED_LOGIN_ATTEMPTS[identifier] = attempts


def clear_login_failures(identifier: str):
    """Clears failed login attempt history upon successful authentication."""
    _FAILED_LOGIN_ATTEMPTS.pop(identifier, None)


# ─── RBAC PERMISSION MATRIX ───────────────────────────────────────────────────

ROLE_PERMISSIONS: dict[str, Set[str]] = {
    "CLINIC_OWNER": {
        "clinic:manage",
        "staff:manage",
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
        "referrals:create",
        "referrals:read",
        "referrals:update",
        "appointments:create",
        "appointments:read",
        "appointments:manage",
        "appointments:delete",
        "analytics:view",
        "audit:read",
        "resources:read",
        "resources:write",
        "resources:review",
        "sync:push",
        "sync:pull",
    },
    "DOCTOR": {
        "patients:create",
        "patients:read",
        "patients:update",
        "patients:delete",
        "assessments:create",
        "assessments:read",
        "assessments:update",
        "reviews:view_queue",
        "reviews:perform",
        "reviews:override",
        "referrals:create",
        "referrals:read",
        "referrals:update",
        "appointments:create",
        "appointments:read",
        "appointments:manage",
        "analytics:view",
        "resources:read",
        "resources:write",
        "resources:review",
        "sync:push",
        "sync:pull",
    },
    "HEALTH_WORKER": {
        "patients:create",
        "patients:read",
        "assessments:create",
        "assessments:read",
        "referrals:create",
        "referrals:read",
        "appointments:create",
        "appointments:read",
        "resources:read",
        "sync:push",
        "sync:pull",
    },
    "COUNSELOR": {
        "patients:read",
        "assessments:read",
        "referrals:read",
        "referrals:update",
        "appointments:read",
        "appointments:manage",
        "analytics:view",
        "resources:read",
        "sync:pull",
    },
    "ASHA_WORKER": {
        "patients:create",
        "patients:read",
        "assessments:create",
        "assessments:read",
        "referrals:create",
        "referrals:read",
        "appointments:create",
        "appointments:read",
        "resources:read",
        "sync:push",
        "sync:pull",
    },
    "PHC_DOCTOR": {
        "clinic:manage",
        "staff:manage",
        "patients:create",
        "patients:read",
        "patients:update",
        "patients:delete",
        "assessments:create",
        "assessments:read",
        "assessments:update",
        "reviews:view_queue",
        "reviews:perform",
        "reviews:override",
        "referrals:create",
        "referrals:read",
        "referrals:update",
        "appointments:create",
        "appointments:read",
        "appointments:manage",
        "analytics:view",
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
        "referrals:read",
        "referrals:update",
        "analytics:view",
        "audit:read",
        "resources:read",
        "resources:write",
        "sync:pull",
    },
    "PATIENT": {
        "patients:read",
        "assessments:create",
        "assessments:read",
        "appointments:create",
        "appointments:read",
        "resources:read",
    },
    "SYSTEM_ADMIN": {
        "clinic:manage",
        "staff:manage",
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
        "referrals:create",
        "referrals:read",
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
    """Verifies a plain password against stored PBKDF2-HMAC-SHA256 string in constant time."""
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
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "iat": now,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE
    })
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    """
    Decodes and validates JWT token with explicit HS256 algorithm enforcement.
    Rejects none-alg, expired, malformed, or tampered tokens.
    """
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_signature": True, "verify_exp": True, "verify_aud": False}
        )
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
    Strict dependency that extracts and validates the Bearer JWT token.
    Raises 401 UNAUTHORIZED if token is missing, expired, or invalid.
    Strictly forbids fallback to demo user or default doctor.
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
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account does not exist or is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# Alias for backward-compatibility with call sites
get_strict_current_user = get_current_user

def require_roles(*allowed_roles: str, strict: bool = True):
    """Factory dependency that restricts access to users with specific roles."""
    def role_checker(
        current_user: UserModel = Depends(get_current_user)
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


# ─── CLINIC TENANT RESOLUTION & MEMBERSHIP AUTHORIZATION ─────────────────────

def get_current_clinic(
    request: Request,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> ClinicModel:
    """
    Resolves and verifies the authorized clinic workspace for the authenticated user.
    Enforces strict multi-tenant boundary checks:
    - Never trusts arbitrary client-supplied clinic ID without verified membership.
    - If user requests a clinic they do not belong to: returns 403 Forbidden.
    - If user has no active memberships: returns 403 Forbidden.
    - Automatically resolves active clinic if only 1 active membership exists.
    - Attaches `current_user_role` to the resolved ClinicModel instance.
    """
    # 1. Fetch all active memberships for the user
    memberships = (
        db.query(ClinicMembershipModel)
        .filter(ClinicMembershipModel.user_id == current_user.id, ClinicMembershipModel.is_active == 1)
        .all()
    )

    req_clinic_id = (request.headers.get("X-Clinic-ID") or request.query_params.get("clinic_id") or "").strip()

    # 2. SYSTEM_ADMIN Superuser Bypass
    if current_user.role == "SYSTEM_ADMIN":
        if req_clinic_id:
            clinic = db.query(ClinicModel).filter(ClinicModel.id == req_clinic_id, ClinicModel.is_active == 1).first()
            if not clinic:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested clinic does not exist.")
            setattr(clinic, "current_user_role", "SYSTEM_ADMIN")
            return clinic
        clinic = db.query(ClinicModel).filter(ClinicModel.is_active == 1).first()
        if not clinic:
            # Create a fallback clinic if none exists in fresh testing DB
            clinic = ClinicModel(
                id="clinic-system-default",
                name="System Operations Clinic",
                facility_code="CENTRAL_OPS",
                owner_user_id=current_user.id,
                is_active=1
            )
            db.add(clinic)
            db.commit()
            db.refresh(clinic)
        setattr(clinic, "current_user_role", "SYSTEM_ADMIN")
        return clinic

    # 3. For all standard users: Require at least one active membership
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not belong to any active clinic workspace."
        )

    membership_by_clinic_id = {m.clinic_id: m for m in memberships}

    # 4. If a specific clinic is requested, verify authorized membership
    if req_clinic_id:
        if req_clinic_id not in membership_by_clinic_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not authorized to access this clinic workspace."
            )
        matched_mem = membership_by_clinic_id[req_clinic_id]
        clinic = db.query(ClinicModel).filter(ClinicModel.id == req_clinic_id, ClinicModel.is_active == 1).first()
        if not clinic:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found or deactivated.")
        setattr(clinic, "current_user_role", matched_mem.role)
        return clinic

    # 5. Default to the user's first active membership clinic
    default_mem = memberships[0]
    clinic = db.query(ClinicModel).filter(ClinicModel.id == default_mem.clinic_id, ClinicModel.is_active == 1).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found or deactivated.")
    setattr(clinic, "current_user_role", default_mem.role)
    return clinic


def require_clinic_permission(required_perm: str):
    """Enforces role-based permissions scoped to the active clinic workspace."""
    def permission_checker(
        current_clinic: ClinicModel = Depends(get_current_clinic),
        current_user: UserModel = Depends(get_current_user)
    ) -> ClinicModel:
        if current_user.role == "SYSTEM_ADMIN":
            return current_clinic
        role = getattr(current_clinic, "current_user_role", current_user.role)
        role_perms = ROLE_PERMISSIONS.get(role, set())
        if required_perm not in role_perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: role '{role}' in this clinic lacks '{required_perm}'."
            )
        return current_clinic
    return permission_checker


# ─── SEED DEFAULT SYSTEM USERS ───────────────────────────────────────────────

def seed_default_users(db: Session, env: Optional[str] = None) -> bool:
    """
    Populates development/pilot users into the database if not present.
    STRICT SECURITY ENFORCEMENT:
    - Strictly prohibited in 'production'.
    - Limited exclusively to 'development' and 'testing' environments.
    - Production must NEVER silently create predictable default accounts or passwords.
    Returns True if seeding was performed, False if skipped.
    """
    active_env = (env or os.environ.get("ENVIRONMENT", ENVIRONMENT)).strip().lower()
    if active_env == "production":
        import logging
        logging.getLogger("ruralhealth.auth").warning(
            "[auth] Security notice: Default user seeding is strictly disabled in production. No accounts created."
        )
        return False

    if active_env not in ("development", "testing"):
        import logging
        logging.getLogger("ruralhealth.auth").warning(
            "[auth] Environment '%s' is not authorized for user seeding. Skipping.", active_env
        )
        return False

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
        {
            "id": "usr_patient_ramesh",
            "username": "ramesh.kumar",
            "email": "ramesh.patient@ruralhealth.org",
            "password": "patient123",
            "full_name": "Ramesh Kumar (Patient)",
            "role": "PATIENT",
            "license_number": None,
            "facility_id": "PHC_SONPUR",
            "assigned_villages": ["Sonpur"],
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

    # Ensure legacy clinic exists and default users have active memberships
    legacy_clinic = db.query(ClinicModel).filter(ClinicModel.id == "clinic-sonpur-legacy").first()
    if not legacy_clinic:
        legacy_clinic = ClinicModel(
            id="clinic-sonpur-legacy",
            name="Sonpur Primary Health Centre (Legacy)",
            facility_code="PHC_SONPUR",
            owner_user_id="usr_dr_sharma",
            address="Sonpur Village PHC",
            phone="033-2289-4401",
            is_active=1
        )
        db.add(legacy_clinic)
        db.commit()

    # Seed memberships for default users
    for u in default_users:
        existing_mem = db.query(ClinicMembershipModel).filter(
            ClinicMembershipModel.clinic_id == "clinic-sonpur-legacy",
            ClinicMembershipModel.user_id == u["id"]
        ).first()
        if not existing_mem:
            mem_role = "CLINIC_OWNER" if u["role"] in ("PHC_DOCTOR", "SYSTEM_ADMIN") else ("PATIENT" if u["role"] == "PATIENT" else "HEALTH_WORKER")
            new_mem = ClinicMembershipModel(
                id=f"clm_legacy_{u['id']}",
                clinic_id="clinic-sonpur-legacy",
                user_id=u["id"],
                role=mem_role,
                status="ACTIVE",
                is_active=1
            )
            db.add(new_mem)
    db.commit()
    return True
