import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FieldErrors from '../components/FieldErrors';
import PasswordInput from '../components/PasswordInput';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(form);
    setSubmitting(false);
    if (result.success) {
      navigate('/gigs');
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="auth-page">
      <h1>Log in</h1>
      <form onSubmit={handleSubmit} noValidate>
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
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          required
        />

        <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p>
        No account yet? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
