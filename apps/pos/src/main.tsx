import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { setupFetchInterceptor } from './lib/fetchInterceptor'

setupFetchInterceptor()
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) console.log('🗑️ Dev: Service Worker unregistered successfully.');
        });
      }
    });
  }
} else {
  registerSW({ immediate: true })
}

const applyInitialTheme = () => {
  try {
    const saved = localStorage.getItem('pos-theme')
    if (saved === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      // Varsayılan: mevcut tasarım karanlık olduğundan dark açık başlat
      document.documentElement.classList.add('dark')
    }
  } catch {
    document.documentElement.classList.add('dark')
  }
}

applyInitialTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
    </>
  </StrictMode>,
)
