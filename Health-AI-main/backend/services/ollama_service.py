"""
RuralHealth AI — Local Ollama AI Service & Data-Aware Inference
File: backend/services/ollama_service.py

Handles:
- Local LLM inference via Ollama runtime (Gemma 3 270M)
- Kolkata Health Data Engine integration (deterministic facts, no hallucinated numbers)
- Clinical Safety boundaries (non-prescribing, non-diagnostic, official risk separation)
- Multilingual adaptation (English, Bengali, Hindi)
- Multi-turn conversation memory (contextual pronoun resolution)
- Non-blocking offline resiliency
"""

import os
import json
import logging
import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator
from prompts.ruralhealth_ai import (
    build_system_prompt_for_language,
    sanitize_user_input,
    detect_target_language,
    check_clinical_safety_override,
    get_verified_clinical_topic_response,
    get_rule_based_fallback,
)
from services.kolkata_health_data_service import kolkata_data_service

logger = logging.getLogger("ruralhealth.ollama")

def is_generic_or_empty_response(text: str) -> bool:
    """
    Check if the LLM output is an unhelpful generic greeting, refusal, or loop.
    """
    if not text or len(text.strip()) < 30:
        return True
    
    t = text.strip().lower()
    generic_patterns = [
        'আমি আপনার প্রশ্নের উত্তর দিতে প্রস্তুত',
        'আপনি কি জানতে চান',
        'আপনি যদি নির্দিষ্ট কোনো বিষয়',
        'what would you like to know',
        'how can i help you today',
        'i am ready to answer',
        'please ask your question',
        'translation:',
        'wysokі',
    ]
    return any(p in t for p in generic_patterns)

def resolve_conversational_query(messages: List[Dict[str, str]], current_query: str) -> str:
    """
    Resolve contextual pronouns ('it', 'this', 'that') using multi-turn conversation memory.
    Example: User asks 'What is hypertension?' -> then 'How does the Kolkata dataset represent it?'
    -> resolves to 'How does the Kolkata dataset represent hypertension?'
    """
    q_lower = current_query.lower()
    pronoun_indicators = [' it', ' this', ' that', 'represent it', 'show it', 'contain it', 'about it']
    
    if any(p in q_lower for p in pronoun_indicators) and len(messages) >= 2:
        for msg in reversed(messages[:-1]):
            txt = msg.get("content", "").lower()
            for kw in ['hypertension', 'blood pressure', 'malaria', 'diabetes', 'vaccin', 'anemia', 'maternal']:
                if kw in txt:
                    return f"{current_query} ({kw})"
    return current_query


