import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../lib/stats';

const now = new Date('2026-10-11T12:00:00Z');

test('computes revenue, MRR, funnel, and daily series', () => {
  const s = computeStats(
    {
      purchases: [
        { product: 'playbook', amount_cents: 4700, created_at: '2026-10-10T10:00:00Z', email: 'a@x.com' },
        { product: 'playbook', amount_cents: 4700, created_at: '2026-10-11T09:00:00Z', email: 'B@x.com' },
        { product: 'premium_plan', amount_cents: 250000, created_at: '2026-10-05T09:00:00Z', email: 'b@x.com' },
        { product: 'playbook', amount_cents: 4700, created_at: '2026-01-01T09:00:00Z', email: 'old@x.com' },
      ],
      profiles: [
        { plan: 'pro', subscription_status: 'active', created_at: '2026-10-01T00:00:00Z' },
        { plan: 'pro', subscription_status: 'trialing', created_at: '2026-10-02T00:00:00Z' },
        { plan: 'free', subscription_status: 'canceled', created_at: '2026-10-03T00:00:00Z' },
        { plan: 'free', subscription_status: null, created_at: '2026-10-04T00:00:00Z' },
      ],
      leads: Array.from({ length: 40 }, (_, i) => ({
        source: i % 4 === 0 ? 'instagram' : 'tiktok',
        created_at: '2026-10-11T08:00:00Z',
      })),
      premium: [
        { status: 'new', price_cents: null, created_at: '2026-10-09T00:00:00Z' },
        { status: 'contract_sent', price_cents: 300000, created_at: '2026-10-08T00:00:00Z' },
        { status: 'paid', price_cents: 250000, created_at: '2026-10-05T00:00:00Z' },
      ],
    },
    { proPriceCents: 2900, now },
  );

  assert.equal(s.revenue.allTimeCents, 264100);
  assert.equal(s.revenue.windowCents, 259400);              // excludes the January sale
  assert.deepEqual(s.revenue.byProduct.playbook, { count: 3, cents: 14100 });
  assert.equal(s.subscriptions.activePro, 2);
  assert.equal(s.subscriptions.mrrCents, 5800);
  assert.equal(s.subscriptions.churnedOrPastDue, 1);
  assert.equal(s.funnel.buyers, 3);                         // emails are case-insensitive
  assert.equal(s.funnel.leadToSignupPct, 10);
  assert.equal(s.funnel.leadToBuyerPct, 7.5);
  assert.deepEqual(s.leadsBySource, { instagram: 10, tiktok: 30 });
  assert.deepEqual(s.premiumPipeline.contract_sent, { count: 1, quotedCents: 300000 });
  assert.equal(s.daily.length, 30);
  assert.equal(s.daily.at(-1)!.date, '2026-10-11');
  assert.equal(s.daily.at(-1)!.revenueCents, 4700);
  assert.equal(s.daily.at(-1)!.leads, 40);
});

test('empty business returns zeros, not errors', () => {
  const s = computeStats({ purchases: [], profiles: [], leads: [], premium: [] }, { proPriceCents: 2900, now });
  assert.equal(s.revenue.allTimeCents, 0);
  assert.equal(s.funnel.leadToBuyerPct, null);
  assert.equal(s.daily.length, 30);
});
