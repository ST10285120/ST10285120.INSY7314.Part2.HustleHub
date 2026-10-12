import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Register from '../pages/Register';
import { AuthProvider } from '../context/AuthContext';
import { client } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    client: { post: vi.fn(), get: vi.fn() },
  };
});

function renderRegister() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Register />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Register page', () => {
  it('only offers client and freelancer as roles (never admin)', () => {
    renderRegister();
    const options = screen.getAllByRole('option').map((o) => o.value);
    expect(options).toEqual(['client', 'freelancer']);
  });

  it('renders field-level validation errors returned by the backend', async () => {
    client.post.mockRejectedValueOnce({
      response: {
        data: {
          success: false,
          message: 'Validation failed.',
          errors: [{ field: 'password', message: 'Password must be between 10 and 128 characters.' }],
        },
      },
    });

    renderRegister();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Name'), 'Thabo Mokoena');
    await user.type(screen.getByLabelText('Email'), 'thabo@example.com');
    await user.type(screen.getByLabelText('Password'), 'weak');
    await user.type(screen.getByLabelText('Confirm password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Password must be between 10 and 128 characters.')
    ).toBeInTheDocument();
  });

  it('blocks submission when the passwords do not match', async () => {
    renderRegister();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Name'), 'Thabo Mokoena');
    await user.type(screen.getByLabelText('Email'), 'thabo@example.com');
    await user.type(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rdX');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });
});
