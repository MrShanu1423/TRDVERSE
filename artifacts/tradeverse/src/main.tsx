import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// --- Mobile app (APK) support -------------------------------------------------
// In the APK the UI is served from https://localhost, so relative "/api/..." calls must be
// pointed at the real API server. Set it in public/config.js (TV_CONFIG.API_URL) - or VITE_API_URL at build time.
// In the normal web/PWA build VITE_API_URL is empty and nothing changes.
const API_URL = (((window as any).TV_CONFIG?.API_URL as string | undefined) || (import.meta.env.VITE_API_URL as string | undefined) || '').trim().replace(/\/+$/, '');
const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();
if (API_URL) {
  setBaseUrl(API_URL);
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    typeof input === 'string' && input.startsWith('/api') ? nativeFetch(API_URL + input, init) : nativeFetch(input, init)) as typeof window.fetch;
}
if (isNativeApp) document.documentElement.classList.add('native-app');

// Dashboard/portfolio/orders are per-user, so every generated-client call needs the session bearer token.
setAuthTokenGetter(() => localStorage.getItem('tv_session'));

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
