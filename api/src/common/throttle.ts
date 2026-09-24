import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Requests per minute a project may send to `/ingest/*`.
 *
 * Each request carries up to 50 events, so the default leaves room for
 * thousands of events a minute per site: far above the group's real traffic,
 * and low enough that a leaked key or a looping beacon can't bury the database.
 */
export const DEFAULT_INGEST_PER_MINUTE = 600;

/** Login attempts per account and quarter of an hour. */
export const LOGIN_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export function throttlerOptions(env: NodeJS.ProcessEnv = process.env): ThrottlerModuleOptions {
  const perMinute = Number(env.INGEST_RATE_LIMIT_PER_MINUTE);
  return [
    {
      name: 'default',
      ttl: 60_000,
      limit: Number.isInteger(perMinute) && perMinute > 0 ? perMinute : DEFAULT_INGEST_PER_MINUTE,
    },
  ];
}

/** The parts of the Express request the trackers read. */
interface TrackedRequest {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: { email?: unknown };
}

/** The tracker lives in memory: it's hashed so no plain secret sits there. */
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/**
 * Throttles ingestion by project, not by IP.
 *
 * The callers are the sites' servers, and several of them can share the same
 * hosting IPs: limiting by IP would let one busy site starve the others. The
 * key identifies the project, so it's what gets counted. It runs BEFORE the
 * key is checked, so a flood of invalid keys is throttled as well.
 */
@Injectable()
export class IngestThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: TrackedRequest): Promise<string> {
    const header = req.headers?.['x-api-key'];
    const key = typeof header === 'string' ? header : '';
    return key ? `key:${digest(key)}` : `ip:${req.ip}`;
  }
}

/**
 * Throttles login attempts by account.
 *
 * The panel logs in from its own server, so every attempt arrives from the
 * same IP: limiting by IP would lock everyone out at once. Limiting by email
 * stops guessing one account's password without affecting the others.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: TrackedRequest): Promise<string> {
    const raw = req.body?.email;
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return email ? `login:${digest(email)}` : `ip:${req.ip}`;
  }
}
