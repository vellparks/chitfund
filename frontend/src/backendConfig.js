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
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('system_settings_last');
      if (raw) {
        const s = JSON.parse(raw);
        if (
          mode === BACKEND_MODES.CLOUD &&
          s &&
          typeof s.backend_url === 'string' &&
          s.backend_url.trim().length > 0
        ) {
          return s.backend_url.trim();
        }
      }
    } catch (e) {
      e;
    }
  }
  return mode === BACKEND_MODES.LOCAL ? LOCAL_BASE : CLOUD_BASE;
}
