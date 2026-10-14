/**
 * Failure-mode tests: simulate dependency outages and check the app degrades instead of failing.
 * These are the automated version of the scenarios in docs/failure-modes.md.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { emitEvent } from '../lib/automation';
import { evaluateHealth, configCheck, runCheck, REQUIRED_ENV } from '../lib/health';
import { log } from '../lib/log';

const realFetch = globalThis.fetch;
const saved = { ...process.env };
let lines: string[] = [];
const realWarn = console.warn, realLog = console.log, realError = console.error;

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test';
  process.env.OWNER_EMAIL = 'owner@example.com';
  process.env.MAKE_WEBHOOK_URL = 'https://hooks.example.com/x';
  process.env.DEPENDENCY_TIMEOUT_MS = '50';
  lines = [];
  console.warn = console.log = console.error = (s: string) => { lines.push(s); };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
  console.warn = realWarn; console.log = realLog; console.error = realError;
});

const sale = { product: 'deal_review', email: 'buyer@example.com', amountCents: 29900 };

test('a sale still completes when the email provider is unreachable', async () => {
  globalThis.fetch = (async () => { throw new TypeError('fetch failed: ECONNREFUSED'); }) as typeof fetch;
  await assert.doesNotReject(emitEvent('purchase.completed', sale));
  assert.ok(lines.some((l) => JSON.parse(l).event === 'dependency.resend.failed'));
  assert.ok(lines.some((l) => JSON.parse(l).event === 'dependency.make.failed'));
});

test('a hung dependency is cut off by the timeout instead of hanging the request', async () => {
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
  // AbortSignal.timeout timers don't keep Node alive on their own; a server always has open handles, a test doesn't.
  const keepAlive = setInterval(() => {}, 10);
  const start = Date.now();
  try {
    await assert.doesNotReject(emitEvent('purchase.completed', sale));
  } finally {
    clearInterval(keepAlive);
  }
  assert.ok(Date.now() - start < 1000, 'should give up after DEPENDENCY_TIMEOUT_MS, not hang');
});

test('a 5xx from the email provider is logged, not raised', async () => {
  globalThis.fetch = (async () => new Response('upstream error', { status: 503 })) as typeof fetch;
  await assert.doesNotReject(emitEvent('premium.requested', { name: 'A', email: 'a@b.co' }));
  const failure = lines.map((l) => JSON.parse(l)).find((l) => l.event === 'dependency.resend.failed');
  assert.equal(failure?.status, 503);
});

test('no alert calls are made when alerts are not configured', async () => {
  delete process.env.RESEND_API_KEY; delete process.env.MAKE_WEBHOOK_URL;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('ok'); }) as typeof fetch;
  await emitEvent('purchase.completed', sale);
  assert.equal(calls, 0);
});

test('health: database down is critical (503), missing alert config is only degraded (200)', () => {
  assert.deepEqual(evaluateHealth({ db: { ok: false, critical: true } }), { status: 'down', httpStatus: 503 });
  assert.deepEqual(evaluateHealth({ db: { ok: true, critical: true }, alerts: { ok: false, critical: false } }), { status: 'degraded', httpStatus: 200 });
  assert.deepEqual(evaluateHealth({ db: { ok: true, critical: true } }), { status: 'ok', httpStatus: 200 });
});

test('health: a hung check times out and reports failure', async () => {
  const r = await runCheck(true, 30, () => new Promise(() => {}));
  assert.equal(r.ok, false);
  assert.match(r.detail ?? '', /timed out/);
  assert.ok((r.ms ?? 0) < 500);
});

test('health: config check names missing keys but never leaks values', () => {
  const env: Record<string, string> = { STRIPE_SECRET_KEY: 'rk_live_SECRET' };
  const r = configCheck(env, REQUIRED_ENV, true);
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes('rk_live_SECRET'));
  assert.match(r.detail ?? '', /NEXT_PUBLIC_SUPABASE_URL/);
});

test('logs are one JSON object per line with level and event', () => {
  log('error', 'test.event', { requestId: 'abc', err: new Error('boom') });
  const line = JSON.parse(lines.at(-1)!);
  assert.equal(line.level, 'error');
  assert.equal(line.event, 'test.event');
  assert.equal(line.requestId, 'abc');
  assert.equal(line.err.message, 'boom');
});
