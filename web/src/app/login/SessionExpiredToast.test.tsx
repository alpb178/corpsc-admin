import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { SessionExpiredToast } from './SessionExpiredToast';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('SessionExpiredToast', () => {
  it('shows a toast explaining the forced sign-out, and clears the dead cookie', () => {
    render(
      <ToastProvider>
        <SessionExpiredToast />
      </ToastProvider>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Tu sesión ha expirado. Inicia sesión de nuevo.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/session', { method: 'DELETE' });
  });
});
