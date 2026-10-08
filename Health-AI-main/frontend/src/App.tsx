import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AshaScreeningFlow } from './components/AshaScreeningFlow';
import { PhcDashboard } from './components/PhcDashboard';
import { PatientDirectory } from './components/PatientDirectory';
import { HealthChatbot } from './components/HealthChatbot';
import { TeleconsultBooking } from './components/TeleconsultBooking';
import type { Language } from './i18n/translations';
import { db } from './db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';
import WaterDropClick from './components/WaterDropClick';

export function App() {
  const [currentTab, setCurrentTab] = useState<'asha' | 'phc' | 'patients' | 'high-risk' | 'teleconsult'>('asha');
  const [lang, setLang] = useState<Language>('en');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // ── Dark Mode ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('ruralhealth-dark-mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('ruralhealth-dark-mode', String(darkMode));
  }, [darkMode]);

  // Unsynced count from Dexie IndexedDB
  const unsyncedPatients = useLiveQuery(() => db.patients.where('synced').equals(0).toArray()) || [];
  const unsyncedAssessments = useLiveQuery(() => db.assessments.where('synced').equals(0).toArray()) || [];
  const unsyncedAppointments = useLiveQuery(() => db.appointments.where('synced').equals(0).toArray()) || [];
  const pendingSyncCount = unsyncedPatients.length + unsyncedAssessments.length + unsyncedAppointments.length;

  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval>;

    // Check if the backend is actually reachable (not just internet connectivity)
    const checkBackend = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/health', {
          signal: AbortSignal.timeout(3000),
        });
        setIsOnline(res.ok);
      } catch {
        // Backend unreachable (stopped, crashed, or no network)
        setIsOnline(false);
      }
    };

    // Native browser events for real network disconnection
    const handleOnline = () => checkBackend();
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount
    checkBackend();

    // Periodic heartbeat every 5 seconds — keeps pill accurate
    heartbeatTimer = setInterval(checkBackend, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(heartbeatTimer);
    };
  }, []);

  // Show toast + trigger sync whenever online status changes
  const prevOnlineRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (prevOnlineRef.current === null) {
      // Skip first render — just record initial state
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

      // Sync patients and assessments via bulk sync endpoint
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

      // Sync appointments individually
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
        } catch { /* skip individual failure */ }
      }

      showNotification(`Sync Complete! ${pList.length} patients, ${aList.length} assessments, ${syncedAppts} appointments synced.`);
    } catch (err) {
      console.warn('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-500 dark:selection:bg-emerald-400 selection:text-white dark:selection:text-slate-900 transition-colors duration-300">
      <WaterDropClick />
      
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        lang={lang}
        onLangChange={setLang}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onSyncTrigger={triggerSync}
        isSyncing={isSyncing}
        darkMode={darkMode}
        onDarkModeToggle={() => setDarkMode(!darkMode)}
      />

      {/* Persistent Offline Banner */}
      {!isOnline && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-700 dark:to-orange-700 text-white px-4 py-2 text-center text-xs sm:text-sm font-bold shadow-lg flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span>📡 OFFLINE MODE — All data saved locally. Auto-syncs when connection restores.</span>
          {pendingSyncCount > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px]">{pendingSyncCount} pending</span>
          )}
        </div>
      )}

      {/* Toast Notification Banner */}
      {notification && (
        <div className="bg-slate-900 dark:bg-slate-800 text-emerald-400 border-b border-emerald-500/40 px-4 py-2.5 text-center text-xs sm:text-sm font-bold shadow-lg animate-fade-in flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{notification}</span>
        </div>
      )}

      {/* Main Content View */}
      <main className="flex-1 pb-12">
        {currentTab === 'asha' && (
          <AshaScreeningFlow
            lang={lang}
            isOnline={isOnline}
            onAssessmentComplete={() => {
              if (isOnline && pendingSyncCount > 0) {
                triggerSync();
              }
            }}
            onBookTeleconsult={() => setCurrentTab('teleconsult')}
          />
        )}

        {(currentTab === 'phc' || currentTab === 'high-risk') && (
          <PhcDashboard
            lang={lang}
            isOnline={isOnline}
            defaultRiskFilter={currentTab === 'high-risk' ? 'HIGH' : 'ALL'}
          />
        )}

        {currentTab === 'patients' && (
          <PatientDirectory
            lang={lang}
            isOnline={isOnline}
          />
        )}

        {currentTab === 'teleconsult' && (
          <TeleconsultBooking
            lang={lang}
            isOnline={isOnline}
          />
        )}
      </main>

      {/* Floating Health Chatbot */}
      <HealthChatbot lang={lang} isOnline={isOnline} />

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-slate-950 text-slate-400 dark:text-slate-500 text-[11px] py-4 text-center border-t border-slate-800 dark:border-slate-800 transition-colors">
        <p className="font-semibold">
          RuralHealth AI • Hackathon Prototype for Early Disease Risk Prediction & Rural Access
        </p>
        <p className="text-slate-500 dark:text-slate-600 mt-0.5">
          Decision Support Tool only • Not a substitute for professional clinical diagnosis
        </p>
      </footer>

    </div>
  );
}

export default App;
