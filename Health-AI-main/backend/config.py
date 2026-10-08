"""
config.py — Central Application Configuration & Environment Governance
========================================================================
Implements strict configuration management:
- Explicit ENVIRONMENT definition ('development', 'testing', 'production').
- In 'production', PostgreSQL is strictly mandatory; fallback to SQLite is disallowed.
- Configuration for JWT tokens, Cryptographic Attestation secrets, and CORS allowlists.
"""

import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()

# Database Configuration
DATABASE_URL = os.environ.get("DATABASE_URL")

if ENVIRONMENT == "production":
    if not DATABASE_URL or ("sqlite" in DATABASE_URL.lower()):
        raise RuntimeError(
            "FATAL PRODUCTION CONFIGURATION ERROR: In production environment, "
            "PostgreSQL is mandatory (e.g. postgresql+psycopg2://user:pass@host/dbname). "
            "SQLite fallback is strictly forbidden in production mode."
        )
else:
    if not DATABASE_URL:
        DATABASE_URL = "sqlite:///./ruralhealth.db"

# JWT Token Configuration
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "rapidcheck-dev-secret-key-2026-secure-jwt-signing")
JWT_ALGORITHM = "HS256"
JWT_ISSUER = os.environ.get("JWT_ISSUER", "rapidcheck.internal")
JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", "rapidcheck-clinical-workforce")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24 hours

# Server-Side Cryptographic Attestation Secret
REVIEW_SECRET_KEY = os.environ.get("REVIEW_SECRET_KEY", "rapidcheck-clinical-attestation-signing-key-2026")

# CORS Configuration
CORS_ORIGINS_RAW = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173")
CORS_ORIGINS: List[str] = [origin.strip() for origin in CORS_ORIGINS_RAW.split(",") if origin.strip()]
