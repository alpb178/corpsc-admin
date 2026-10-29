'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type ToastVariant = 'error' | 'success';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 6000;

/**
 * One global toast stack, mounted once in the root layout.
 *
 * Server Action forms already show their result inline (`state.error`,
 * `state.ok`): that stays, it's tested and it's the clearest spot for it. A
 * toast is for what happens away from any form — a session that just expired
 * mid-navigation — and, via `useActionToast`, as a second, harder-to-miss
 * signal next to the inline one for action failures.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'error') => {
      const id = `t${nextId.current++}`;
      setToasts((current) => [...current, { id, variant, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`card pointer-events-auto flex max-w-sm items-start gap-3 border-l-[3px] px-4 py-3 text-[13px] shadow-lg ${
              t.variant === 'error' ? 'border-l-[var(--negative)]' : 'border-l-[var(--positive)]'
            }`}
          >
            <span className={t.variant === 'error' ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}>
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar aviso"
              className="ml-auto text-fg-faint hover:text-fg"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

/** Pops an error toast whenever a Server Action's state carries a new `error`. */
export function useActionToast(state: { error?: string }): void {
  const { show } = useToast();
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.error && state.error !== last.current) show(state.error, 'error');
    last.current = state.error;
  }, [state.error, show]);
}
