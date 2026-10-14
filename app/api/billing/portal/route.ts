import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { siteUrl } from '@/lib/env';
import { ok, fail, handleError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const { user } = await getUser(req);
    if (!user) return fail('Please sign in.', 401);

    const { data: profile } = await createAdminClient()
      .from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (!profile?.stripe_customer_id) return fail('No billing account yet. Buy or subscribe first.', 404);

    const session = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl()}/`,
    });
    return ok({ url: session.url });
  } catch (err) {
    return handleError(err, req);
  }
}
