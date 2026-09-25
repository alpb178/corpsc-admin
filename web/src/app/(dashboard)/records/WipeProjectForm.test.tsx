import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ wipeProject: vi.fn() }));

import { WipeProjectForm } from './WipeProjectForm';

describe('WipeProjectForm', () => {
  it('keeps the button off until the name is typed exactly', () => {
    render(<WipeProjectForm slug="take" name="Take" />);

    const button = screen.getByRole('button', { name: 'Eliminar todo' }) as HTMLButtonElement;
    const input = screen.getByLabelText('Escribe «Take» para confirmar');
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'take' } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: ' Take ' } });
    expect(button.disabled).toBe(false);
  });
});
