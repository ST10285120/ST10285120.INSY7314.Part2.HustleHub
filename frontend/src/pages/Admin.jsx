import { useCallback, useEffect, useState } from 'react';
import { client, toDisplayError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import FieldErrors from '../components/FieldErrors';
import { formatPrice, formatDate } from '../utils/format';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'gigs', label: 'Gigs' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'audit', label: 'Security log' },
];

const ENDPOINTS = {
  overview: ['/admin/stats', (d) => d],
  users: ['/admin/users', (d) => d.users],
  gigs: ['/admin/gigs', (d) => d.gigs],
  bookings: ['/admin/bookings', (d) => d.bookings],
  transactions: ['/admin/transactions', (d) => d.transactions],
  audit: ['/admin/audit-logs', (d) => d.logs],
};

function Stat({ label, value }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function Overview({ stats }) {
  return (
    <section className="stat-grid" aria-label="Platform statistics">
      <Stat label="Clients" value={stats.users.client} />
      <Stat label="Freelancers" value={stats.users.freelancer} />
      <Stat label="Active gigs" value={`${stats.gigs.active} / ${stats.gigs.total}`} />
      <Stat label="Bookings" value={stats.bookings} />
      <Stat label="Transaction volume" value={formatPrice(stats.transactions.volume)} />
      <Stat label="Failed logins (24h)" value={stats.failedLogins24h} />
      <Stat label="Locked accounts" value={stats.lockedAccounts} />
      <Stat label="Suspended users" value={stats.suspendedUsers} />
    </section>
  );
}

export default function Admin() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (which) => {
    setLoading(true);
    setError(null);
    try {
      const [url, pick] = ENDPOINTS[which];
      const res = await client.get(url);
      setData(pick(res.data.data));
    } catch (err) {
      setError(toDisplayError(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function act(id, request, successMessage) {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      await request();
      setNotice(successMessage);
      await load(tab);
    } catch (err) {
      setError(toDisplayError(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggleSuspend(u) {
    return act(
      u._id,
      () => client.patch(`/admin/users/${u._id}/status`, { isActive: !u.isActive }),
      u.isActive ? `${u.name} suspended - their sessions were revoked.` : `${u.name} reactivated.`
    );
  }

  function unlock(u) {
    return act(u._id, () => client.post(`/admin/users/${u._id}/unlock`), `${u.name} unlocked.`);
  }

  function removeGig(g) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove "${g.title}"? Its bookings and transactions are kept.`)) return;
    act(g._id, () => client.delete(`/admin/gigs/${g._id}`), `"${g.title}" removed.`);
  }

  return (
    <div className="page">
      <h1>Admin</h1>
      <p className="page-intro">Platform oversight. Every action here is recorded in the security log.</p>

      <div className="tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => {
              if (t.key === tab) return;
              setNotice(null);
              setData(null);
              setLoading(true);
              setTab(t.key);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />
      {loading && <p className="loading">Loading…</p>}

      {!loading && data && tab === 'overview' && <Overview stats={data} />}

      {!loading && data && tab === 'users' && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last login</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => {
                const isSelf = u._id === me?.id || u.email === me?.email;
                return (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="badge badge-muted">{u.role}</span>
                    </td>
                    <td>
                      {!u.isActive && <span className="badge badge-danger">suspended</span>}
                      {u.isActive && u.isLocked && <span className="badge badge-warning">locked</span>}
                      {u.isActive && !u.isLocked && <span className="badge badge-success">active</span>}
                    </td>
                    <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                    <td className="row-actions">
                      {u.role !== 'admin' && !isSelf && (
                        <button
                          type="button"
                          className={`btn btn-small ${u.isActive ? 'btn-danger' : 'btn-secondary'}`}
                          disabled={busyId === u._id}
                          onClick={() => toggleSuspend(u)}
                        >
                          {u.isActive ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                      {u.isLocked && (
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          disabled={busyId === u._id}
                          onClick={() => unlock(u)}
                        >
                          Unlock
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && tab === 'gigs' && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Freelancer</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g._id}>
                  <td>{g.title}</td>
                  <td>{g.freelancer?.name}</td>
                  <td>{g.category}</td>
                  <td>{formatPrice(g.price)}</td>
                  <td>
                    <span className={`badge ${g.isActive ? 'badge-success' : 'badge-muted'}`}>
                      {g.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      disabled={busyId === g._id}
                      onClick={() => removeGig(g)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && tab === 'bookings' && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Gig</th>
                <th scope="col">Client</th>
                <th scope="col">Freelancer</th>
                <th scope="col">Amount</th>
                <th scope="col">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b._id}>
                  <td>{formatDate(b.createdAt)}</td>
                  <td>{b.gig?.title || <span className="viz-muted">Removed gig</span>}</td>
                  <td>{b.client?.name}</td>
                  <td>{b.freelancer?.name}</td>
                  <td>{formatPrice(b.amount)}</td>
                  <td>
                    <code>{b.transaction?.reference || '—'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && tab === 'transactions' && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Date</th>
                <th scope="col">Client</th>
                <th scope="col">Freelancer</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t._id}>
                  <td>
                    <code>{t.reference}</code>
                  </td>
                  <td>{formatDate(t.createdAt)}</td>
                  <td>{t.client?.name}</td>
                  <td>{t.freelancer?.name}</td>
                  <td>{formatPrice(t.amount)}</td>
                  <td>
                    <span className={`badge ${t.status === 'completed' ? 'badge-success' : 'badge-muted'}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && tab === 'audit' && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">Outcome</th>
                <th scope="col">Actor</th>
                <th scope="col">IP</th>
                <th scope="col">Request ID</th>
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l._id}>
                  <td>{new Date(l.createdAt).toLocaleString('en-ZA')}</td>
                  <td>
                    <code>{l.event}</code>
                  </td>
                  <td>
                    <span className={`badge ${l.outcome === 'success' ? 'badge-success' : 'badge-danger'}`}>
                      {l.outcome}
                    </span>
                  </td>
                  <td>{l.actor ? `${l.actor.name} (${l.actor.role})` : 'anonymous'}</td>
                  <td>{l.ip || '—'}</td>
                  <td>
                    <code className="request-id">{l.requestId ? l.requestId.slice(0, 8) : '—'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && Array.isArray(data) && data.length === 0 && <p className="empty-state">Nothing here yet.</p>}
    </div>
  );
}
