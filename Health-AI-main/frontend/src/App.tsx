import React, { useState, useEffect } from 'react';
import { RuralHealthDashboard } from './components/dashboard/RuralHealthDashboard';
import type { DashboardNavTab } from './components/dashboard/DashboardSidebar';
import { ScreenPatientPage } from './components/screening/ScreenPatientPage';
import { PhcDashboard } from './components/PhcDashboard';
import { PatientDirectory } from './components/PatientDirectory';
import { HealthChatbot } from './components/HealthChatbot';
import { ChatAssistantPage } from './components/ChatAssistantPage';
import { TeleconsultBooking } from './components/TeleconsultBooking';
import { HealthResourcesModal } from './components/dashboard/HealthResourcesModal';
import { PopulationHealthPanel } from './components/dashboard/population/PopulationHealthPanel';
import { RuralHealthHomepage } from './components/home/RuralHealthHomepage';
import { LoginPage } from './components/auth/LoginPage';
import { useAuth } from './auth/AuthContext';
import { useLanguage } from './i18n';
import { db } from './db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';
import WaterDropClick from './components/WaterDropClick';
import { ArrowLeft } from 'lucide-react';

export type AppView = 'home' | 'login' | 'app';

export function App() {
  const { isAuthenticated, logout } = useAuth();
  const { language: lang, setLanguage: setLang } = useLanguage();

  // Track high-level view (home, login, app)
  const [currentView, setCurrentView] = useState<AppView>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'login') return 'login';
    if (hash === 'dashboard' || hash === 'screen' || hash === 'patients' || hash === 'referrals' || hash === 'appointments' || hash === 'population_health' || hash === 'analytics' || hash === 'chat') {
      const savedUser = localStorage.getItem('rapidcheck_user');
      const savedToken = localStorage.getItem('rapidcheck_token');
      return savedUser && savedToken ? 'app' : 'login';
    }
    return 'home';
  });

  const [currentTab, setCurrentTab] = useState<DashboardNavTab>(() => {
    const hash = window.location.hash.replace('#', '') as DashboardNavTab;
    const validTabs: DashboardNavTab[] = ['dashboard', 'screen', 'patients', 'referrals', 'appointments', 'analytics', 'population_health', 'chat', 'resources'];
    return validTabs.includes(hash) ? hash : 'dashboard';
  });

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [showResourcesModal, setShowResourcesModal] = useState<boolean>(false);

  // Unsynced count from Dexie IndexedDB
  const unsyncedPatients = useLiveQuery(() => db.patients.where('synced').equals(0).toArray()) || [];
  const unsyncedAssessments = useLiveQuery(() => db.assessments.where('synced').equals(0).toArray()) || [];
  const unsyncedAppointments = useLiveQuery(() => db.appointments.where('synced').equals(0).toArray()) || [];
  const pendingSyncCount = unsyncedPatients.length + unsyncedAssessments.length + unsyncedAppointments.length;

  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval>;

    // Check if the backend is actually reachable
    const checkBackend = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/health', {
          signal: AbortSignal.timeout(3000),
        });
        setIsOnline(res.ok);
      } catch {
        setIsOnline(false);
      }
    };

    const handleOnline = () => checkBackend();
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkBackend();
    heartbeatTimer = setInterval(checkBackend, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(heartbeatTimer);
    };
  }, []);

  // Sync hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'login') {
        if (isAuthenticated) {
          setCurrentView('app');
        } else {
          setCurrentView('login');
        }
      } else if (hash === 'home' || hash === '') {
        setCurrentView('home');
      } else if (['dashboard', 'screen', 'patients', 'referrals', 'appointments', 'population_health', 'analytics', 'chat'].includes(hash)) {
        if (!isAuthenticated) {
          setCurrentView('login');
        } else {
          setCurrentView('app');
          setCurrentTab(hash as DashboardNavTab);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAuthenticated]);

  // Show toast + trigger sync whenever online status changes
  const prevOnlineRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (prevOnlineRef.current === null) {
      prevOnlineRef.current = isOnline;
      return;
    }
    if (isOnline && prevOnlineRef.current === false) {
      showNotification('Backend connected. Syncing offline records...');
      triggerSync();
    }
    if (!isOnline && prevOnlineRef.current === true) {
      showNotification('Operating in OFFLINE mode. All data saved locally.');
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const triggerSync = async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);

    try {
      const pList = await db.patients.where('synced').equals(0).toArray();
      const aList = await db.assessments.where('synced').equals(0).toArray();
      const apptList = await db.appointments.where('synced').equals(0).toArray();

      if (pList.length === 0 && aList.length === 0 && apptList.length === 0) {
        setIsSyncing(false);
        return;
      }

      if (pList.length > 0 || aList.length > 0) {
        const response = await fetch('http://127.0.0.1:8000/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patients: pList, assessments: aList })
        });
        if (response.ok) {
          for (const p of pList) await db.patients.update(p.id, { synced: true });
          for (const a of aList) await db.assessments.update(a.id, { synced: true });
        }
      }

      let syncedAppts = 0;
      for (const appt of apptList) {
        try {
          await fetch(`http://127.0.0.1:8000/api/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...appt, likely_conditions: appt.likely_conditions || [] })
          });
          await db.appointments.update(appt.id, { synced: true });
          syncedAppts++;
        } catch { /* skip */ }
      }

      showNotification(`Sync Complete! ${pList.length} patients, ${aList.length} assessments, ${syncedAppts} appointments synced.`);
    } catch (err) {
      console.warn('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNavigateTab = (tab: DashboardNavTab) => {
    if (tab === 'resources') {
      setShowResourcesModal(true);
      return;
    }
    setCurrentTab(tab);
    window.location.hash = tab;
  };

  const handleSignIn = () => {
    if (isAuthenticated) {
      setCurrentView('app');
      setCurrentTab('dashboard');
      window.location.hash = 'dashboard';
    } else {
      setCurrentView('login');
      window.location.hash = 'login';
    }
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setCurrentView('app');
      setCurrentTab('dashboard');
      window.location.hash = 'dashboard';
    } else {
      setCurrentView('login');
      window.location.hash = 'login';
    }
  };

  const handleLoginSuccess = () => {
    setCurrentView('app');
    setCurrentTab('dashboard');
    window.location.hash = 'dashboard';
  };

  const handleLogout = () => {
    logout();
    setCurrentView('home');
    window.location.hash = 'home';
  };

  // 1. PUBLIC HOMEPAGE VIEW
  if (currentView === 'home') {
    return (
      <>
        <WaterDropClick />
        <RuralHealthHomepage
          onSignIn={handleSignIn}
          onGetStarted={handleGetStarted}
          lang={lang}
          onLangChange={setLang}
          isAuthenticated={isAuthenticated}
        />
      </>
    );
  }

  // 2. AUTHENTICATION / LOGIN VIEW
  if (currentView === 'login') {
    return (
      <>
        <WaterDropClick />
        <LoginPage
          onSuccess={handleLoginSuccess}
          onBackToHome={() => {
            setCurrentView('home');
            window.location.hash = 'home';
          }}
          lang={lang}
        />
      </>
    );
  }

  // 3. PROTECTED APPLICATION DASHBOARD VIEWS
  // Guard check: if unauthenticated in app view, redirect to login
  if (!isAuthenticated) {
    return (
      <>
        <WaterDropClick />
        <LoginPage
          onSuccess={handleLoginSuccess}
          onBackToHome={() => {
            setCurrentView('home');
            window.location.hash = 'home';
          }}
          lang={lang}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F9FA] text-[#102A56] flex flex-col font-sans selection:bg-[#0A9F68] selection:text-white">
      <WaterDropClick />

      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed top-3 right-4 z-50 bg-[#102A56] text-[#10B981] border border-[#10B981]/40 px-4 py-2.5 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping"></span>
          <span>{notification}</span>
        </div>
      )}

      {/* Top Breadcrumb Bar when viewing Sub-Screens */}
      {currentTab !== 'dashboard' && currentTab !== 'screen' && (
        <div className="bg-white border-b border-[#E5EEF1] px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-xs">
          <button
            onClick={() => handleNavigateTab('dashboard')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E7F7F0] text-[#0A9F68] hover:bg-[#0A9F68] hover:text-white font-bold text-xs transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-slate-400">RuralHealth AI</span>
            <span className="text-slate-300">/</span>
            <span className="text-[#102A56] capitalize font-bold">
              {currentTab === 'patients'
                ? 'Patient Directory'
                : currentTab === 'referrals'
                ? 'IDRC Referrals & Care'
                : currentTab === 'appointments'
                ? 'Doctor Appointments'
                : currentTab === 'population_health'
                ? 'Population Health Intelligence (HMIS + NFHS-5)'
                : currentTab === 'analytics'
                ? 'Analytics'
                : 'Chat Assistant'}
            </span>
          </div>
        </div>
      )}

      {/* Main View Switcher */}
      <div className="flex-1">
        {currentTab === 'dashboard' && (
          <RuralHealthDashboard
            lang={lang}
            onLangChange={setLang}
            isOnline={isOnline}
            pendingSyncCount={pendingSyncCount}
            onSyncTrigger={triggerSync}
            isSyncing={isSyncing}
            onNavigateToTab={handleNavigateTab}
            onStartScreeningPatient={() => {
              handleNavigateTab('screen');
            }}
            onLogout={handleLogout}
          />
        )}

        {currentTab === 'screen' && (
          <ScreenPatientPage
            lang={lang}
            onLangChange={setLang}
            isOnline={isOnline}
            pendingSyncCount={pendingSyncCount}
            onSyncTrigger={triggerSync}
            isSyncing={isSyncing}
            onNavigateToTab={handleNavigateTab}
            onBookTeleconsult={() => handleNavigateTab('appointments')}
          />
        )}

        {currentTab === 'patients' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <PatientDirectory lang={lang} isOnline={isOnline} />
          </div>
        )}

        {(currentTab === 'referrals' || currentTab === 'analytics') && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <PhcDashboard
              lang={lang}
              isOnline={isOnline}
              defaultRiskFilter={currentTab === 'referrals' ? 'HIGH' : 'ALL'}
            />
          </div>
        )}

        {currentTab === 'appointments' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <TeleconsultBooking lang={lang} isOnline={isOnline} />
          </div>
        )}

        {currentTab === 'population_health' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <PopulationHealthPanel isOnline={isOnline} />
          </div>
        )}

        {currentTab === 'chat' && (
          <ChatAssistantPage lang={lang} isOnline={isOnline} />
        )}
      </div>

      {/* Floating Chat Assistant (Active on any dashboard screen) */}
      <HealthChatbot lang={lang} isOnline={isOnline} />

      {/* Health Resources Modal */}
      <HealthResourcesModal
        isOpen={showResourcesModal}
        onClose={() => setShowResourcesModal(false)}
      />
    </div>
  );
}

export default App;
