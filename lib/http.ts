import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { InputError } from './analyzer';
import { log, requestId } from './log';

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Turns known errors into friendly 400s and hides everything else behind a 500.
 * Unexpected errors are logged as structured JSON with the request id (when the caller passes req),
 * and the id is returned to the client so a bug report can be matched to the log line.
 */
export function handleError(err: unknown, req?: Request) {
  if (err instanceof InputError) return fail(err.message, 400);
  if (err instanceof ZodError) return fail(err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  if (err instanceof SyntaxError) return fail('Request body must be valid JSON', 400);
  const id = req ? requestId(req) : 'none';
  log('error', 'request.unhandled_error', { requestId: id, path: req ? new URL(req.url).pathname : undefined, err });
  return NextResponse.json({ error: 'Something went wrong. Please try again.', requestId: id }, { status: 500 });
}

/** Very small in-memory rate limiter for public endpoints (per server instance). */
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimited(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  h.count += 1;
  return h.count > limit;
}

export const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
