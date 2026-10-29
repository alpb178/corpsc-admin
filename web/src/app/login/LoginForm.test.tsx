import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';

vi.mock('./actions', () => ({ login: vi.fn() }));

import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
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
