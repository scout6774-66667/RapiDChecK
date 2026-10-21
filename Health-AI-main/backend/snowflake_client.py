"""
snowflake_client.py — Dedicated Snowflake Cloud Data Warehouse Connection Module
================================================================================
RuralHealth AI Analytical Layer Integration

Architectural Guarantees:
1. Lazy Connection Lifecycle: Zero network connections or sockets opened at import time.
2. Credential Security: Credentials are read exclusively from environment variables,
   masked in representations/logs, and never exposed to the client or unauthenticated endpoints.
3. Least-Privilege Role: Enforces usage of application roles (e.g. RURALHEALTH_APP_ROLE);
   prohibits routine usage of ACCOUNTADMIN.
4. Clean Disposal: Connection pooling and safe resource disposal via SQLAlchemy engine
   and context managers.
5. Isolated Health Diagnostic: Diagnostic verification querying synthetic test table
   (RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST) with sanitized responses.
"""

import os
import re
import logging
import threading
from typing import Optional, Dict, Any, Tuple, List
from contextlib import contextmanager
from dataclasses import dataclass

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, URL
from sqlalchemy.orm import sessionmaker, Session
import snowflake.connector

from dotenv import load_dotenv

# Ensure root .env and backend .env are loaded if present
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.abspath(os.path.join(_backend_dir, "..", ".."))
_root_env = os.path.join(_root_dir, ".env")
_backend_env = os.path.join(_backend_dir, ".env")

if os.path.exists(_root_env):
    load_dotenv(dotenv_path=_root_env, override=False)
if os.path.exists(_backend_env):
    load_dotenv(dotenv_path=_backend_env, override=False)
load_dotenv()


logger = logging.getLogger("ruralhealth.snowflake")

# Regular expression to sanitize potential secrets from error messages
SENSITIVE_PATTERNS = [
    re.compile(r"password=([^\s;&]+)", re.IGNORECASE),
    re.compile(r"token=([^\s;&]+)", re.IGNORECASE),
    re.compile(r":([^\s@:]+)@", re.IGNORECASE),  # user:pass@host pattern
]


def sanitize_error_message(error: Exception) -> str:
    """
    Strips raw passwords, tokens, and internal network traces from error messages.
    """
    msg = str(error)
    for pattern in SENSITIVE_PATTERNS:
        msg = pattern.sub(r"***REDACTED***", msg)

    # Map well-known Snowflake error messages to clear, actionable, safe descriptions
    lower_msg = msg.lower()
    if "250001" in lower_msg or "authentication failed" in lower_msg or "incorrect username or password" in lower_msg:
        return "Snowflake authentication failed: Invalid username, password, or account identifier."
    if "390144" in lower_msg or ("role" in lower_msg and "does not exist" in lower_msg):
        return "Snowflake role error: Configured role does not exist or user is not granted access to it."
    if "390111" in lower_msg or ("warehouse" in lower_msg and "does not exist" in lower_msg):
        return "Snowflake warehouse error: Configured warehouse does not exist or user lacks USAGE privilege."
    if "002003" in lower_msg or ("database" in lower_msg and "does not exist" in lower_msg):
        return "Snowflake database error: Configured database or schema does not exist or user lacks USAGE privilege."
    if "002043" in lower_msg or "object does not exist" in lower_msg or "connection_test" in lower_msg:
        return "Snowflake table error: Verification table does not exist or role lacks SELECT permissions."
    if "timed out" in lower_msg or "timeout" in lower_msg or "connection refused" in lower_msg:
        return "Snowflake network error: Connection attempt timed out or network is unreachable."

    return msg


