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

_backend_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.abspath(os.path.join(_backend_dir, "..", ".."))
_root_env = os.path.join(_root_dir, ".env")
_backend_env = os.path.join(_backend_dir, ".env")

if os.path.exists(_root_env):
    load_dotenv(dotenv_path=_root_env, override=False)
if os.path.exists(_backend_env):
    load_dotenv(dotenv_path=_backend_env, override=False)
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


# Known development secrets and sample placeholders that are strictly disallowed in production
KNOWN_INSECURE_SECRETS = {
    DEFAULT_DEV_JWT_SECRET,
    DEFAULT_DEV_REVIEW_SECRET,
    "ruralhealth-ai-insecure-dev-jwt-secret-do-not-use-in-production-2026",
    "change-this-in-production-to-a-cryptographically-secure-random-key",
    "generate_a_64_character_random_secret_for_production_jwt_signing",
    "generate_a_64_character_random_secret_for_attestation_signing",
    "replace-with-a-cryptographically-secure-random-32-char-string-in-production",
    "secret",
    "secret123",
    "changeme",
    "password123",
    "admin123",
    "12345678901234567890123456789012",
}


def validate_security_configuration(env: str = ENVIRONMENT):
    """
    Validates secrets, origins, and cryptographic configurations.
    Fails closed with RuntimeError if:
    1. ENVIRONMENT is unknown or invalid.
    2. Insecure or known development settings are detected in production.
    3. Production database is missing or uses SQLite.
    4. CORS wildcard is enabled in production.
    """
    normalized_env = (env or "").strip().lower()
    if normalized_env not in ("development", "testing", "production"):
        raise RuntimeError(
            f"FATAL CONFIGURATION ERROR: Invalid ENVIRONMENT '{env}'. "
            "Must be one of: 'development', 'testing', 'production'."
        )

    if normalized_env == "production":
        # 1. JWT Secret Validation
        active_jwt_key = os.environ.get("JWT_SECRET_KEY", JWT_SECRET_KEY)
        if not active_jwt_key or active_jwt_key.strip() in KNOWN_INSECURE_SECRETS or len(active_jwt_key.strip()) < 32:
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: JWT_SECRET_KEY must be a cryptographically "
                "strong random secret (minimum 32 characters) and cannot use the development default or known insecure placeholder secrets."
            )

        # 2. HMAC Attestation Secret Validation
        active_hmac_secret = (
            os.environ.get("HMAC_SECRET_KEY")
            or os.environ.get("REVIEW_SECRET_KEY")
            or os.environ.get("CLINICIAN_REVIEW_SECRET")
            or REVIEW_SECRET_KEY
        )
        if not active_hmac_secret or active_hmac_secret.strip() in KNOWN_INSECURE_SECRETS or len(active_hmac_secret.strip()) < 32:
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: REVIEW_SECRET_KEY / HMAC_SECRET_KEY must be a "
                "cryptographically strong secret (minimum 32 characters) and cannot use the development default or known insecure placeholder secrets."
            )

        # 3. Database Engine Enforcement (PostgreSQL mandatory in production)
        active_db_url = os.environ.get("DATABASE_URL", DATABASE_URL)
        if not active_db_url or ("sqlite" in active_db_url.lower()):
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: In production environment, "
                "PostgreSQL is mandatory (e.g. postgresql+psycopg2://user:pass@host/dbname). "
                "SQLite fallback is strictly forbidden in production mode."
            )

        # 4. CORS Wildcard Check
        active_cors = os.environ.get("CORS_ORIGINS", CORS_ORIGINS_RAW)
        origins = [o.strip() for o in active_cors.split(",") if o.strip()]
        if "*" in origins:
            raise RuntimeError(
                "FATAL PRODUCTION CONFIGURATION ERROR: Wildcard CORS origin ('*') is strictly forbidden in production mode."
            )

    return True


# Run startup validation
validate_security_configuration(ENVIRONMENT)
