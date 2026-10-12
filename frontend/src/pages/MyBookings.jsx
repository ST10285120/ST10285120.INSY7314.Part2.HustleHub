import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { client, toDisplayError } from '../api/client';
import FieldErrors from '../components/FieldErrors';
import BookingsTable from '../components/BookingsTable';

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/bookings/my');
        setBookings(res.data.data.bookings);
      } catch (err) {
        setError(toDisplayError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="page">
      <h1>My bookings</h1>
      <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />
      {loading && <p className="loading">Loading bookings…</p>}
      {!loading && !error && bookings.length === 0 && (
        <p className="empty-state">
          You haven't booked any gigs yet. <Link to="/gigs">Browse gigs</Link>
        </p>
      )}
      {bookings.length > 0 && (
        <BookingsTable bookings={bookings} partyLabel="Freelancer" partyKey="freelancer" />
      )}
    </div>
  );
}
