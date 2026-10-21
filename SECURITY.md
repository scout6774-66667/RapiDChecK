# Security Policy — RapiDChecK / RuralHealth AI

## 1. Scope & Healthcare Security Philosophy

RapiDChecK processes sensitive health data (demographics, vital signs, clinical assessments, referrals, and teleconsultations). As a healthcare platform, security, patient data confidentiality, and system integrity are paramount.

We strictly adhere to:
* **Zero Client-Side Trust:** Frontend state never confers backend permissions. All authorization is validated via PBKDF2-HMAC-SHA256 password hashing (600,000 iterations), signed HS256 JWTs, and server-side RBAC.
* **Tenant & Facility Isolation:** Records belong to specific primary health care centres (`facility_id`). Cross-facility access is denied unless performed by an authorized district health officer or system admin.
* **Cryptographic Attestation:** Clinician reviews are sealed with HMAC-SHA256 signatures (`compute_signature_hash`) to guarantee audit trail tamper resistance.
* **Offline Durability & Soft Deletion:** Deletion creates immutable soft-delete tombstones and audit event logs (`AuditEventModel`) to prevent accidental record destruction or sync resurrection.

---

## 2. Supported Versions

| Version | Supported | Security Updates |
|---|---|---|
| `2.0.x-PROD` | Yes | Active maintenance & continuous security patches |
| `< 2.0.0` | No | Deprecated legacy releases |

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability, please **do NOT report it in public GitHub issues**.

Instead, email our security team directly:
* **Email:** `security@rapidcheck.internal` / `sohamghosh1762@gmail.com`
* **Subject:** `[SECURITY DISCLOSURE] RapiDChecK - Vulnerability Report`

Please include:
1. Description of the vulnerability and attack vector.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. The affected components (`backend`, `frontend`, `auth_service`, `sync_service`, `db`).
4. Any potential impact on patient privacy or clinical decision support integrity.

### Disclosure Timeline
* **Initial Response:** Within 24 hours.
* **Triage & Remediation Plan:** Within 72 hours.
* **Coordinated Public Disclosure:** After a fix has been verified and deployed to production.

---

## 4. Key Security Invariants & Rules

1. **No Tracked Secrets:** Production keys (`JWT_SECRET_KEY`, `REVIEW_SECRET_KEY`, `POSTGRES_PASSWORD`, `SNOWFLAKE_PASSWORD`) must never be committed to Git. Only safe `.env.example` templates with empty placeholders are allowed in version control.
2. **Environment Variable Separation:** `VITE_*` public variables in frontend must never contain backend private secrets or signing keys.
3. **Database Network Isolation:** In Docker Compose deployments, PostgreSQL port 5432 is strictly internal to the container network and never exposed to the public host.
4. **Adversarial Mitigation:** The backend is regression-tested with 23 live adversarial test cases (`test_adversarial_security.py`) covering SQL injection, JWT signature stripping (`none` algorithm), token replay, and cross-facility IDOR.
