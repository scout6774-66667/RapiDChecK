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

# Snowflake Cloud Data Warehouse Configuration (Analytical & Reporting Layer)
SNOWFLAKE_ACCOUNT = os.environ.get("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = os.environ.get("SNOWFLAKE_USER")
SNOWFLAKE_PASSWORD = os.environ.get("SNOWFLAKE_PASSWORD")
SNOWFLAKE_WAREHOUSE = os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SNOWFLAKE_DATABASE = os.environ.get("SNOWFLAKE_DATABASE", "RURALHEALTH_DB")
SNOWFLAKE_SCHEMA = os.environ.get("SNOWFLAKE_SCHEMA", "ANALYTICS")
SNOWFLAKE_ROLE = os.environ.get("SNOWFLAKE_ROLE", "RURALHEALTH_APP_ROLE")
SNOWFLAKE_LOGIN_TIMEOUT = int(os.environ.get("SNOWFLAKE_LOGIN_TIMEOUT", "15"))
SNOWFLAKE_NETWORK_TIMEOUT = int(os.environ.get("SNOWFLAKE_NETWORK_TIMEOUT", "15"))

# JWT Token Configuration
DEFAULT_DEV_JWT_SECRET = "rapidcheck-dev-secret-key-2026-secure-jwt-signing"
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", DEFAULT_DEV_JWT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_ISSUER = os.environ.get("JWT_ISSUER", "rapidcheck.internal")
JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", "rapidcheck-clinical-workforce")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24 hours

# Server-Side Cryptographic Attestation Secret
DEFAULT_DEV_REVIEW_SECRET = "rapidcheck-clinical-attestation-signing-key-2026"
REVIEW_SECRET_KEY = os.environ.get("REVIEW_SECRET_KEY", DEFAULT_DEV_REVIEW_SECRET)
HMAC_SECRET_KEY = os.environ.get("HMAC_SECRET_KEY", REVIEW_SECRET_KEY)

# CORS Configuration
CORS_ORIGINS_RAW = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
)
CORS_ORIGINS: List[str] = [origin.strip() for origin in CORS_ORIGINS_RAW.split(",") if origin.strip()]


def validate_security_configuration(env: str = ENVIRONMENT):
    """
    Validates secrets, origins, and cryptographic configurations.
    Fails fast with RuntimeError if insecure settings are detected in production.
    """
    normalized_env = (env or "").lower()
    if normalized_env == "production":
        # 1. JWT Secret Validation
        if not JWT_SECRET_KEY or JWT_SECRET_KEY == DEFAULT_DEV_JWT_SECRET or len(JWT_SECRET_KEY) < 32:
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: JWT_SECRET_KEY must be a cryptographically "
                "strong random secret (minimum 32 characters) and cannot use the development default."
            )
        # 2. HMAC Attestation Secret Validation
        active_hmac_secret = HMAC_SECRET_KEY or REVIEW_SECRET_KEY
        if not active_hmac_secret or active_hmac_secret == DEFAULT_DEV_REVIEW_SECRET or len(active_hmac_secret) < 32:
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: REVIEW_SECRET_KEY / HMAC_SECRET_KEY must be a "
                "cryptographically strong secret (minimum 32 characters) and cannot use the development default."
            )
        # 3. CORS Wildcard Check
        if "*" in CORS_ORIGINS:
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: Wildcard CORS origin ('*') is strictly forbidden in production mode."
            )


# Run startup validation
validate_security_configuration(ENVIRONMENT)
