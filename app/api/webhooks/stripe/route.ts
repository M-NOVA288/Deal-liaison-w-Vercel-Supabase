import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitEvent } from '@/lib/automation';
import { env } from '@/lib/env';

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = stripe().webhooks.constructEvent(raw, signature, env('STRIPE_WEBHOOK_SECRET'));
  } catch (err) {
    console.error('[stripe] bad signature', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await onSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(`[stripe] failed handling ${event.type}`, err);
    return new Response('Webhook handler failed', { status: 500 });
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return;

  const db = createAdminClient();
  const product = (session.metadata?.product ?? 'playbook') as 'playbook' | 'pro_subscription' | 'premium_plan' | 'deal_review' | 'workflow_audit';
  const userId = session.client_reference_id || session.metadata?.user_id || null;
  const email = session.customer_details?.email ?? session.customer_email ?? '';
  const premiumRequestId = session.metadata?.premium_request_id || null;
  const details = session.custom_fields?.find((f) => f.key === 'listing')?.text?.value ?? null;

  const { error } = await db.from('purchases').upsert(
    {
      user_id: userId,
      email,
      product,
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      stripe_session_id: session.id,
      premium_request_id: premiumRequestId,
      details,
    },
    { onConflict: 'stripe_session_id', ignoreDuplicates: true },
  );
  if (error) throw error;

  if (product === 'premium_plan' && premiumRequestId) {
    const { error: e } = await db
      .from('premium_requests')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', premiumRequestId);
    if (e) throw e;
  }

  if (product === 'playbook' && userId) {
    const { error: e } = await db.from('profiles').update({ has_playbook: true }).eq('id', userId);
    if (e) throw e;
  }

  await emitEvent('purchase.completed', {
    product, email, userId, amountCents: session.amount_total, sessionId: session.id, premiumRequestId, details,
  });
}

async function onSubscriptionChange(sub: Stripe.Subscription) {
  const db = createAdminClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const active = sub.status === 'active' || sub.status === 'trialing';

  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;

  const update = {
    plan: active ? 'pro' : 'free',
    subscription_status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };

  const userId = sub.metadata?.user_id;
  const query = db.from('profiles').update(update);
  const { data, error } = userId
    ? await query.eq('id', userId).select('id, email')
    : await query.eq('stripe_customer_id', customerId).select('id, email');
  if (error) throw error;
  if (!data?.length) console.warn(`[stripe] no profile found for subscription ${sub.id}`);

  await emitEvent('subscription.updated', {
    status: sub.status, plan: update.plan, email: data?.[0]?.email, userId: data?.[0]?.id,
  });
}
