import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GigCard from '../components/GigCard';

const gig = {
  _id: 'gig1',
  title: 'Logo design',
  description: 'A clean, modern logo for your brand.',
  category: 'Design',
  price: 250,
  freelancer: { name: 'Naledi Khumalo' },
};

describe('GigCard', () => {
  it('renders the gig title, category, description and price', () => {
    render(<GigCard gig={gig} />);
    expect(screen.getByText('Logo design')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('A clean, modern logo for your brand.')).toBeInTheDocument();
    expect(screen.getByText('R250.00')).toBeInTheDocument();
    expect(screen.getByText('by Naledi Khumalo')).toBeInTheDocument();
  });

  it('formats large prices with thousands separators', () => {
    render(<GigCard gig={{ ...gig, price: 12500.5 }} />);
    expect(screen.getByText('R12,500.50')).toBeInTheDocument();
  });

  it('renders no action button when none is provided', () => {
    render(<GigCard gig={gig} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the provided action, e.g. a Book button', () => {
    render(<GigCard gig={gig} action={<button>Book this gig</button>} />);
    expect(screen.getByRole('button', { name: 'Book this gig' })).toBeInTheDocument();
  });
});
