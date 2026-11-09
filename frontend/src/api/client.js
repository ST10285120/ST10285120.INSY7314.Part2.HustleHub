import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:5443/api';

// The JWT lives in sessionStorage, not localStorage: it is scoped to this tab
// and is discarded when the tab closes, which shortens the window in which a
// stolen token is useful. The strict CSP (no inline or third-party scripts)
// is what stops XSS from reading it in the first place.
export const TOKEN_KEY = 'hustlehub_token';
export const USER_KEY = 'hustlehub_user';
export const SESSION_EXPIRED_EVENT = 'hustlehub:session-expired';

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};

const client = axios.create({ baseURL: API_URL, timeout: 15000 });

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 on an authenticated request means the token expired or was revoked
// (logout elsewhere, suspended by an admin): end the session in the UI too.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const hadToken = Boolean(error.config?.headers?.Authorization);
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && hadToken && !isLogin) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** Reads the expiry (ms since epoch) from a JWT without trusting anything else in it. */
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function toDisplayError(err) {
  if (err.response && err.response.data) {
    const { message, errors } = err.response.data;
    return {
      message: message || 'Something went wrong. Please try again.',
      fieldErrors: Array.isArray(errors) ? errors : [],
    };
  }
  if (err.request) {
    return { message: 'Could not reach the server. Please try again later.', fieldErrors: [] };
  }
  return { message: 'Something went wrong. Please try again.', fieldErrors: [] };
}

export { client, toDisplayError };
