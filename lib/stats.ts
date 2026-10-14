/**
 * Sales stats calculator. Pure function so it can be tested without a database.
 * Feeds GET /api/admin/stats (your "how is it selling" numbers).
 */
export interface PurchaseRow { product: string; amount_cents: number; created_at: string; email: string }
export interface ProfileRow { plan: string; subscription_status: string | null; created_at: string }
export interface LeadRow { source: string | null; created_at: string }
export interface PremiumRow { status: string; price_cents: number | null; created_at: string }

export interface SalesStats {
  windowDays: number;
  revenue: { allTimeCents: number; windowCents: number; byProduct: Record<string, { count: number; cents: number }> };
  subscriptions: { activePro: number; mrrCents: number; churnedOrPastDue: number };
  funnel: {
    leads: number;
    signups: number;
    buyers: number;              // unique emails with at least one purchase
    leadToSignupPct: number | null;
    signupToBuyerPct: number | null;
    leadToBuyerPct: number | null;
  };
  leadsBySource: Record<string, number>;
  premiumPipeline: Record<string, { count: number; quotedCents: number }>;
  daily: { date: string; revenueCents: number; leads: number }[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const day = (iso: string) => iso.slice(0, 10);

export function computeStats(
  rows: { purchases: PurchaseRow[]; profiles: ProfileRow[]; leads: LeadRow[]; premium: PremiumRow[] },
  opts: { windowDays?: number; proPriceCents: number; now?: Date },
): SalesStats {
  const windowDays = opts.windowDays ?? 30;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const inWindow = (iso: string) => new Date(iso) >= since;

  const byProduct: SalesStats['revenue']['byProduct'] = {};
  let allTimeCents = 0;
  let windowCents = 0;
  for (const p of rows.purchases) {
    allTimeCents += p.amount_cents;
    if (inWindow(p.created_at)) windowCents += p.amount_cents;
    const b = (byProduct[p.product] ??= { count: 0, cents: 0 });
    b.count += 1;
    b.cents += p.amount_cents;
  }

  const activePro = rows.profiles.filter((p) => p.plan === 'pro').length;
  const churnedOrPastDue = rows.profiles.filter(
    (p) => p.subscription_status && ['canceled', 'past_due', 'unpaid'].includes(p.subscription_status),
  ).length;

  const buyers = new Set(rows.purchases.map((p) => p.email.toLowerCase())).size;
  const leads = rows.leads.length;
  const signups = rows.profiles.length;

  const leadsBySource: Record<string, number> = {};
  for (const l of rows.leads) leadsBySource[l.source || 'unknown'] = (leadsBySource[l.source || 'unknown'] ?? 0) + 1;

  const premiumPipeline: SalesStats['premiumPipeline'] = {};
  for (const r of rows.premium) {
    const b = (premiumPipeline[r.status] ??= { count: 0, quotedCents: 0 });
    b.count += 1;
    b.quotedCents += r.price_cents ?? 0;
  }

  // Daily series for the window (oldest first), including empty days.
  const daily: SalesStats['daily'] = [];
  const index = new Map<string, SalesStats['daily'][number]>();
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = day(new Date(now.getTime() - i * 86_400_000).toISOString());
    const entry = { date: d, revenueCents: 0, leads: 0 };
    daily.push(entry);
    index.set(d, entry);
  }
  for (const p of rows.purchases) { const e = index.get(day(p.created_at)); if (e) e.revenueCents += p.amount_cents; }
  for (const l of rows.leads) { const e = index.get(day(l.created_at)); if (e) e.leads += 1; }

  return {
    windowDays,
    revenue: { allTimeCents, windowCents, byProduct },
    subscriptions: { activePro, mrrCents: activePro * opts.proPriceCents, churnedOrPastDue },
    funnel: {
      leads, signups, buyers,
      leadToSignupPct: pct(signups, leads),
      signupToBuyerPct: pct(buyers, signups),
      leadToBuyerPct: pct(buyers, leads),
    },
    leadsBySource,
    premiumPipeline,
    daily,
  };
}
