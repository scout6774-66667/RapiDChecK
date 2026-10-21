# Contributing to RapiDChecK — RuralHealth AI

Thank you for your interest in contributing to RapiDChecK! We welcome contributions to improve rural healthcare accessibility, clinical decision safety, and offline-first durability.

---

## Code of Conduct & Clinical Safety First

As a healthcare-critical platform, all contributions must uphold non-negotiable clinical safety invariants:
1. **Never introduce silent normal defaults:** Missing vitals must remain explicit (`None` / `null`) with an explicit `uncertainty_state`. Never silently assume normal blood pressure or heart rate.
2. **Preserve emergency short-circuiting:** Red-flag symptoms (hypertensive crisis, severe respiratory distress, high fever in pregnancy) must immediately short-circuit to emergency protocol.
3. **Preserve offline parity:** All clinical rules in TypeScript ([`evaluator.ts`](Health-AI-main/frontend/src/clinical/evaluator.ts)) and Python ([`screening_engine`](Health-AI-main/backend/ml_engine.py)) must produce 100% byte-for-byte identical outputs against [`golden_test_vectors.json`](Health-AI-main/clinical-rules/v2.0.0/golden_test_vectors.json).

---

## Development Setup

### 1. Backend (FastAPI / Python 3.11+)
```bash
cd Health-AI-main/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend (React 19 / TypeScript / Vite 8)
```bash
cd Health-AI-main/frontend
npm ci
npm run dev
```

---

## Verification Before Submitting PRs

Run all test suites and ensure zero failures:
```bash
# Frontend checks
cd Health-AI-main/frontend
npm run typecheck
npm run test:i18n
npm run test:role-selection
npm run build

# Backend checks
cd ../backend
./venv/bin/pytest
```

---

## Pull Request Guidelines

1. Create a feature branch: `git checkout -b feature/your-feature-name`.
2. Commit with concise, descriptive commit messages adhering to Conventional Commits:
   * `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `refactor: ...`.
3. Include tests covering any new endpoints, UI components, or clinical evaluator branches.
4. Ensure no secrets, `.env` files, or local SQLite `.db` binaries are committed.
