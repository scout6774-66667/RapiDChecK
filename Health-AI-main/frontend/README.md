# RapiDChecK Frontend (React 19 + TypeScript + Vite PWA)

Progressive Web Application (PWA) designed for frontline ASHA/ANM health workers and Primary Health Centre (PHC) medical officers.

---

## 📴 Key Offline-First Capabilities

1. **Durable Dexie v4 Outbox:** All local mutations are committed in a single atomic transaction alongside an outbox queue operation.
2. **Local Evaluation Engine:** Client-side TypeScript evaluator executing versioned ruleset `v2.0.0` with 100% equivalence against Python backend golden vectors.
3. **Heartbeat & Auto-Sync Worker:** Background sync queue listener that pushes pending operations on network reconnection.
4. **Multilingual Speech-to-Text:** Voice intake supporting English, Hindi (हिंदी), and Bengali (বাংলা) via Web Speech API.

---

## 🚀 Development & Testing Commands

```powershell
# Install dependencies
npm install

# Run Vite dev server
npm run dev

# Run Production Build
npm run build

# Run Client-Side Golden Vector Tests
node test_golden_vectors.js

# Run Outbox Atomic Persistence & Recovery Tests
node test_task004_outbox.js

# Run 20 Offline Failure-Injection Scenarios Runner
python generate_offline_validation_report.py
```

For complete system architecture and documentation, see:
- [**Project Architecture (`docs/PROJECT.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/PROJECT.md)
- [**Database Specification (`docs/DATABASE.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/DATABASE.md)
- [**Authentication & RBAC (`docs/AUTH.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/AUTH.md)
- [**Features & Engine Specification (`docs/FEATURE.md`)**](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docs/FEATURE.md)
