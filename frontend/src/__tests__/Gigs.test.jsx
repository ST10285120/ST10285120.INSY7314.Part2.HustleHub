import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Gigs from '../pages/Gigs';
import { AuthProvider } from '../context/AuthContext';
import { client, TOKEN_KEY, USER_KEY } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return { ...actual, client: { get: vi.fn(), post: vi.fn() } };
});

const gig = {
  _id: 'g1',
  title: 'E-commerce website build',
  description: 'Full online store in React and Node.js.',
  category: 'Development',
  price: 45000,
  freelancer: { name: 'Naledi Khumalo' },
};

function signInAs(role) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  sessionStorage.setItem(TOKEN_KEY, `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', role, exp })}.sig`);
  sessionStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1', name: 'Thabo', role }));
}

function renderGigs() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Gigs />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  client.get.mockResolvedValue({ data: { data: { gigs: [gig] } } });
});

describe('Browse gigs - booking', () => {
  it('confirms the booking with the amount and the recorded transaction reference', async () => {
    signInAs('client');
    client.post.mockResolvedValue({
      data: {
        data: {
          booking: { _id: 'b1', amount: 45000 },
          transaction: { _id: 't1', reference: 'TXN-3D58A866745B' },
        },
      },
    });

    renderGigs();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Book this gig' }));

    expect(client.post).toHaveBeenCalledWith('/bookings', { gigId: 'g1' });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('R45,000.00');
    expect(status).toHaveTextContent('TXN-3D58A866745B');
    expect(screen.getByRole('link', { name: 'View transactions' })).toHaveAttribute('href', '/transactions');
  });

  it('only offers booking to clients', async () => {
    signInAs('freelancer');
    renderGigs();
    await screen.findByText('E-commerce website build');
    expect(screen.queryByRole('button', { name: 'Book this gig' })).not.toBeInTheDocument();
  });

  it('asks visitors to log in before booking', async () => {
    renderGigs();
    expect(await screen.findByRole('link', { name: 'Log in to book' })).toBeInTheDocument();
  });
});
