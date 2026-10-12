import { useEffect, useRef, useState } from 'react';
import { client, toDisplayError } from '../api/client';
import FieldErrors from '../components/FieldErrors';
import { formatPrice } from '../utils/format';

const emptyForm = { title: '', description: '', category: '', price: '' };

export default function MyGigs() {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  async function loadGigs() {
    try {
      const res = await client.get('/gigs/my');
      setGigs(res.data.data.gigs);
    } catch (err) {
      setError(toDisplayError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGigs();
  }, []);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function startEdit(gig) {
    setEditingId(gig._id || gig.id);
    setForm({
      title: gig.title,
      description: gig.description,
      category: gig.category,
      price: gig.price,
    });
    setError(null);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    formRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (editingId) {
        await client.put(`/gigs/${editingId}`, form);
      } else {
        await client.post('/gigs', form);
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadGigs();
    } catch (err) {
      setError(toDisplayError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(gig) {
    if (!window.confirm(`Delete "${gig.title}"? This cannot be undone.`)) return;
    const gigId = gig._id || gig.id;
    setError(null);
    try {
      await client.delete(`/gigs/${gigId}`);
      if (editingId === gigId) cancelEdit();
      await loadGigs();
    } catch (err) {
      setError(toDisplayError(err));
    }
  }

  async function handleToggleActive(gig) {
    setError(null);
    try {
      await client.put(`/gigs/${gig._id || gig.id}`, { isActive: !gig.isActive });
      await loadGigs();
    } catch (err) {
      setError(toDisplayError(err));
    }
  }

  return (
    <div className="page">
      <h1>My gigs</h1>

      <form onSubmit={handleSubmit} className="gig-form" ref={formRef} noValidate>
        <h2>{editingId ? 'Edit gig' : 'Create a new gig'}</h2>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" value={form.title} onChange={handleChange} required />

        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          value={form.description}
          onChange={handleChange}
          required
        />

        <label htmlFor="category">Category</label>
        <input id="category" name="category" value={form.category} onChange={handleChange} required />

        <label htmlFor="price">Price (ZAR)</label>
        <input
          id="price"
          name="price"
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={handleChange}
          required
        />

        <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />

        <div className="form-actions">
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create gig'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn btn-secondary">
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2>Your gigs</h2>
      {loading && <p className="loading">Loading…</p>}
      {!loading && gigs.length === 0 && (
        <p className="empty-state">You haven't created any gigs yet. Use the form above to add your first one.</p>
      )}

      <ul className="my-gig-list">
        {gigs.map((gig) => (
          <li
            key={gig._id || gig.id}
            className={`my-gig-item${editingId === (gig._id || gig.id) ? ' is-editing' : ''}`}
          >
            <div className="my-gig-summary">
              <strong>{gig.title}</strong>
              <span className="my-gig-price">{formatPrice(gig.price)}</span>
              <span className={`badge ${gig.isActive ? 'badge-success' : 'badge-muted'}`}>
                {gig.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="my-gig-actions">
              <button type="button" onClick={() => startEdit(gig)} className="btn btn-secondary btn-small">
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(gig)}
                className="btn btn-secondary btn-small"
              >
                {gig.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" onClick={() => handleDelete(gig)} className="btn btn-danger btn-small">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
