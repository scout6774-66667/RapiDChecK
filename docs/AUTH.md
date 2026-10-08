# Authentication, Authorization & Cryptographic Attestation Specification
**System:** RapiDChecK / RuralHealth AI  
**Authentication Standard:** PBKDF2-HMAC-SHA256 (600,000 iterations) + JSON Web Tokens (PyJWT HS256)  
**Authorization Model:** Role-Based Access Control (RBAC) + Multi-Tenant Facility Isolation  
**Attestation Standard:** Server-Side Cryptographic Attestation (HMAC-SHA256 Canonical Serialization)

---

## 1. Authentication Architecture & Token Lifecycle

Authentication is implemented in [`backend/auth_service.py`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/Health-AI-main/backend/auth_service.py) with zero client-side privilege escalation trust.

```
Frontline Worker / Doctor               FastAPI Auth Endpoint                PostgreSQL DB
        │                                        │                                 │
        ├────── POST /api/v2/auth/login ────────►│                                 │
        │       {username, password}             ├──── Query user by username ────►│
        │                                        │◄─── Return User Record ─────────┤
        │                                        │
        │                                        ├── Verify PBKDF2 Hash (600k iter)
        │                                        ├── Check is_active == 1
        │                                        ├── Update last_login_at
        │                                        │
        │                                        ├── Generate JWT with Claims:
        │                                        │   • sub (user_id)
        │                                        │   • username, role, facility_id
        │                                        │   • iss, aud, exp, iat
        │                                        │
        │◄───── Return 200 OK + JWT Token ───────┤
```

### 1.1 Password Hashing Specification
- **Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2)
- **Pseudorandom Function (PRF):** HMAC-SHA256
- **Iteration Count:** 600,000 iterations (exceeding OWASP recommendations)
- **Salt:** 16-byte cryptographically secure random bytes generated via `secrets.token_bytes(16)`
- **Storage Format:** `pbkdf2_sha256${iterations}${salt_hex}${derived_key_hex}`

### 1.2 JWT Claims & Validation Policy
Every access token generated contains explicit claims:
- `sub`: User UUID (`UserModel.id`)
- `username`: Login handle
- `role`: Canonical role (`ASHA_WORKER`, `PHC_DOCTOR`, `DISTRICT_OFFICER`, `SYSTEM_ADMIN`)
- `facility_id`: Primary Health Centre tenancy boundary (e.g. `PHC_NORTH`)
- `iss`: `rapidcheck-auth-service` (validated on decode)
- `aud`: `rapidcheck-client-app` (validated on decode)
- `exp`: UTC expiration timestamp (default: 1440 minutes / 24 hours)
- `iat`: UTC issuance timestamp

---

## 2. Role-Based Access Control (RBAC) Permission Matrix

The system enforces strict least-privilege role boundaries:

| Permission Name | `ASHA_WORKER` | `PHC_DOCTOR` | `DISTRICT_OFFICER` | `SYSTEM_ADMIN` |
|---|:---:|:---:|:---:|:---:|
| `patients:create` | ✅ | ✅ | ❌ | ✅ |
| `patients:read` | ✅ | ✅ | ✅ | ✅ |
| `patients:update` | ❌ | ✅ | ❌ | ✅ |
| `patients:delete` | ❌ | ❌ | ❌ | ✅ |
| `assessments:create` | ✅ | ✅ | ❌ | ✅ |
| `assessments:read` | ✅ | ✅ | ✅ | ✅ |
| `assessments:update` | ❌ | ✅ | ❌ | ✅ |
| `assessments:delete` | ❌ | ❌ | ❌ | ✅ |
| `reviews:view_queue` | ❌ | ✅ | ✅ | ✅ |
| `reviews:perform` | ❌ | ✅ | ❌ | ✅ |
| `reviews:override` | ❌ | ✅ | ❌ | ✅ |
| `referrals:update` | ❌ | ✅ | ❌ | ✅ |
| `analytics:view` | ❌ | ❌ | ✅ | ✅ |
| `audit:read` | ❌ | ❌ | ✅ | ✅ |
| `admin:manage_users` | ❌ | ❌ | ❌ | ✅ |
| `sync:push` | ✅ | ✅ | ❌ | ✅ |
| `sync:pull` | ✅ | ✅ | ✅ | ✅ |

### 2.1 Enforcement Mechanism
Permissions are enforced at the FastAPI route level via the `require_permissions(...)` dependency:
```python
@app.post("/api/v2/reviews/{assessment_id}/submit")
def submit_review_decision(
    assessment_id: str,
    review_data: ClinicalReviewSubmitRequest,
    current_user: UserModel = Depends(require_permissions("reviews:perform")),
    db: Session = Depends(get_db)
):
    ...
```

