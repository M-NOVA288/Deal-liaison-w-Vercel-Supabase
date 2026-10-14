import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDeal, monthlyPayment, principalForPayment, InputError } from '../lib/analyzer';

test('monthly payment matches standard amortization', () => {
  // $360,000 at 10.5% over 10 years -> ~$4,857.71/mo
  assert.ok(Math.abs(monthlyPayment(360_000, 10.5, 10) - 4857.71) < 0.5);
  assert.equal(monthlyPayment(0, 10, 10), 0);
  assert.equal(monthlyPayment(120_000, 0, 10), 1000);
});

test('principalForPayment is the inverse of monthlyPayment', () => {
  const p = monthlyPayment(250_000, 9, 10);
  assert.ok(Math.abs(principalForPayment(p, 9, 10) - 250_000) < 0.01);
});

test('healthy laundromat-style deal', () => {
  const r = analyzeDeal({
    askingPrice: 400_000, annualRevenue: 300_000, sellerProfit: 150_000,
    ownerSalary: 50_000, workingCapital: 20_000, closingCosts: 10_000,
  });
  assert.equal(r.loanAmount, 360_000);
  assert.equal(r.downPayment, 40_000);
  assert.equal(r.annualDebtService, 58_292);       // ~4857.68 * 12
  assert.equal(r.adjustedProfit, 100_000);
  assert.equal(r.cashFlowAfterDebt, 41_708);
  assert.equal(r.dscr, 1.72);
  assert.equal(r.verdict, 'strong');
  assert.equal(r.cashInvested, 70_000);
  assert.ok(r.paybackYears! > 1.6 && r.paybackYears! < 1.8);
  assert.ok(r.maxPriceAtTargetDscr > 400_000);     // asking price is under the ceiling
  assert.equal(r.suggestedOffer.high, 400_000);
  assert.ok(r.flags.some((f) => f.includes('50%')));  // 50% margin flagged for verification
});

test('overpriced deal does not cash flow and gets a lower offer ceiling', () => {
  const r = analyzeDeal({
    askingPrice: 900_000, annualRevenue: 600_000, sellerProfit: 160_000, ownerSalary: 60_000,
  });
  assert.equal(r.verdict, 'no_cash_flow');
  assert.ok(r.cashFlowAfterDebt < 0);
  assert.ok(r.suggestedOffer.high < 900_000);
  assert.ok(r.flags.some((f) => f.includes('debt coverage')));
  // Check the ceiling actually yields ~1.25 DSCR
  const check = analyzeDeal({
    askingPrice: r.maxPriceAtTargetDscr, annualRevenue: 600_000, sellerProfit: 160_000, ownerSalary: 60_000,
  });
  assert.ok(Math.abs(check.dscr! - 1.25) < 0.01);
});

test('flags missing owner salary', () => {
  const r = analyzeDeal({ askingPrice: 200_000, annualRevenue: 400_000, sellerProfit: 90_000 });
  assert.ok(r.flags.some((f) => f.includes('No owner salary')));
});

test('accepts formatted strings like "$400,000"', () => {
  const r = analyzeDeal({ askingPrice: '$400,000', annualRevenue: '300,000', sellerProfit: '150000' });
  assert.equal(r.assumptions.askingPrice, 400_000);
});

test('rejects bad input with a friendly error', () => {
  assert.throws(() => analyzeDeal({ askingPrice: 'abc', annualRevenue: 1, sellerProfit: 1 }), InputError);
  assert.throws(() => analyzeDeal({ askingPrice: 100, annualRevenue: 1, sellerProfit: 1, downPaymentPct: 150 }), InputError);
});

test('all-cash purchase (100% down) has no debt and is strong if profitable', () => {
  const r = analyzeDeal({ askingPrice: 100_000, annualRevenue: 200_000, sellerProfit: 60_000, ownerSalary: 30_000, downPaymentPct: 100 });
  assert.equal(r.loanAmount, 0);
  assert.equal(r.dscr, null);
  assert.equal(r.verdict, 'strong');
  assert.equal(r.paybackYears, 3.3);
});
