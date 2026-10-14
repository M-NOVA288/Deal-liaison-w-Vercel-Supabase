import { analyzeDeal } from '@/lib/analyzer';
import { ok, fail, handleError, rateLimited, clientIp } from '@/lib/http';

export async function POST(req: Request) {
  if (rateLimited(`analyze:${clientIp(req)}`, 60)) return fail('Too many requests. Slow down a little.', 429);
  try {
    const body = await req.json();
    return ok(analyzeDeal(body ?? {}));
  } catch (err) {
    return handleError(err);
  }
}
