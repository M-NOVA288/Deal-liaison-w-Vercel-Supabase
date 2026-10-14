import { getUser } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/http';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getUser(req);
    if (!user) return fail('Not signed in.', 401);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('email, full_name, plan, subscription_status, current_period_end, has_playbook, is_admin, created_at')
      .eq('id', user.id)
      .single();
    if (error) throw error;

    return ok({
      id: user.id,
      ...profile,
      access: {
        analyzer: true,
        savedDeals: profile.plan === 'pro',
        playbook: profile.has_playbook,
        admin: profile.is_admin,
      },
    });
  } catch (err) {
    return handleError(err, req);
  }
}
