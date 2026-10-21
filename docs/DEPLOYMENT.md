# Deployment & Operations Guide

## 1. Overview & Architecture

RapiDChecK is designed for reliable containerized deployment using Docker Compose, orchestrating:
1. **`postgres`:** PostgreSQL 16 (internal container network on port 5432).
2. **`backend`:** FastAPI Python 3.11 service (exposed on port 8000).
3. **`frontend`:** NGINX Alpine serving the production Vite build (exposed on port 5173).

---

## 2. Environment Configuration

Before launching, copy the environment template and provide production secrets:
```bash
cp .env.example .env
```

### Essential Production Variables

| Variable | Description | Requirement |
|---|---|---|
| `POSTGRES_DB` | Production database name (e.g. `ruralhealth_prod`) | Required |
| `POSTGRES_USER` | PostgreSQL user (e.g. `rapidcheck_user`) | Required |
| `POSTGRES_PASSWORD` | Strong database password | **Mandatory Secret** |
| `JWT_SECRET_KEY` | Cryptographic secret for signing JWTs (>= 32 chars) | **Mandatory Secret** |
| `REVIEW_SECRET_KEY` | HMAC key for doctor review signature attestation (>= 32 chars) | **Mandatory Secret** |
| `CORS_ORIGINS` | Allowed frontend domains (e.g. `https://rapidcheck.org`) | Required |
| `ENVIRONMENT` | Deployment environment (`production` or `development`) | Required |

---

## 3. Docker Compose Orchestration

### Launching the Stack
```bash
docker compose up -d --build
```

### Verification & Logs
```bash
# Check service status
docker compose ps

# View backend logs
docker compose logs -f backend

# View health check status
curl -f http://localhost:8000/api/health
```

### Stopping the Stack
```bash
docker compose down
```

---

## 4. Database Migrations

### SQLite to PostgreSQL Migration
If upgrading from a single-node SQLite instance to PostgreSQL:
```bash
python scripts/maintenance/migrate_sqlite_to_postgres.py
```
This script validates row counts, preserves foreign key relationships, verifies sync journals, and outputs a migration audit report to `artifacts/migration-validation/report.json`.

---

## 5. Security & Network Invariants
* **Database Isolation:** PostgreSQL port 5432 is never published to the public host; only backend containers within the Docker bridge network have network access.
* **Non-Root Containers:** Backend runs as non-root user `appuser` (UID 1001) with restricted permissions.
* **Fail-Closed Secrets:** If `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, or `REVIEW_SECRET_KEY` are omitted, Docker Compose will fail closed and abort startup.
