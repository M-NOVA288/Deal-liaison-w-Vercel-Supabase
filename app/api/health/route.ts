import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { configCheck, evaluateHealth, OPTIONAL_ENV, REQUIRED_ENV, runCheck } from '@/lib/health';
import { log, requestId } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * For uptime monitors, load balancers and container HEALTHCHECKs.
 *   ?live=1  -> liveness only (process is up, no dependency calls)
 *   default  -> readiness: config + a real database round trip
 */
export async function GET(req: Request) {
  const id = requestId(req);
  if (new URL(req.url).searchParams.get('live')) {
    return NextResponse.json({ status: 'ok', check: 'liveness' }, { headers: { 'cache-control': 'no-store' } });
  }

  const checks = {
    config: configCheck(process.env, REQUIRED_ENV, true),
    optionalConfig: configCheck(process.env, OPTIONAL_ENV, false),
    database: await runCheck(true, 3000, async () => {
      const { error } = await createAdminClient().from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
      if (error) throw new Error(error.message);
    }),
  };

  const { status, httpStatus } = evaluateHealth(checks);
  log(status === 'ok' ? 'info' : 'warn', 'health.check', { requestId: id, status, dbMs: checks.database.ms });

  return NextResponse.json(
    {
      status,
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.APP_VERSION || 'dev',
      region: process.env.VERCEL_REGION || process.env.REGION || 'local',
      time: new Date().toISOString(),
    },
    { status: httpStatus, headers: { 'cache-control': 'no-store' } },
  );
}
