import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Admin from '../pages/Admin';
import { AuthProvider } from '../context/AuthContext';
import { client } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return { ...actual, client: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

const stats = {
  users: { client: 4, freelancer: 3, admin: 1 },
  suspendedUsers: 0,
  lockedAccounts: 1,
  gigs: { active: 5, total: 6 },
  bookings: 11,
  transactions: { count: 11, volume: 37950 },
  failedLogins24h: 7,
};

const users = [
  { _id: 'u1', name: 'Thabo Mokoena', email: 'thabo@example.com', role: 'client', isActive: true, isLocked: false },
  { _id: 'u2', name: 'Sipho Dlamini', email: 'sipho@example.com', role: 'freelancer', isActive: true, isLocked: true },
  { _id: 'u3', name: 'Platform Admin', email: 'admin@example.com', role: 'admin', isActive: true, isLocked: false },
];

function mockApi() {
  client.get.mockImplementation((url) => {
    if (url === '/admin/stats') return Promise.resolve({ data: { data: stats } });
    if (url === '/admin/users') return Promise.resolve({ data: { data: { users } } });
    return Promise.resolve({ data: { data: { gigs: [], bookings: [], transactions: [], logs: [] } } });
  });
  client.patch.mockResolvedValue({ data: { success: true } });
  client.post.mockResolvedValue({ data: { success: true } });
}

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Admin />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockApi();
});

describe('Admin page', () => {
  it('shows platform statistics on the overview tab', async () => {
    renderAdmin();
    expect(await screen.findByText('Transaction volume')).toBeInTheDocument();
    expect(screen.getByText('R37,950.00')).toBeInTheDocument();
    expect(screen.getByText('Failed logins (24h)')).toBeInTheDocument();
  });

  it('lists users and lets the admin suspend a client', async () => {
    renderAdmin();
    const user = userEvent.setup();
    await screen.findByText('Transaction volume');
    await user.click(screen.getByRole('tab', { name: 'Users' }));

    const row = (await screen.findByText('Thabo Mokoena')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Suspend' }));

    expect(client.patch).toHaveBeenCalledWith('/admin/users/u1/status', { isActive: false });
    expect(await screen.findByText(/Thabo Mokoena suspended/)).toBeInTheDocument();
  });

  it('offers unlock for locked accounts and no suspend button for admins', async () => {
    renderAdmin();
    const user = userEvent.setup();
    await screen.findByText('Transaction volume');
    await user.click(screen.getByRole('tab', { name: 'Users' }));

    const locked = (await screen.findByText('Sipho Dlamini')).closest('tr');
    expect(within(locked).getByText('locked')).toBeInTheDocument();
    await user.click(within(locked).getByRole('button', { name: 'Unlock' }));
    expect(client.post).toHaveBeenCalledWith('/admin/users/u2/unlock');

    const adminRow = screen.getByText('Platform Admin').closest('tr');
    expect(within(adminRow).queryByRole('button')).not.toBeInTheDocument();
  });
});
