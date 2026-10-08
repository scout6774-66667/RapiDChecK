"""
gemini_client.py — Gemini API Integration for Medical Symptom Analysis
========================================================================
Sends symptoms to Google's Gemini API for disease prediction.
Returns structured predictions that can be combined with ML model results.
"""

import os
import json
import google.generativeai as genai
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))


class GeminiMedicalAnalyzer:
    """Gemini API client for medical symptom analysis."""
    
    def __init__(self):
        self._ready = False
        self._load_error: str = None
        self._model = None
        
        try:
            api_key = os.getenv("GEMINI_API_KEY", "")
            if not api_key or api_key == "your_gemini_api_key_here":
                self._load_error = "GEMINI_API_KEY not configured in backend/.env"
                print(f"[gemini] WARNING: {self._load_error}")
                return
            
            # Configure Gemini
            genai.configure(api_key=api_key)
            
            # Use Gemini 3.6 Flash for fast, cost-effective predictions
            self._model = genai.GenerativeModel(
                model_name="gemini-3.6-flash",
                generation_config=genai.GenerationConfig(
                    temperature=0.3,  # More deterministic for medical analysis
                    max_output_tokens=1024,
                )
            )
            
            self._ready = True
            print("[gemini] Initialized successfully with Gemini 2.0 Flash")
            
        except Exception as e:
            self._load_error = str(e)
            print(f"[gemini] ERROR initializing: {e}")
    
    @property
    def is_ready(self) -> bool:
        return self._ready
    
    def analyze_symptoms(self, symptoms: List[str]) -> Dict[str, Any]:
        """
        Send symptoms to Gemini for medical analysis.
        
        Parameters
        ----------
        symptoms : list of str
            List of symptom descriptions from the user.
        
        Returns
        -------
        dict with keys:
          predictions  — list of {condition, confidence, reasoning}
          raw_response — original Gemini response text
          error        — error message if failed
        """
        if not self._ready:
            return {
                "predictions": [],
                "raw_response": None,
                "error": self._load_error or "Gemini not initialized"
            }
        
        try:
            # Build medical analysis prompt
            symptoms_text = ", ".join(symptoms)
            
            prompt = f"""You are a medical expert AI analyzing patient symptoms for a rural health screening system in India.

Patient Symptoms: {symptoms_text}

Based on these symptoms, provide your medical analysis:

1. **Top 3 Most Likely Conditions**: List the 3 most probable conditions that match these symptoms.
2. **Confidence Level**: For each condition, rate your confidence (High/Medium/Low) based on how well symptoms match.
3. **Brief Reasoning**: Explain why each condition is likely given these symptoms.
4. **Urgency Assessment**: Is this urgent (seek immediate care), semi-urgent (see doctor within days), or routine?

**IMPORTANT MEDICAL DISCLAIMERS**:
- This is for screening purposes only, not a diagnosis
- Always recommend consulting a qualified healthcare professional
- In emergencies (chest pain, severe bleeding, breathing difficulty), immediately advise calling emergency services

Respond in this exact JSON format:
```json
{{
  "predictions": [
    {{
      "condition": "Condition Name",
      "confidence": "High/Medium/Low",
      "reasoning": "Brief explanation"
    }}
  ],
  "urgency": "Urgent/Semi-Urgent/Routine",
  "general_advice": "Brief advice for the patient"
}}
```
"""
            
            # Call Gemini API
            response = self._model.generate_content(prompt)
            
            # Parse response
            response_text = response.text
            
            # Try to extract JSON from response
            predictions = self._parse_gemini_response(response_text)
            
            return {
                "predictions": predictions.get("predictions", []),
                "urgency": predictions.get("urgency", "Unknown"),
                "general_advice": predictions.get("general_advice", ""),
                "raw_response": response_text,
                "error": None
            }
            
        except Exception as e:
            error_msg = str(e)
            if "quota" in error_msg.lower() or "429" in error_msg:
                return {
                    "predictions": [],
                    "raw_response": None,
                    "error": "Gemini API quota exceeded. Using ML model only."
                }
            return {
                "predictions": [],
                "raw_response": None,
                "error": f"Gemini API error: {error_msg}"
            }
    
    def _parse_gemini_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Gemini's response into structured format."""
        try:
            # Try to find JSON in the response
            import re
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON object directly
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    # Fallback: create predictions from text
                    return self._fallback_parse(response_text)
            
            return json.loads(json_str)
            
        except json.JSONDecodeError:
            return self._fallback_parse(response_text)
    
    def _fallback_parse(self, text: str) -> Dict[str, Any]:
        """Fallback parsing when JSON extraction fails."""
        # Simple text extraction
        predictions = []
        lines = text.split('\n')
        
        for line in lines:
            if any(keyword in line.lower() for keyword in ['condition:', 'diagnosis:', 'likely:']):
                # Extract condition name
                condition = line.split(':', 1)[1].strip() if ':' in line else line.strip()
                if condition:
                    predictions.append({
                        "condition": condition,
                        "confidence": "Medium",
                        "reasoning": "Extracted from AI analysis"
                    })
        
        return {
            "predictions": predictions[:3],  # Top 3
            "urgency": "Unknown",
            "general_advice": "Please consult a healthcare professional for proper evaluation."
        }


# Module-level singleton
gemini_analyzer = GeminiMedicalAnalyzer()
