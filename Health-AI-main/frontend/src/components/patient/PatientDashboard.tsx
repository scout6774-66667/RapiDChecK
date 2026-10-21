import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n';
import { RuralHealthLogo } from '../brand/RuralHealthLogo';
import { db } from '../../db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  HeartHandshake,
  Stethoscope,
  Building2,
  Calendar,
  MessageSquare,
  Activity,
  Users,
  Phone,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Globe,
  ChevronDown,
  LogOut,
  Plus,
  Send,
  ShieldCheck,
  Search,
  Check,
  Heart,
  Droplets,
  CalendarDays,
  X,
} from 'lucide-react';

export type PatientDashboardTab =
  | 'symptoms'
  | 'hospitals'
  | 'consultation'
  | 'assistant'
  | 'records'
  | 'appointments'
  | 'family';

interface FacilityItem {
  id: string;
  name: string;
  type: 'PHC' | 'District Hospital' | 'Sub-Centre' | 'CHC';
  distance: string;
  address: string;
  phone: string;
  emergency24x7: boolean;
  services: string[];
}

const SAMPLE_FACILITIES: FacilityItem[] = [
  {
    id: 'fac-1',
    name: 'Sonpur Primary Health Centre (PHC)',
    type: 'PHC',
    distance: '1.4 km',
    address: 'Sonpur Village Main Road, Block A',
    phone: '033-2289-4401',
    emergency24x7: true,
    services: ['OPD Consultation', 'Emergency Triage', 'Maternal Health', 'Free Pharmacy'],
  },
  {
    id: 'fac-2',
    name: 'Bishnupur Block Primary Health Centre',
    type: 'PHC',
    distance: '4.8 km',
    address: 'Bishnupur Hospital More, South 24 Parganas',
    phone: '033-2479-1100',
    emergency24x7: true,
    services: ['24/7 Delivery Room', 'Minor Surgery', 'X-Ray & Lab', 'Ambulance Station'],
  },
  {
    id: 'fac-3',
    name: 'Diamond Harbour District Hospital',
    type: 'District Hospital',
    distance: '16.5 km',
    address: 'Hospital Road, Diamond Harbour, WB 743331',
    phone: '03174-255-222',
    emergency24x7: true,
    services: ['ICU & Emergency Care', 'Specialist Clinics', 'Blood Bank', 'CT Scan & Ultrasound'],
  },
  {
    id: 'fac-4',
    name: 'Sonpur East Health Sub-Centre',
    type: 'Sub-Centre',
    distance: '0.6 km',
    address: 'East Sonpur Gram Panchayat',
    phone: '033-2289-4402',
    emergency24x7: false,
    services: ['ANM / ASHA Screenings', 'Childhood Immunization', 'Blood Pressure & Sugar Tests'],
  },
];

