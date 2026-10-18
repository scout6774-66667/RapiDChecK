"""
test_snowflake_connection.py — Comprehensive Test Suite for Snowflake Connection & Diagnostics
================================================================================================
Verifies:
1. Missing environment configuration handling (unconfigured state).
2. Security validation: rejection of ACCOUNTADMIN role for routine operations.
3. Security validation: identifier sanitization against injection.
4. Credential masking: zero credential leakage in repr, dicts, logs, or error strings.
5. Mocked successful Snowflake connection & verification query execution.
6. Mocked authentication failure with sanitized error reporting.
7. Mocked verification table query failure with sanitized error reporting.
8. Connection cleanup and engine disposal.
9. Public /api/health endpoint safe Snowflake metadata exposure.
10. Role-based access control: /api/admin/snowflake/test-connection rejects unauthenticated,
    ASHA_WORKER, and PHC_DOCTOR callers (401/403).
11. Authorized SYSTEM_ADMIN access to /api/admin/snowflake/test-connection returns diagnostic payload.
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import snowflake.connector

# Ensure backend root is on sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from snowflake_client import (
    SnowflakeConfig,
    SnowflakeClient,
    sanitize_error_message,
    verify_snowflake_connection,
    is_snowflake_configured,
    get_snowflake_health_summary
)
from main import app
from auth_service import create_access_token, seed_default_users
from ml.population_health import (
    CloudSnowflakeAnalyticsProvider,
    LocalDimensionalSchemaProvider,
    population_health_engine as _POPULATION_HEALTH
)
from config import (
    validate_security_configuration,
    KNOWN_INSECURE_SECRETS,
    DEFAULT_DEV_JWT_SECRET,
    DEFAULT_DEV_REVIEW_SECRET
)
from database import SessionLocal, UserModel

client = TestClient(app)


# ──────────────────────────────────────────────────────────────────────────────
# 1. CONFIGURATION & SANITIZATION TESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_missing_configuration():
    """Verifies safe handling when Snowflake environment variables are unconfigured."""
    empty_config = SnowflakeConfig(account="", user="", password="")
    assert empty_config.is_configured() is False
    assert empty_config.get_missing_fields() == ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD"]

    is_valid, error = empty_config.validate()
    assert is_valid is False
    assert "Missing required Snowflake configuration" in error
    assert "SNOWFLAKE_ACCOUNT" in error

    snow_client = SnowflakeClient(config=empty_config)
    res = snow_client.test_connection()
    assert res["snowflake_configured"] is False
    assert res["connection_status"] == "not_configured"
    assert res["missing_configuration"] == ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD"]
    assert res["verification_query_status"] == "skipped"
    assert res["verification_record"] is None
    assert "missing required credentials" in res["error"].lower()
    assert res["is_live_snowflake_connection"] is False


def test_accountadmin_role_rejected():
    """Verifies that routine application operations cannot use ACCOUNTADMIN."""
    admin_config = SnowflakeConfig(
        account="org-account",
        user="admin_user",
        password="ValidPassword123!",
        role="ACCOUNTADMIN"
    )
    is_valid, error = admin_config.validate()
    assert is_valid is False
    assert "Security policy violation" in error
    assert "ACCOUNTADMIN" in error

    snow_client = SnowflakeClient(config=admin_config)
    res = snow_client.test_connection()
    assert res["connection_status"] == "validation_error"
    assert "ACCOUNTADMIN" in res["error"]


def test_invalid_identifier_rejected():
    """Verifies rejection of malformed or injection-prone database/schema identifiers."""
    bad_config = SnowflakeConfig(
        account="org-account",
        user="test_user",
        password="ValidPassword123!",
        database="RURALHEALTH_DB; DROP TABLE patients;"
    )
    is_valid, error = bad_config.validate()
    assert is_valid is False
    assert "Invalid Snowflake identifier" in error


def test_credential_masking():
    """Guarantees passwords and tokens are never exposed in strings, dicts, or errors."""
    secret = "SuperSecretSnowflakePassword123!#"
    cfg = SnowflakeConfig(
        account="org-account",
        user="test_user",
        password=secret,
        role="RURALHEALTH_APP_ROLE"
    )

    # 1. Representation & safe dictionary must not contain cleartext password
    cfg_repr = repr(cfg)
    assert secret not in cfg_repr
    safe_dict = cfg.to_safe_dict()
    assert secret not in str(safe_dict)
    assert "password" not in safe_dict

    # 2. Sanitizer strips cleartext password traces from error messages
    raw_error = Exception(f"Connection failed: password={secret}; socket error")
    sanitized = sanitize_error_message(raw_error)
    assert secret not in sanitized
    assert "***REDACTED***" in sanitized


# ──────────────────────────────────────────────────────────────────────────────
# 2. MOCKED CONNECTION & VERIFICATION TESTS
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def valid_config():
    return SnowflakeConfig(
        account="xy12345.us-east-1",
        user="RURALHEALTH_APP_USER",
        password="StrongMockedPassword123!",
        warehouse="COMPUTE_WH",
        database="RURALHEALTH_DB",
        schema="ANALYTICS",
        role="RURALHEALTH_APP_ROLE",
        login_timeout=10,
        network_timeout=10
    )


def test_successful_mocked_connection(valid_config):
    """Verifies end-to-end diagnostic flow with mocked successful Snowflake connection."""
    snow_client = SnowflakeClient(config=valid_config)

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    # First fetchone: session context (user, role, db, schema, wh)
    # Second fetchone: verification record (TEST_ID, TEST_MESSAGE, CREATED_AT)
    mock_cursor.fetchone.side_effect = [
        ("RURALHEALTH_APP_USER", "RURALHEALTH_APP_ROLE", "RURALHEALTH_DB", "ANALYTICS", "COMPUTE_WH"),
        ("TEST-001", "Synthetic Snowflake connectivity verification passed", "2026-10-17 12:00:00")
    ]

    with patch("snowflake.connector.connect", return_value=mock_conn) as mock_connect:
        result = snow_client.test_connection()

        # Verify connector called with expected parameters
        mock_connect.assert_called_once_with(
            user="RURALHEALTH_APP_USER",
            password="StrongMockedPassword123!",
            account="xy12345.us-east-1",
            warehouse="COMPUTE_WH",
            database="RURALHEALTH_DB",
            schema="ANALYTICS",
            role="RURALHEALTH_APP_ROLE",
            login_timeout=10,
            network_timeout=10,
            client_session_keep_alive=False
        )

        assert result["snowflake_configured"] is True
        assert result["connection_status"] == "connected"
        assert result["warehouse_status"] == "accessible"
        assert result["user"] == "RURALHEALTH_APP_USER"
        assert result["role"] == "RURALHEALTH_APP_ROLE"
        assert result["database"] == "RURALHEALTH_DB"
        assert result["schema"] == "ANALYTICS"
        assert result["verification_query_status"] == "passed"
        assert result["verification_record"]["test_id"] == "TEST-001"
        assert "Synthetic Snowflake" in result["verification_record"]["test_message"]
        assert result["is_live_snowflake_connection"] is True
        assert result["query_source"] == "Snowflake Cloud Data Warehouse (Live)"
        assert result["error"] is None

        # Verify SQL execution checked session context and verification table
        assert mock_cursor.execute.call_count == 2
        first_call = mock_cursor.execute.call_args_list[0][0][0]
        assert "CURRENT_USER()" in first_call
        assert "CURRENT_ROLE()" in first_call
        assert "CURRENT_DATABASE()" in first_call
        second_call = mock_cursor.execute.call_args_list[1][0][0]
        assert "CONNECTION_TEST" in second_call

        # Verify cursor closed
        mock_cursor.close.assert_called_once()
        mock_conn.close.assert_called_once()


def test_authentication_failure(valid_config):
    """Verifies that authentication errors are safely caught and sanitized."""
    snow_client = SnowflakeClient(config=valid_config)

    auth_error = snowflake.connector.errors.DatabaseError(
        "250001: Incorrect username or password was specified."
    )

    with patch("snowflake.connector.connect", side_effect=auth_error):
        result = snow_client.test_connection()

        assert result["snowflake_configured"] is True
        assert result["connection_status"] == "failed"
        assert result["warehouse_status"] == "inaccessible"
        assert result["verification_query_status"] == "failed"
        assert result["verification_record"] is None
        assert "authentication failed" in result["error"].lower()


def test_verification_table_query_failure(valid_config):
    """Verifies handling when verification table is missing or role lacks permissions."""
    snow_client = SnowflakeClient(config=valid_config)

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    # Session query succeeds, but verification table query fails with ProgrammingError
    mock_cursor.execute.side_effect = [
        None,  # session query executes
        snowflake.connector.errors.ProgrammingError("002043 (02000): Object 'CONNECTION_TEST' does not exist")
    ]
    mock_cursor.fetchone.return_value = ("RURALHEALTH_APP_ROLE", "RURALHEALTH_DB", "ANALYTICS", "COMPUTE_WH")

    with patch("snowflake.connector.connect", return_value=mock_conn):
        result = snow_client.test_connection()

        assert result["snowflake_configured"] is True
        assert result["connection_status"] == "failed"
        assert result["verification_query_status"] == "failed"
        assert result["verification_record"] is None
        assert "table error" in result["error"].lower() or "does not exist" in result["error"].lower()


def test_connection_cleanup_and_disposal(valid_config):
    """Verifies clean engine creation, disposal, and resource release."""
    snow_client = SnowflakeClient(config=valid_config)

    with patch("snowflake_client.create_engine") as mock_create_engine:
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine

        engine = snow_client.get_engine()
        assert engine == mock_engine
        assert snow_client._engine is not None

        # Call close and verify engine is disposed
        snow_client.close()
        mock_engine.dispose.assert_called_once()
        assert snow_client._engine is None


# ──────────────────────────────────────────────────────────────────────────────
# 3. FASTAPI ENDPOINT INTEGRATION & RBAC TESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_public_health_endpoint_privacy():
    """Verifies that /api/health exposes strictly minimal liveness info without metadata leakage."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "online"
    assert "snowflake" in data
    snow_meta = data["snowflake"]
    assert "configured" in snow_meta
    assert "status" in snow_meta

    # Strict privacy assertions: No database, schema, warehouse, role, or credentials exposed
    assert "database" not in snow_meta
    assert "schema" not in snow_meta
    assert "warehouse" not in snow_meta
    assert "role" not in snow_meta
    assert "account" not in snow_meta
    assert "password" not in str(data).lower()
    assert "token" not in str(data).lower()
    assert "secret" not in str(data).lower()


