import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { tokenExpiry, SESSION_EXPIRED_EVENT, TOKEN_KEY, USER_KEY } from '../api/client';

function fakeJwt(payload) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

function signIn(role, expSecondsFromNow = 3600) {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  sessionStorage.setItem(TOKEN_KEY, fakeJwt({ sub: 'u1', role, exp }));
  sessionStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1', name: 'Test', role }));
}

function Whoami() {
  const { user, sessionMessage } = useAuth();
  return (
    <p>
      {user ? `signed in as ${user.role}` : 'signed out'}
      {sessionMessage ? ` - ${sessionMessage}` : ''}
    </p>
  );
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/gigs" element={<p>gigs page</p>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <p>admin page</p>
              </ProtectedRoute>
            }
          />
          <Route path="/me" element={<Whoami />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  globalThis.localStorage?.clear?.();
  vi.useRealTimers();
});

describe('Session handling', () => {
  it('reads the expiry from a JWT', () => {
    expect(tokenExpiry(fakeJwt({ exp: 2000000000 }))).toBe(2000000000 * 1000);
    expect(tokenExpiry('garbage')).toBeNull();
  });

  it('keeps the token in sessionStorage, never localStorage', () => {
    signIn('client');
    renderAt('/me');
    expect(screen.getByText('signed in as client')).toBeInTheDocument();
    expect(globalThis.localStorage?.getItem?.(TOKEN_KEY) ?? null).toBeNull();
  });

  it('discards an already-expired token on load', () => {
    signIn('client', -10);
    renderAt('/me');
    expect(screen.getByText('signed out')).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('signs the user out when the API reports the session has ended', () => {
    signIn('freelancer');
    renderAt('/me');
    act(() => {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    });
    expect(screen.getByText(/signed out - Your session has ended/)).toBeInTheDocument();
  });

  it('signs the user out automatically when the token expires', () => {
    vi.useFakeTimers();
    signIn('client', 60);
    renderAt('/me');
    expect(screen.getByText('signed in as client')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(61 * 1000);
    });
    expect(screen.getByText(/Your session has expired/)).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  it('sends signed-out users to the login page', () => {
    renderAt('/admin');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends users without the right role back to gigs', () => {
    signIn('freelancer');
    renderAt('/admin');
    expect(screen.getByText('gigs page')).toBeInTheDocument();
  });

  it('lets an admin through to the admin page', () => {
    signIn('admin');
    renderAt('/admin');
    expect(screen.getByText('admin page')).toBeInTheDocument();
  });
});
