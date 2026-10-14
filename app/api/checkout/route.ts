import { z } from 'zod';
import { stripe, PRODUCTS } from '@/lib/stripe';
import { createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env, siteUrl } from '@/lib/env';
import { ok, fail, handleError } from '@/lib/http';

const Body = z.object({
  product: z.enum(['playbook', 'pro_subscription', 'deal_review', 'workflow_audit']),
  email: z.string().email().optional(),
});

export async function POST(req: Request) {
  try {
    const { product, email } = Body.parse(await req.json());
    const cfg = PRODUCTS[product];

    const supabase = await createUserClient(req.headers.get('authorization'));
    const { data: { user } } = await supabase.auth.getUser();

    if (product === 'pro_subscription' && !user) return fail('Please sign in before subscribing.', 401);

    let customerId: string | undefined;
    if (user) {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles').select('stripe_customer_id, plan').eq('id', user.id).single();

      if (product === 'pro_subscription' && profile?.plan === 'pro') return fail('You already have Pro.', 409);

      customerId = profile?.stripe_customer_id ?? undefined;
      if (!customerId) {
        const customer = await stripe().customers.create({ email: user.email, metadata: { user_id: user.id } });
        customerId = customer.id;
        await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
      }
    }

    const session = await stripe().checkout.sessions.create({
      mode: cfg.mode,
      line_items: [{ price: env(cfg.priceEnv), quantity: 1 }],
      customer: customerId,
      customer_email: customerId ? undefined : email,
      client_reference_id: user?.id,
      metadata: { product, user_id: user?.id ?? '' },
      subscription_data: cfg.mode === 'subscription' && user ? { metadata: { user_id: user.id } } : undefined,
      custom_fields: product === 'deal_review'
        ? [{ key: 'listing', label: { type: 'custom', custom: 'Listing link or business name' }, type: 'text' }]
        : product === 'workflow_audit'
          ? [{ key: 'listing', label: { type: 'custom', custom: 'Store URL or brand name' }, type: 'text' }]
          : undefined,
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/welcome?product=${product}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}${product === 'workflow_audit' ? '/growth' : '/'}?checkout=canceled`,
    });

    return ok({ url: session.url });
  } catch (err) {
    return handleError(err);
  }
}