def test_diagnostic_endpoint_unauthorized():
    """Verifies that /api/admin/snowflake/test-connection rejects unauthenticated requests (401)."""
    resp = client.get("/api/admin/snowflake/test-connection")
    assert resp.status_code in (401, 403)


def test_diagnostic_endpoint_forbidden_for_non_admins():
    """Verifies that frontline workers and clinicians cannot access the diagnostic endpoint (403)."""
    # 1. Test ASHA_WORKER role (seeded account)
    asha_token = create_access_token({
        "sub": "usr_asha_anita",
        "username": "asha.anita",
        "role": "ASHA_WORKER",
        "facility_id": "SC_SONPUR"
    })
    resp_asha = client.get(
        "/api/admin/snowflake/test-connection",
        headers={"Authorization": f"Bearer {asha_token}"}
    )
    assert resp_asha.status_code == 403

    # 2. Test PHC_DOCTOR role (seeded account)
    doc_token = create_access_token({
        "sub": "usr_dr_sharma",
        "username": "dr.sharma",
        "role": "PHC_DOCTOR",
        "facility_id": "PHC_SONPUR"
    })
    resp_doc = client.get(
        "/api/admin/snowflake/test-connection",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp_doc.status_code == 403


def test_diagnostic_endpoint_authorized_system_admin():
    """Verifies that SYSTEM_ADMIN role can execute the diagnostic test."""
    admin_token = create_access_token({
        "sub": "usr_admin",
        "username": "admin",
        "role": "SYSTEM_ADMIN",
        "facility_id": "ADMIN_HQ"
    })

    # Mock the underlying verify_snowflake_connection to isolate endpoint logic
    mock_diag = {
        "snowflake_configured": True,
        "connection_status": "connected",
        "warehouse_status": "accessible",
        "role": "RURALHEALTH_APP_ROLE",
        "database": "RURALHEALTH_DB",
        "schema": "ANALYTICS",
        "verification_query_status": "passed",
        "verification_record": {
            "test_id": "TEST-001",
            "test_message": "Synthetic test passed",
            "created_at": "2026-10-17 12:00:00"
        },
        "error": None
    }

    with patch("main.verify_snowflake_connection", return_value=mock_diag):
        resp = client.get(
            "/api/admin/snowflake/test-connection",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["connection_status"] == "connected"
        assert data["verification_query_status"] == "passed"
        assert data["role"] == "RURALHEALTH_APP_ROLE"
        assert "password" not in str(data).lower()


# ──────────────────────────────────────────────────────────────────────────────
# 4. CLOUD SNOWFLAKE ANALYTICS PROVIDER TESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_cloud_snowflake_provider_unconfigured():
    """Verifies provider handles missing cloud Snowflake credentials gracefully."""
    mock_client = MagicMock()
    mock_client.is_configured = False
    provider = CloudSnowflakeAnalyticsProvider(mock_client)

    meta = provider.get_metadata()
    assert meta["is_cloud_snowflake_connection"] is True
    assert meta["configured"] is False

    verification = provider.query_verification_table()
    assert verification["status"] == "not_configured"
    assert verification["is_cloud_snowflake_result"] is False
    assert verification["record"] is None

    tables = provider.inspect_schema_tables()
    assert tables["status"] == "not_configured"
    assert tables["tables"] == []


def test_cloud_snowflake_provider_query_verification_table_success():
    """Verifies read-only query against RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST with mock engine."""
    mock_client = MagicMock()
    mock_client.is_configured = True
    mock_client.test_connection.return_value = {
        "snowflake_configured": True,
        "connection_status": "connected",
        "warehouse_status": "accessible",
        "verification_query_status": "passed",
        "verification_record": {
            "test_id": "VERIFY-001",
            "test_message": "Verification row accessible",
            "created_at": "2026-10-18T12:00:00"
        },
        "error": None
    }

    provider = CloudSnowflakeAnalyticsProvider(mock_client)
    result = provider.query_verification_table()

    assert result["status"] == "connected"
    assert result["verification_query_status"] == "passed"
    assert result["is_cloud_snowflake_result"] is True
    assert "Snowflake Cloud Data Warehouse" in result["query_source"]
    assert result["record"]["test_id"] == "VERIFY-001"


def test_cloud_snowflake_provider_query_verification_table_empty():
    """Verifies handling when the verification table exists but has no records."""
    mock_client = MagicMock()
    mock_client.is_configured = True
    mock_client.test_connection.return_value = {
        "snowflake_configured": True,
        "connection_status": "connected",
        "warehouse_status": "accessible",
        "verification_query_status": "passed_empty_table",
        "verification_record": None,
        "error": None
    }

    provider = CloudSnowflakeAnalyticsProvider(mock_client)
    result = provider.query_verification_table()

    assert result["status"] == "connected"
    assert result["verification_query_status"] == "passed_empty_table"
    assert result["record"] is None
    assert result["is_cloud_snowflake_result"] is True


def test_cloud_snowflake_provider_inspect_schema_tables():
    """Verifies schema table inspection queries SHOW TABLES safely."""
    mock_client = MagicMock()
    mock_client.is_configured = True
    mock_client.config.database = "RURALHEALTH_DB"
    mock_client.config.schema = "ANALYTICS"
    mock_raw_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_client.get_raw_connection.return_value.__enter__.return_value = mock_raw_conn
    mock_raw_conn.cursor.return_value = mock_cursor

    mock_cursor.fetchall.return_value = [
        ["2026-10-18", "CONNECTION_TEST", "ANALYTICS", "RURALHEALTH_DB", "TABLE", "N", 1, 1024, "None", "None"],
        ["2026-10-18", "FACT_POPULATION_HEALTH", "ANALYTICS", "RURALHEALTH_DB", "TABLE", "N", 1500, 2048, "None", "None"]
    ]

    provider = CloudSnowflakeAnalyticsProvider(mock_client)
    result = provider.inspect_schema_tables(schema_name="ANALYTICS")

    assert result["status"] == "success"
    assert result["is_cloud_snowflake_result"] is True
    assert len(result["tables"]) == 2
    assert result["tables"][0]["table_name"] == "CONNECTION_TEST"
    assert result["tables"][1]["table_name"] == "FACT_POPULATION_HEALTH"


def test_cloud_snowflake_provider_error_handling_sanitizes():
    """Verifies error handling catches database exceptions and returns sanitized messages."""
    mock_client = MagicMock()
    mock_client.is_configured = True
    mock_client.config.database = "RURALHEALTH_DB"
    mock_client.config.schema = "ANALYTICS"
    mock_client.get_raw_connection.side_effect = snowflake.connector.errors.ProgrammingError(
        "SQL compilation error: Object does not exist"
    )

    provider = CloudSnowflakeAnalyticsProvider(mock_client)
    result = provider.inspect_schema_tables()

    assert result["status"] in ("failed", "error")
    assert result["is_cloud_snowflake_result"] is False
    assert "password" not in str(result).lower()
    assert "Snowflake table error" in result["error"] or "does not exist" in result["error"]


def test_local_schema_provider_clarity():
    """Verifies local relational schema provider accurately reports non-cloud source."""
    provider = LocalDimensionalSchemaProvider()
    meta = provider.get_metadata()

    assert meta["is_cloud_snowflake_connection"] is False
    assert "Local Relational Storage" in meta["source"]
    assert "SQLite/PostgreSQL" in meta["database_engine"]

    facts = _POPULATION_HEALTH.query_snowflake_facts("ALL")
    assert facts["is_cloud_snowflake_result"] is False
    assert facts["query_source"] == "Local Relational Storage (SQLite/PostgreSQL)"


# ──────────────────────────────────────────────────────────────────────────────
# 5. POPULATION HEALTH SNOWFLAKE ENDPOINTS AUTHENTICATION & RBAC TESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_population_health_snowflake_endpoints_require_authentication():
    """Verifies that all /api/ml/population-health/snowflake/* endpoints reject unauthenticated access."""
    endpoints = [
        ("GET", "/api/ml/population-health/snowflake/metadata"),
        ("GET", "/api/ml/population-health/snowflake/query"),
        ("GET", "/api/ml/population-health/snowflake/verify-cloud"),
        ("GET", "/api/ml/population-health/snowflake/tables"),
    ]
    for method, path in endpoints:
        if method == "GET":
            resp = client.get(path)
        else:
            resp = client.post(path)
        assert resp.status_code in (401, 403), f"Endpoint {path} failed auth check with {resp.status_code}"


def test_population_health_snowflake_endpoints_forbidden_for_asha_and_phc():
    """Verifies that ASHA workers and PHC doctors cannot access population analytics endpoints (403)."""
    asha_token = create_access_token({
        "sub": "usr_asha_anita",
        "username": "asha.anita",
        "role": "ASHA_WORKER",
        "facility_id": "SC_SONPUR"
    })
    headers = {"Authorization": f"Bearer {asha_token}"}

    endpoints = [
        "/api/ml/population-health/snowflake/metadata",
        "/api/ml/population-health/snowflake/query",
        "/api/ml/population-health/snowflake/verify-cloud",
        "/api/ml/population-health/snowflake/tables",
    ]
    for path in endpoints:
        resp = client.get(path, headers=headers)
        assert resp.status_code == 403, f"Endpoint {path} allowed ASHA worker (expected 403)"


def test_population_health_snowflake_endpoints_authorized_district_officer():
    """Verifies that DISTRICT_OFFICER (with analytics:view permission) can access all analytics endpoints."""
    do_token = create_access_token({
        "sub": "usr_officer_patel",
        "username": "officer.patel",
        "role": "DISTRICT_OFFICER",
        "facility_id": "DH_DISTRICT_HQ"
    })
    headers = {"Authorization": f"Bearer {do_token}"}

    # 1. Metadata endpoint (default local)
    resp_meta = client.get("/api/ml/population-health/snowflake/metadata", headers=headers)
    assert resp_meta.status_code == 200
    meta_data = resp_meta.json()
    assert meta_data["is_cloud_snowflake_connection"] is False

    # 2. Metadata endpoint with cloud requested
    resp_meta_cloud = client.get("/api/ml/population-health/snowflake/metadata?use_cloud=true", headers=headers)
    assert resp_meta_cloud.status_code == 200
    cloud_meta = resp_meta_cloud.json()
    assert cloud_meta["is_cloud_snowflake_connection"] is True

    # 3. Facts query endpoint
    resp_query = client.get("/api/ml/population-health/snowflake/query", headers=headers)
    assert resp_query.status_code == 200
    query_data = resp_query.json()
    assert query_data["is_cloud_snowflake_result"] is False
    assert query_data["query_source"] == "Local Relational Storage (SQLite/PostgreSQL)"

    # 4. Cloud verification endpoint (mocked)
    with patch.object(_POPULATION_HEALTH, "query_cloud_snowflake_verification", return_value={"status": "mock_success"}):
        resp_verify = client.get("/api/ml/population-health/snowflake/verify-cloud", headers=headers)
        assert resp_verify.status_code == 200
        assert resp_verify.json()["status"] == "mock_success"

    # 5. Schema tables endpoint (mocked)
    with patch.object(_POPULATION_HEALTH, "inspect_cloud_snowflake_tables", return_value={"status": "success", "tables": [{"table_name": "CONNECTION_TEST"}]}):
        resp_tables = client.get("/api/ml/population-health/snowflake/tables", headers=headers)
        assert resp_tables.status_code == 200
        assert resp_tables.json()["status"] == "success"


# ──────────────────────────────────────────────────────────────────────────────
# 6. AUTHENTICATION HARDENING & PRODUCTION SEED RESTRICTION TESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_validate_security_configuration_rejects_insecure_secrets_in_production():
    """Verifies that validate_security_configuration fails closed if any known insecure secret is set in production."""
    for secret in KNOWN_INSECURE_SECRETS:
        env_vars = {
            "JWT_SECRET_KEY": secret,
            "DATABASE_URL": "postgresql://user:pass@localhost:5432/ruralhealth_prod",
            "CLINICIAN_REVIEW_SECRET": "prod_clinician_secret_with_sufficient_length_32chars",
            "ALLOWED_ORIGINS": "https://ruralhealth.example.org"
        }
        with patch.dict(os.environ, env_vars, clear=False):
            with pytest.raises(RuntimeError) as exc_info:
                validate_security_configuration(env="production")
            assert "insecure" in str(exc_info.value).lower() or "secret" in str(exc_info.value).lower()


def test_validate_security_configuration_rejects_short_secrets_in_production():
    """Verifies that secrets < 32 chars raise RuntimeError in production."""
    env_vars = {
        "JWT_SECRET_KEY": "too_short_secret",
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/ruralhealth_prod",
        "CLINICIAN_REVIEW_SECRET": "prod_clinician_secret_with_sufficient_length_32chars",
        "ALLOWED_ORIGINS": "https://ruralhealth.example.org"
    }
    with patch.dict(os.environ, env_vars, clear=False):
        with pytest.raises(RuntimeError) as exc_info:
            validate_security_configuration(env="production")
        assert "32" in str(exc_info.value).lower() or "secret" in str(exc_info.value).lower()


def test_validate_security_configuration_rejects_sqlite_in_production():
    """Verifies that SQLite is rejected as the primary database in production."""
    env_vars = {
        "JWT_SECRET_KEY": "prod_jwt_secret_with_sufficient_length_32chars_ok",
        "DATABASE_URL": "sqlite:///./prod_clinical.db",
        "REVIEW_SECRET_KEY": "prod_clinician_secret_with_sufficient_length_32chars",
        "CLINICIAN_REVIEW_SECRET": "prod_clinician_secret_with_sufficient_length_32chars",
        "ALLOWED_ORIGINS": "https://ruralhealth.example.org"
    }
    with patch.dict(os.environ, env_vars, clear=False):
        with pytest.raises(RuntimeError) as exc_info:
            validate_security_configuration(env="production")
        assert "sqlite" in str(exc_info.value).lower()


def test_validate_security_configuration_rejects_invalid_environment():
    """Verifies that unknown environments fail closed."""
    with pytest.raises(RuntimeError) as exc_info:
        validate_security_configuration(env="staging")
    assert "invalid environment" in str(exc_info.value).lower()


def test_validate_security_configuration_accepts_valid_production():
    """Verifies that valid production configuration passes validation."""
    env_vars = {
        "JWT_SECRET_KEY": "prod_jwt_secret_with_sufficient_length_32chars_ok",
        "DATABASE_URL": "postgresql://rh_user:rh_pass@localhost:5432/ruralhealth_prod",
        "REVIEW_SECRET_KEY": "prod_clinician_secret_with_sufficient_length_32chars",
        "CLINICIAN_REVIEW_SECRET": "prod_clinician_secret_with_sufficient_length_32chars",
        "ALLOWED_ORIGINS": "https://ruralhealth.example.org"
    }
    with patch.dict(os.environ, env_vars, clear=False):
        assert validate_security_configuration(env="production") is True



def test_seed_default_users_strictly_blocked_in_production():
    """Verifies that default user seeding returns False and does not seed accounts when env=production."""
    db = SessionLocal()
    try:
        result = seed_default_users(db, env="production")
        assert result is False
    finally:
        db.close()


def test_runtime_accountadmin_session_rejected(valid_config):
    """Verifies that if active Snowflake session returns ACCOUNTADMIN, connection is blocked."""
    snow_client = SnowflakeClient(config=valid_config)

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    # Active session returns ACCOUNTADMIN as the active role
    mock_cursor.fetchone.return_value = (
        "ADMIN_USER", "ACCOUNTADMIN", "RURALHEALTH_DB", "ANALYTICS", "COMPUTE_WH"
    )

    with patch("snowflake.connector.connect", return_value=mock_conn):
        result = snow_client.test_connection()
        assert result["connection_status"] == "security_violation"
        assert result["verification_query_status"] == "blocked"
        assert result["verification_record"] is None
        assert "ACCOUNTADMIN" in result["error"]
        assert result["is_live_snowflake_connection"] is True



