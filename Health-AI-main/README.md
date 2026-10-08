# RapiDChecK - RuralHealth AI 🏥🤖
> **Clinically Governed, Offline-First Disease Triage & Rural Health Access Platform**

Please refer to the comprehensive project documentation in the root directory:
- [**Main Project README**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/README.md)
- [**Project Architecture Guide (`docs/PROJECT.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/PROJECT.md)
- [**Database Architecture & Schema (`docs/DATABASE.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/DATABASE.md)
- [**Authentication, RBAC & Attestation (`docs/AUTH.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/AUTH.md)
- [**Feature & Clinical Engine Specification (`docs/FEATURE.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/FEATURE.md)
- [**System Validation Records (`docs/validation/`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/validation/)

---

### Backend Quickstart:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend Quickstart:
```powershell
cd frontend
npm install
npm run dev
```

### Complete Test Suite:
```powershell
cd backend
pytest test_clinical_safety.py test_golden_vectors.py test_sync_v2.py test_auth_review.py test_adversarial_security.py -v
```