export const PatientDashboard: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();

  const [activeTab, setActiveTab] = useState<PatientDashboardTab>('symptoms');
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  // 1. Symptom Checker State
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomDuration, setSymptomDuration] = useState<'today' | 'few_days' | 'week'>('today');
  const [symptomSeverity, setSymptomSeverity] = useState<'mild' | 'moderate' | 'severe'>('moderate');
  const [triageResult, setTriageResult] = useState<{
    level: 'emergency' | 'phc' | 'home';
    title: string;
    description: string;
    recommendations: string[];
  } | null>(null);

  // 2. Hospital Search State
  const [facilitySearch, setFacilitySearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<'ALL' | 'PHC' | 'District Hospital' | 'Sub-Centre'>('ALL');

  // 3. Consultation Booking State
  const [bookingDoctor, setBookingDoctor] = useState('Dr. Rajesh Sharma, MBBS (PHC Sonpur)');
  const [bookingDate, setBookingDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [bookingSlot, setBookingSlot] = useState('10:00 AM - 11:00 AM');
  const [bookingReason, setBookingReason] = useState('General Health Consultation');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // 4. Live Appointments from Dexie
  const liveAppointments = useLiveQuery(() =>
    db.appointments.filter((a) => !a.is_deleted).toArray()
  ) || [];

  // 5. AI Chat Assistant State
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: 'user' | 'assistant'; text: string; time: string }>
  >([
    {
      sender: 'assistant',
      text:
        language === 'hi'
          ? 'नमस्ते! मैं आपका ग्रामीण स्वास्थ्य सहायक हूँ। आप मुझसे लक्षणों, दवाइयों, या नजदीकी अस्पताल के बारे में पूछ सकते हैं।'
          : language === 'bn'
          ? 'নমস্কার! আমি আপনার গ্রামীণ স্বাস্থ্য সহকারী। আপনি উপসর্গ, ওষুধ বা স্বাস্থ্যকেন্দ্র সম্পর্কে আমাকে প্রশ্ন করতে পারেন।'
          : 'Hello! I am your RuralHealth AI Assistant. How can I support your health today? Ask about symptoms, child vaccines, or local clinics.',
      time: 'Just now',
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  // 6. Family Members State
  const [familyMembers, setFamilyMembers] = useState<
    Array<{ name: string; relation: string; age: number; bloodGroup: string; lastCheckup: string }>
  >([
    {
      name: user?.full_name || 'Self',
      relation: 'Self',
      age: 38,
      bloodGroup: 'B+',
      lastCheckup: '12 Oct 2026 (PHC Sonpur)',
    },
    {
      name: 'Anjali Das',
      relation: 'Spouse',
      age: 34,
      bloodGroup: 'O+',
      lastCheckup: '28 Sep 2026 (Maternal Health)',
    },
    {
      name: 'Rohan Das',
      relation: 'Son',
      age: 8,
      bloodGroup: 'B+',
      lastCheckup: '15 Aug 2026 (School Health Camp)',
    },
  ]);
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelation, setNewMemberRelation] = useState('Child');
  const [newMemberAge, setNewMemberAge] = useState('');
  const [newMemberBlood, setNewMemberBlood] = useState('O+');

  // Handle Symptom Checker Submission
  const handleRunTriage = () => {
    if (selectedSymptoms.length === 0) return;

    const hasRedFlag = selectedSymptoms.some((s) =>
      ['Chest Pain', 'Shortness of Breath', 'Severe Dizziness', 'High Fever (>103°F)'].includes(s)
    );

    if (hasRedFlag || symptomSeverity === 'severe') {
      setTriageResult({
        level: 'emergency',
        title: 'Immediate Clinical Attention Required',
        description:
          'Your reported symptoms indicate a potential high-risk condition. Do not delay.',
        recommendations: [
          'Call 108 immediately for free emergency government ambulance dispatch.',
          'Proceed immediately to Diamond Harbour District Hospital or nearest Emergency Room.',
          'Keep the patient seated comfortably in an upright position with adequate airflow.',
        ],
      });
    } else if (
      selectedSymptoms.includes('Fever') ||
      selectedSymptoms.includes('Cough & Cold') ||
      selectedSymptoms.includes('Stomach Pain') ||
      symptomDuration === 'week'
    ) {
      setTriageResult({
        level: 'phc',
        title: 'Primary Health Centre (PHC) Visit Recommended',
        description:
          'Your symptoms warrant an in-person clinical assessment by a medical officer within 24 hours.',
        recommendations: [
          'Visit Sonpur PHC during morning OPD (8:00 AM - 2:00 PM).',
          'Drink boiled drinking water and ORS solution to prevent dehydration.',
          'Consult with your assigned village ASHA worker for doorstep vital checks.',
        ],
      });
    } else {
      setTriageResult({
        level: 'home',
        title: 'Mild Symptoms — Supportive Home Care Advised',
        description:
          'Your symptoms appear mild and manageable with basic supportive care and monitoring.',
        recommendations: [
          'Take plenty of rest and stay hydrated with light meals.',
          'Monitor body temperature twice daily.',
          'If symptoms worsen or persist beyond 48 hours, visit your local Primary Health Centre.',
        ],
      });
    }
  };

  const toggleSymptom = (symptom: string) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
    setTriageResult(null);
  };

  // Handle Booking Consultation
  const handleBookConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newApptId = `appt_pat_${Date.now()}`;
      await db.appointments.add({
        id: newApptId,
        patient_name: user?.full_name || 'Sunil Das',
        patient_phone: user?.phone || '+91 98765 43210',
        doctor_name: bookingDoctor,
        doctor_specialty: 'General Medicine / Rural Health',
        doctor_address: 'Sonpur Primary Health Centre (PHC)',
        appointment_date: bookingDate,
        appointment_time: bookingSlot.split(' - ')[0],
        status: 'CONFIRMED',
        notes: `Patient Portal Booking: ${bookingReason}`,
        risk_level: 'LOW',
        likely_conditions: [],
        server_version: 1,
        local_version: 1,
        is_deleted: false,
        sync_state: 'QUEUED',
        synced: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      setBookingSuccess(true);
      setTimeout(() => {
        setBookingSuccess(false);
        setActiveTab('appointments');
      }, 1500);
    } catch (err) {
      console.warn('Could not save appointment:', err);
    }
  };

  // Handle AI Chat Send
  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text) return;

    const userMsg = {
      sender: 'user' as const,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    // Generate responsive helpful advice
    setTimeout(() => {
      let reply = '';
      const lower = text.toLowerCase();
      if (lower.includes('fever') || lower.includes('temperature') || lower.includes('बुखार') || lower.includes('জ্বর')) {
        reply =
          language === 'hi'
            ? 'यदि बुखार 100°F से अधिक है, तो माथे पर ठंडे पानी की पट्टी रखें और ओआरएस/तरल पदार्थ पिएं। यदि 48 घंटे में बुखार न उतरे, तो तुरंत पीएचसी सोनपुर जाएं।'
            : language === 'bn'
            ? 'জ্বর ১০০ ডিগ্রির বেশি হলে মাথায় জলপট্টি দিন ও প্রচুর ওআরএস জল পান করুন। ৪৮ ঘণ্টার বেশি জ্বর থাকলে অবিলম্বে সোনপুর পিএইচসিতে ডাক্তার দেখান।'
            : 'For fever above 100°F, apply cool damp cloth to the forehead and drink plenty of ORS / boiled water. If fever persists past 48 hours, visit Sonpur PHC.';
      } else if (lower.includes('hospital') || lower.includes('doctor') || lower.includes('डॉक्टर') || lower.includes('হাসপাতাল')) {
        reply =
          language === 'hi'
            ? 'सोनपुर प्राथमिक स्वास्थ्य केंद्र (PHC) आपके सबसे करीब है (1.4 किमी)। यह 24/7 खुला रहता है। आप अपॉइंटमेंट टैब से सीधे डॉक्टर परामर्श बुक कर सकते हैं।'
            : language === 'bn'
            ? 'সোনপুর প্রাথমিক স্বাস্থ্যকেন্দ্র আপনার নিকটতম (১.৪ কিমি)। এটি ২৪ ঘণ্টা খোলা থাকে। আপনি অ্যাপয়েন্টমেন্ট ট্যাব থেকে ডাক্তারের পরামর্শ বুক করতে পারেন।'
            : 'Sonpur PHC is closest to you (1.4 km, open 24/7). You can also book a teleconsultation directly from the Book Consultation tab.';
      } else {
        reply =
          language === 'hi'
            ? 'यह एक आम स्वास्थ्य प्रश्न है। सामान्य देखभाल के लिए पर्याप्त आराम करें, साफ पानी पिएं, और किसी भी चिंताजनक लक्षण पर अपनी स्थानीय आशा कार्यकर्ता या पीएचसी डॉक्टर से संपर्क करें।'
            : language === 'bn'
            ? 'এটি একটি গুরুত্বপূর্ণ স্বাস্থ্য সম্পর্কিত প্রশ্ন। সাধারণ পরিচর্যার জন্য বিশ্রাম নিন, বিশুদ্ধ জল পান করুন এবং সন্দেহ হলে স্থানীয় আশা দিদি বা চিকিৎসকের পরামর্শ নিন।'
            : 'Thank you for your question. For routine wellness, stay hydrated and get adequate rest. If you experience severe symptoms, visit your Primary Health Centre.';
      }

      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 600);
  };

  const handleAddFamilyMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    setFamilyMembers((prev) => [
      ...prev,
      {
        name: newMemberName.trim(),
        relation: newMemberRelation,
        age: parseInt(newMemberAge) || 25,
        bloodGroup: newMemberBlood,
        lastCheckup: 'Not recorded',
      },
    ]);
    setNewMemberName('');
    setNewMemberAge('');
    setShowAddFamilyModal(false);
  };

  return (
    <div className="min-h-screen bg-[#F4FBF8] text-[#12345B] flex flex-col font-sans selection:bg-[#12B981] selection:text-white">
      {/* 1. Emergency Helpline Ribbon */}
      <div className="bg-[#0F355C] text-white px-3 sm:px-6 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-white/10">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <span>🚨 Emergency Helplines:</span>
          <a
            href="tel:108"
            className="font-bold text-emerald-300 hover:text-white underline underline-offset-2 ml-1"
          >
            108 (Free Ambulance)
          </a>
          <span className="text-slate-400">•</span>
          <a
            href="tel:102"
            className="font-bold text-emerald-300 hover:text-white underline underline-offset-2"
          >
            102 (Mother & Child)
          </a>
          <span className="text-slate-400">•</span>
          <span className="text-slate-300">104 (National Health Helpline)</span>
        </div>
        <div className="text-[11px] text-emerald-300 font-semibold hidden sm:inline">
          Village: Sonpur • Primary Health Care Network
        </div>
      </div>

      {/* 2. Accessible Header Navigation */}
      <header className="bg-white border-b border-[#DCEBE5] sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          {/* Logo & Portal Identity */}
          <div className="flex items-center gap-3">
            <RuralHealthLogo size="md" theme="light" />
            <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F8F2] text-[#0A9F68] text-xs font-bold border border-[#A8E6CE]">
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>Patient & Citizen Portal</span>
            </div>
          </div>

          {/* Right Controls: User Greeting, Language Switcher, Sign Out */}
          <div className="flex items-center gap-3">
            {/* User Info Badge */}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-extrabold text-[#102A56] leading-tight">
                {user?.full_name || 'Sunil Das'}
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold">General User / Patient</span>
            </div>

            {/* Language Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 hover:border-slate-300 bg-slate-50 text-xs font-semibold text-[#102A56] cursor-pointer transition-colors"
                title="Change language"
              >
                <Globe className="w-3.5 h-3.5 text-[#0A9F68]" />
                <span>
                  {language === 'en' ? 'EN' : language === 'hi' ? 'हिन्दी' : 'বাংলা'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {langDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 animate-in fade-in duration-150">
                  {(['en', 'hi', 'bn'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        setLanguage(l);
                        setLangDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                        language === l ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                      }`}
                    >
                      {l === 'en' ? 'English' : l === 'hi' ? 'हिन्दी (Hindi)' : 'বাংলা (Bengali)'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-xs font-bold text-slate-600 hover:text-rose-600 cursor-pointer transition-all"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* 3. Horizontal Scrollable Feature Tabs */}
        <div className="border-t border-slate-100 bg-[#F8FCFA] px-4 sm:px-6 overflow-x-auto scrollbar-none">
          <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 py-2 min-w-max">
            <button
              type="button"
              onClick={() => setActiveTab('symptoms')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'symptoms'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>Check Symptoms</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hospitals')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'hospitals'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Find Hospital</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('consultation')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'consultation'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Book Consultation</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('assistant')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'assistant'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Ask Health Assistant</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'records'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>My Health</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'appointments'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>My Appointments</span>
              {liveAppointments.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0A9F68] text-[10px] flex items-center justify-center font-bold">
                  {liveAppointments.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('family')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'family'
                  ? 'bg-[#10B981] text-white shadow-sm'
                  : 'text-[#476078] hover:bg-white hover:text-[#102A56]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Family Health</span>
            </button>
          </div>
        </div>
      </header>

      {/* 4. Tab Views Content Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        {/* ── TAB 1: CHECK SYMPTOMS ────────────────────────────────────────── */}
        {activeTab === 'symptoms' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Greeting Banner */}
            <div className="bg-gradient-to-r from-white to-[#E8F8F2] p-6 rounded-3xl border border-[#DCEBE5] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-2">
                  <Activity className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Doorstep Clinical Triage</span>
                </span>
                <h2 className="text-2xl font-black text-[#102A56]">
                  What symptoms are you experiencing today?
                </h2>
                <p className="text-xs sm:text-sm text-[#52677F] mt-1">
                  Select your symptoms below for immediate guidance, red-flag detection, and referral recommendations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('hospitals')}
                className="px-4 py-2.5 rounded-full bg-white border border-[#10B981] text-[#0A9F68] hover:bg-[#10B981] hover:text-white text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
              >
                Find Nearest Hospital →
              </button>
            </div>

            {/* Interactive Symptom Selector */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#DCEBE5] shadow-xs space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#102A56] mb-3">
                  1. Tap Common Symptoms (Select all that apply)
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {[
                    'Fever',
                    'Cough & Cold',
                    'Chest Pain',
                    'Shortness of Breath',
                    'Severe Headache',
                    'Stomach Pain',
                    'Skin Rash',
                    'Vomiting / Diarrhea',
                    'Severe Dizziness',
                    'Joint & Body Ache',
                    'High Fever (>103°F)',
                    'Loss of Appetite',
                  ].map((symptom) => {
                    const isSelected = selectedSymptoms.includes(symptom);
                    const isUrgent = [
                      'Chest Pain',
                      'Shortness of Breath',
                      'High Fever (>103°F)',
                      'Severe Dizziness',
                    ].includes(symptom);

                    return (
                      <button
                        key={symptom}
                        type="button"
                        onClick={() => toggleSymptom(symptom)}
                        className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer border ${
                          isSelected
                            ? isUrgent
                              ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-200 font-bold'
                              : 'bg-[#10B981] border-[#10B981] text-white font-bold shadow-xs'
                            : isUrgent
                            ? 'bg-rose-50/50 border-rose-200 text-rose-800 hover:border-rose-400'
                            : 'bg-slate-50 border-slate-200 text-[#102A56] hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 inline mr-1.5" />}
                        {symptom}
                        {isUrgent && !isSelected && (
                          <span className="text-rose-500 text-[10px] ml-1.5 font-bold">⚠️ Urgent</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration and Severity Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#102A56] mb-2">
                    2. How long have you felt this way?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'today', label: 'Started Today' },
                      { key: 'few_days', label: '2 - 3 Days' },
                      { key: 'week', label: 'Over a Week' },
                    ].map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => {
                          setSymptomDuration(d.key as any);
                          setTriageResult(null);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                          symptomDuration === d.key
                            ? 'bg-[#102A56] text-white border-[#102A56]'
                            : 'bg-slate-50 text-[#52677F] border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#102A56] mb-2">
                    3. Severity Level
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'mild', label: 'Mild (Manageable)' },
                      { key: 'moderate', label: 'Moderate' },
                      { key: 'severe', label: 'Severe (Disruptive)' },
                    ].map((sev) => (
                      <button
                        key={sev.key}
                        type="button"
                        onClick={() => {
                          setSymptomSeverity(sev.key as any);
                          setTriageResult(null);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                          symptomSeverity === sev.key
                            ? sev.key === 'severe'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-[#10B981] text-white border-[#10B981]'
                            : 'bg-slate-50 text-[#52677F] border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sev.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assessment Submit Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRunTriage}
                  disabled={selectedSymptoms.length === 0}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#10B981] hover:bg-[#0A9F68] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Activity className="w-4 h-4" />
                  <span>Check My Symptoms Now ({selectedSymptoms.length} selected)</span>
                </button>
              </div>

              {/* Triage Guidance Card */}
              {triageResult && (
                <div
                  role="alert"
                  className={`p-6 rounded-2xl border-2 transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
                    triageResult.level === 'emergency'
                      ? 'bg-rose-50 border-rose-400 text-rose-950'
                      : triageResult.level === 'phc'
                      ? 'bg-amber-50 border-amber-400 text-amber-950'
                      : 'bg-emerald-50 border-emerald-400 text-emerald-950'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {triageResult.level === 'emergency' ? (
                      <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                    ) : triageResult.level === 'phc' ? (
                      <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    )}

                    <div className="space-y-3 flex-1">
                      <div>
                        <div className="text-xs font-extrabold uppercase tracking-wider opacity-80">
                          Clinical Triage Assessment
                        </div>
                        <h3 className="text-lg font-black tracking-tight">{triageResult.title}</h3>
                        <p className="text-xs sm:text-sm mt-1 opacity-90">{triageResult.description}</p>
                      </div>

                      <div className="bg-white/80 p-4 rounded-xl border border-black/5 space-y-1.5">
                        <div className="text-xs font-bold">Recommended Immediate Actions:</div>
                        {triageResult.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="font-bold">•</span>
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3 pt-1">
                        {triageResult.level === 'emergency' ? (
                          <a
                            href="tel:108"
                            className="px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md inline-flex items-center gap-2"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call 108 Free Ambulance</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveTab('consultation')}
                            className="px-5 py-2.5 rounded-full bg-[#10B981] hover:bg-[#0A9F68] text-white font-bold text-xs shadow-md inline-flex items-center gap-2 cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Book Consultation at Sonpur PHC</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveTab('hospitals')}
                          className="px-5 py-2.5 rounded-full bg-white border border-slate-300 hover:bg-slate-50 text-[#102A56] font-bold text-xs cursor-pointer"
                        >
                          View Facility Directory
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: FIND HOSPITAL ────────────────────────────────────────── */}
        {activeTab === 'hospitals' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-3xl border border-[#DCEBE5] shadow-xs">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black text-[#102A56]">
                    Nearby Hospitals & Health Centres
                  </h2>
                  <p className="text-xs sm:text-sm text-[#52677F] mt-1">
                    Verified public health facilities serving Sonpur, Bishnupur, and surrounding rural blocks.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={facilitySearch}
                    onChange={(e) => setFacilitySearch(e.target.value)}
                    placeholder="Search by name or block..."
                    className="w-full pl-10 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981]"
                  />
                </div>
              </div>

              {/* Facility Filter Chips */}
              <div className="flex flex-wrap gap-2 mb-6">
                {(['ALL', 'PHC', 'District Hospital', 'Sub-Centre'] as const).map((filterType) => (
                  <button
                    key={filterType}
                    type="button"
                    onClick={() => setFacilityFilter(filterType)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      facilityFilter === filterType
                        ? 'bg-[#10B981] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filterType === 'ALL' ? 'All Facilities' : filterType}
                  </button>
                ))}
              </div>

              {/* Facility Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SAMPLE_FACILITIES.filter((f) => {
                  const matchSearch =
                    f.name.toLowerCase().includes(facilitySearch.toLowerCase()) ||
                    f.address.toLowerCase().includes(facilitySearch.toLowerCase());
                  const matchType = facilityFilter === 'ALL' || f.type === facilityFilter;
                  return matchSearch && matchType;
                }).map((fac) => (
                  <div
                    key={fac.id}
                    className="p-5 rounded-2xl border border-slate-200 hover:border-[#10B981] bg-slate-50/50 hover:bg-white transition-all shadow-2xs hover:shadow-md flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#E8F8F2] text-[#0A9F68] mb-1">
                            {fac.type}
                          </div>
                          <h3 className="text-base font-extrabold text-[#102A56]">{fac.name}</h3>
                        </div>
                        <span className="text-xs font-bold text-[#10B981] bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
                          📍 {fac.distance}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-[#52677F] mb-3">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span>{fac.address}</span>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            fac.emergency24x7 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        ></span>
                        <span className="text-xs font-semibold text-[#102A56]">
                          {fac.emergency24x7 ? '24/7 Emergency Services Active' : 'OPD: 8 AM - 4 PM'}
                        </span>
                      </div>

                      {/* Services list */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {fac.services.map((srv, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-600"
                          >
                            {srv}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between">
                      <a
                        href={`tel:${fac.phone}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A9F68] hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call {fac.phone}</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          setBookingDoctor(`Medical Officer (${fac.name})`);
                          setActiveTab('consultation');
                        }}
                        className="px-3 py-1.5 rounded-full bg-[#10B981] hover:bg-[#0A9F68] text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        Book Visit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: BOOK CONSULTATION ────────────────────────────────────── */}
        {activeTab === 'consultation' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#DCEBE5] shadow-xs">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-2">
                  <Calendar className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Free Teleconsultation & OPD Booking</span>
                </span>
                <h2 className="text-2xl font-black text-[#102A56]">
                  Schedule a Doctor Consultation
                </h2>
                <p className="text-xs sm:text-sm text-[#52677F] mt-1">
                  Connect with Primary Health Centre medical officers without waiting in long clinic queues.
                </p>
              </div>

              {bookingSuccess && (
                <div
                  role="alert"
                  className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2.5 animate-in fade-in"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    Appointment confirmed! Your teleconsultation token has been saved to My Appointments.
                  </span>
                </div>
              )}

              <form onSubmit={handleBookConsultation} className="space-y-4">
                {/* Doctor / Facility */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Select Healthcare Professional / Facility <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={bookingDoctor}
                    onChange={(e) => setBookingDoctor(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-[#102A56] font-semibold focus:outline-none focus:border-[#10B981]"
                  >
                    <option value="Dr. Rajesh Sharma, MBBS (PHC Sonpur)">
                      Dr. Rajesh Sharma, MBBS — Sonpur PHC (General Medicine)
                    </option>
                    <option value="Dr. Priya Mondal, MD (Maternal Health)">
                      Dr. Priya Mondal, MD — Bishnupur BPHC (Maternal & Child Health)
                    </option>
                    <option value="Anita Roy (Senior ASHA Supervisor)">
                      Anita Roy (ASHA Supervisor) — Doorstep Vital Check & Counseling
                    </option>
                  </select>
                </div>

                {/* Date & Time Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Preferred Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-[#102A56] focus:outline-none focus:border-[#10B981]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Time Slot <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={bookingSlot}
                      onChange={(e) => setBookingSlot(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-[#102A56] focus:outline-none focus:border-[#10B981]"
                    >
                      <option value="09:00 AM - 10:00 AM">Morning: 09:00 AM - 10:00 AM</option>
                      <option value="10:00 AM - 11:00 AM">Morning: 10:00 AM - 11:00 AM</option>
                      <option value="11:30 AM - 12:30 PM">Noon: 11:30 AM - 12:30 PM</option>
                      <option value="02:30 PM - 03:30 PM">Afternoon: 02:30 PM - 03:30 PM</option>
                    </select>
                  </div>
                </div>

                {/* Reason for visit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Reason for Consultation <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={bookingReason}
                    onChange={(e) => setBookingReason(e.target.value)}
                    placeholder="Briefly describe what symptoms or questions you have (e.g. fever for 2 days, checking blood pressure)..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-[#102A56] focus:outline-none focus:border-[#10B981]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-full bg-[#10B981] hover:bg-[#0A9F68] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Confirm Appointment</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB 4: ASK HEALTH ASSISTANT ─────────────────────────────────── */}
        {activeTab === 'assistant' && (
          <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl border border-[#DCEBE5] shadow-xs overflow-hidden flex flex-col h-[600px]">
              {/* Chat Header */}
              <div className="p-4 sm:p-5 bg-[#0F355C] text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base leading-snug">
                      RuralHealth AI Citizen Assistant
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Verified Guidance • Hindi, Bengali, English</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] bg-white/10 px-3 py-1 rounded-full text-slate-300 hidden sm:block">
                  Confidential & Non-Judgmental
                </div>
              </div>

              {/* Chat Message Scroll */}
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/50">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${
                      msg.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-[#10B981] text-white rounded-br-none shadow-xs font-medium'
                          : 'bg-white text-[#102A56] rounded-bl-none border border-slate-200 shadow-2xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
                  </div>
                ))}
              </div>

              {/* Quick Prompt Suggestion Chips */}
              <div className="p-2 sm:px-4 bg-slate-100 border-t border-slate-200 flex items-center gap-2 overflow-x-auto scrollbar-none text-[11px]">
                <span className="font-bold text-slate-500 whitespace-nowrap">Suggested:</span>
                {[
                  'What to do for high fever?',
                  'How to prevent dehydration?',
                  'Nearby free ambulance number?',
                  'Routine baby vaccine schedule?',
                ].map((sugg) => (
                  <button
                    key={sugg}
                    type="button"
                    onClick={() => {
                      setChatInput(sugg);
                    }}
                    className="px-2.5 py-1 rounded-full bg-white border border-slate-300 text-slate-700 hover:border-[#10B981] whitespace-nowrap cursor-pointer transition-colors"
                  >
                    {sugg}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder="Type your health question (English, हिन्दी, বাংলা)..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-xs sm:text-sm text-[#102A56] focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  className="w-10 h-10 rounded-full bg-[#10B981] hover:bg-[#0A9F68] text-white flex items-center justify-center cursor-pointer transition-colors shrink-0 shadow-xs"
                >
                  <Send className="w-4 h-4 translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: MY HEALTH RECORDS ────────────────────────────────────── */}
        {activeTab === 'records' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Citizen Digital Health Card */}
            <div className="bg-gradient-to-r from-[#102A56] via-[#0E3E5B] to-[#0A634E] text-white p-6 sm:p-8 rounded-3xl shadow-md relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-[11px] font-bold border border-white/15 mb-2">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Ayushman Bharat / NDHM Aligned</span>
                  </div>
                  <h2 className="text-2xl font-black">{user?.full_name || 'Sunil Das'}</h2>
                  <div className="text-xs text-slate-300 font-mono mt-1">
                    Health ID: 91-8821-4920-1102 • Sonpur Village
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-slate-300 font-semibold uppercase">Registered Facility</div>
                  <div className="text-sm font-bold text-white">Sonpur Primary Health Centre</div>
                  <div className="text-[11px] text-emerald-300">Frontline ASHA: Anita Roy</div>
                </div>
              </div>
            </div>

            {/* Vital Signs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">Blood Pressure</span>
                  <Heart className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-2xl font-black text-[#102A56]">120 / 80</div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">● Optimal Range</div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">Heart Rate</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-[#102A56]">74 <span className="text-xs font-normal">bpm</span></div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">● Regular Rhythm</div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">Blood Sugar</span>
                  <Droplets className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-black text-[#102A56]">98 <span className="text-xs font-normal">mg/dL</span></div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">● Fasting Normal</div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">Vaccines</span>
                  <CheckCircle2 className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-black text-[#102A56]">Up to Date</div>
                <div className="text-[11px] text-slate-500 font-medium mt-1">Tetanus / COVID Verified</div>
              </div>
            </div>

            {/* Past Screening Encounters */}
            <div className="bg-white p-6 rounded-3xl border border-[#DCEBE5] shadow-xs">
              <h3 className="text-base font-extrabold text-[#102A56] mb-4">
                Recent Community Health Screenings
              </h3>
              <div className="space-y-3">
                {[
                  {
                    date: '12 Oct 2026',
                    type: 'Annual Vital Signs Screening',
                    worker: 'Anita Roy (ASHA)',
                    status: 'NORMAL',
                    summary: 'Blood pressure within normal limits. SpO2 99%. No chronic symptoms.',
                  },
                  {
                    date: '14 May 2026',
                    type: 'Monsoon Seasonal Health Check',
                    worker: 'Sonpur Sub-Centre Camp',
                    status: 'NORMAL',
                    summary: 'Oral rehydration packets provided. Routine vital signs normal.',
                  },
                ].map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-500">{rec.date} • {rec.worker}</div>
                      <div className="text-sm font-bold text-[#102A56] mt-0.5">{rec.type}</div>
                      <div className="text-xs text-slate-600 mt-1">{rec.summary}</div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 shrink-0">
                      {rec.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 6: MY APPOINTMENTS ──────────────────────────────────────── */}
        {activeTab === 'appointments' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-3xl border border-[#DCEBE5] shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-[#102A56]">
                    Your Teleconsultations & Appointments
                  </h2>
                  <p className="text-xs sm:text-sm text-[#52677F] mt-1">
                    Track confirmed consultations with medical officers and frontline staff.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('consultation')}
                  className="px-4 py-2 rounded-full bg-[#10B981] hover:bg-[#0A9F68] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  + Book New
                </button>
              </div>

              {liveAppointments.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CalendarDays className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">No active appointments found.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Book a free consultation with Dr. Sharma at Sonpur Primary Health Centre.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('consultation')}
                    className="mt-4 px-5 py-2.5 rounded-full bg-[#10B981] text-white text-xs font-bold"
                  >
                    Book Consultation Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {liveAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                            {appt.doctor_specialty || 'General Consultation'}
                          </span>
                          <span className="text-xs font-bold text-[#10B981]">
                            {appt.status || 'CONFIRMED'}
                          </span>
                        </div>
                        <h4 className="text-base font-extrabold text-[#102A56]">
                          {appt.doctor_name || 'Dr. Rajesh Sharma, MBBS'}
                        </h4>
                        <div className="text-xs text-[#52677F] mt-1 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {appt.appointment_date} at {appt.appointment_time || '10:00 AM'}
                          </span>
                        </div>
                        {appt.notes && (
                          <div className="text-xs text-slate-600 mt-1 bg-white p-2 rounded-lg border border-slate-200/60">
                            {appt.notes}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveTab('assistant')}
                          className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-[#102A56] cursor-pointer"
                        >
                          Ask Question
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 7: FAMILY HEALTH ────────────────────────────────────────── */}
        {activeTab === 'family' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-3xl border border-[#DCEBE5] shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-[#102A56]">
                    Family Health Care
                  </h2>
                  <p className="text-xs sm:text-sm text-[#52677F] mt-1">
                    Manage health checkups, vaccination schedules, and appointments for your household.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddFamilyModal(true)}
                  className="px-4 py-2 rounded-full bg-[#10B981] hover:bg-[#0A9F68] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Family Member</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {familyMembers.map((member, i) => (
                  <div
                    key={i}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all shadow-2xs hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#0A9F68] flex items-center justify-center font-bold text-sm">
                        {member.name.charAt(0)}
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                        {member.relation}
                      </span>
                    </div>

                    <h4 className="text-base font-extrabold text-[#102A56]">{member.name}</h4>
                    <div className="text-xs text-[#52677F] mt-1">Age: {member.age} • Blood Group: {member.bloodGroup}</div>

                    <div className="mt-4 pt-3 border-t border-slate-200/60 text-xs">
                      <span className="text-slate-400">Last Assessment:</span>
                      <div className="font-semibold text-slate-700 mt-0.5">{member.lastCheckup}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 5. Add Family Member Modal */}
      {showAddFamilyModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setShowAddFamilyModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-black text-[#102A56] mb-4">Add Family Member</h3>

            <form onSubmit={handleAddFamilyMember} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Meera Das"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#102A56]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Relationship</label>
                  <select
                    value={newMemberRelation}
                    onChange={(e) => setNewMemberRelation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#102A56]"
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Age (Years)</label>
                  <input
                    type="number"
                    required
                    value={newMemberAge}
                    onChange={(e) => setNewMemberAge(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#102A56]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Blood Group</label>
                <select
                  value={newMemberBlood}
                  onChange={(e) => setNewMemberBlood(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#102A56]"
                >
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-full bg-[#10B981] text-white font-bold text-xs mt-2"
              >
                Save Family Member
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Footer */}
      <footer className="py-4 text-center text-xs text-slate-400 bg-white border-t border-slate-100">
        RuralHealth AI Citizen Network • Primary Health Centre Sonpur • Confidential Medical Records
      </footer>
    </div>
  );
};
