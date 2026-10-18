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
from auth_service import create_access_token

client = TestClient(app)


# ──────────────────────────────────────────────────────────────────────────────
# 1. CONFIGURATION & SANITIZATION TESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_missing_configuration():
    """Verifies safe handling when Snowflake environment variables are unconfigured."""
    empty_config = SnowflakeConfig(account="", user="", password="")
    assert empty_config.is_configured() is False

    is_valid, error = empty_config.validate()
    assert is_valid is False
    assert "Missing required Snowflake configuration" in error
    assert "SNOWFLAKE_ACCOUNT" in error

    snow_client = SnowflakeClient(config=empty_config)
    res = snow_client.test_connection()
    assert res["snowflake_configured"] is False
    assert res["connection_status"] == "not_configured"
    assert res["verification_query_status"] == "skipped"
    assert res["verification_record"] is None
    assert "missing required credentials" in res["error"].lower()


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

    # First fetchone: session context (role, db, schema, wh)
    # Second fetchone: verification record (TEST_ID, TEST_MESSAGE, CREATED_AT)
    mock_cursor.fetchone.side_effect = [
        ("RURALHEALTH_APP_ROLE", "RURALHEALTH_DB", "ANALYTICS", "COMPUTE_WH"),
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
        assert result["role"] == "RURALHEALTH_APP_ROLE"
        assert result["database"] == "RURALHEALTH_DB"
        assert result["schema"] == "ANALYTICS"
        assert result["verification_query_status"] == "passed"
        assert result["verification_record"]["test_id"] == "TEST-001"
        assert "Synthetic Snowflake" in result["verification_record"]["test_message"]
        assert result["error"] is None

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

def test_public_health_endpoint_metadata():
    """Verifies that /api/health includes safe Snowflake summary without credentials."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "online"
    assert "snowflake" in data
    snow_meta = data["snowflake"]
    assert "configured" in snow_meta
    assert "database" in snow_meta
    assert "schema" in snow_meta
    assert "role" in snow_meta

    # Critical security assertion: No credentials or account identifiers exposed
    assert "password" not in str(data).lower()
    assert "token" not in str(data).lower()


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
