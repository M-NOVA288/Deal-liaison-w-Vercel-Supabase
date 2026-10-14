import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeStats } from '@/lib/stats';
import { ok, fail, handleError } from '@/lib/http';

export async function GET(req: Request) {
  try {
    if (!(await requireAdmin(req))) return fail('Admins only.', 403);
    const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 30));

    const db = createAdminClient();
    const [purchases, profiles, leads, premium] = await Promise.all([
      db.from('purchases').select('product, amount_cents, created_at, email').limit(50000),
      db.from('profiles').select('plan, subscription_status, created_at').limit(50000),
      db.from('leads').select('source, created_at').limit(50000),
      db.from('premium_requests').select('status, price_cents, created_at').limit(10000),
    ]);
    if (purchases.error) throw purchases.error;
    if (profiles.error) throw profiles.error;
    if (leads.error) throw leads.error;
    if (premium.error) throw premium.error;

    return ok(
      computeStats(
        { purchases: purchases.data ?? [], profiles: profiles.data ?? [], leads: leads.data ?? [], premium: premium.data ?? [] },
        { windowDays: days, proPriceCents: Number(process.env.PRO_PRICE_CENTS || 2900) },
      ),
    );
  } catch (err) {
    return handleError(err, req);
  }
}
