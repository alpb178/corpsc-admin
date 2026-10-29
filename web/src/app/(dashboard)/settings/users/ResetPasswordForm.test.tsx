import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';

const mocks = vi.hoisted(() => ({ resetPassword: vi.fn() }));
vi.mock('../actions', () => ({ resetPassword: mocks.resetPassword }));

import { ResetPasswordForm } from './ResetPasswordForm';

beforeEach(() => {
  mocks.resetPassword.mockReset();
});

function renderForm() {
  return render(
    <ToastProvider>
      <ResetPasswordForm userId="u1" userName="Ana" />
    </ToastProvider>,
  );
}

describe('ResetPasswordForm', () => {
  it('starts collapsed, as a plain button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Nueva contraseña')).toBeNull();
  });

  it('opens the form, submits the new password for that user, then collapses back on success', async () => {
    mocks.resetPassword.mockResolvedValue({ ok: 'Contraseña actualizada.' });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    const input = screen.getByPlaceholderText('Nueva contraseña');
    fireEvent.change(input, { target: { value: 'una-nueva-contrasena' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalled());
    const data = mocks.resetPassword.mock.calls[0][1] as FormData;
    expect(data.get('userId')).toBe('u1');
    expect(data.get('password')).toBe('una-nueva-contrasena');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Contraseña actualizada.')).toBeTruthy());
  });

  it('stays open and shows the error toast when the reset fails', async () => {
    mocks.resetPassword.mockResolvedValue({ error: 'La contraseña debe tener al menos 10 caracteres.' });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    fireEvent.change(screen.getByPlaceholderText('Nueva contraseña'), { target: { value: 'cualquier-cosa-larga' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByText('La contraseña debe tener al menos 10 caracteres.')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Restablecer contraseña' })).toBeNull();
  });

  it('cancels back to the button without submitting', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeTruthy();
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });
});
