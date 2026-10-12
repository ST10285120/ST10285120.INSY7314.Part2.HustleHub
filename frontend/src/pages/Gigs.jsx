import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { client, toDisplayError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import GigCard from '../components/GigCard';
import FieldErrors from '../components/FieldErrors';

export default function Gigs() {
  const { user } = useAuth();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  async function loadGigs() {
    try {
      const res = await client.get('/gigs');
      setGigs(res.data.data.gigs);
      setError(null);
    } catch (err) {
      setError(toDisplayError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGigs();
  }, []);

  async function handleBook(gigId) {
    setBookingId(gigId);
    setNotice(null);
    setError(null);
    try {
      await client.post('/bookings', { gigId });
      setNotice('Booking confirmed - payment simulated successfully.');
    } catch (err) {
      setError(toDisplayError(err));
    } finally {
      setBookingId(null);
    }
  }

  const categories = [...new Set(gigs.map((g) => g.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const term = search.trim().toLowerCase();
  const visibleGigs = gigs.filter((g) => {
    if (category && g.category !== category) return false;
    if (!term) return true;
    return [g.title, g.description, g.category, g.freelancer?.name].some((v) =>
      v?.toLowerCase().includes(term)
    );
  });

  function clearFilters() {
    setSearch('');
    setCategory('');
  }

  function renderAction(gigId) {
    if (!user) {
      return (
        <Link to="/login" className="btn btn-outline">
          Log in to book
        </Link>
      );
    }
    if (user.role !== 'client') return null;
    return (
      <button
        type="button"
        className="btn"
        onClick={() => handleBook(gigId)}
        disabled={bookingId !== null}
      >
        {bookingId === gigId ? 'Booking…' : 'Book this gig'}
      </button>
    );
  }

  return (
    <div className="page">
      <h1>Browse gigs</h1>
      <p className="page-intro">Find a freelancer for your next job.</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />

      {loading && <p className="loading">Loading gigs…</p>}
      {!loading && !error && gigs.length === 0 && (
        <p className="empty-state">No gigs available yet.</p>
      )}

      {gigs.length > 0 && (
        <div className="gig-filters">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gigs…"
            aria-label="Search gigs"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {gigs.length > 0 && visibleGigs.length === 0 && (
        <p className="empty-state">
          No gigs match your search.{' '}
          <button type="button" className="text-button" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      )}

      <div className="gig-grid">
        {visibleGigs.map((gig) => (
          <GigCard key={gig._id || gig.id} gig={gig} action={renderAction(gig._id || gig.id)} />
        ))}
      </div>
    </div>
  );
}
