import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('./actions', () => ({ login: mocks.login }));

import { LoginForm } from './LoginForm';

beforeEach(() => {
  mocks.login.mockReset();
});

describe('LoginForm', () => {
  it('keeps what was typed after a failed attempt (wrong credentials, lockout, API down)', async () => {
    mocks.login.mockResolvedValue({ error: 'Credenciales incorrectas.' });
    render(
      <ToastProvider>
        <LoginForm next="/" />
      </ToastProvider>,
    );

    const email = screen.getByLabelText('Correo') as HTMLInputElement;
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'ana@corpsc.com' } });
    fireEvent.change(password, { target: { value: 'lo-que-sea' } });

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Credenciales incorrectas.')).toBeTruthy());
    expect(email.value).toBe('ana@corpsc.com');
    expect(password.value).toBe('lo-que-sea');
  });

  it('hides the password by default and reveals it on demand', () => {
    render(
      <ToastProvider>
        <LoginForm next="/" />
      </ToastProvider>,
    );

    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(password.type).toBe('password');

    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
    fireEvent.click(toggle);
    expect(password.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(password.type).toBe('password');
  });
});
