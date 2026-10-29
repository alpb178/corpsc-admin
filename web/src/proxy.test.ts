import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

function request(path: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie: `corpsc_hub_session=${cookie}` } : undefined;
  return new NextRequest(new URL(path, 'http://panel.test'), { headers });
}

describe('proxy', () => {
  it('sends a visitor without a cookie to the login, remembering where they were headed', () => {
    const response = proxy(request('/projects/take'));
    expect(response.status).toBe(307);
    const to = new URL(response.headers.get('location')!);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('next')).toBe('/projects/take');
  });

  it('sends a cookie-less visit to the home page to a plain /login, with no "next"', () => {
    const response = proxy(request('/'));
    expect(response.status).toBe(307);
    const to = new URL(response.headers.get('location')!);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.has('next')).toBe(false);
  });

  it('sends someone with a cookie away from the login form, to the dashboard', () => {
    const response = proxy(request('/login', 'a-token'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/');
  });

  it('lets a dead-session redirect reach the login instead of bouncing it back to "/"', () => {
    // Without this, `requireUser()` sending a dead cookie to
    // `/login?reason=expired` would loop forever: `/` fails the real check,
    // lands here, and a cookie-only proxy would bounce it straight back.
    const response = proxy(request('/login?reason=expired', 'dead-token'));
    expect(response.status).toBe(200);
  });

  it('lets a request with its cookie through to the page it asked for', () => {
    const response = proxy(request('/projects/take', 'a-token'));
    expect(response.status).toBe(200);
  });
});
