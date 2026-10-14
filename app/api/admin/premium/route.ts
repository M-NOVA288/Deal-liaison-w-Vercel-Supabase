import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, fail, handleError } from '@/lib/http';

export async function GET(req: Request) {
  try {
    if (!(await requireAdmin(req))) return fail('Admins only.', 403);
    const status = new URL(req.url).searchParams.get('status');
    let q = createAdminClient().from('premium_requests').select('*').order('created_at', { ascending: false }).limit(500);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return ok({ requests: data });
  } catch (err) {
    return handleError(err, req);
  }
}
