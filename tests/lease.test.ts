import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLease, LeaseInputError } from '../lib/lease';

const ctx = { annualRevenue: 300_000, adjustedProfit: 92_000, annualDebtService: 58_292, loanTermYears: 10 };

test('healthy lease: low occupancy, covers loan, assignable', () => {
  const r = analyzeLease(
    { monthlyBaseRent: 1500, monthlyExtras: 300, annualEscalationPct: 2, yearsRemaining: 5, renewalYears: 10, assignable: 'yes' },
    ctx,
  );
  assert.equal(r.annualOccupancyCost, 21_600);
  assert.equal(r.occupancyRatioPct, 7.2);
  assert.equal(r.totalTermYears, 15);
  assert.equal(r.coversLoanTerm, true);
  assert.equal(r.years.length, 10);
  assert.equal(r.years[0].cashFlowAfterDebt, 92_000 - 58_292); // year 1 unchanged: rent already in SDE
  // year 10 rent = 21600 * 1.02^9
  assert.ok(Math.abs(r.finalYearRent - 21_600 * 1.02 ** 9) < 1);
  assert.equal(r.firstNegativeYear, null);
  assert.equal(r.verdict, 'solid');
  assert.equal(r.flags.length, 0);
});

test('short lease, heavy rent, landlord approval -> risky with flags', () => {
  const r = analyzeLease(
    { monthlyBaseRent: 4000, monthlyExtras: 1000, annualEscalationPct: 4, yearsRemaining: 3, renewalYears: 0, assignable: 'landlord_approval' },
    ctx,
  );
  assert.equal(r.occupancyRatioPct, 20);
  assert.equal(r.coversLoanTerm, false);
  assert.equal(r.coverageGapYears, 7);
  assert.equal(r.verdict, 'risky');
  assert.ok(r.flags.some((f) => f.includes('20% of revenue')));
  assert.ok(r.flags.some((f) => f.includes('loan runs 10')));
  assert.ok(r.flags.some((f) => f.includes('landlord must approve')));
});

test('escalations that eventually wipe out cash flow are caught', () => {
  const thin = { annualRevenue: 500_000, adjustedProfit: 70_000, annualDebtService: 65_000, loanTermYears: 10 };
  const r = analyzeLease(
    { monthlyBaseRent: 3000, annualEscalationPct: 5, yearsRemaining: 15, assignable: 'yes' },
    thin,
  );
  // year-1 cash flow 5,000; rent 36,000 growing 5%/yr: year 3 extra = 36000*(1.1025-1)=3,690 (still positive),
  // year 4 extra = 36000*(1.157625-1)=5,674.5 -> negative
  assert.equal(r.firstNegativeYear, 4);
  assert.ok(r.worstCashFlowAfterDebt < 0);
  assert.ok(r.flags.some((f) => f.includes('year 4')));
});

test('non-assignable lease is always risky', () => {
  const r = analyzeLease({ monthlyBaseRent: 1000, yearsRemaining: 20, assignable: 'no', annualEscalationPct: 0 }, ctx);
  assert.equal(r.verdict, 'risky');
});

test('defaults: 3% escalation, unknown transfer flagged', () => {
  const r = analyzeLease({ monthlyBaseRent: 1000, yearsRemaining: 12 }, ctx);
  assert.equal(r.assumptions.annualEscalationPct, 3);
  assert.equal(r.assumptions.assignable, 'unknown');
  assert.equal(r.verdict, 'watch');
});

test('bad input throws a friendly error', () => {
  assert.throws(() => analyzeLease({ monthlyBaseRent: 'abc', yearsRemaining: 5 }, ctx), LeaseInputError);
});
