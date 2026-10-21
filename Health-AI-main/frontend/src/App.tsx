import React, { useState, useEffect, useCallback } from 'react';
import { RuralHealthDashboard } from './components/dashboard/RuralHealthDashboard';
import type { DashboardNavTab } from './components/dashboard/DashboardSidebar';
import { ScreenPatientPage } from './components/screening/ScreenPatientPage';
import { IdrcReferralsPage } from './components/referrals/IdrcReferralsPage';
import { AnalysisPage } from './components/analysis/AnalysisPage';
import { PatientDirectory } from './components/PatientDirectory';
import { HealthChatbot } from './components/HealthChatbot';
import { ChatAssistantPage } from './components/ChatAssistantPage';
import { TeleconsultBooking } from './components/TeleconsultBooking';
import { HealthResourcesModal } from './components/dashboard/HealthResourcesModal';
import { PopulationHealthPanel } from './components/dashboard/population/PopulationHealthPanel';
import { StaffManagementPage } from './components/staff/StaffManagementPage';
import { RuralHealthHomepage } from './components/home/RuralHealthHomepage';
import { SignInPage } from './components/auth/SignInPage';
import { SignUpPage } from './components/auth/SignUpPage';
import { RoleSelectionPage } from './components/auth/RoleSelectionPage';
import { PatientRegistrationPage } from './components/auth/PatientRegistrationPage';
import { PatientDashboard } from './components/patient/PatientDashboard';
import { useAuth } from './auth/AuthContext';
import { useLanguage } from './i18n';
import { db } from './db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';
import WaterDropClick from './components/WaterDropClick';
import { ArrowLeft, Globe, ChevronDown } from 'lucide-react';
import { apiFetch } from './api/apiConfig';
import { SyncManager } from './sync/SyncManager';

export type AppView =
  | 'home'
  | 'signin'
  | 'signup'
  | 'role_selection'
  | 'patient_register'
  | 'patient_dashboard'
  | 'app';

const VALID_TABS: DashboardNavTab[] = [
  'dashboard',
  'screen',
  'patients',
  'referrals',
  'appointments',
  'staff',
  'analytics',
  'population_health',
  'chat',
  'resources',
];

