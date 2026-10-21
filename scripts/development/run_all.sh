#!/usr/bin/env bash
# run_all.sh — Run both backend and frontend servers simultaneously
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

trap 'kill $(jobs -p) 2>/dev/null || true' EXIT SIGINT SIGTERM

echo "================================================================="
echo "🏥 RapiDChecK — RuralHealth AI Full-Stack Development Launcher"
echo "================================================================="

"${SCRIPT_DIR}/run_backend.sh" &
BACKEND_PID=$!

sleep 2

"${SCRIPT_DIR}/run_frontend.sh" &
FRONTEND_PID=$!

echo ""
echo "✅ Backend PID: ${BACKEND_PID} (http://127.0.0.1:8000)"
echo "✅ Frontend PID: ${FRONTEND_PID} (http://localhost:5173)"
echo "👉 Press Ctrl+C to terminate both servers cleanly."
echo ""

wait
