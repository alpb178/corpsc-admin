import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useActionToast, useToast } from './Toast';

function Trigger({ message }: { message: string }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(message)}>
      disparar
    </button>
  );
}

describe('ToastProvider', () => {
  it('shows a toast on demand and dismisses it on click', () => {
    render(
      <ToastProvider>
        <Trigger message="Algo falló." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Algo falló.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stacks more than one toast, each dismissed on its own', () => {
    render(
      <ToastProvider>
        <Trigger message="Primero." />
      </ToastProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'disparar' });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar aviso' })[0]);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('throws if useToast is used outside the provider', () => {
    function Lonely() {
      useToast();
      return null;
    }
    // React logs the thrown error to the console as well; the assertion is what matters here.
    expect(() => render(<Lonely />)).toThrow('useToast must be used within a ToastProvider');
  });
});

describe('useActionToast', () => {
  function Form({ error }: { error?: string }) {
    useActionToast({ error });
    return null;
  }

  it('pops a toast when an action state carries a new error, and only once per message', () => {
    const { rerender } = render(
      <ToastProvider>
        <Form />
      </ToastProvider>,
    );
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <ToastProvider>
        <Form error="No se pudo guardar." />
      </ToastProvider>,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('No se pudo guardar.')).toBeTruthy();

    // The same error string again (e.g. the exact same failure re-submitted
    // with no state change in between) does not pile up a second toast.
    rerender(
      <ToastProvider>
        <Form error="No se pudo guardar." />
      </ToastProvider>,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});
