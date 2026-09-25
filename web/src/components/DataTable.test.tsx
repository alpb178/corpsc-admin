import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Row } from './DataTable';

const columns = [
  { key: 'name', label: 'Nombre' },
  { key: 'n', label: 'N', align: 'right' as const },
];

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    deleteKey: `/p${i + 1}`,
    deleteLabel: `la página /p${i + 1}`,
    cells: { name: `fila ${i + 1}`, n: i + 1 },
  }));

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('DataTable', () => {
  it('shows ten rows a page and moves between pages without losing count', () => {
    render(<DataTable title="Páginas" columns={columns} rows={rows(25)} emptyText="nada" />);

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('1–10 de 25')).toBeTruthy();
    expect(within(bodyRows()[0]).getByText('fila 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–20 de 25')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('21–25 de 25')).toBeTruthy();
    expect(bodyRows()).toHaveLength(5);
    expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('has no pages and no delete column without a reason for them', () => {
    render(<DataTable title="Páginas" columns={columns} rows={rows(3)} emptyText="nada" />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: /Borrar/ })).toBeNull();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  });

  it('explains an empty table', () => {
    render(<DataTable title="Páginas" columns={columns} rows={[]} emptyText="Sin páginas." />);
    expect(screen.getByText('Sin páginas.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('asks before deleting, then calls the action with the row and the period, and reports back', async () => {
    const action = vi.fn().mockResolvedValue({ ok: 'Borrados 3 eventos.' });
    render(
      <DataTable
        title="Páginas"
        columns={columns}
        rows={rows(2)}
        emptyText="nada"
        deletion={{ action, table: 'page', slug: 'take', from: '2026-09-01', to: '2026-09-28' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Borrar la página /p2' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText('¿Borrar?')).toBeTruthy();

    // Backing out leaves everything as it was.
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.queryByText('¿Borrar?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Borrar la página /p2' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sí' }));
    });

    expect(action).toHaveBeenCalledWith({ slug: 'take', table: 'page', key: '/p2', from: '2026-09-01', to: '2026-09-28' });
    expect(screen.getByRole('status').textContent).toBe('Borrados 3 eventos.');
  });

  it("takes the row's own site over the table's, and shows an error as an alert", async () => {
    const action = vi.fn().mockResolvedValue({ error: 'No se pudo borrar.' });
    const mixed: Row[] = [{ id: 'e1', slug: 'corpsc', deleteKey: '42', cells: { name: 'evento', n: 1 } }];
    render(
      <DataTable
        title="Eventos"
        columns={columns}
        rows={mixed}
        emptyText="nada"
        deletion={{ action, table: 'recent', from: '2026-09-01', to: '2026-09-28' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Borrar 42' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sí' }));
    });

    expect(action).toHaveBeenCalledWith(expect.objectContaining({ slug: 'corpsc', table: 'recent', key: '42' }));
    expect(screen.getByRole('alert').textContent).toBe('No se pudo borrar.');
  });

  it('leaves a row without a key alone even when deleting is allowed', () => {
    const action = vi.fn();
    render(
      <DataTable
        title="Páginas"
        columns={columns}
        rows={[{ id: 'rest', cells: { name: 'Resto', n: 9 } }, ...rows(1)]}
        emptyText="nada"
        deletion={{ action, table: 'page', slug: 'take', from: '2026-09-01', to: '2026-09-28' }}
      />,
    );
    expect(screen.getAllByRole('button', { name: /^Borrar/ })).toHaveLength(1);
    expect(screen.getByText(/Borrar quita los eventos/)).toBeTruthy();
  });

  it('falls back to the last page that still has rows when they shrink', () => {
    const { rerender } = render(<DataTable title="Páginas" columns={columns} rows={rows(21)} emptyText="nada" />);
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('21–21 de 21')).toBeTruthy();

    rerender(<DataTable title="Páginas" columns={columns} rows={rows(12)} emptyText="nada" />);
    expect(screen.getByText('11–12 de 12')).toBeTruthy();
  });
});