---

## 3. Object-Level & Multi-Tenant Facility Authorization

In addition to role permissions, the backend enforces object-level facility tenancy boundaries:
- A medical officer registered at facility `PHC_NORTH` cannot submit reviews or modify assessments registered at facility `PHC_SOUTH`.
- Violation of facility boundaries immediately raises `403 Forbidden` (`detail="Facility access violation"`).
- `SYSTEM_ADMIN` is the only role granted cross-facility administrative override privileges.

---

## 4. Server-Side Cryptographic Attestation (HMAC-SHA256)

### 4.1 Terminology & Architecture
> **Important Note:** This capability is formally designated as **SERVER-SIDE CRYPTOGRAPHIC ATTESTATION**. It uses a server-managed HMAC-SHA256 secret key over a canonical deterministic payload. It is distinct from client-side PKI asymmetric digital signatures.

### 4.2 Canonical Payload Serialization
To guarantee deterministic tamper resistance, the canonical review string binds all clinical context attributes:
$$\text{Payload} = \text{review\_id} \,\|\, \text{assessment\_id} \,\|\, \text{reviewer\_id} \,\|\, \text{decision} \,\|\, \text{timestamp} \,\|\, \text{override\_reason} \,\|\, \text{workflow\_version} \,\|\, \text{ruleset\_version}$$

### 4.3 Key Management & Security Properties
- **Secret Isolation:** `HMAC_SECRET_KEY` resides strictly on the backend server (`config.py` / environment variables). It is never sent to the browser, stored in `localStorage`, or exposed in JavaScript client bundles.
- **Key Rotation Support:** `verify_server_attestation(...)` accepts explicit secret keys to support zero-downtime key rotation policies.

---

## 5. Adversarial Security Verification Suite

The comprehensive test suite [`backend/test_adversarial_security.py`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/Health-AI-main/backend/test_adversarial_security.py) executes 23 live adversarial attack vectors:

### 5.1 Authentication Suite (`AUTH-001` – `AUTH-009`)
- `AUTH-001`: Valid login issues JWT with correct role and facility claims (**PASS**).
- `AUTH-002`: Invalid password rejected with `401 Unauthorized` (**PASS**).
- `AUTH-003`: Expired JWT token rejected with `401 Unauthorized` (**PASS**).
- `AUTH-004`: Tampered JWT signature rejected with `401 Unauthorized` (**PASS**).
- `AUTH-007`: Token with `"alg": "none"` header attack rejected with `401 Unauthorized` (**PASS**).
- `AUTH-008`: Deactivated/disabled user login blocked with `403 Forbidden` (**PASS**).
- `AUTH-009`: Revoked or non-existent user token rejected with `401 Unauthorized` (**PASS**).

### 5.2 RBAC & Authorization Suite (`RBAC-001` – `RBAC-005`)
- `RBAC-001`: ASHA Worker attempting clinical review submission blocked with `403 Forbidden` (**PASS**).
- `RBAC-002`: ASHA Worker attempting clinical override blocked with `403 Forbidden` (**PASS**).
- `RBAC-003`: District Officer attempting clinical review blocked with `403 Forbidden` (**PASS**).
- `RBAC-004`: Cross-facility review submission blocked with `403 Forbidden` (**PASS**).
- `RBAC-005`: Forged frontend role override header (`X-Role-Override: PHC_DOCTOR`) rejected with `403 Forbidden` (**PASS**).

### 5.3 Review Governance Suite (`REV-001` – `REV-009`)
- `REV-001`: Doctor approval transitions state to `APPROVED` with attestation signature (**PASS**).
- `REV-004`: Empty clinical notes (< 5 chars) rejected with `422 Unprocessable Content` (**PASS**).
- `REV-005`: Modified decision without `override_reason` rejected with `422 Unprocessable Content` (**PASS**).
- `REV-006`: Emergency downgrade strictly requires clinical justification (**PASS**).

### 5.4 Attestation Tamper Detection Suite (`ATT-001` – `ATT-009`)
- `ATT-001`: Valid attestation passes verification (**PASS**).
- `ATT-002`: Tampering with `reviewer_id` fails verification (**PASS**).
- `ATT-003`: Tampering with `decision` fails verification (**PASS**).
- `ATT-004`: Tampering with `override_reason` fails verification (**PASS**).
- `ATT-005`: Tampering with `timestamp` fails verification (**PASS**).
- `ATT-006`: Tampering with `assessment_id` fails verification (**PASS**).
- `ATT-009`: Key rotation invalidates signatures created under old keys (**PASS**).
