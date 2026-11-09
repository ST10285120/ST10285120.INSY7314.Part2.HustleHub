import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Income from '../pages/Income';
import { AuthProvider } from '../context/AuthContext';
import { client } from '../api/client';
import { makeInsights } from './fixtures';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return { ...actual, client: { post: vi.fn(), get: vi.fn() } };
});

function mockApi(insights = makeInsights()) {
  client.get.mockImplementation((url) => {
    if (url === '/insights/income') return Promise.resolve({ data: { data: insights } });
    if (url === '/bookings/freelancer') return Promise.resolve({ data: { data: { bookings: [] } } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function renderIncome() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Income />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('Income & tax dashboard', () => {
  it('shows the income summary tiles', async () => {
    mockApi();
    renderIncome();
    expect(await screen.findByText('Income this tax year')).toBeInTheDocument();
    expect(screen.getAllByText('R9,000.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/▲ 160% vs last month/)).toBeInTheDocument();
    expect(screen.getByText('Set aside each month')).toBeInTheDocument();
  });

  it('explains when projected income is below the tax threshold', async () => {
    mockApi();
    renderIncome();
    expect(await screen.findByText(/below the R99,000.00 tax threshold/)).toBeInTheDocument();
  });

  it('shows the annual estimate, provisional payments and the bracket table', async () => {
    mockApi(
      makeInsights({
        tax: {
          belowThreshold: false,
          projectedAnnualTaxableIncome: 300000,
          estimatedAnnualTax: 40598,
          provisionalPayments: [
            { period: 'First provisional payment', dueDate: '2026-08-31', amount: 20299 },
            { period: 'Second provisional payment', dueDate: '2027-02-28', amount: 20299 },
          ],
        },
      })
    );
    renderIncome();
    expect(await screen.findByText(/estimated income tax of/)).toBeInTheDocument();
    expect(screen.getAllByText('R40,598.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R20,299.00')).toHaveLength(2);
    expect(screen.getByText('Due 31 Aug 2026')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Rate' })).toBeInTheDocument();
    expect(screen.getByText('How this estimate is calculated')).toBeInTheDocument();
  });

  it('recalculates with the expenses and age group the user enters', async () => {
    mockApi();
    renderIncome();
    const user = userEvent.setup();
    await screen.findByText('Income this tax year');

    await user.type(screen.getByLabelText(/Business expenses/), '1500');
    await user.selectOptions(screen.getByLabelText('Your age'), '65to74');
    await user.click(screen.getByRole('button', { name: 'Recalculate' }));

    expect(client.get).toHaveBeenLastCalledWith('/insights/income', {
      params: { expenses: 1500, ageGroup: '65to74' },
    });
  });

  it('shows the server error message if the insights request fails', async () => {
    client.get.mockRejectedValue({ response: { data: { message: 'You do not have permission to perform this action.' } } });
    renderIncome();
    expect(await screen.findByText('You do not have permission to perform this action.')).toBeInTheDocument();
  });
});
