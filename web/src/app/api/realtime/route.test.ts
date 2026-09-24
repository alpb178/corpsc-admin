import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), api: vi.fn() }));
vi.mock('@/lib/dal', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: mocks.api };
});

import { GET } from './route';
import { ApiError } from '@/lib/api';

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ id: 'u1', role: 'VIEWER' });
  mocks.api.mockReset().mockResolvedValue({ activeVisitors: 2 });
});

describe('GET /api/realtime', () => {
  it('refuses without a session', async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await GET(new Request('http://panel/api/realtime'));
    expect(response.status).toBe(401);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('forwards the site and window to the API, never cached', async () => {
    const response = await GET(new Request('http://panel/api/realtime?project=take&minutes=10'));

    expect(mocks.api).toHaveBeenCalledWith('/metrics/realtime', { project: 'take', minutes: '10' });
    expect(await response.json()).toEqual({ activeVisitors: 2 });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('passes on the API status, and a 502 when it is unreachable', async () => {
    mocks.api.mockRejectedValueOnce(new ApiError(404, 'No existe el proyecto'));
    expect((await GET(new Request('http://panel/api/realtime?project=x'))).status).toBe(404);

    mocks.api.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await GET(new Request('http://panel/api/realtime'))).status).toBe(502);
  });
});
