import { createContext, useContext, useState, useCallback } from 'react';
import { client, toDisplayError } from '../api/client';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem('hustlehub_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem('hustlehub_token'));

  const persist = useCallback((nextUser, nextToken) => {
    setUser(nextUser);
    setToken(nextToken);
    localStorage.setItem('hustlehub_user', JSON.stringify(nextUser));
    localStorage.setItem('hustlehub_token', nextToken);
  }, []);

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

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('hustlehub_user');
    localStorage.removeItem('hustlehub_token');
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}
