const CLOUD_BASE = 'https://chitfund-backend-hk37.onrender.com';
const LOCAL_BASE = 'http://127.0.0.1:9000';
const MODE_KEY = 'backendMode';

export const BACKEND_MODES = {
  CLOUD: 'cloud',
  LOCAL: 'local'
};

export function getBackendMode() {
  if (typeof window === 'undefined') return BACKEND_MODES.CLOUD;
  const stored = window.localStorage.getItem(MODE_KEY);
  if (stored === BACKEND_MODES.LOCAL) return BACKEND_MODES.LOCAL;
  return BACKEND_MODES.CLOUD;
}

export function setBackendMode(mode) {
  if (typeof window === 'undefined') return;
  if (mode === BACKEND_MODES.CLOUD || mode === BACKEND_MODES.LOCAL) {
    window.localStorage.setItem(MODE_KEY, mode);
  }
}

export function getApiBase() {
  const mode = getBackendMode();
  return mode === BACKEND_MODES.LOCAL ? LOCAL_BASE : CLOUD_BASE;
}

