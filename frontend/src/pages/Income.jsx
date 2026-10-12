import { useEffect, useState } from 'react';
import { client, toDisplayError } from '../api/client';
import FieldErrors from '../components/FieldErrors';
import BookingsTable from '../components/BookingsTable';
import { formatPrice } from '../utils/format';

export default function Income() {
  const [summary, setSummary] = useState({ totalIncome: 0, totalBookings: 0 });
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [summaryRes, bookingsRes] = await Promise.all([
          client.get('/bookings/freelancer/income'),
          client.get('/bookings/freelancer'),
        ]);
        setSummary(summaryRes.data.data);
        setBookings(bookingsRes.data.data.bookings);
      } catch (err) {
        setError(toDisplayError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="page">
        <h1>Income</h1>
        <p className="loading">Loading income…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Income</h1>
      <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />

      <div className="income-summary">
        <div>
          <span className="income-total">{formatPrice(summary.totalIncome)}</span>
          <span>total income</span>
        </div>
        <div>
          <span className="income-total">{summary.totalBookings}</span>
          <span>paid bookings</span>
        </div>
      </div>

      <h2>Bookings against your gigs</h2>
      {!error && bookings.length === 0 && <p className="empty-state">No bookings yet.</p>}
      {bookings.length > 0 && (
        <BookingsTable bookings={bookings} partyLabel="Client" partyKey="client" />
      )}
    </div>
  );
}
