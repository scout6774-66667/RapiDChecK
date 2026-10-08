"""
google_search.py — Google Search Integration for Medical Symptom Analysis
==========================================================================
Searches Google for medical information about symptoms and extracts
relevant conditions and advice. Works without API keys using web scraping.
"""

import re
import time
import requests
from typing import List, Dict, Any, Optional
from urllib.parse import quote_plus


class GoogleMedicalSearch:
    """
    Searches Google for medical information about symptoms.
    Extracts conditions, advice, and urgency information.
    """
    
    # Common medical conditions database for fallback
    MEDICAL_KNOWLEDGE = {
        "fever": {
            "conditions": ["Infection", "Viral Fever", "Bacterial Infection", "Malaria", "Dengue"],
            "urgency": "Semi-Urgent",
            "advice": "Stay hydrated, rest, and monitor temperature. If fever >102°F persists >2 days, visit PHC."
        },
        "cough": {
            "conditions": ["Respiratory Infection", "Bronchitis", "Common Cold", "TB (if persistent)", "Allergy"],
            "urgency": "Semi-Urgent",
            "advice": "Drink warm water, steam inhalation. If cough >2 weeks or with blood, get tested for TB."
        },
        "fatigue": {
            "conditions": ["Anemia", "Diabetes", "Hypothyroidism", "Chronic Fatigue", "Depression"],
            "urgency": "Routine",
            "advice": "Ensure proper nutrition, iron-rich foods, adequate sleep. Get CBC and blood sugar tested."
        },
        "headache": {
            "conditions": ["Tension Headache", "Migraine", "Hypertension", "Sinusitis", "Eye Strain"],
            "urgency": "Routine",
            "advice": "Rest in dark room, stay hydrated. If severe/sudden, seek immediate medical attention."
        },
        "chest pain": {
            "conditions": ["Angina", "Muscle Strain", "GERD", "Anxiety", "Heart Attack (urgent)"],
            "urgency": "Urgent",
            "advice": "CHEST PAIN CAN BE SERIOUS. If accompanied by sweating, shortness of breath, call 108 immediately."
        },
        "shortness of breath": {
            "conditions": ["Asthma", "COPD", "Heart Failure", "Pneumonia", "Anemia"],
            "urgency": "Urgent",
            "advice": "If severe difficulty breathing, call 108 immediately. Sit upright and try to stay calm."
        },
        "dizziness": {
            "conditions": ["Vertigo", "Hypotension", "Anemia", "Dehydration", "Inner Ear Problem"],
            "urgency": "Semi-Urgent",
            "advice": "Sit or lie down, drink water. If persistent or with fainting, visit PHC immediately."
        },
        "nausea": {
            "conditions": ["Gastritis", "Food Poisoning", "Pregnancy", "Migraine", "Appendicitis"],
            "urgency": "Semi-Urgent",
            "advice": "Drink clear fluids, avoid solid food temporarily. If persistent >24hrs, visit PHC."
        },
        "weakness": {
            "conditions": ["Anemia", "Diabetes", "Electrolyte Imbalance", "Malnutrition", "Kidney Disease"],
            "urgency": "Routine",
            "advice": "Eat nutritious food, stay hydrated. Get basic blood tests done at PHC."
        },
        "night sweats": {
            "conditions": ["TB", "Menopause", "Lymphoma", "Infection", "Hypoglycemia"],
            "urgency": "Semi-Urgent",
            "advice": "Persistent night sweats with cough/weight loss needs TB screening. Visit PHC."
        },
        "weight loss": {
            "conditions": ["Diabetes", "Hyperthyroidism", "Cancer", "TB", "Malabsorption"],
            "urgency": "Semi-Urgent",
            "advice": "Unexplained weight loss needs investigation. Get CBC, TFT, and blood sugar tested."
        },
        "swelling": {
            "conditions": ["Edema", "Kidney Disease", "Heart Failure", "Liver Disease", "Injury"],
            "urgency": "Semi-Urgent",
            "advice": "Elevate affected area. If sudden/widespread, visit PHC for evaluation."
        },
        "vomiting": {
            "conditions": ["Food Poisoning", "Gastritis", "Appendicitis", "Migraine", "Infection"],
            "urgency": "Semi-Urgent",
            "advice": "Sip ORS water, avoid solid food. If blood in vomit or severe pain, seek emergency care."
        },
        "diarrhea": {
            "conditions": ["Gastroenteritis", "Food Poisoning", "IBS", "Infection", "Cholera"],
            "urgency": "Semi-Urgent",
            "advice": "Drink ORS frequently. If bloody diarrhea or dehydration, visit PHC immediately."
        },
        "joint pain": {
            "conditions": ["Arthritis", "Gout", "Rheumatoid Arthritis", "Injury", "Lupus"],
            "urgency": "Routine",
            "advice": "Rest, ice, and anti-inflammatory. If persistent/swollen, get evaluated at PHC."
        },
        "back pain": {
            "conditions": ["Muscle Strain", "Disc Problem", "Kidney Stone", "Spondylosis", "Posture Issue"],
            "urgency": "Routine",
            "advice": "Rest, hot compress, avoid heavy lifting. If with leg numbness, visit PHC."
        },
        "skin rash": {
            "conditions": ["Allergic Reaction", "Eczema", "Fungal Infection", "Psoriasis", "Infection"],
            "urgency": "Routine",
            "advice": "Keep area clean and dry. Avoid scratching. If spreading or with fever, visit PHC."
        },
        "frequent urination": {
            "conditions": ["Diabetes", "UTI", "Prostate Issue", "Overactive Bladder", "Kidney Problem"],
            "urgency": "Semi-Urgent",
            "advice": "Get blood sugar and urine tests. If with burning/pain, likely UTI - visit PHC."
        },
        "increased thirst": {
            "conditions": ["Diabetes", "Dehydration", "Diabetes Insipidus", "Hypercalcemia"],
            "urgency": "Semi-Urgent",
            "advice": "Excessive thirst often indicates diabetes. Get fasting blood sugar tested immediately."
        },
        "blurred vision": {
            "conditions": ["Diabetes", "Hypertension", "Cataract", "Glaucoma", "Eye Strain"],
            "urgency": "Semi-Urgent",
            "advice": "If sudden vision change, visit eye specialist. Also check blood sugar and BP."
        },
        "palpitations": {
            "conditions": ["Arrhythmia", "Anxiety", "Hyperthyroidism", "Anemia", "Heart Disease"],
            "urgency": "Semi-Urgent",
            "advice": "Sit down, breathe slowly. If persistent or with chest pain, seek emergency care."
        }
    }
    
    def __init__(self):
        self._ready = True
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    @property
    def is_ready(self) -> bool:
        return self._ready
    
    def search_symptoms(self, symptoms: List[str]) -> Dict[str, Any]:
        """
        Search for medical information about symptoms.
        
        Parameters
        ----------
        symptoms : list of str
            List of symptom descriptions.
        
        Returns
        -------
        dict with:
          predictions   — list of {condition, confidence, reasoning, source}
          search_results — Google search results snippets
          urgency       — urgency level
          advice        — general medical advice
        """
        results = {
            "predictions": [],
            "search_results": [],
            "urgency": "Unknown",
            "advice": "",
            "error": None
        }
        
        try:
            # Build search query
            symptoms_text = ", ".join(symptoms[:5])  # Limit to 5 symptoms
            query = f"medical symptoms {symptoms_text} possible conditions diagnosis"
            
            # Search Google
            search_results = self._google_search(query)
            results["search_results"] = search_results[:5]  # Top 5 results
            
            # Extract predictions from search results and knowledge base
            predictions = self._extract_predictions(symptoms, search_results)
            results["predictions"] = predictions
            
            # Determine urgency
            results["urgency"] = self._determine_urgency(symptoms)
            
            # Generate advice
            results["advice"] = self._generate_advice(symptoms)
            
        except Exception as e:
            print(f"[google_search] Error: {e}")
            # Fallback to knowledge base only
            predictions = self._extract_predictions_from_knowledge(symptoms)
            results["predictions"] = predictions
            results["urgency"] = self._determine_urgency(symptoms)
            results["advice"] = self._generate_advice(symptoms)
        
        return results
    
    def _google_search(self, query: str, num_results: int = 5) -> List[Dict[str, str]]:
        """
        Perform Google search and extract results.
        """
        try:
            url = f"https://www.google.com/search?q={quote_plus(query)}&num={num_results}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            # Parse search results
            results = self._parse_google_html(response.text)
            return results[:num_results]
            
        except Exception as e:
            print(f"[google_search] Search failed: {e}")
            return []
    
    def _parse_google_html(self, html: str) -> List[Dict[str, str]]:
        """Parse Google search results from HTML."""
        results = []
        
        # Simple regex-based extraction (Google's HTML structure changes frequently)
        # Extract titles and snippets from search results
        
        # Look for search result blocks
        # Google uses various class names, but we can look for common patterns
        
        # Extract text content that looks like medical information
        medical_keywords = [
            "symptom", "condition", "disease", "diagnosis", "treatment",
            "fever", "infection", "diabetes", "hypertension", "cancer",
            "TB", "malaria", "anemia", "heart", "lung", "kidney"
        ]
        
        # Split HTML into text segments
        text_segments = re.split(r'<[^>]+>', html)
        
        for segment in text_segments:
            segment = segment.strip()
            if len(segment) < 20:  # Skip short segments
                continue
            
            # Check if segment contains medical keywords
            if any(keyword.lower() in segment.lower() for keyword in medical_keywords):
                # Clean the segment
                cleaned = re.sub(r'\s+', ' ', segment).strip()
                if cleaned and len(cleaned) > 30:
                    results.append({
                        "snippet": cleaned[:200],  # Limit length
                        "source": "Google Search"
                    })
        
        return results
    
    def _extract_predictions(
        self,
        symptoms: List[str],
        search_results: List[Dict[str, str]]
    ) -> List[Dict[str, Any]]:
        """
        Extract medical predictions from search results and knowledge base.
        """
        predictions = []
        
        # First, get predictions from knowledge base
        kb_predictions = self._extract_predictions_from_knowledge(symptoms)
        predictions.extend(kb_predictions)
        
        # Then extract from search results
        for result in search_results[:3]:  # Top 3 results
            snippet = result.get("snippet", "")
            
            # Extract conditions from snippet
            conditions = self._extract_conditions_from_text(snippet)
            
            for condition in conditions[:2]:  # Top 2 per result
                # Check if this condition is already in predictions
                existing = [p for p in predictions if condition.lower() in p["condition"].lower()]
                if not existing:
                    predictions.append({
                        "condition": condition,
                        "confidence": "Medium",
                        "reasoning": f"Found in medical search results: {snippet[:100]}...",
                        "source": "Google Search"
                    })
        
        # Limit to top 5 predictions
        return predictions[:5]
    
    def _extract_predictions_from_knowledge(self, symptoms: List[str]) -> List[Dict[str, Any]]:
        """Extract predictions from local knowledge base."""
        predictions = []
        conditions_count = {}
        
        for symptom in symptoms:
            symptom_lower = symptom.lower().strip()
            
            # Check exact match
            if symptom_lower in self.MEDICAL_KNOWLEDGE:
                info = self.MEDICAL_KNOWLEDGE[symptom_lower]
                for condition in info["conditions"]:
                    conditions_count[condition] = conditions_count.get(condition, 0) + 1
            
            # Check partial matches
            for key in self.MEDICAL_KNOWLEDGE:
                if key in symptom_lower or symptom_lower in key:
                    info = self.MEDICAL_KNOWLEDGE[key]
                    for condition in info["conditions"]:
                        conditions_count[condition] = conditions_count.get(condition, 0) + 1
        
        # Sort by frequency and create predictions
        sorted_conditions = sorted(conditions_count.items(), key=lambda x: x[1], reverse=True)
        
        for condition, count in sorted_conditions[:5]:
            confidence = "High" if count >= 3 else "Medium" if count >= 2 else "Low"
            predictions.append({
                "condition": condition,
                "confidence": confidence,
                "reasoning": f"Matches {count} symptom(s) in medical knowledge base",
                "source": "Medical Knowledge Base"
            })
        
        return predictions
    
    def _extract_conditions_from_text(self, text: str) -> List[str]:
        """Extract medical conditions from text."""
        conditions = []
        
        # Common medical conditions to look for
        known_conditions = [
            "Diabetes", "Hypertension", "TB", "Tuberculosis", "Malaria", "Dengue",
            "Typhoid", "Pneumonia", "Bronchitis", "Asthma", "Anemia", "Heart Disease",
            "Kidney Disease", "Liver Disease", "Cancer", "Infection", "Fever",
            "Arthritis", "Gout", "Migraine", "Vertigo", "UTI", "Gastritis"
        ]
        
        text_lower = text.lower()
        
        for condition in known_conditions:
            if condition.lower() in text_lower:
                conditions.append(condition)
        
        return conditions
    
    def _determine_urgency(self, symptoms: List[str]) -> str:
        """Determine urgency level based on symptoms."""
        urgent_symptoms = [
            "chest pain", "shortness of breath", "severe bleeding", "unconscious",
            "difficulty breathing", "severe headache", "high fever", "vomiting blood"
        ]
        
        semi_urgent_symptoms = [
            "fever", "persistent cough", "night sweats", "weight loss",
            "dizziness", "swelling", "frequent urination", "blurred vision"
        ]
        
        symptoms_text = " ".join(symptoms).lower()
        
        # Check for urgent symptoms
        for symptom in urgent_symptoms:
            if symptom in symptoms_text:
                return "Urgent"
        
        # Check for semi-urgent symptoms
        for symptom in semi_urgent_symptoms:
            if symptom in symptoms_text:
                return "Semi-Urgent"
        
        return "Routine"
    
    def _generate_advice(self, symptoms: List[str]) -> str:
        """Generate general medical advice based on symptoms."""
        advice_parts = []
        
        symptoms_text = " ".join(symptoms).lower()
        
        # Check for specific symptom advice
        for symptom in symptoms:
            symptom_lower = symptom.lower().strip()
            if symptom_lower in self.MEDICAL_KNOWLEDGE:
                info = self.MEDICAL_KNOWLEDGE[symptom_lower]
                advice_parts.append(info["advice"])
        
        if not advice_parts:
            advice_parts.append("Ensure proper rest, hydration, and nutrition.")
            advice_parts.append("If symptoms persist >3 days, visit your local PHC.")
        
        # Add general disclaimer
        advice_parts.append("\n⚕️ This is AI guidance only — not a medical diagnosis. Please consult a doctor.")
        
        return " ".join(advice_parts)


# Module-level singleton
google_search = GoogleMedicalSearch()
