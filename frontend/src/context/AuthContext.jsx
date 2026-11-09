import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  client,
  toDisplayError,
  tokenStore,
  tokenExpiry,
  USER_KEY,
  SESSION_EXPIRED_EVENT,
} from '../api/client';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredToken() {
  const token = tokenStore.get();
  const exp = token ? tokenExpiry(token) : null;
  // Drop a token that has already expired instead of sending it.
  if (token && exp && exp <= Date.now()) {
    tokenStore.clear();
    return null;
  }
  return token;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(() => (readStoredToken() ? readStoredUser() : null));
  const [sessionMessage, setSessionMessage] = useState(null);

  const persist = useCallback((nextUser, nextToken) => {
    setUser(nextUser);
    setToken(nextToken);
    setSessionMessage(null);
    sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    tokenStore.set(nextToken);
  }, []);

  const clearSession = useCallback((message = null) => {
    setUser(null);
    setToken(null);
    setSessionMessage(message);
    tokenStore.clear();
  }, []);

  // Server said the token is no longer valid (expired, revoked, suspended).
  useEffect(() => {
    const onExpired = () => clearSession('Your session has ended. Please log in again.');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [clearSession]);

  // Log out automatically the moment the JWT expires.
  useEffect(() => {
    if (!token) return undefined;
    const exp = tokenExpiry(token);
    if (!exp) return undefined;
    const timer = setTimeout(
      () => clearSession('Your session has expired. Please log in again.'),
      Math.max(0, exp - Date.now())
    );
    return () => clearTimeout(timer);
  }, [token, clearSession]);

  const register = useCallback(
    async ({ name, email, password, role }) => {
      try {
        const res = await client.post('/auth/register', { name, email, password, role });
        const { user: newUser, token: newToken } = res.data.data;
        persist(newUser, newToken);
        return { success: true };
      } catch (err) {
        return { success: false, error: toDisplayError(err) };
      }
    },
    [persist]
  );

  const login = useCallback(
    async ({ email, password }) => {
      try {
        const res = await client.post('/auth/login', { email, password });
        const { user: loggedInUser, token: newToken } = res.data.data;
        persist(loggedInUser, newToken);
        return { success: true };
      } catch (err) {
        return { success: false, error: toDisplayError(err) };
      }
    },
    [persist]
  );

  // Revoke the token on the server (all sessions), then clear it locally even
  // if the network call fails.
  const logout = useCallback(async () => {
    try {
      if (tokenStore.get()) await client.post('/auth/logout');
    } catch {
      // ignore - the local session is cleared regardless
    } finally {
      clearSession();
    }
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, token, register, login, logout, sessionMessage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}
