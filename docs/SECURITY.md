# Security & Cryptographic Architecture

## 1. Architectural Security Invariants

RapiDChecK enforces strict defense-in-depth across the entire request lifecycle.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App (PWA)
    participant Auth as Auth Middleware (FastAPI)
    participant RBAC as Role Permissions Engine
    participant Tenancy as Facility Tenancy Filter
    participant DB as Relational Store (PostgreSQL)
    participant Audit as Immutable Audit Log

    Client->>Auth: Request with Bearer JWT
    alt Missing, Expired, or Tampered Token
        Auth-->>Client: 401 Unauthorized
    else Valid Token
        Auth->>RBAC: Validate Role Permissions for Route
        alt Role Lacks Permission
            RBAC-->>Client: 403 Forbidden
        else Permission Granted
            RBAC->>Tenancy: Enforce Facility Tenancy (facility_id)
            alt Cross-Facility Access (Non-Admin)
                Tenancy-->>Client: 403 Forbidden
            else Tenancy Validated
                Tenancy->>DB: Execute Query / Mutation
                DB->>Audit: Append AuditEventModel (Action, User, Timestamp)
                DB-->>Client: 200 OK / Response Payload
            end
        end
    end
```

---

## 2. Password Hashing & Key Derivation
* **Algorithm:** PBKDF2-HMAC-SHA256
* **Iterations:** 600,000 (compliant with OWASP / NIST SP 800-63B standards)
* **Salt:** 16 bytes of cryptographically secure random entropy per user via `secrets.token_bytes(16)`.
* **Storage Format:** `$pbkdf2-sha256$600000$<salt_hex>$<hash_hex>`

---

## 3. Role-Based Access Control (RBAC) Matrix

| Permission | `PATIENT` | `ASHA_WORKER` | `PHC_DOCTOR` | `DISTRICT_OFFICER` | `SYSTEM_ADMIN` |
|---|:---:|:---:|:---:|:---:|:---:|
| `patients:read` | Authorized (Self) | Authorized (Assigned Villages) | Authorized (Facility) | Authorized (District) | Authorized (All) |
| `patients:write` | ❌ | Authorized | Authorized | ❌ | Authorized |
| `assessments:create` | Authorized | Authorized | Authorized | ❌ | Authorized |
| `assessments:review` | ❌ | ❌ | Authorized | Authorized | Authorized |
| `analytics:read` | ❌ | ❌ | Authorized (Facility) | Authorized (District) | Authorized (All) |
| `system:admin` | ❌ | ❌ | ❌ | ❌ | Authorized |

---

## 4. Cryptographic Review Attestation
When a medical officer approves or modifies a clinical triage assessment:
$$\text{Signature} = \text{HMAC-SHA256}(K_{\text{review}}, \text{review\_id} \parallel \text{assessment\_id} \parallel \text{doctor\_id} \parallel \text{decision} \parallel \text{timestamp})$$
* This 64-character hexadecimal signature is permanently stored in `ClinicalReviewModel.signature_hash`.
* Any subsequent tampering with the assessment record invalidates the signature hash upon audit.
