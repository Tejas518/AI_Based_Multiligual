import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// In development, automatically unregister any active service worker from previous production runs to prevent caching hijacks
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    if (registrations.length > 0) {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('[PWA] Unregistered active service worker in development mode.');
          }
        });
      }
      // Force reload to bypass cache
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
  });
}

// Register PWA Service Worker safely
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        onNeedRefresh() {
          console.log('[PWA] New content available. Refreshing...')
        },
        onOfflineReady() {
          console.log('[PWA] CommAI App is ready to work offline.')
        },
      })
    })
    .catch((err) => {
      console.warn('[PWA] Service worker registration skipped:', err)
    })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