function parseLocation(): { view: AppView; tab?: DashboardNavTab } {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');

  // 1. Check for Sign In
  if (path === '/signin' || path === '/login' || hash === 'signin' || hash === 'login') {
    return { view: 'signin' };
  }

  // 2. Check for Get Started / Role Selection
  if (
    path === '/get-started' ||
    path === '/role-selection' ||
    path === '/select-role' ||
    hash === 'get-started' ||
    hash === 'role-selection' ||
    hash === 'select-role'
  ) {
    return { view: 'role_selection' };
  }

  // 3. Check for Professional Registration (Existing SignUpPage)
  if (
    path === '/signup' ||
    path === '/register' ||
    path === '/professional-signup' ||
    hash === 'signup' ||
    hash === 'register' ||
    hash === 'professional-signup'
  ) {
    return { view: 'signup' };
  }

  // 4. Check for Patient Registration
  if (
    path === '/patient-register' ||
    path === '/patient-signup' ||
    path === '/patient-onboarding' ||
    hash === 'patient-register' ||
    hash === 'patient-signup' ||
    hash === 'patient-onboarding'
  ) {
    return { view: 'patient_register' };
  }

  // 5. Check for Patient Dashboard
  if (
    path === '/patient-dashboard' ||
    path === '/patient' ||
    path === '/my-health' ||
    hash === 'patient-dashboard' ||
    hash === 'patient' ||
    hash === 'my-health'
  ) {
    return { view: 'patient_dashboard' };
  }

  // 6. Check for Dashboard tabs
  const tabCandidate = (path.replace(/^\//, '') || hash) as DashboardNavTab;
  if (VALID_TABS.includes(tabCandidate)) {
    return { view: 'app', tab: tabCandidate };
  }

  // 7. Default to Homepage
  return { view: 'home' };
}

export function App() {
  const { isAuthenticated, user, logout } = useAuth();
  const { language: lang, setLanguage: setLang, strings } = useLanguage();
  const [subscreenLangOpen, setSubscreenLangOpen] = useState(false);

  const [currentView, setCurrentView] = useState<AppView>(() => {
    const loc = parseLocation();
    if (
      loc.view === 'signin' ||
      loc.view === 'signup' ||
      loc.view === 'role_selection' ||
      loc.view === 'patient_register' ||
      loc.view === 'patient_dashboard'
    ) {
      return loc.view;
    }
    if (loc.view === 'app') {
      const savedUser = localStorage.getItem('rapidcheck_user');
      const savedToken = localStorage.getItem('rapidcheck_token');
      if (savedUser && savedToken) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed?.role === 'PATIENT') return 'patient_dashboard';
        } catch { /* ignore */ }
        return 'app';
      }
      return 'signin';
    }
    return 'home';
  });

  const [currentTab, setCurrentTab] = useState<DashboardNavTab>(() => {
    const loc = parseLocation();
    return loc.tab || 'dashboard';
  });

  const [prefilledEmail, setPrefilledEmail] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [showResourcesModal, setShowResourcesModal] = useState<boolean>(false);

  // Unsynced count from Dexie IndexedDB
  const unsyncedPatients = useLiveQuery(() => db.patients.filter(p => !p.synced || p.sync_state === 'QUEUED').toArray()) || [];
  const unsyncedAssessments = useLiveQuery(() => db.assessments.filter(a => !a.synced || a.sync_state === 'QUEUED').toArray()) || [];
  const unsyncedAppointments = useLiveQuery(() => db.appointments.filter(ap => !ap.synced || ap.sync_state === 'QUEUED').toArray()) || [];
  const pendingSyncCount = unsyncedPatients.length + unsyncedAssessments.length + unsyncedAppointments.length;

  const navigateTo = useCallback((targetUrl: string) => {
    if (targetUrl.startsWith('#')) {
      window.location.hash = targetUrl;
    } else {
      window.history.pushState({}, '', targetUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);

  // Heartbeat backend connectivity check
  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval>;

    const checkBackend = async () => {
      try {
        const res = await apiFetch('/api/health', {
          timeoutMs: 3000,
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

  // Synchronization with browser history (popstate) & hash changes
  useEffect(() => {
    const handleRouteSync = () => {
      const loc = parseLocation();
      const savedUser = localStorage.getItem('rapidcheck_user');
      let currentRole = user?.role;
      if (savedUser) {
        try {
          currentRole = JSON.parse(savedUser)?.role;
        } catch { /* ignore */ }
      }

      if (loc.view === 'signin') {
        if (isAuthenticated) {
          if (currentRole === 'PATIENT') {
            setCurrentView('patient_dashboard');
            if (window.location.pathname !== '/patient-dashboard' && !window.location.hash) {
              window.history.replaceState({}, '', '/patient-dashboard');
            }
          } else {
            setCurrentView('app');
            setCurrentTab('dashboard');
            if (window.location.pathname !== '/dashboard' && !window.location.hash) {
              window.history.replaceState({}, '', '/dashboard');
            }
          }
        } else {
          setCurrentView('signin');
        }
      } else if (loc.view === 'role_selection') {
        setCurrentView('role_selection');
      } else if (loc.view === 'signup') {
        if (isAuthenticated && currentRole !== 'PATIENT') {
          setCurrentView('app');
          setCurrentTab('dashboard');
          if (window.location.pathname !== '/dashboard' && !window.location.hash) {
            window.history.replaceState({}, '', '/dashboard');
          }
        } else {
          setCurrentView('signup');
        }
      } else if (loc.view === 'patient_register') {
        if (isAuthenticated && currentRole === 'PATIENT') {
          setCurrentView('patient_dashboard');
          if (window.location.pathname !== '/patient-dashboard' && !window.location.hash) {
            window.history.replaceState({}, '', '/patient-dashboard');
          }
        } else {
          setCurrentView('patient_register');
        }
      } else if (loc.view === 'patient_dashboard') {
        if (!isAuthenticated) {
          setCurrentView('signin');
          if (window.location.pathname !== '/signin' && !window.location.hash) {
            window.history.replaceState({}, '', '/signin');
          }
        } else {
          setCurrentView('patient_dashboard');
        }
      } else if (loc.view === 'app') {
        if (!isAuthenticated) {
          setCurrentView('signin');
          if (window.location.pathname !== '/signin' && !window.location.hash) {
            window.history.replaceState({}, '', '/signin');
          }
        } else if (currentRole === 'PATIENT') {
          setCurrentView('patient_dashboard');
          if (window.location.pathname !== '/patient-dashboard' && !window.location.hash) {
            window.history.replaceState({}, '', '/patient-dashboard');
          }
        } else {
          setCurrentView('app');
          if (loc.tab) setCurrentTab(loc.tab);
        }
      } else {
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handleRouteSync);
    window.addEventListener('hashchange', handleRouteSync);
    handleRouteSync();

    return () => {
      window.removeEventListener('popstate', handleRouteSync);
      window.removeEventListener('hashchange', handleRouteSync);
    };
  }, [isAuthenticated, user?.role]);

  // Periodic background synchronization
  useEffect(() => {
    const syncManager = SyncManager.getInstance();
    syncManager.startPeriodicSync(15000);
    return () => {
      syncManager.stopPeriodicSync();
    };
  }, []);

  // Show toast when online/offline transitions occur
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
      const syncResult = await SyncManager.getInstance().runFullSync();

      const pList = await db.patients.filter(p => !p.synced || p.sync_state === 'QUEUED').toArray();
      const aList = await db.assessments.filter(a => !a.synced || a.sync_state === 'QUEUED').toArray();
      const apptList = await db.appointments.filter(ap => !ap.synced || ap.sync_state === 'QUEUED').toArray();

      if (pList.length > 0 || aList.length > 0) {
        const response = await apiFetch('/api/sync', {
          method: 'POST',
          body: JSON.stringify({ patients: pList, assessments: aList }),
          timeoutMs: 15000,
        });
        if (response.ok) {
          for (const p of pList) await db.patients.update(p.id, { synced: true, sync_state: 'SYNCED' });
          for (const a of aList) await db.assessments.update(a.id, { synced: true, sync_state: 'SYNCED' });
        }
      }

      let syncedAppts = 0;
      for (const appt of apptList) {
        try {
          await apiFetch('/api/appointments', {
            method: 'POST',
            body: JSON.stringify({ ...appt, likely_conditions: appt.likely_conditions || [] }),
            timeoutMs: 10000,
          });
          await db.appointments.update(appt.id, { synced: true, sync_state: 'SYNCED' });
          syncedAppts++;
        } catch { /* skip */ }
      }

      const totalOps = (syncResult.push?.applied || 0) + (syncResult.pull?.appliedCount || 0) + pList.length + aList.length + syncedAppts;
      if (totalOps > 0) {
        showNotification(`✓ Sync complete: ${totalOps} records reconciled with server.`);
      } else {
        showNotification('✓ Offline records up to date with server.');
      }
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
    navigateTo(`/${tab}`);
  };

  const handleSignIn = () => {
    if (isAuthenticated) {
      if (user?.role === 'PATIENT') {
        setCurrentView('patient_dashboard');
        navigateTo('/patient-dashboard');
      } else {
        setCurrentView('app');
        setCurrentTab('dashboard');
        navigateTo('/dashboard');
      }
    } else {
      setCurrentView('signin');
      navigateTo('/signin');
    }
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      if (user?.role === 'PATIENT') {
        setCurrentView('patient_dashboard');
        navigateTo('/patient-dashboard');
      } else {
        setCurrentView('app');
        setCurrentTab('dashboard');
        navigateTo('/dashboard');
      }
    } else {
      setCurrentView('role_selection');
      navigateTo('/get-started');
    }
  };

  const handleLoginSuccess = () => {
    const savedUserStr = localStorage.getItem('rapidcheck_user');
    let parsedRole = user?.role;
    if (savedUserStr) {
      try {
        parsedRole = JSON.parse(savedUserStr)?.role;
      } catch { /* ignore */ }
    }

    if (parsedRole === 'PATIENT') {
      setCurrentView('patient_dashboard');
      navigateTo('/patient-dashboard');
    } else {
      setCurrentView('app');
      setCurrentTab('dashboard');
      navigateTo('/dashboard');
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentView('home');
    navigateTo('/');
  };

  const handleSelectPatient = () => {
    if (isAuthenticated) {
      setCurrentView('patient_dashboard');
      navigateTo('/patient-dashboard');
    } else {
      setCurrentView('patient_register');
      navigateTo('/patient-register');
    }
  };

  const handleSelectProfessional = () => {
    if (isAuthenticated && user?.role !== 'PATIENT') {
      setCurrentView('app');
      setCurrentTab('dashboard');
      navigateTo('/dashboard');
    } else {
      setCurrentView('signup');
      navigateTo('/signup');
    }
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

  // 2. ROLE SELECTION VIEW (/get-started)
  if (currentView === 'role_selection') {
    return (
      <>
        <WaterDropClick />
        <RoleSelectionPage
          onSelectPatient={handleSelectPatient}
          onSelectProfessional={handleSelectProfessional}
          onNavigateHome={() => {
            setCurrentView('home');
            navigateTo('/');
          }}
          onNavigateSignIn={() => {
            setCurrentView('signin');
            navigateTo('/signin');
          }}
        />
      </>
    );
  }

  // 3. DEDICATED SIGN IN VIEW (/signin)
  if (currentView === 'signin') {
    return (
      <>
        <WaterDropClick />
        <SignInPage
          onSuccess={handleLoginSuccess}
          onNavigateSignUp={() => {
            setCurrentView('role_selection');
            navigateTo('/get-started');
          }}
          onNavigateHome={() => {
            setCurrentView('home');
            navigateTo('/');
          }}
          initialEmail={prefilledEmail}
        />
      </>
    );
  }

  // 4. PROFESSIONAL GET STARTED / REGISTRATION VIEW (/signup)
  if (currentView === 'signup') {
    return (
      <>
        <WaterDropClick />
        <SignUpPage
          onSuccess={(email) => {
            setPrefilledEmail(email);
          }}
          onNavigateSignIn={(email) => {
            if (email) setPrefilledEmail(email);
            setCurrentView('signin');
            navigateTo('/signin');
          }}
          onNavigateHome={() => {
            setCurrentView('home');
            navigateTo('/');
          }}
        />
      </>
    );
  }

  // 5. PATIENT REGISTRATION VIEW (/patient-register)
  if (currentView === 'patient_register') {
    return (
      <>
        <WaterDropClick />
        <PatientRegistrationPage
          onSuccess={() => {
            setCurrentView('patient_dashboard');
            navigateTo('/patient-dashboard');
          }}
          onNavigateSignIn={(email) => {
            if (email) setPrefilledEmail(email);
            setCurrentView('signin');
            navigateTo('/signin');
          }}
          onNavigateBack={() => {
            setCurrentView('role_selection');
            navigateTo('/get-started');
          }}
          onNavigateHome={() => {
            setCurrentView('home');
            navigateTo('/');
          }}
        />
      </>
    );
  }

  // 6. PATIENT DASHBOARD VIEW (/patient-dashboard)
  if (currentView === 'patient_dashboard') {
    return (
      <>
        <WaterDropClick />
        <PatientDashboard onLogout={handleLogout} />
      </>
    );
  }

  // 7. PROTECTED APPLICATION DASHBOARD VIEWS
  // Guard check: if unauthenticated in app view, redirect to signin
  if (!isAuthenticated) {
    return (
      <>
        <WaterDropClick />
        <SignInPage
          onSuccess={handleLoginSuccess}
          onNavigateSignUp={() => {
            setCurrentView('role_selection');
            navigateTo('/get-started');
          }}
          onNavigateHome={() => {
            setCurrentView('home');
            navigateTo('/');
          }}
          initialEmail={prefilledEmail}
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E7F7F0] text-[#0A9F68] hover:bg-[#0A9F68] hover:text-white font-bold text-xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{strings?.common?.backToDashboard || 'Back to Dashboard'}</span>
          </button>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold">
              <img src="/logo.png" alt="RuralHealth AI" className="w-4 h-4 object-contain rounded shrink-0" />
              <span className="text-slate-400">RuralHealth AI</span>
              <span className="text-slate-300">/</span>
              <span className="text-[#102A56] capitalize font-bold">
                {currentTab === 'patients'
                  ? strings?.sidebar?.patientDirectory || 'Patient Directory'
                  : currentTab === 'referrals'
                  ? strings?.sidebar?.idrcReferrals || 'IDRC Operational Referrals'
                  : currentTab === 'appointments'
                  ? strings?.sidebar?.appointments || 'Doctor Appointments'
                  : currentTab === 'staff'
                  ? strings?.sidebar?.staffManagement || 'Staff Management'
                  : currentTab === 'population_health'
                  ? strings?.sidebar?.populationHealth || 'Population Health Intelligence'
                  : currentTab === 'analytics'
                  ? strings?.sidebar?.analytics || 'Clinical Analysis & Insights'
                  : strings?.sidebar?.chatAssistant || 'Chat Assistant'}
              </span>
            </div>

            {/* Quick Language Switcher on Subscreens */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSubscreenLangOpen(!subscreenLangOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] hover:border-slate-300 bg-white text-xs font-semibold text-[#102A56] hover:bg-slate-50 transition-all cursor-pointer"
                title="Change language"
              >
                <Globe className="w-3.5 h-3.5 text-[#0A9F68]" />
                <span>
                  {lang === 'en' ? 'English' : lang === 'hi' ? 'हिन्दी' : 'বাংলা'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {subscreenLangOpen && (
                <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {(['en', 'hi', 'bn'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        setLang(l);
                        setSubscreenLangOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                        lang === l ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                      }`}
                    >
                      {l === 'en' ? 'English' : l === 'hi' ? 'हिन्दी (Hindi)' : 'বাংলা (Bengali)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

        {currentTab === 'referrals' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <IdrcReferralsPage
              lang={lang}
              isOnline={isOnline}
            />
          </div>
        )}

        {currentTab === 'analytics' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <AnalysisPage
              lang={lang}
              isOnline={isOnline}
            />
          </div>
        )}

        {currentTab === 'appointments' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <TeleconsultBooking lang={lang} isOnline={isOnline} />
          </div>
        )}

        {currentTab === 'staff' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <StaffManagementPage />
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
