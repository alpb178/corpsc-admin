import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

const range = { from: '2026-10-01', to: '2026-10-28' };

describe('PageHeader', () => {
  it('shows no site mark for a header about the whole group', () => {
    const { container } = render(<PageHeader title="Dashboard" range={range} preset="28d" />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the site logo next to the title of a one-project header', () => {
    const { container } = render(
      <PageHeader title="Take" range={range} preset="28d" siteHeader logo="/project-icons/take.png" />,
    );

    const image = container.querySelector('img') as HTMLImageElement;
    expect(image.src).toContain('take.png');
  });

  it('falls back to initials when the project has no logo yet', () => {
    const { container } = render(<PageHeader title="Line Hot" range={range} preset="28d" siteHeader />);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('LH')).toBeTruthy();
  });
});
