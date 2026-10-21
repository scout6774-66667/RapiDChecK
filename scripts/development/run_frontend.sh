#!/usr/bin/env bash
# run_frontend.sh — Launch Vite React frontend development server
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/Health-AI-main/frontend"

cd "${FRONTEND_DIR}"

echo "⚡ Starting RapiDChecK React/Vite Frontend on http://localhost:5173..."
exec npm run dev
