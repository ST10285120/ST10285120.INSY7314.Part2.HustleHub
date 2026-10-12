import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Login from '../pages/Login';
import { AuthProvider } from '../context/AuthContext';
import { client } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    client: { post: vi.fn(), get: vi.fn() },
  };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Login page', () => {
  it('renders email and password fields and a submit button', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('lets the user type into the email and password fields', async () => {
    renderLogin();
    const user = userEvent.setup();
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');

    await user.type(emailInput, 'thabo@example.com');
    await user.type(passwordInput, 'Str0ng!Passw0rd');

    expect(emailInput).toHaveValue('thabo@example.com');
    expect(passwordInput).toHaveValue('Str0ng!Passw0rd');
  });

  it('lets the user show and hide the password', async () => {
    renderLogin();
    const user = userEvent.setup();
    const passwordInput = screen.getByLabelText('Password');

    expect(passwordInput).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('shows the backend\'s generic error message on failed login, without leaking details', async () => {
    client.post.mockRejectedValueOnce({
      response: { data: { success: false, message: 'Invalid email or password.' } },
    });

    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'thabo@example.com');
    await user.type(screen.getByLabelText('Password'), 'WrongPassword1!');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });
});
