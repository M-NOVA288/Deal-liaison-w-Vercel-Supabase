import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGrowth, GrowthInputError, CORE_FLOWS } from '../lib/growth.ts';

const base = { adSpend: 5000, impressions: 400000, linkClicks: 5000, purchases: 100, adRevenue: 8000, grossMarginPct: 60 };

test('core ad math', () => {
  const r = analyzeGrowth(base);
  assert.equal(r.cpm, 12.5);
  assert.equal(r.ctrPct, 1.25);
  assert.equal(r.cpc, 1);
  assert.equal(r.conversionRatePct, 2);
  assert.equal(r.cpa, 50);
  assert.equal(r.roas, 1.6);
  assert.equal(r.aov, 80);
  assert.equal(r.breakEvenRoas, 1.67);
  assert.equal(r.maxCpa, 48);
  assert.equal(r.adProfit, -200);
});

test('below break-even ROAS is losing and economics is the bottleneck', () => {
  const r = analyzeGrowth(base);
  assert.equal(r.verdict, 'losing');
  assert.equal(r.bottleneck, 'economics');
  assert.equal(r.fixes[0].stage, 'economics');
});

test('profitable ads with all flows is scaling', () => {
  const r = analyzeGrowth({ ...base, adRevenue: 15000, flows: [...CORE_FLOWS], storeRevenue: 50000, emailRevenue: 12000 });
  assert.equal(r.verdict, 'scaling');
  assert.equal(r.adProfit, 4000);
  assert.equal(r.missingFlows.length, 0);
  assert.equal(r.emailSharePct, 24);
});

test('low conversion rate flags the landing page', () => {
  const r = analyzeGrowth({ ...base, purchases: 30, adRevenue: 15000 });
  assert.ok(r.fixes.some((f) => f.stage === 'landing' && f.priority === 3));
});

test('low email share and missing flows flag retention', () => {
  const r = analyzeGrowth({ ...base, adRevenue: 15000, storeRevenue: 50000, emailRevenue: 3000, flows: ['Welcome series'] });
  assert.equal(r.emailSharePct, 6);
  assert.deepEqual(r.missingFlows, ['Abandoned cart', 'Browse abandonment', 'Post-purchase', 'Win-back']);
});

test('rejects impossible numbers', () => {
  assert.throws(() => analyzeGrowth({ ...base, linkClicks: 500000 }), GrowthInputError);
  assert.throws(() => analyzeGrowth({ ...base, grossMarginPct: 0 }), GrowthInputError);
});
