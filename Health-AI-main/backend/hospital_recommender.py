"""
hospital_recommender.py — Intelligent Capability-Aware Hospital Recommendation
================================================================================
Recommends and ranks healthcare facilities based on:
1. Patient Risk Score (0-100) and Risk Level (Low, Moderate, High, Critical)
2. Medical condition / clinical diagnosis
3. Required medical specialty
4. Hospital capabilities (ICU, Emergency 24/7, Ventilator, Dialysis, etc.)
5. Real-time capacity & bed availability
6. Distance & estimated travel time

CRITICAL RULE:
For critical cases (risk_score > 70), facilities equipped to handle emergencies
and specialized care are prioritized over closer but unequipped clinics.
"""

import math
from typing import List, Dict, Any, Optional
from risk_scoring import classify_risk_level, get_condition_profile

# ─── COMPREHENSIVE HOSPITAL & HEALTHCARE NETWORK ─────────────────────────────
HOSPITAL_NETWORK: List[Dict[str, Any]] = [
    {
        "id": "hosp_district_cardiac_01",
        "name": "District Super-Specialty Hospital & Trauma Centre",
        "category": "Tertiary Referral Hospital",
        "specialties": ["Cardiology", "Critical Care", "General Surgery", "Neurology", "Orthopedics"],
        "capabilities": ["24/7 Emergency", "ICU", "Cath Lab / Cardiac Care", "Ventilator", "Blood Bank", "Operation Theatre"],
        "icu_beds_available": 6,
        "general_beds_available": 42,
        "is_emergency_24x7": True,
        "lat": 22.7520,
        "lng": 88.4910,
        "address": "Grand Trunk Trunk Rd, District Medical Complex",
        "phone": "+91 33 2589 1100",
        "rating": 4.8
    },
    {
        "id": "hosp_subdiv_pulmo_02",
        "name": "Barasat Sub-Divisional Hospital & Chest Clinic",
        "category": "Sub-Divisional Hospital (SDH)",
        "specialties": ["Pulmonology", "Internal Medicine", "Infectious Disease (NTEP)", "Pediatrics"],
        "capabilities": ["24/7 Emergency", "Oxygen Support", "X-Ray", "Sputum Microscopy / CBNAAT", "ICU", "Ventilator"],
        "icu_beds_available": 3,
        "general_beds_available": 28,
        "is_emergency_24x7": True,
        "lat": 22.7215,
        "lng": 88.4812,
        "address": "Hospital Road, Barasat Central",
        "phone": "+91 33 2552 3401",
        "rating": 4.5
    },
    {
        "id": "hosp_metro_specialty_03",
        "name": "Apex Advanced Nephrology & Multi-Specialty Care",
        "category": "Specialized Medical Centre",
        "specialties": ["Nephrology", "Endocrinology / Diabetology", "Cardiology", "Internal Medicine"],
        "capabilities": ["Dialysis", "ICU", "Diagnostics", "HbA1c Lab", "24/7 Emergency"],
        "icu_beds_available": 4,
        "general_beds_available": 18,
        "is_emergency_24x7": True,
        "lat": 22.7350,
        "lng": 88.5120,
        "address": "Jessore Rd Junction, Sector 4",
        "phone": "+91 33 2567 8900",
        "rating": 4.7
    },
    {
        "id": "hosp_chc_habra_04",
        "name": "Habra Community Health Centre (CHC)",
        "category": "Community Health Centre (CHC)",
        "specialties": ["General Medicine", "Pediatrics", "Obstetrics & Gynecology", "Minor Surgery"],
        "capabilities": ["24/7 Emergency", "Inpatient Beds", "Diagnostics", "Oxygen Support", "Maternity Ward"],
        "icu_beds_available": 0,
        "general_beds_available": 14,
        "is_emergency_24x7": True,
        "lat": 22.8340,
        "lng": 88.6310,
        "address": "CHC Campus, Habra Town",
        "phone": "+91 3216 237 112",
        "rating": 4.1
    },
    {
        "id": "hosp_phc_sundarpur_05",
        "name": "Sundarpur Primary Health Centre (PHC)",
        "category": "Primary Health Centre (PHC)",
        "specialties": ["General Medicine", "Family Medicine", "Preventive Care"],
        "capabilities": ["Outpatient Clinic", "Basic Diagnostics", "Immunization", "DOTS Center"],
        "icu_beds_available": 0,
        "general_beds_available": 4,
        "is_emergency_24x7": False,
        "lat": 22.7180,
        "lng": 88.4720,
        "address": "Sundarpur Block IV, Near Panchayat Office",
        "phone": "+91 33 2541 2290",
        "rating": 4.0
    },
    {
        "id": "hosp_phc_rajarhat_06",
        "name": "Rajarhat Rural Health Post & Wellness Centre",
        "category": "Health & Wellness Centre",
        "specialties": ["General Practice", "Dermatology", "Maternal Care"],
        "capabilities": ["Outpatient Clinic", "Pharmacy", "Teleconsultation"],
        "icu_beds_available": 0,
        "general_beds_available": 2,
        "is_emergency_24x7": False,
        "lat": 22.6100,
        "lng": 88.5200,
        "address": "Main Bazar, Rajarhat Rural",
        "phone": "+91 33 2573 9940",
        "rating": 3.9
    }
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def estimate_travel_time_minutes(distance_km: float) -> int:
    """
    Estimates travel time in minutes over rural and semi-urban Indian road conditions
    (approx. 25-35 km/h average ambulance/vehicle speed = ~2 mins per km, min 5 mins).
    """
    return max(5, int(round(distance_km * 2.0)))


def recommend_hospitals(
    condition: str,
    risk_score: float,
    user_lat: float = 22.723,
    user_lng: float = 88.483,
    custom_specialty: Optional[str] = None,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Recommends suitable hospitals balancing risk level, specialty match,
    capability requirements, distance, and capacity.
    """
    risk_level = classify_risk_level(risk_score)
    is_critical = risk_score > 70.0
    is_high = risk_score > 50.0

    profile = get_condition_profile(condition)
    target_specialty = custom_specialty or profile.get("specialty", "General Medicine")
    required_caps = profile.get("required_capabilities", [])
    target_emergency = profile.get("is_emergency", False) or is_critical

    scored_hospitals = []

    for hosp in HOSPITAL_NETWORK:
        dist_km = haversine_km(user_lat, user_lng, hosp["lat"], hosp["lng"])
        travel_min = estimate_travel_time_minutes(dist_km)

        # ── 1. Specialty Match Score (Max 35 pts) ───────────────────────────
        specialty_match_desc = "General Care Facility"
        specialty_score = 10.0
        hosp_specs = [s.lower() for s in hosp["specialties"]]
        target_lower = target_specialty.lower()

        matched_spec = None
        for s in hosp_specs:
            if any(term in s for term in target_lower.split(" / ")) or any(term in target_lower for term in s.split()):
                matched_spec = s
                break

        if matched_spec:
            specialty_score = 35.0
            specialty_match_desc = f"Direct Specialty Match: {matched_spec.title()}"
        elif any("general" in s or "internal" in s for s in hosp_specs):
            specialty_score = 22.0
            specialty_match_desc = "Multi-Specialty / General Physician Coverage"

        # ── 2. Capability & Emergency Match (Max 35 pts) ───────────────────
        hosp_caps = hosp["capabilities"]
        matching_capabilities = [c for c in required_caps if any(c.lower() in hc.lower() for hc in hosp_caps)]
        
        capability_score = 10.0
        if target_emergency:
            if hosp["is_emergency_24x7"] and "ICU" in hosp_caps:
                capability_score = 35.0
            elif hosp["is_emergency_24x7"]:
                capability_score = 25.0
            else:
                capability_score = 5.0  # Inadequate for emergency
        else:
            if matching_capabilities:
                capability_score = 25.0 + (min(len(matching_capabilities), 2) * 5.0)

        # ── 3. Proximity / Travel Time Score (Max 20 pts) ──────────────────
        if travel_min <= 10:
            proximity_score = 20.0
        elif travel_min <= 20:
            proximity_score = 16.0
        elif travel_min <= 40:
            proximity_score = 11.0
        else:
            proximity_score = 5.0

        # ── 4. Capacity / Availability Score (Max 10 pts) ──────────────────
        capacity_score = 5.0
        if hosp["icu_beds_available"] > 0 and is_critical:
            capacity_score = 10.0
        elif hosp["general_beds_available"] > 5:
            capacity_score = 8.0

        # ── 5. Total Suitability & Critical Case Override ─────────────────
        total_suitability = specialty_score + capability_score + proximity_score + capacity_score

        # Critical case safety filter: if critical, penalize facilities without 24/7 emergency & ICU
        if is_critical and (not hosp["is_emergency_24x7"] or "ICU" not in hosp_caps):
            total_suitability -= 45.0  # Heavy penalty for unequipped clinics

        total_suitability = round(max(5.0, min(99.0, total_suitability)), 1)

        # Recommendation Priority & Explanation
        if is_critical and total_suitability >= 60.0:
            rec_priority = "CRITICAL"
            reason = (
                f"Emergency Priority Match: Equipped with 24/7 Emergency & ICU for critical {condition} triage. "
                f"Travel time {travel_min} mins ({dist_km:.1f} km). {hosp['icu_beds_available']} ICU beds available."
            )
        elif is_high and total_suitability >= 55.0:
            rec_priority = "HIGH"
            reason = (
                f"Specialized Care Match: Has {target_specialty} department and diagnostics. "
                f"Travel time {travel_min} mins ({dist_km:.1f} km)."
            )
        else:
            rec_priority = "STANDARD"
            reason = (
                f"Community / Routine Consultation: {specialty_match_desc}. "
                f"Convenient distance ({dist_km:.1f} km, {travel_min} mins)."
            )

        scored_hospitals.append({
            "id": hosp["id"],
            "name": hosp["name"],
            "category": hosp["category"],
            "specialty": hosp["specialties"][0] if hosp["specialties"] else "General Medicine",
            "all_specialties": hosp["specialties"],
            "distance_km": round(dist_km, 1),
            "distance": f"{dist_km:.1f} km",
            "travel_time_min": travel_min,
            "travel_time": f"{travel_min} mins",
            "specialty_match": specialty_match_desc,
            "capability_match": matching_capabilities if matching_capabilities else hosp_caps[:3],
            "all_capabilities": hosp_caps,
            "recommendation_priority": rec_priority,
            "suitability_score": total_suitability,
            "reason": reason,
            "icu_beds_available": hosp["icu_beds_available"],
            "general_beds_available": hosp["general_beds_available"],
            "is_emergency_24x7": hosp["is_emergency_24x7"],
            "address": hosp["address"],
            "phone": hosp["phone"],
            "rating": hosp["rating"],
            "lat": hosp["lat"],
            "lng": hosp["lng"],
        })

    # Sort primarily by suitability score descending, then by travel time ascending
    scored_hospitals.sort(key=lambda h: (-h["suitability_score"], h["travel_time_min"]))

    return scored_hospitals[:max_results]
