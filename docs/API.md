# RapiDChecK REST API Reference

## 1. Authentication & Base URL
* **Base URL:** `http://127.0.0.1:8000/api`
* **Authentication Header:** `Authorization: Bearer <jwt_access_token>`

---

## 2. Authentication Endpoints

### `POST /api/v2/auth/login`
Authenticates user credentials and issues an HS256 JWT access token.
* **Request Body:**
  ```json
  {
    "username": "dr.sharma@phc.in",
    "password": "password123"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "user": {
      "id": "usr_dr_sharma",
      "username": "dr.sharma",
      "email": "dr.sharma@phc.in",
      "full_name": "Dr. Rajesh Sharma",
      "role": "PHC_DOCTOR",
      "facility_id": "PHC_SONPUR"
    }
  }
  ```
* **Error Responses:** 401 Unauthorized (Invalid credentials, expired token, or disabled account).

### `POST /api/v2/auth/register`
Self-service registration for allowed roles (`PATIENT`, `ASHA_WORKER`, `DOCTOR`, `HEALTH_WORKER`).
* **Request Body:**
  ```json
  {
    "username": "sunil.das",
    "email": "sunil.das@rural.in",
    "password": "Password123!",
    "full_name": "Sunil Das",
    "role": "PATIENT",
    "village": "Sonpur",
    "phone": "+91 98765 43210"
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "status": "success",
    "user_id": "usr_pat_8f1b34",
    "role": "PATIENT"
  }
  ```

---

## 3. Synchronization Endpoints (Sync V2)

### `POST /api/v2/sync/push`
Batch push of client operations from offline Dexie Outbox.
* **Headers:** `Authorization: Bearer <token>`
* **Request Body:**
  ```json
  {
    "device_id": "device_tablet_01",
    "operations": [
      {
        "operation_id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
        "client_sequence": 1,
        "entity_type": "patient",
        "entity_id": "pat_12345",
        "operation_type": "CREATE",
        "base_server_version": 0,
        "payload": {
          "name": "Sunil Das",
          "age": 34,
          "gender": "Male",
          "village": "Sonpur"
        }
      }
    ]
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "results": [
      {
        "operation_id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
        "status": "APPLIED",
        "server_version": 1
      }
    ]
  }
  ```

### `GET /api/v2/sync/pull`
Incremental cursor-based sync pull from server journal.
* **Query Parameters:** `since_seq` (int), `limit` (int, default 100).
* **Response (200 OK):**
  ```json
  {
    "entries": [
      {
        "seq": 177,
        "entity_type": "patient",
        "entity_id": "pat_12345",
        "operation_type": "CREATE",
        "server_version": 1,
        "is_deleted": 0,
        "payload": { ... }
      }
    ],
    "max_seq": 177,
    "has_more": false
  }
  ```

---

## 4. Clinical Review Endpoints

### `POST /api/v2/reviews/{assessment_id}/attestation`
Seals a doctor's clinical review with cryptographic attestation.
* **Authorized Roles:** `PHC_DOCTOR`, `DISTRICT_OFFICER`.
* **Request Body:**
  ```json
  {
    "decision": "APPROVED",
    "notes": "Verified patient vitals. Normal presentation, supportive home care recommended."
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "APPROVED",
    "signature_hash": "a1b2c3d4e5f6...64-char-hex",
    "reviewed_by": "usr_dr_sharma",
    "reviewed_at": "2026-10-21T10:00:00Z"
  }
  ```

---

## 5. Health Check & Diagnostics

### `GET /api/health`
Liveness and readiness probe for Docker / Kubernetes.
* **Response (200 OK):**
  ```json
  {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2026-10-21T10:30:00Z"
  }
  ```
