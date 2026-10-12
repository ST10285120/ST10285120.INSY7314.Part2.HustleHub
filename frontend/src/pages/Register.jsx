import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FieldErrors from '../components/FieldErrors';
import PasswordInput from '../components/PasswordInput';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'client',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const { confirmPassword, ...payload } = form;
    if (payload.password !== confirmPassword) {
      setError({ message: 'Passwords do not match.' });
      return;
    }
    setSubmitting(true);
    const result = await register(payload);
    setSubmitting(false);
    if (result.success) {
      navigate('/gigs');
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="auth-page">
      <h1>Register</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          value={form.name}
          onChange={handleChange}
          required
        />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          required
        />

        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <p className="hint">
          At least 10 characters, with uppercase, lowercase, a number and a symbol.
        </p>

        <label htmlFor="confirmPassword">Confirm password</label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          required
        />

        <label htmlFor="role">I am a…</label>
        <select id="role" name="role" value={form.role} onChange={handleChange}>
          <option value="client">Client (I want to book gigs)</option>
          <option value="freelancer">Freelancer (I want to offer gigs)</option>
        </select>

        <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
