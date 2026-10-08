"""
consensus_engine.py — Hybrid ML + Google Search Consensus System
================================================================
Combines predictions from:
1. Logistic Regression ML model (statistical/pattern-based)
2. Google Search (medical knowledge/reasoning-based)

Uses weighted voting and confidence scoring to produce final predictions.
"""

from typing import List, Dict, Any, Optional
from .predictor import disease_predictor
from .google_search import google_search


class ConsensusEngine:
    """
    Hybrid prediction engine that combines ML model and Google Search results.
    
    Consensus Strategy:
    1. Get predictions from both sources
    2. Normalize confidence scores to 0-1 range
    3. Apply weighted voting (ML: 0.6, Google: 0.4)
    4. Merge conditions that appear in both predictions (boost confidence)
    5. Return top-3 consensus predictions
    """
    
    # Weight configuration
    ML_WEIGHT = 0.6      # Logistic Regression weight
    GOOGLE_WEIGHT = 0.4  # Google Search weight
    
    # Confidence level mapping
    CONFIDENCE_MAP = {
        "high": 0.9,
        "medium": 0.6,
        "low": 0.3
    }
    
    def __init__(self):
        self.ml_predictor = disease_predictor
        self.google = google_search
    
    @property
    def is_ready(self) -> Dict[str, bool]:
        """Check which systems are available."""
        return {
            "ml_model": self.ml_predictor.is_ready,
            "google_search": self.google.is_ready,
            "hybrid": self.ml_predictor.is_ready  # At minimum, ML must work
        }
    
    def predict(
        self,
        symptoms: List[str],
        use_google: bool = True
    ) -> Dict[str, Any]:
        """
        Generate consensus predictions from ML and Google Search.
        
        Parameters
        ----------
        symptoms : list of str
            List of symptom descriptions.
        use_google : bool
            Whether to use Google Search (False = ML only).
        
        Returns
        -------
        dict with:
          predictions     — top-3 consensus predictions
          ml_predictions  — ML model's individual predictions
          google_predictions — Google's individual predictions
          consensus_info  — metadata about how consensus was reached
          fallback_mode   — True if only one system worked
        """
        results = {
            "predictions": [],
            "ml_predictions": [],
            "google_predictions": [],
            "consensus_info": {
                "ml_used": False,
                "google_used": False,
                "consensus_reached": False,
                "sources_agree": False
            },
            "fallback_mode": False
        }
        
        # Get ML predictions
        ml_result = None
        if self.ml_predictor.is_ready:
            try:
                ml_result = self.ml_predictor.predict_disease(symptoms)
                results["ml_predictions"] = ml_result.get("predictions", [])
                results["consensus_info"]["ml_used"] = True
            except Exception as e:
                print(f"[consensus] ML prediction failed: {e}")
        
        # Get Google Search predictions (if enabled and available)
        google_result = None
        if use_google and self.google.is_ready:
            try:
                google_result = self.google.search_symptoms(symptoms)
                if not google_result.get("error"):
                    results["google_predictions"] = google_result.get("predictions", [])
                    results["consensus_info"]["google_used"] = True
                else:
                    print(f"[consensus] Google Search warning: {google_result['error']}")
            except Exception as e:
                print(f"[consensus] Google Search prediction failed: {e}")
        
        # Combine predictions
        ml_preds = results["ml_predictions"]
        google_preds = results["google_predictions"]
        
        if ml_preds and google_preds:
            # Both sources available — compute consensus
            results["predictions"] = self._compute_consensus(ml_preds, google_preds)
            results["consensus_info"]["consensus_reached"] = True
            
            # Check if sources agree
            ml_top = ml_preds[0]["condition"].lower() if ml_preds else ""
            google_top = google_preds[0]["condition"].lower() if google_preds else ""
            results["consensus_info"]["sources_agree"] = (
                ml_top in google_top or google_top in ml_top
            )
            
        elif ml_preds:
            # Only ML available
            results["predictions"] = ml_preds
            results["fallback_mode"] = True
            
        elif google_preds:
            # Only Google available
            results["predictions"] = self._normalize_google_predictions(google_preds)
            results["fallback_mode"] = True
        
        return results
    
    def _compute_consensus(
        self,
        ml_preds: List[Dict[str, Any]],
        google_preds: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Compute weighted consensus between ML and Google Search predictions.
        
        Strategy:
        1. Create unified condition list from both sources
        2. Assign scores based on source weights and confidence
        3. Boost conditions that appear in BOTH sources
        4. Return top-3 by final score
        """
        condition_scores = {}
        condition_details = {}
        
        # Process ML predictions
        for pred in ml_preds:
            condition = self._normalize_condition(pred["condition"])
            ml_score = pred.get("score", 0.5) * self.ML_WEIGHT
            
            condition_scores[condition] = condition_scores.get(condition, 0) + ml_score
            condition_details[condition] = {
                "condition": pred["condition"],
                "ml_score": pred.get("score", 0),
                "google_score": 0,
                "ml_rank": pred.get("rank", 99),
                "google_rank": 99,
                "reasoning": "",
                "source": "ML Model"
            }
        
        # Process Google Search predictions
        for rank, pred in enumerate(google_preds):
            condition = self._normalize_condition(pred.get("condition", ""))
            confidence_str = pred.get("confidence", "medium").lower()
            google_score = self.CONFIDENCE_MAP.get(confidence_str, 0.5) * self.GOOGLE_WEIGHT
            
            condition_scores[condition] = condition_scores.get(condition, 0) + google_score
            
            if condition not in condition_details:
                condition_details[condition] = {
                    "condition": pred.get("condition", condition),
                    "ml_score": 0,
                    "google_score": 0,
                    "ml_rank": 99,
                    "google_rank": rank + 1,
                    "reasoning": pred.get("reasoning", ""),
                    "source": pred.get("source", "Google Search")
                }
            else:
                condition_details[condition]["google_score"] = self.CONFIDENCE_MAP.get(confidence_str, 0.5)
                condition_details[condition]["google_rank"] = rank + 1
                condition_details[condition]["reasoning"] = pred.get("reasoning", "")
                condition_details[condition]["source"] = pred.get("source", "Google Search")
        
        # Boost conditions that appear in BOTH sources
        for condition in condition_scores:
            details = condition_details[condition]
            if details["ml_score"] > 0 and details["google_score"] > 0:
                # Consensus bonus: 20% boost
                condition_scores[condition] *= 1.2
        
        # Sort by final score and get top 3
        sorted_conditions = sorted(
            condition_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]
        
        # Build final predictions
        predictions = []
        for rank, (condition, score) in enumerate(sorted_conditions):
            details = condition_details[condition]
            predictions.append({
                "rank": rank + 1,
                "condition": details["condition"],
                "consensus_score": round(score, 4),
                "ml_score": round(details["ml_score"], 4) if details["ml_score"] else None,
                "google_score": round(details["google_score"], 4) if details["google_score"] else None,
                "ml_rank": details["ml_rank"] if details["ml_rank"] < 99 else None,
                "google_rank": details["google_rank"] if details["google_rank"] < 99 else None,
                "reasoning": details["reasoning"],
                "source": details["source"],
                "sources_agree": details["ml_score"] > 0 and details["google_score"] > 0
            })
        
        return predictions
    
    def _normalize_google_predictions(
        self,
        google_preds: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Normalize Google-only predictions to match expected format."""
        normalized = []
        for rank, pred in enumerate(google_preds):
            confidence_str = pred.get("confidence", "medium").lower()
            normalized.append({
                "rank": rank + 1,
                "condition": pred.get("condition", "Unknown"),
                "consensus_score": self.CONFIDENCE_MAP.get(confidence_str, 0.5),
                "ml_score": None,
                "google_score": self.CONFIDENCE_MAP.get(confidence_str, 0.5),
                "ml_rank": None,
                "google_rank": rank + 1,
                "reasoning": pred.get("reasoning", ""),
                "source": pred.get("source", "Google Search"),
                "sources_agree": False
            })
        return normalized
    
    def _normalize_condition(self, condition: str) -> str:
        """Normalize condition name for matching."""
        import re
        # Lowercase, remove special chars, collapse whitespace
        normalized = condition.lower().strip()
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = ' '.join(normalized.split())
        return normalized


# Module-level singleton
consensus_engine = ConsensusEngine()
