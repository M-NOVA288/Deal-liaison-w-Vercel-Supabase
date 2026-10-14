import { stripe } from '@/lib/stripe';

// Shown after a successful Stripe checkout. Access is granted by the webhook, not by this page.
export const dynamic = 'force-dynamic';

const CALLS = ['deal_review', 'workflow_audit', 'premium_plan'];

async function bookingLink(product: string | undefined, sessionId: string | undefined) {
  if (!product || !CALLS.includes(product)) return null;
  const base = product === 'workflow_audit' ? process.env.CALENDLY_GROWTH_URL : process.env.CALENDLY_DEALS_URL;
  if (!base) return null;
  const url = new URL(base);
  if (sessionId?.startsWith('cs_')) {
    try {
      const s = await stripe().checkout.sessions.retrieve(sessionId);
      const email = s.customer_details?.email;
      const name = s.customer_details?.name;
      const details = s.custom_fields?.find((f) => f.key === 'listing')?.text?.value;
      if (email) url.searchParams.set('email', email);
      if (name) url.searchParams.set('name', name);
      if (details) url.searchParams.set('a1', details);
    } catch {
      // Booking still works without prefill.
    }
  }
  return url.toString();
}

export default async function Welcome({ searchParams }: { searchParams: Promise<{ product?: string; session_id?: string }> }) {
  const { product, session_id } = await searchParams;
  const booking = await bookingLink(product, session_id);
  const later = booking ? 'Pick a time below for your call.' : "I'll email you within one business day to schedule the call.";

  const copy =
    product === 'pro_subscription'
      ? { title: "You're on Pro.", body: 'Your access turns on within a few seconds of payment. Head back and your account will show Pro.' }
      : product === 'deal_review'
        ? { title: 'Your deal review is booked.', body: `${later} Have the listing and any financials the seller has shared ready. If you go ahead with a done-for-you plan, the $299 comes off the price.` }
      : product === 'workflow_audit'
        ? { title: 'Your workflow audit is booked.', body: `${later} I'll also ask for view-only access to your ad account, email platform and workspace. If you go ahead with a done-for-you build, the $299 comes off the price.` }
      : product === 'premium_plan'
        ? { title: 'Payment received.', body: `I'll start on your acquisition plan and email you with next steps and a delivery date.${booking ? ' Book a kickoff call below.' : ''}` }
        : { title: 'Your playbook is ready.', body: 'Create an account (or sign in) with the same email you used at checkout, and a Download button appears at the top of the page.' };

  const growth = product === 'workflow_audit';
  const home = growth ? '/growth' : '/';
  const brand = growth ? 'Growth Check' : 'Deal Engine';

  return (
    <div className="wrap">
      <header className="top"><a className="brand" href={home}>{brand}</a></header>
      <section className="hero" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          <p style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {booking && (
              <a className="btn primary" href={booking} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-block' }}>Pick your time</a>
            )}
            <a className={booking ? 'btn ghost' : 'btn primary'} href={home} style={{ textDecoration: 'none', display: 'inline-block' }}>Back to {brand}</a>
          </p>
        </div>
      </section>
    </div>
  );
}