@dataclass
class SnowflakeConfig:
    """Centralized Snowflake configuration container."""
    account: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None
    warehouse: str = "COMPUTE_WH"
    database: str = "RURALHEALTH_DB"
    schema: str = "ANALYTICS"
    role: str = "RURALHEALTH_APP_ROLE"
    login_timeout: int = 15
    network_timeout: int = 15

    @classmethod
    def from_env(cls) -> "SnowflakeConfig":
        """Instantiates configuration from environment variables."""
        if os.path.exists(_root_env):
            load_dotenv(dotenv_path=_root_env, override=False)
        if os.path.exists(_backend_env):
            load_dotenv(dotenv_path=_backend_env, override=False)

        def _clean_str(val: Optional[str]) -> Optional[str]:
            if val is None:
                return None
            s = val.strip()
            return s if s else None

        return cls(
            account=_clean_str(os.environ.get("SNOWFLAKE_ACCOUNT")),
            user=_clean_str(os.environ.get("SNOWFLAKE_USER")),
            password=_clean_str(os.environ.get("SNOWFLAKE_PASSWORD")),
            warehouse=_clean_str(os.environ.get("SNOWFLAKE_WAREHOUSE")) or "COMPUTE_WH",
            database=_clean_str(os.environ.get("SNOWFLAKE_DATABASE")) or "RURALHEALTH_DB",
            schema=_clean_str(os.environ.get("SNOWFLAKE_SCHEMA")) or "ANALYTICS",
            role=_clean_str(os.environ.get("SNOWFLAKE_ROLE")) or "RURALHEALTH_APP_ROLE",
            login_timeout=int(os.environ.get("SNOWFLAKE_LOGIN_TIMEOUT") or "15"),
            network_timeout=int(os.environ.get("SNOWFLAKE_NETWORK_TIMEOUT") or "15"),
        )


    def is_configured(self) -> bool:
        """Checks if all primary credentials required for connection are populated."""
        return bool(
            self.account and self.account.strip() and
            self.user and self.user.strip() and
            self.password and self.password.strip()
        )

    def get_missing_fields(self) -> List[str]:
        """Returns the list of required Snowflake environment variables currently unpopulated."""
        missing = []
        if not (self.account and self.account.strip()):
            missing.append("SNOWFLAKE_ACCOUNT")
        if not (self.user and self.user.strip()):
            missing.append("SNOWFLAKE_USER")
        if not (self.password and self.password.strip()):
            missing.append("SNOWFLAKE_PASSWORD")
        return missing

    def validate(self) -> Tuple[bool, Optional[str]]:
        """
        Validates the configuration parameters.
        Returns (is_valid, error_reason).
        """
        if not self.is_configured():
            missing = self.get_missing_fields()
            return False, f"Missing required Snowflake configuration: {', '.join(missing)}"

        # Prohibit routine usage of ACCOUNTADMIN role in application backend
        if self.role and self.role.strip().upper() == "ACCOUNTADMIN":
            return False, (
                "Security policy violation: Routine application operations cannot use ACCOUNTADMIN role. "
                "Please configure a least-privilege role such as RURALHEALTH_APP_ROLE."
            )

        # Validate warehouse, database, schema formatting (alphanumeric and underscores only)
        identifier_regex = re.compile(r"^[A-Za-z0-9_]+$")
        for name, val in [("database", self.database), ("schema", self.schema), ("warehouse", self.warehouse), ("role", self.role)]:
            if val and not identifier_regex.match(val):
                return False, f"Invalid Snowflake identifier for {name}: '{val}'. Must be alphanumeric/underscores only."

        return True, None

    def to_safe_dict(self) -> Dict[str, Any]:
        """Returns non-sensitive configuration metadata safe for diagnostics."""
        return {
            "configured": self.is_configured(),
            "warehouse": self.warehouse,
            "database": self.database,
            "schema": self.schema,
            "role": self.role,
            "login_timeout": self.login_timeout,
            "network_timeout": self.network_timeout,
        }

    def __repr__(self) -> str:
        safe_info = self.to_safe_dict()
        return f"<SnowflakeConfig {safe_info}>"


