"""
test_phase2_reliability.py
===========================
Phase 2 reliability, Ollama integration, privacy, and security headers tests.
"""

import asyncio
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from main import app
from services.ollama_service import ollama_service
from prompts.ruralhealth_ai import sanitize_user_input

client = TestClient(app)

def test_pii_sanitization():
    """Verify patient PII is scrubbed before processing in AI prompts."""
    raw_prompt = "Patient Ramesh Kumar, phone +91 9876543210, ABHA 12-3456-7890-1234, email ramesh@gmail.com has chest pain."
    sanitized = sanitize_user_input(raw_prompt)

    # Identifiers must be removed or masked
    assert "9876543210" not in sanitized
    assert "12-3456-7890-1234" not in sanitized
    assert "ramesh@gmail.com" not in sanitized
    assert "[REDACTED_PHONE]" in sanitized
    assert "[REDACTED_ID]" in sanitized
    assert "[REDACTED_EMAIL]" in sanitized
    # Clinical symptoms must remain intact
    assert "chest pain" in sanitized

def test_ollama_unavailable_returns_error_not_fabricated():
    """Verify that when Ollama is unavailable, chat returns failure with retry info and does NOT fabricate answers."""
    with patch.object(ollama_service, "check_health", new_callable=AsyncMock) as mock_health:
        mock_health.return_value = {
            "available": False,
            "status": "unavailable",
            "message": "Ollama service is not running locally on port 11434"
        }

        # Ask a query requiring the LLM (not an offline rule-based clinical boundary)
        result = asyncio.run(ollama_service.chat([{"role": "user", "content": "Tell me home exercises for lower back pain"}]))

        assert result["success"] is False
        assert result["retryable"] is True
        assert "unavailable" in result["error"].lower()
        # Ensure no fabricated text is returned as a valid response
        assert result["response"] == ""

def test_ollama_timeout_handling():
    """Verify that an Ollama timeout returns a clean retryable error."""
    with patch.object(ollama_service, "check_health", new_callable=AsyncMock) as mock_health, \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        import httpx
        mock_health.return_value = {
            "available": True,
            "status": "connected",
            "model": "gemma3:270m",
            "models_available": ["gemma3:270m"]
        }
        mock_post.side_effect = httpx.TimeoutException("Request timed out")

        result = asyncio.run(ollama_service.chat([{"role": "user", "content": "Tell me home exercises for lower back pain"}]))

        assert result["success"] is False
        assert result["retryable"] is True
        assert "timed out" in result["error"].lower()
        assert result["response"] == ""

def test_ollama_health_endpoint_when_offline():
    """Verify /api/ai/ollama/health reports unavailable when Ollama is offline."""
    with patch.object(ollama_service, "check_health", new_callable=AsyncMock) as mock_health:
        mock_health.return_value = {
            "available": False,
            "status": "unavailable",
            "model": "gemma3:270m"
        }

        res = client.get("/api/ai/ollama/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "unavailable"
        assert data["available"] is False

def test_security_cache_control_headers():
    """Verify /api/ responses include Cache-Control: no-store to protect patient data from generic cache storage."""
    res = client.get("/api/health")
    assert res.status_code == 200
    cache_header = res.headers.get("cache-control", "")
    assert "no-store" in cache_header
    assert "private" in cache_header
    assert res.headers.get("pragma") == "no-cache"

def test_api_ai_chat_endpoint_delegation():
    """Verify authoritative /api/ai/chat delegates to Ollama and returns structured status."""
    with patch.object(ollama_service, "chat", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = {
            "success": True,
            "response": "Hypertension is high blood pressure.",
            "reply": "Hypertension is high blood pressure.",
            "model": "gemma3:270m",
            "provider": "ollama",
            "local": True,
            "badge": "🩺 HEALTH EDUCATION",
            "source": "Local Gemma 3 270M",
        }

        res = client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "What is hypertension?"}],
            "message": "What is hypertension?",
            "language": "en"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "Hypertension is high blood pressure." in data["response"]

def test_legacy_api_chat_endpoint_delegation():
    """Verify legacy /api/chat delegates to Ollama service and returns ChatResponse."""
    with patch.object(ollama_service, "chat", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = {
            "success": True,
            "response": "Managing diabetes requires regular monitoring.",
            "model": "gemma3:270m",
        }

        res = client.post("/api/chat", json={
            "messages": [{"role": "user", "content": "How to manage diabetes?"}],
            "language": "en"
        })
        assert res.status_code == 200
        data = res.json()
        assert "Managing diabetes requires regular monitoring." in data["reply"]
