/**
 * Health evaluation, kept pure so it can be unit tested without a database.
 *
 * - critical checks (database, required config) failing => "down"  (HTTP 503: take out of rotation / page someone)
 * - optional checks (alerts, booking links) failing     => "degraded" (HTTP 200: still serving traffic)
 */
export type CheckResult = { ok: boolean; critical: boolean; ms?: number; detail?: string };
export type HealthStatus = 'ok' | 'degraded' | 'down';

export function evaluateHealth(checks: Record<string, CheckResult>): { status: HealthStatus; httpStatus: number } {
  const results = Object.values(checks);
  if (results.some((c) => c.critical && !c.ok)) return { status: 'down', httpStatus: 503 };
  if (results.some((c) => !c.ok)) return { status: 'degraded', httpStatus: 200 };
  return { status: 'ok', httpStatus: 200 };
}

/** Required for the app to take payments and serve accounts at all. */
export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PLAYBOOK',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_DEAL_REVIEW',
  'STRIPE_PRICE_WORKFLOW_AUDIT',
] as const;

/** Nice to have: the app works without them but loses a feature. */
export const OPTIONAL_ENV = ['RESEND_API_KEY', 'OWNER_EMAIL', 'CALENDLY_DEALS_URL', 'CALENDLY_GROWTH_URL'] as const;

export function configCheck(env: Record<string, string | undefined>, keys: readonly string[], critical: boolean): CheckResult {
  const missing = keys.filter((k) => !env[k]);
  // Names only, never values: health output is public.
  return missing.length ? { ok: false, critical, detail: `missing: ${missing.join(', ')}` } : { ok: true, critical };
}

/** Runs a check with a hard timeout so a hung dependency can't hang the health endpoint itself. */
export async function runCheck(critical: boolean, timeoutMs: number, fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, critical, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, critical, ms: Date.now() - start, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