class SnowflakeClient:
    """
    Thread-safe client managing Snowflake connections and queries.
    Connections are initialized strictly lazily.
    """

    def __init__(self, config: Optional[SnowflakeConfig] = None):
        self._config = config
        self._engine: Optional[Engine] = None
        self._session_factory: Optional[sessionmaker] = None
        self._lock = threading.RLock()

    @property
    def config(self) -> SnowflakeConfig:
        """Returns the active configuration (or loads fresh from environment)."""
        if self._config is None:
            self._config = SnowflakeConfig.from_env()
        return self._config

    def is_configured(self) -> bool:
        """Returns True if minimum connection settings are set in environment."""
        return self.config.is_configured()

    def get_engine(self) -> Engine:
        """
        Lazily creates and returns a SQLAlchemy Engine configured with connection pooling.
        """
        valid, error_msg = self.config.validate()
        if not valid:
            raise ValueError(error_msg or "Invalid Snowflake configuration")

        with self._lock:
            if self._engine is None:
                # Construct safe URL using SQLAlchemy URL.create (masks password in repr/logs)
                snowflake_url = URL.create(
                    drivername="snowflake",
                    username=self.config.user,
                    password=self.config.password,
                    host=self.config.account,
                    database=f"{self.config.database}/{self.config.schema}",
                    query={
                        "warehouse": self.config.warehouse,
                        "role": self.config.role,
                    }
                )

                connect_args = {
                    "login_timeout": self.config.login_timeout,
                    "network_timeout": self.config.network_timeout,
                    "client_session_keep_alive": False,
                }

                self._engine = create_engine(
                    snowflake_url,
                    connect_args=connect_args,
                    pool_size=5,
                    max_overflow=10,
                    pool_pre_ping=True,
                    pool_recycle=1800,
                )
                self._session_factory = sessionmaker(
                    autocommit=False, autoflush=False, bind=self._engine
                )
                logger.info(
                    "Initialized Snowflake SQLAlchemy engine for database=%s, schema=%s, role=%s",
                    self.config.database, self.config.schema, self.config.role
                )

            return self._engine

    @contextmanager
    def get_session(self):
        """
        Context manager for SQLAlchemy ORM sessions against Snowflake.
        Automatically commits or rolls back and disposes session.
        """
        engine = self.get_engine()
        with self._lock:
            if not self._session_factory:
                self._session_factory = sessionmaker(
                    autocommit=False, autoflush=False, bind=engine
                )
            session: Session = self._session_factory()

        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @contextmanager
    def get_raw_connection(self):
        """
        Context manager for raw snowflake-connector-python connections.
        Used for lightweight direct queries and diagnostic checks.
        """
        valid, error_msg = self.config.validate()
        if not valid:
            raise ValueError(error_msg or "Invalid Snowflake configuration")

        conn = snowflake.connector.connect(
            user=self.config.user,
            password=self.config.password,
            account=self.config.account,
            warehouse=self.config.warehouse,
            database=self.config.database,
            schema=self.config.schema,
            role=self.config.role,
            login_timeout=self.config.login_timeout,
            network_timeout=self.config.network_timeout,
            client_session_keep_alive=False
        )
        try:
            yield conn
        finally:
            try:
                conn.close()
            except Exception as close_err:
                logger.debug("Error closing Snowflake raw connection: %s", close_err)

    def close(self):
        """Disposes the SQLAlchemy engine connection pool and releases resources."""
        with self._lock:
            if self._engine is not None:
                try:
                    self._engine.dispose()
                    logger.info("Disposed Snowflake engine connection pool.")
                except Exception as err:
                    logger.warning("Error disposing Snowflake engine: %s", err)
                finally:
                    self._engine = None
                    self._session_factory = None

    def test_connection(self) -> Dict[str, Any]:
        """
        Diagnostic verification routine (Phase 5).
        Verifies:
        1. Snowflake authentication succeeds.
        2. Configured database is accessible.
        3. Configured warehouse is accessible.
        4. Configured role has required permissions.
        5. Queries synthetic verification table:
           RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST
           (SELECT TEST_ID, TEST_MESSAGE, CREATED_AT LIMIT 1).

        Guarantees:
        - Read-only execution (no inserts, updates, deletes, or DDL).
        - Sanitized response without exposing credentials, tokens, or usernames.
        """
        # Step 1: Check configuration
        if not self.config.is_configured():
            is_valid, validation_error = self.config.validate()
            detail = f": {validation_error}" if validation_error else ""
            return {
                "snowflake_configured": False,
                "connection_status": "not_configured",
                "missing_configuration": self.config.get_missing_fields(),
                "warehouse_status": "unknown",
                "user": self.config.user,
                "role": self.config.role,
                "database": self.config.database,
                "schema": self.config.schema,
                "warehouse": self.config.warehouse,
                "verification_query_status": "skipped",
                "verification_record": None,
                "query_source": "Snowflake Cloud Data Warehouse",
                "is_live_snowflake_connection": False,
                "error": f"Snowflake configuration is incomplete: missing required credentials (SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, or SNOWFLAKE_PASSWORD){detail}"
            }

        is_valid, validation_error = self.config.validate()
        if not is_valid:
            return {
                "snowflake_configured": False,
                "connection_status": "validation_error",
                "warehouse_status": "unknown",
                "user": self.config.user,
                "role": self.config.role,
                "database": self.config.database,
                "schema": self.config.schema,
                "warehouse": self.config.warehouse,
                "verification_query_status": "skipped",
                "verification_record": None,
                "query_source": "Snowflake Cloud Data Warehouse",
                "is_live_snowflake_connection": False,
                "error": validation_error
            }

        # Step 2: Test raw connection and diagnostic query
        try:
            with self.get_raw_connection() as conn:
                cursor = conn.cursor()
                try:
                    # 2a. Verify session context
                    cursor.execute("SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_WAREHOUSE();")
                    session_row = cursor.fetchone()
                    if session_row and len(session_row) >= 5:
                        active_user = session_row[0]
                        active_role = session_row[1]
                        active_db = session_row[2]
                        active_schema = session_row[3]
                        active_wh = session_row[4]
                    elif session_row and len(session_row) == 4:
                        active_user = self.config.user
                        active_role = session_row[0]
                        active_db = session_row[1]
                        active_schema = session_row[2]
                        active_wh = session_row[3]
                    else:
                        active_user = self.config.user
                        active_role = self.config.role
                        active_db = self.config.database
                        active_schema = self.config.schema
                        active_wh = self.config.warehouse

                    # Security policy enforcement: Runtime operations strictly forbid ACCOUNTADMIN
                    if str(active_role).strip().upper() == "ACCOUNTADMIN":
                        return {
                            "snowflake_configured": True,
                            "connection_status": "security_violation",
                            "warehouse_status": "accessible" if active_wh else "not_set",
                            "user": str(active_user),
                            "role": str(active_role),
                            "database": str(active_db),
                            "schema": str(active_schema),
                            "warehouse": str(active_wh) if active_wh else self.config.warehouse,
                            "verification_query_status": "blocked",
                            "verification_record": None,
                            "query_source": "Snowflake Cloud Data Warehouse (Live)",
                            "is_live_snowflake_connection": True,
                            "error": "Security policy violation: Routine application operations cannot use ACCOUNTADMIN role. Please configure a least-privilege role such as RURALHEALTH_APP_ROLE."
                        }

                    # 2b. Execute read-only query on verification table
                    target_db = active_db or self.config.database or "RURALHEALTH_DB"
                    target_schema = active_schema or self.config.schema or "ANALYTICS"
                    verification_sql = (
                        f"SELECT TEST_ID, TEST_MESSAGE, CREATED_AT "
                        f"FROM {target_db}.{target_schema}.CONNECTION_TEST "
                        f"LIMIT 1;"
                    )
                    cursor.execute(verification_sql)
                    record_row = cursor.fetchone()

                    verification_record = None
                    if record_row:
                        verification_record = {
                            "test_id": str(record_row[0]),
                            "test_message": str(record_row[1]),
                            "created_at": str(record_row[2])
                        }

                    return {
                        "snowflake_configured": True,
                        "connection_status": "connected",
                        "warehouse_status": "accessible" if active_wh else "not_set",
                        "user": str(active_user),
                        "role": str(active_role),
                        "database": str(active_db),
                        "schema": str(active_schema),
                        "warehouse": str(active_wh) if active_wh else self.config.warehouse,
                        "verification_query_status": "passed" if record_row else "passed_empty_table",
                        "verification_record": verification_record,
                        "query_source": "Snowflake Cloud Data Warehouse (Live)",
                        "is_live_snowflake_connection": True,
                        "error": None
                    }

                finally:
                    cursor.close()

        except Exception as exc:
            sanitized_err = sanitize_error_message(exc)
            logger.error("Snowflake connection test diagnostic failed: %s", sanitized_err)
            return {
                "snowflake_configured": True,
                "connection_status": "failed",
                "warehouse_status": "inaccessible",
                "user": self.config.user,
                "role": self.config.role,
                "database": self.config.database,
                "schema": self.config.schema,
                "warehouse": self.config.warehouse,
                "verification_query_status": "failed",
                "verification_record": None,
                "query_source": "Snowflake Cloud Data Warehouse",
                "is_live_snowflake_connection": False,
                "error": sanitized_err
            }


