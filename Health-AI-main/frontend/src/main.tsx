import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { registerSW } from 'virtual:pwa-register'

// Register service worker for offline support
const updateSW = registerSW({
  onNeedRefresh() {
    // Auto-update: new content available, will reload
    updateSW();
  },
  onOfflineReady() {
    console.log('[PWA] App ready for offline use');
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)

