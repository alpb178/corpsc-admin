import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock('@/lib/session', () => ({ clearSession: mocks.clearSession }));

import { DELETE } from './route';

beforeEach(() => {
  mocks.clearSession.mockReset();
});

describe('DELETE /api/session', () => {
  it('clears the session cookie and answers with no content', async () => {
    const response = await DELETE();

    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(204);
  });
});
