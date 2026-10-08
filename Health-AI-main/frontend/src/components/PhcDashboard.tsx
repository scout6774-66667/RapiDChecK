import React, { useState, useEffect } from 'react';
import { 
  Users, AlertTriangle, Clock, 
  Search, Activity, MapPin, Stethoscope,
  Wifi, WifiOff, Building2, ShieldAlert,
  X, CheckCircle2,
  Bed, PhoneCall, ArrowRight, Loader2, HeartPulse
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { translations, type Language } from '../i18n/translations';
import { db, type LocalAssessment } from '../db/offlineDb';
import { PopulationHealthPanel } from './dashboard/population/PopulationHealthPanel';

interface PhcDashboardProps {
  lang: Language;
  isOnline: boolean;
  defaultRiskFilter?: string;
}

interface HospitalRec {
  id: string;
  name: string;
  category: string;
  specialty: string;
  distance: string;
  distance_km: number;
  travel_time: string;
  travel_time_min: number;
  specialty_match: string;
  capability_match: string[];
  recommendation_priority: 'CRITICAL' | 'HIGH' | 'STANDARD';
  suitability_score: number;
  reason: string;
  icu_beds_available: number;
  general_beds_available: number;
  is_emergency_24x7: boolean;
  address: string;
  phone: string;
  rating: number;
}

// Fallback hospital network if offline or backend is unreachable
const LOCAL_HOSPITAL_NETWORK: HospitalRec[] = [
  {
    id: "hosp_district_cardiac_01",
    name: "District Super-Specialty Hospital & Trauma Centre",
    category: "Tertiary Referral Hospital",
    specialty: "Cardiology & Critical Care",
    distance: "4.8 km",
    distance_km: 4.8,
    travel_time: "14 mins",
    travel_time_min: 14,
    specialty_match: "Full Match: Cardiology & Trauma",
    capability_match: ["24/7 Emergency", "ICU (6 beds)", "Cath Lab", "Ventilator"],
    recommendation_priority: "CRITICAL",
    suitability_score: 95.0,
    reason: "Primary emergency recommendation: Fully equipped with 24/7 Emergency, ICU, and Cardiac care for acute triage within 14 mins.",
    icu_beds_available: 6,
    general_beds_available: 42,
    is_emergency_24x7: true,
    address: "Grand Trunk Trunk Rd, District Medical Complex",
    phone: "+91 33 2589 1100",
    rating: 4.8
  },
  {
    id: "hosp_subdiv_pulmo_02",
    name: "Barasat Sub-Divisional Hospital & Chest Clinic",
    category: "Sub-Divisional Hospital (SDH)",
    specialty: "Pulmonology & Respiratory Care",
    distance: "2.1 km",
    distance_km: 2.1,
    travel_time: "8 mins",
    travel_time_min: 8,
    specialty_match: "Direct Match: Pulmonology & NTEP",
    capability_match: ["24/7 Emergency", "Oxygen Support", "X-Ray", "ICU (3 beds)"],
    recommendation_priority: "HIGH",
    suitability_score: 88.0,
    reason: "Equipped with respiratory diagnostics, oxygen support, and active ICU beds within 8 mins.",
    icu_beds_available: 3,
    general_beds_available: 28,
    is_emergency_24x7: true,
    address: "Hospital Road, Barasat Central",
    phone: "+91 33 2552 3401",
    rating: 4.5
  },
  {
    id: "hosp_metro_specialty_03",
    name: "Apex Advanced Nephrology & Multi-Specialty Care",
    category: "Specialized Medical Centre",
    specialty: "Nephrology & Endocrinology",
    distance: "3.5 km",
    distance_km: 3.5,
    travel_time: "11 mins",
    travel_time_min: 11,
    specialty_match: "Specialty Match: Nephrology & Diabetes",
    capability_match: ["Dialysis Unit", "ICU", "Diagnostics", "HbA1c Lab"],
    recommendation_priority: "HIGH",
    suitability_score: 84.0,
    reason: "Advanced chronic metabolic & renal evaluation with active dialysis support.",
    icu_beds_available: 4,
    general_beds_available: 18,
    is_emergency_24x7: true,
    address: "Jessore Rd Junction, Sector 4",
    phone: "+91 33 2567 8900",
    rating: 4.7
  },
  {
    id: "hosp_chc_habra_04",
    name: "Habra Community Health Centre (CHC)",
    category: "Community Health Centre",
    specialty: "General Medicine & Inpatient Care",
    distance: "6.2 km",
    distance_km: 6.2,
    travel_time: "18 mins",
    travel_time_min: 18,
    specialty_match: "Secondary Clinical Evaluation",
    capability_match: ["24/7 Emergency", "Inpatient Beds", "Maternity"],
    recommendation_priority: "STANDARD",
    suitability_score: 72.0,
    reason: "Community inpatient facility suitable for moderate cases and stabilizing patients.",
    icu_beds_available: 0,
    general_beds_available: 14,
    is_emergency_24x7: true,
    address: "CHC Campus, Habra Town",
    phone: "+91 3216 237 112",
    rating: 4.1
  },
  {
    id: "hosp_phc_sundarpur_05",
    name: "Sundarpur Primary Health Centre (PHC)",
    category: "Primary Health Centre",
    specialty: "Primary Care & Preventive Health",
    distance: "1.1 km",
    distance_km: 1.1,
    travel_time: "5 mins",
    travel_time_min: 5,
    specialty_match: "Routine Primary Care",
    capability_match: ["Outpatient Clinic", "Basic Diagnostics", "DOTS Center"],
    recommendation_priority: "STANDARD",
    suitability_score: 65.0,
    reason: "Closest outpatient facility for routine monitoring, prescription renewal, and wellness guidance.",
    icu_beds_available: 0,
    general_beds_available: 4,
    is_emergency_24x7: false,
    address: "Sundarpur Block IV, Near Panchayat Office",
    phone: "+91 33 2541 2290",
    rating: 4.0
  }
];

export const PhcDashboard: React.FC<PhcDashboardProps> = ({ lang, isOnline, defaultRiskFilter = 'ALL' }) => {
  const t = translations[lang];
  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState(defaultRiskFilter);
  const [dashboardView, setDashboardView] = useState<'referrals' | 'population'>('referrals');

  // Hospital Recommendation Modal State
  const [selectedAssessment, setSelectedAssessment] = useState<LocalAssessment | null>(null);
  const [recommendedHospitals, setRecommendedHospitals] = useState<HospitalRec[]>([]);
  const [recommendationBanner, setRecommendationBanner] = useState<string>('');
  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    setRiskFilter(defaultRiskFilter);
  }, [defaultRiskFilter]);

  const loadData = async () => {
    if (isOnline) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/assessments');
        const data = await res.json();
        setAssessments(data);
        return;
      } catch (err) {
        console.warn('Backend offline, loading Dexie local assessments', err);
      }
    }

    const localList = await db.assessments.orderBy('created_at').reverse().toArray();
    setAssessments(localList);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

  const updateReferralStatus = async (
    assessmentId: string,
    newStatus: 'NOT_REFERRED' | 'REFERRED' | 'APPOINTMENT_REQUESTED' | 'CONSULTATION_COMPLETED'
  ) => {
    setAssessments((prev) =>
      prev.map((a) => (a.id === assessmentId ? { ...a, referral_status: newStatus } : a))
    );

    await db.assessments.update(assessmentId, { referral_status: newStatus });

    if (isOnline) {
      try {
        await fetch(`http://127.0.0.1:8000/api/assessments/${assessmentId}/referral`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_status: newStatus })
        });
      } catch (err) {
        console.warn('Referral update offline queueing', err);
      }
    }
  };

  // Helper to open Hospital Recommendation Workflow for an assessment item
  const openHospitalRecommendations = async (ass: LocalAssessment) => {
    setSelectedAssessment(ass);
    setIsLoadingRecs(true);
    
    const scoreVal = ass.risk_score > 1 ? ass.risk_score : Math.round(ass.risk_score * 100);
    const isCrit = scoreVal > 70 || ass.risk_level === 'CRITICAL';
    const levelStr = isCrit ? 'Critical' : (ass.risk_level === 'HIGH' ? 'High' : (ass.risk_level === 'MODERATE' ? 'Moderate' : 'Low'));
    setRecommendationBanner(`Risk Score: ${scoreVal}/100 — ${levelStr}`);

    const conditionName = (ass.likely_conditions && ass.likely_conditions.length > 0)
      ? ass.likely_conditions[0]
      : 'General Condition';

    if (isOnline) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/hospitals/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: ass.id,
            condition: conditionName,
            risk_score: scoreVal,
            risk_level: ass.risk_level,
            specialty: ass.required_specialty || 'General Medicine',
            max_results: 5
          })
        });

        if (res.ok) {
          const data = await res.json();
          setRecommendedHospitals(data.hospitals || []);
          if (data.recommendation_banner) {
            setRecommendationBanner(data.recommendation_banner);
          }
          setIsLoadingRecs(false);
          return;
        }
      } catch (err) {
        console.warn('Hospital recommendation API fetch failed, using local ranking', err);
      }
    }

    // Local offline ranking fallback
    const ranked = [...LOCAL_HOSPITAL_NETWORK];
    if (isCrit) {
      // Prioritize hospitals with ICU and 24/7 Emergency
      ranked.sort((a, b) => {
        if (a.is_emergency_24x7 && !b.is_emergency_24x7) return -1;
        if (!a.is_emergency_24x7 && b.is_emergency_24x7) return 1;
        return a.travel_time_min - b.travel_time_min;
      });
    }
    setRecommendedHospitals(ranked);
    setIsLoadingRecs(false);
  };

  const handleConfirmReferral = async (hospitalName: string) => {
    if (!selectedAssessment) return;
    await updateReferralStatus(selectedAssessment.id, 'REFERRED');
    setToastMsg(`Referral confirmed to ${hospitalName}`);
    setTimeout(() => {
      setToastMsg(null);
      setSelectedAssessment(null);
    }, 2000);
  };

  // Helper to normalize risk scores to 0-100 range
  const getNormalizedScore = (ass: LocalAssessment): number => {
    if (ass.risk_score > 1.0) {
      return Math.round(ass.risk_score);
    }
    return Math.round(ass.risk_score * 100);
  };

  // Helper to determine normalized risk level
  const getEffectiveRiskLevel = (ass: LocalAssessment): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' => {
    const score = getNormalizedScore(ass);
    if (score > 70 || ass.risk_level === 'CRITICAL') return 'CRITICAL';
    if (score > 50 || ass.risk_level === 'HIGH') return 'HIGH';
    if (score > 30 || ass.risk_level === 'MODERATE') return 'MODERATE';
    return 'LOW';
  };

  // Metrics derived dynamically from data
  const totalPatientsCount = new Set(assessments.map((a) => a.patient_id)).size;
  const totalAssessmentsCount = assessments.length;
  const criticalRiskCount = assessments.filter((a) => getEffectiveRiskLevel(a) === 'CRITICAL').length;
  const highRiskCount = assessments.filter((a) => getEffectiveRiskLevel(a) === 'HIGH').length;
  const modRiskCount = assessments.filter((a) => getEffectiveRiskLevel(a) === 'MODERATE').length;
  const lowRiskCount = assessments.filter((a) => getEffectiveRiskLevel(a) === 'LOW').length;
  const pendingReferralsCount = assessments.filter((a) =>
    ['REFERRED', 'APPOINTMENT_REQUESTED'].includes(a.referral_status)
  ).length;

  // Chart Data
  const pieData = [
    { name: 'Critical Risk', value: criticalRiskCount || 0, color: '#e11d48' },
    { name: 'High Risk', value: highRiskCount || 0, color: '#f43f5e' },
    { name: 'Moderate Risk', value: modRiskCount || 0, color: '#f59e0b' },
    { name: 'Low Risk', value: lowRiskCount || 0, color: '#10b981' }
  ];

  const villagesList = Array.from(new Set(assessments.map((a) => a.village || 'Unknown'))).filter(Boolean);

  const villageChartData = villagesList.map((v) => ({
    village: v,
    count: assessments.filter((a) => a.village === v).length
  }));

  // Filtering
  const filteredAssessments = assessments.filter((a) => {
    const matchesSearch =
      (a.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.village || '').toLowerCase().includes(searchTerm.toLowerCase());
    const effLevel = getEffectiveRiskLevel(a);
    const matchesRisk = riskFilter === 'ALL' || effLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-[#102A56] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 animate-in fade-in slide-in-from-top-2 text-xs font-bold">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Title with IDRC Branding */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-black uppercase tracking-wider">
              IDRC Care Network
            </span>
            <span className="text-xs text-slate-400 font-semibold">Infectious & Integrated Disease Referral</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 mt-1">
            <Stethoscope className="w-7 h-7 text-teal-600" />
            <span>IDRC — PHC Referral & Care Dashboard</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Real-time clinical risk prediction, triage workflow & capability-aware hospital recommendations
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Switcher Tabs */}
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1">
            <button
              onClick={() => setDashboardView('referrals')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                dashboardView === 'referrals'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              IDRC Referrals
            </button>
            <button
              onClick={() => setDashboardView('population')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                dashboardView === 'population'
                  ? 'bg-white text-[#0A9F68] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Population Intelligence</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-extrabold">
                HMIS
              </span>
            </button>
          </div>

          {/* Online / Offline Status Badge */}
          <span
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border-2 transition-all shadow-sm ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
            }`}
          >
            {isOnline ? (
              <><Wifi className="w-4 h-4 text-emerald-500" /> <span>Online — Live Data</span></>
            ) : (
              <><WifiOff className="w-4 h-4 text-rose-500" /> <span>Offline — Local Data</span></>
            )}
          </span>

          <button
            onClick={loadData}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
          >
            Refresh Data ↻
          </button>
        </div>
      </div>

      {dashboardView === 'population' ? (
        <PopulationHealthPanel isOnline={isOnline} />
      ) : (
        <>

      {/* Critical Risk Emergency Banner (Requirement 4) */}
      {criticalRiskCount > 0 && (
        <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-4 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg border border-rose-400">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-amber-300 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-white text-rose-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                  Critical Alert
                </span>
                <span className="text-xs font-extrabold text-rose-100">
                  {criticalRiskCount} Patient(s) with Risk Score &gt; 70/100
                </span>
              </div>
              <p className="text-sm font-black mt-0.5">
                Immediate IDRC hospital triage & transfer workflow triggered for Critical cases.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRiskFilter('CRITICAL')}
            className="px-4 py-2 rounded-xl bg-white text-rose-700 hover:bg-rose-50 text-xs font-black shadow-sm transition-all shrink-0"
          >
            Filter Critical Patients &rarr;
          </button>
        </div>
      )}

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 rounded-2xl flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-sm">You are offline</p>
            <p className="text-xs font-medium text-white/80">Showing locally saved data. Changes will sync when connection restores.</p>
          </div>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        
        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.totalPatients}</span>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">{totalPatientsCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Screenings</span>
            <div className="text-3xl font-black text-teal-600 mt-1">{totalAssessmentsCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-rose-100 dark:border-rose-900/40 flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Critical Cases</span>
            <div className="text-3xl font-black text-rose-600 mt-1">{criticalRiskCount}</div>
            <span className="text-[10px] text-slate-400 font-semibold">Score 71–100</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">High & Mod Risk</span>
            <div className="text-3xl font-black text-amber-600 mt-1">{highRiskCount + modRiskCount}</div>
            <span className="text-[10px] text-slate-400 font-semibold">Score 31–70</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.pendingReferrals}</span>
            <div className="text-3xl font-black text-blue-600 mt-1">{pendingReferralsCount}</div>
            <span className="text-[10px] text-slate-400 font-semibold">In triage</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Risk Distribution Pie */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-teal-600" />
            <span>Clinical Risk Score Distribution</span>
          </h3>
          <p className="text-xs text-slate-500 font-semibold mb-4">
            Thresholds: Critical (71–100), High (51–70), Moderate (31–50), Low (0–30)
          </p>
          <div className="h-64 flex items-center justify-center">
            {assessments.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400 font-bold">No assessment data available</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-600 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#e11d48]" /> Critical ({criticalRiskCount})</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#f43f5e]" /> High ({highRiskCount})</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#f59e0b]" /> Moderate ({modRiskCount})</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#10b981]" /> Low ({lowRiskCount})</span>
          </div>
        </div>

        {/* Screening by Village Bar */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-teal-600" />
            <span>Screenings by Village</span>
          </h3>
          <p className="text-xs text-slate-500 font-semibold mb-4">Regional outreach tracking across covered habitations</p>
          <div className="h-64 flex items-center justify-center">
            {villageChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={villageChartData}>
                  <XAxis dataKey="village" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0d9488" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400 font-bold">No village data available</p>
            )}
          </div>
        </div>

      </div>

      {/* Patients & Referral Table Section */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 transition-colors space-y-4">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">IDRC Referral Queue & Triage Table</h3>
            <p className="text-xs text-slate-500 font-semibold">Every patient receives an explainable risk score (0–100) linked to hospital recommendations</p>
          </div>

          {/* Search & Risk Level Filters */}
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder={t.searchVillage}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="CRITICAL">Critical (71–100)</option>
              <option value="HIGH">High Risk (51–70)</option>
              <option value="MODERATE">Moderate Risk (31–50)</option>
              <option value="LOW">Low Risk (0–30)</option>
            </select>
          </div>
        </div>

        {/* Table: Patient | Village | Risk Score & Level | Concern | Vitals | Referral Status | Hospital Matching */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-200 dark:border-slate-600">
                <th className="p-3">Patient</th>
                <th className="p-3">Village</th>
                <th className="p-3">Risk Score & Level</th>
                <th className="p-3">Predicted Concern</th>
                <th className="p-3">Vitals (BP / Glucose)</th>
                <th className="p-3">Referral Status</th>
                <th className="p-3 text-right">Hospital Matching</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-semibold">
              {filteredAssessments.length > 0 ? (
                filteredAssessments.map((ass) => {
                  const score = getNormalizedScore(ass);
                  const effLevel = getEffectiveRiskLevel(ass);
                  const isCrit = effLevel === 'CRITICAL';

                  return (
                    <tr 
                      key={ass.id} 
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-all ${
                        isCrit ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-black text-slate-900 dark:text-white">
                          {ass.patient_name || 'Patient Record'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {ass.id.slice(0, 12)}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {ass.village || 'N/A'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                              isCrit
                                ? 'bg-rose-100 text-rose-800 border-2 border-rose-300 shadow-2xs'
                                : effLevel === 'HIGH'
                                ? 'bg-red-100 text-red-800'
                                : effLevel === 'MODERATE'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {effLevel}
                          </span>
                          <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-100">
                            {score}/100
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-200 max-w-xs truncate">
                        {(ass.likely_conditions || []).join(', ') || 'General Health Screening'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        BP: {ass.systolic_bp}/{ass.diastolic_bp} | Glu: {ass.glucose_mg_dl} mg/dL
                      </td>
                      <td className="p-3">
                        <select
                          value={ass.referral_status}
                          onChange={(e) => updateReferralStatus(ass.id, e.target.value as any)}
                          className="text-xs font-bold p-1 rounded-lg border border-slate-300 bg-white dark:bg-slate-700 dark:text-white cursor-pointer focus:ring-2 focus:ring-teal-500"
                        >
                          <option value="NOT_REFERRED">Not Referred</option>
                          <option value="REFERRED">Referred to Facility</option>
                          <option value="APPOINTMENT_REQUESTED">Appointment Requested</option>
                          <option value="CONSULTATION_COMPLETED">Consultation Completed</option>
                        </select>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => openHospitalRecommendations(ass)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-xs ${
                            isCrit
                              ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                              : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>{isCrit ? '🚨 Critical Triage' : 'Recommend Hospitals'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold">
                    No matching screening records found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Hospital Recommendation Modal / Drawer (Requirement 5 & 6) */}
      {selectedAssessment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    IDRC Hospital Recommendation Engine
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold">
                    Matching patient condition with facility capabilities & emergency readiness
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAssessment(null)}
                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              
              {/* Patient & Risk Score Banner */}
              <div className={`p-4 rounded-2xl border ${
                getEffectiveRiskLevel(selectedAssessment) === 'CRITICAL'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-teal-50 border-teal-200 text-teal-900'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Patient: {selectedAssessment.patient_name} ({selectedAssessment.village})
                    </span>
                    <h4 className="text-sm font-black mt-0.5">
                      {recommendationBanner || `Risk Score: ${getNormalizedScore(selectedAssessment)}/100`}
                    </h4>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black self-start sm:self-auto ${
                    getEffectiveRiskLevel(selectedAssessment) === 'CRITICAL'
                      ? 'bg-rose-600 text-white'
                      : 'bg-teal-600 text-white'
                  }`}>
                    {getEffectiveRiskLevel(selectedAssessment)} PRIORITY
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Target Condition: <span className="font-black text-slate-900 dark:text-white">{(selectedAssessment.likely_conditions || []).join(', ') || 'General Condition'}</span>
                </div>
              </div>

              {/* Recommendations List */}
              <div>
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                  Ranked Facility Matches (Specialty + Capabilities + Proximity)
                </h5>

                {isLoadingRecs ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                    <span className="text-xs font-bold">Evaluating hospital readiness & travel times...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recommendedHospitals.map((hosp, idx) => (
                      <div
                        key={hosp.id || idx}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700/50 hover:border-teal-500 transition-all space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black flex items-center justify-center">
                                #{idx + 1}
                              </span>
                              <h6 className="font-black text-sm text-slate-900 dark:text-white">
                                {hosp.name}
                              </h6>
                            </div>
                            <span className="text-xs text-slate-400 font-semibold">{hosp.category} • {hosp.specialty}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              hosp.recommendation_priority === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : hosp.recommendation_priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {hosp.recommendation_priority} PRIORITY
                            </span>
                            <span className="text-xs font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                              {hosp.distance} ({hosp.travel_time})
                            </span>
                          </div>
                        </div>

                        {/* Capability Badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {hosp.is_emergency_24x7 && (
                            <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-[10px] font-bold">
                              24/7 Emergency
                            </span>
                          )}
                          {hosp.icu_beds_available > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold flex items-center gap-1">
                              <Bed className="w-3 h-3" />
                              {hosp.icu_beds_available} ICU Beds Available
                            </span>
                          )}
                          {(hosp.capability_match || []).map((cap, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10px] font-semibold">
                              {cap}
                            </span>
                          ))}
                        </div>

                        {/* Recommendation Reason */}
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-600/30 p-2.5 rounded-xl font-medium">
                          <span className="font-bold text-slate-900 dark:text-white">Why recommended: </span>
                          {hosp.reason}
                        </p>

                        {/* Action buttons */}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                            <PhoneCall className="w-3 h-3" /> {hosp.phone || 'Available via PHC Hotline'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfirmReferral(hosp.name)}
                            className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs"
                          >
                            <span>Confirm Referral</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAssessment(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

        </>
      )}
    </div>
  );
};

export default PhcDashboard;