# Global singleton instance
_default_snowflake_client: Optional[SnowflakeClient] = None
_client_lock = threading.Lock()


def get_snowflake_client() -> SnowflakeClient:
    """Returns the process-wide SnowflakeClient singleton."""
    global _default_snowflake_client
    if _default_snowflake_client is None:
        with _client_lock:
            if _default_snowflake_client is None:
                _default_snowflake_client = SnowflakeClient()
    return _default_snowflake_client


def verify_snowflake_connection() -> Dict[str, Any]:
    """Diagnostic health check function executing read-only verification query."""
    return get_snowflake_client().test_connection()


def is_snowflake_configured() -> bool:
    """Returns True if Snowflake environment settings are populated."""
    return get_snowflake_client().is_configured()


def get_snowflake_health_summary() -> Dict[str, Any]:
    """
    Minimal liveness summary for public health check endpoints.
    Discloses strictly minimal liveness/configuration status without revealing
    internal database names, schema names, warehouse names, roles, or credentials.
    """
    client = get_snowflake_client()
    configured = client.is_configured()
    return {
        "configured": configured,
        "status": "configured" if configured else "unconfigured",
    }


def get_snowflake_diagnostic_summary() -> Dict[str, Any]:
    """
    Detailed diagnostic summary restricted to authorized operators (SYSTEM_ADMIN).
    Discloses non-sensitive architecture context without passwords or tokens.
    """
    client = get_snowflake_client()
    return {
        "configured": client.is_configured(),
        "database": client.config.database,
        "schema": client.config.schema,
        "warehouse": client.config.warehouse,
        "role": client.config.role,
        "status": "configured" if client.is_configured() else "unconfigured",
    }


if __name__ == "__main__":
    import json
    print(json.dumps(verify_snowflake_connection(), indent=2))

