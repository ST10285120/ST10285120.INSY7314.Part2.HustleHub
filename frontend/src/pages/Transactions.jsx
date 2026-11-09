import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { client, toDisplayError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import FieldErrors from '../components/FieldErrors';
import { formatPrice, formatDate } from '../utils/format';

const STATUS_BADGE = { completed: 'badge-success', refunded: 'badge-muted', failed: 'badge-danger' };

export default function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/transactions/my');
        setTransactions(res.data.data.transactions);
      } catch (err) {
        setError(toDisplayError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isFreelancer = user?.role === 'freelancer';
  const total = transactions
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="page">
      <h1>Transactions</h1>
      <p className="page-intro">
        {isFreelancer
          ? 'Every payment you have received for a booking.'
          : 'Every payment you have made for a booking.'}{' '}
        Each one is a separate record linked to its booking, the client and the freelancer.
      </p>
      <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />
      {loading && <p className="loading">Loading transactions…</p>}

      {!loading && !error && transactions.length === 0 && (
        <p className="empty-state">
          No transactions yet.{' '}
          {isFreelancer ? <Link to="/my-gigs">Create a gig</Link> : <Link to="/gigs">Browse gigs</Link>}
        </p>
      )}

      {transactions.length > 0 && (
        <>
          <p className="transactions-total">
            Total {isFreelancer ? 'received' : 'paid'}: <strong>{formatPrice(total)}</strong>
          </p>
          <div className="table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Date</th>
                  <th scope="col">Gig</th>
                  <th scope="col">{isFreelancer ? 'Client' : 'Freelancer'}</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <code>{t.reference}</code>
                    </td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.gig?.title || <span className="viz-muted">Removed gig</span>}</td>
                    <td>{isFreelancer ? t.client?.name : t.freelancer?.name}</td>
                    <td>{formatPrice(t.amount)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[t.status] || 'badge-muted'}`}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
