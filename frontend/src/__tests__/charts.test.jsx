import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { MonthlyIncomeChart, CategoryBars, IncomeSplitBar, niceMax, monthLabel } from '../components/charts';
import { makeInsights } from './fixtures';

const { monthly, byCategory } = makeInsights();

describe('chart helpers', () => {
  it('rounds axis maximums up to a readable value', () => {
    expect(niceMax(6500)).toBe(10000);
    expect(niceMax(2300)).toBe(2500);
    expect(niceMax(0)).toBe(1000);
  });

  it('formats month keys', () => {
    expect(monthLabel('2026-11')).toBe('Nov');
    expect(monthLabel('2026-11', true)).toMatch(/November 2026/);
  });
});

describe('MonthlyIncomeChart', () => {
  it('renders one focusable bar group per month with an accessible label', () => {
    render(<MonthlyIncomeChart data={monthly} />);
    expect(screen.getByRole('img', { name: /income per month/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/November 2026: R6,500.00/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/: R/)).toHaveLength(12);
  });

  it('shows a tooltip with the value when a bar is focused', () => {
    render(<MonthlyIncomeChart data={monthly} />);
    fireEvent.focus(screen.getByLabelText(/November 2026: R6,500.00/));
    const tip = screen.getByRole('status');
    expect(within(tip).getByText('R6,500.00')).toBeInTheDocument();
    expect(within(tip).getByText(/1 payment/)).toBeInTheDocument();
  });

  it('can switch to a table view with every month', async () => {
    render(<MonthlyIncomeChart data={monthly} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show as table' }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(13); // header + 12 months
    expect(screen.getByRole('cell', { name: 'R6,500.00' })).toBeInTheDocument();
  });
});

describe('CategoryBars', () => {
  it('labels each category with its value and share', () => {
    render(<CategoryBars data={byCategory} />);
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('R6,500.00')).toBeInTheDocument();
    expect(screen.getByText(/72%/)).toBeInTheDocument();
    expect(screen.getByText(/28%/)).toBeInTheDocument();
  });

  it('shows an empty state with no data', () => {
    render(<CategoryBars data={[]} />);
    expect(screen.getByText('No income by category yet.')).toBeInTheDocument();
  });
});

describe('IncomeSplitBar', () => {
  it('lists every segment in the legend with its amount (not colour alone)', () => {
    render(<IncomeSplitBar takeHome={7000} tax={2000} expenses={1000} />);
    expect(screen.getByText('Take-home (after tax)')).toBeInTheDocument();
    expect(screen.getByText('R7,000.00')).toBeInTheDocument();
    expect(screen.getByText('Estimated tax')).toBeInTheDocument();
    expect(screen.getByText('R2,000.00')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
  });
});
