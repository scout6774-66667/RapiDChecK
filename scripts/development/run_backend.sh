#!/usr/bin/env bash
# run_backend.sh — Launch FastAPI backend server with virtualenv & auto-reload
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/Health-AI-main/backend"

cd "${BACKEND_DIR}"

if [[ -f "./venv/bin/uvicorn" ]]; then
  echo "🚀 Starting RapiDChecK FastAPI Backend on http://127.0.0.1:8000 (venv)..."
  exec ./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
elif command -v uvicorn &>/dev/null; then
  echo "🚀 Starting RapiDChecK FastAPI Backend on http://127.0.0.1:8000 (system uvicorn)..."
  exec uvicorn main:app --host 127.0.0.1 --port 8000 --reload
else
  echo "❌ Error: uvicorn not found. Please activate your virtualenv or install requirements."
  exit 1
fi