class OllamaService:
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.configured_model = os.getenv("OLLAMA_MODEL", "gemma3:270m").strip()
        self.timeout = float(os.getenv("OLLAMA_TIMEOUT", "45.0"))

    def get_base_url(self) -> str:
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")

    def get_configured_model(self) -> str:
        return os.getenv("OLLAMA_MODEL", "gemma3:270m").strip()

    async def check_health(self) -> Dict[str, Any]:
        """
        Check if Ollama local server is running and discover available models.
        """
        base_url = self.get_base_url()
        configured_model = self.get_configured_model()

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                    
                    # Check if configured model exists
                    active_model = configured_model
                    model_found = False
                    if models:
                        for m in models:
                            if m == configured_model or m.startswith(f"{configured_model}:") or configured_model.startswith(f"{m}:"):
                                active_model = m
                                model_found = True
                                break
                        if not model_found:
                            active_model = models[0]
                            model_found = True

                    return {
                        "available": model_found,
                        "status": "connected" if model_found else "offline",
                        "base_url": base_url,
                        "model": active_model,
                        "configured_model": configured_model,
                        "models_available": models,
                        "model_ready": model_found,
                        "provider": "ollama",
                        "runtime": "Local Ollama",
                        "local": True,
                        "message": f"Ollama connected with model {active_model}" if model_found else "Ollama connected but model not ready"
                    }
                else:
                    return {
                        "available": False,
                        "status": "offline",
                        "base_url": base_url,
                        "model": configured_model,
                        "models_available": [],
                        "model_ready": False,
                        "provider": "ollama",
                        "runtime": "Local Ollama",
                        "local": True,
                        "message": f"Ollama returned HTTP {res.status_code}"
                    }
        except httpx.ConnectError:
            return {
                "available": False,
                "status": "offline",
                "base_url": base_url,
                "model": configured_model,
                "models_available": [],
                "model_ready": False,
                "provider": "ollama",
                "runtime": "Local Ollama",
                "local": True,
                "message": "Ollama service is not running locally on port 11434"
            }
        except Exception as e:
            return {
                "available": False,
                "status": "offline",
                "base_url": base_url,
                "model": configured_model,
                "models_available": [],
                "model_ready": False,
                "provider": "ollama",
                "runtime": "Local Ollama",
                "local": True,
                "message": f"Ollama unreachable: {str(e)}"
            }

    async def get_available_models(self) -> List[str]:
        """
        List all installed model tags.
        """
        health = await self.check_health()
        return health.get("models_available", [])

    async def chat(
        self,
        messages: List[Dict[str, str]],
        language: Optional[str] = "en",
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """
        Generate chat response using local Ollama model (Gemma 3 270M) and Kolkata Health Data Engine.
        Enforces:
        - Safety Boundaries (non-diagnostic, non-prescribing, official clinical risk separation)
        - Dataset Context Grounding (exact deterministic calculations, no hallucinated numbers)
        - Multilingual Adaptation (English, Bengali, Hindi)
        - Multi-turn conversation memory
        """
        base_url = self.get_base_url()
        configured_model = self.get_configured_model()
        health = await self.check_health()

        # Last user message for intent analysis
        last_user_query = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user_query = m.get("content", "")
                break

        # Resolve conversational pronouns with chat history
        resolved_query = resolve_conversational_query(messages, last_user_query)

        # Detect target language from query content or requested language parameter
        target_lang = detect_target_language(last_user_query, language)
        active_model = health.get("model", configured_model)

        # 1. Enforce strict clinical safety boundaries (prescription & official risk requests)
        safety_override = check_clinical_safety_override(last_user_query, target_lang)
        if safety_override:
            return {
                "success": True,
                "response": safety_override,
                "model": active_model,
                "provider": "ruralhealth-governance",
                "local": True,
                "badge": "🛡️ CLINICAL SAFETY BOUNDARY",
                "source": "RuralHealth AI Governance"
            }

        # 2. Check Kolkata Health Dataset & Analytics Query
        dataset_ctx = kolkata_data_service.build_dataset_context_for_query(resolved_query)
        if dataset_ctx:
            badge = dataset_ctx.get("badge", "📊 DATASET INSIGHT")
            source = dataset_ctx.get("source", "HMIS & NFHS-5 Dataset")
            data_text = dataset_ctx.get("formatted_text", "")
            data_points = dataset_ctx.get("data_points")

            # Check if this is a combined question (asking for both general medical explanation and dataset insight)
            is_combined = any(k in resolved_query.lower() for k in ['what is', 'what does', 'explain', 'mean']) and any(k in resolved_query.lower() for k in ['dataset', 'kolkata', 'represent', 'show'])
            
            if is_combined:
                general_health_res = get_verified_clinical_topic_response(resolved_query, target_lang)
                if general_health_res:
                    combined_reply = (
                        f"### 🩺 GENERAL HEALTH INFORMATION\n\n{general_health_res}\n\n"
                        f"────────────────────────────────────────\n\n"
                        f"### 📊 KOLKATA DATASET INSIGHT\n\n{data_text}"
                    )
                    return {
                        "success": True,
                        "response": combined_reply,
                        "model": active_model,
                        "provider": "ollama",
                        "local": True,
                        "badge": "📊 DATASET & CLINICAL KNOWLEDGE",
                        "source": source,
                        "data_points": data_points
                    }

            return {
                "success": True,
                "response": data_text,
                "model": active_model,
                "provider": "kolkata-data-engine",
                "local": True,
                "badge": badge,
                "source": source,
                "data_points": data_points
            }

        # 3. Check for domain-verified clinical knowledge topic response (hypertension, ASHA screening guidelines, BP 160/100)
        topic_res = get_verified_clinical_topic_response(last_user_query, target_lang)
        if topic_res:
            return {
                "success": True,
                "response": topic_res,
                "model": active_model,
                "provider": "ruralhealth-knowledge",
                "local": True,
                "badge": "🩺 HEALTH EDUCATION",
                "source": "National Health Mission & Clinical Guidelines"
            }

        # 4. If Ollama is offline or model is not ready, return safe rule-based guidance
        if health.get("status") != "connected" or not health.get("models_available"):
            fallback_text = get_rule_based_fallback(last_user_query, target_lang)
            return {
                "success": True,
                "response": fallback_text,
                "model": "rule-based-fallback",
                "provider": "ruralhealth-offline-engine",
                "local": True,
                "badge": "📋 WORKFLOW GUIDANCE",
                "note": "Local Ollama runtime unavailable; served via offline clinical decision support."
            }

        # 5. Formulate language-specific system prompt and message payload for Gemma 3 270M
        system_prompt = build_system_prompt_for_language(target_lang, last_user_query)

        payload_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages[-15:]:  # Keep last 15 messages for multi-turn context
            role = "user" if msg.get("role") == "user" else "assistant"
            content = sanitize_user_input(msg.get("content", ""))
            payload_messages.append({"role": role, "content": content})

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(
                    f"{base_url}/api/chat",
                    json={
                        "model": active_model,
                        "messages": payload_messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "top_p": 0.85,
                            "repeat_penalty": 1.15,
                            "num_predict": 512,
                        }
                    }
                )

                if res.status_code == 200:
                    data = res.json()
                    msg_obj = data.get("message", {})
                    reply = msg_obj.get("content", "").strip()

                    # If model returned empty, generic greeting, or loop, enhance with verified clinical guidance
                    if is_generic_or_empty_response(reply):
                        reply = get_rule_based_fallback(last_user_query, target_lang)

                    return {
                        "success": True,
                        "response": reply,
                        "model": active_model,
                        "provider": "ollama",
                        "local": True,
                        "badge": "🩺 HEALTH EDUCATION",
                        "source": "Gemma 3 270M (Local)"
                    }
                else:
                    logger.warning(f"Ollama error {res.status_code}: {res.text}")
                    fallback_text = get_rule_based_fallback(last_user_query, target_lang)
                    return {
                        "success": True,
                        "response": fallback_text,
                        "model": active_model,
                        "provider": "ruralhealth-offline-engine",
                        "local": True,
                        "badge": "📋 WORKFLOW GUIDANCE",
                        "note": f"Ollama error {res.status_code}; fallback activated."
                    }

        except httpx.TimeoutException:
            logger.warning("Ollama request timed out; falling back to rule-based guidance.")
            fallback_text = get_rule_based_fallback(last_user_query, target_lang)
            return {
                "success": True,
                "response": fallback_text,
                "model": "rule-based-fallback",
                "provider": "ruralhealth-offline-engine",
                "local": True,
                "badge": "📋 WORKFLOW GUIDANCE",
                "note": "Request timed out; fallback activated."
            }
        except Exception as e:
            logger.error(f"Ollama chat error: {e}")
            fallback_text = get_rule_based_fallback(last_user_query, target_lang)
            return {
                "success": True,
                "response": fallback_text,
                "model": "rule-based-fallback",
                "provider": "ruralhealth-offline-engine",
                "local": True,
                "badge": "📋 WORKFLOW GUIDANCE",
                "note": f"Ollama communication error ({str(e)})."
            }

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        language: Optional[str] = "en",
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming chat generator using Ollama /api/chat with stream=True.
        """
        base_url = self.get_base_url()
        health = await self.check_health()
        last_user_query = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user_query = m.get("content", "")
                break

        resolved_query = resolve_conversational_query(messages, last_user_query)
        target_lang = detect_target_language(last_user_query, language)

        # Check safety override
        safety_override = check_clinical_safety_override(last_user_query, target_lang)
        if safety_override:
            yield json.dumps({
                "token": safety_override,
                "done": True,
                "provider": "ruralhealth-governance",
                "badge": "🛡️ CLINICAL SAFETY BOUNDARY",
                "local": True
            }) + "\n"
            return

        # Check dataset context
        dataset_ctx = kolkata_data_service.build_dataset_context_for_query(resolved_query)
        if dataset_ctx:
            yield json.dumps({
                "token": dataset_ctx.get("formatted_text", ""),
                "done": True,
                "provider": "kolkata-data-engine",
                "badge": dataset_ctx.get("badge", "📊 DATASET INSIGHT"),
                "source": dataset_ctx.get("source", "HMIS & NFHS-5"),
                "data_points": dataset_ctx.get("data_points"),
                "local": True
            }) + "\n"
            return

        # Check verified clinical knowledge topic
        topic_res = get_verified_clinical_topic_response(last_user_query, target_lang)
        if topic_res:
            yield json.dumps({
                "token": topic_res,
                "done": True,
                "provider": "ruralhealth-knowledge",
                "badge": "🩺 HEALTH EDUCATION",
                "local": True
            }) + "\n"
            return

        if health.get("status") != "connected" or not health.get("models_available"):
            fallback_text = get_rule_based_fallback(last_user_query, target_lang)
            yield json.dumps({
                "token": fallback_text,
                "done": True,
                "provider": "ruralhealth-offline-engine",
                "badge": "📋 WORKFLOW GUIDANCE"
            }) + "\n"
            return

        active_model = health.get("model", self.get_configured_model())
        system_prompt = build_system_prompt_for_language(target_lang, last_user_query)

        payload_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages[-15:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            content = sanitize_user_input(msg.get("content", ""))
            payload_messages.append({"role": role, "content": content})

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/chat",
                    json={
                        "model": active_model,
                        "messages": payload_messages,
                        "stream": True,
                        "options": {
                            "temperature": temperature,
                            "top_p": 0.85,
                            "repeat_penalty": 1.15,
                            "num_predict": 512,
                        }
                    }
                ) as response:
                    if response.status_code != 200:
                        fallback_text = get_rule_based_fallback(last_user_query, target_lang)
                        yield json.dumps({"token": fallback_text, "done": True, "provider": "ruralhealth-offline-engine"}) + "\n"
                        return

                    async for line in response.aiter_lines():
                        if line:
                            try:
                                chunk = json.loads(line)
                                token = chunk.get("message", {}).get("content", "")
                                done = chunk.get("done", False)
                                yield json.dumps({
                                    "token": token,
                                    "done": done,
                                    "model": active_model,
                                    "provider": "ollama",
                                    "badge": "🩺 HEALTH EDUCATION",
                                    "local": True
                                }) + "\n"
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            fallback_text = get_rule_based_fallback(last_user_query, target_lang)
            yield json.dumps({"token": fallback_text, "done": True, "provider": "ruralhealth-offline-engine"}) + "\n"


# Singleton instance
ollama_service = OllamaService()

