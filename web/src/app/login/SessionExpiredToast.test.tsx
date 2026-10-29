import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { SessionExpiredToast } from './SessionExpiredToast';

describe('SessionExpiredToast', () => {
  it('shows a toast explaining the forced sign-out', () => {
    render(
      <ToastProvider>
        <SessionExpiredToast />
      </ToastProvider>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Tu sesión ha expirado. Inicia sesión de nuevo.')).toBeTruthy();
  });
});
