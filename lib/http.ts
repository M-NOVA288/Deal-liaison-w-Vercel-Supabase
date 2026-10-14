import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { InputError } from './analyzer';

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Turns known errors into friendly 400s and hides everything else behind a 500. */
export function handleError(err: unknown) {
  if (err instanceof InputError) return fail(err.message, 400);
  if (err instanceof ZodError) return fail(err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  if (err instanceof SyntaxError) return fail('Request body must be valid JSON', 400);
  console.error(err);
  return fail('Something went wrong. Please try again.', 500);
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
