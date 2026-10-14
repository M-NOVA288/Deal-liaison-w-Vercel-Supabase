/**
 * Deal Analyzer engine.
 * Pure functions, no database or network. Safe to run on the server or in the browser.
 *
 * All outputs are ESTIMATES based on the numbers the user enters.
 * They are not predictions, guarantees, or financial advice.
 */

export interface DealInputs {
  askingPrice: number;           // listing price ($)
  annualRevenue: number;         // gross sales per year ($)
  sellerProfit: number;          // seller's discretionary earnings (SDE) the seller claims ($/yr)
  ownerSalary?: number;          // what it costs to pay yourself or a manager to run it ($/yr)
  annualCapex?: number;          // yearly equipment/repairs to keep it running ($/yr)
  downPaymentPct?: number;       // % of price paid in cash (e.g. 10)
  interestRate?: number;         // annual loan rate % (e.g. 10.5)
  loanTermYears?: number;        // loan length in years (e.g. 10)
  closingCosts?: number;         // fees, legal, loan costs ($)
  workingCapital?: number;       // cash kept in the business on day one ($)
}

export type Verdict = 'strong' | 'workable' | 'tight' | 'no_cash_flow';

export interface DealResults {
  assumptions: Required<DealInputs>;
  loanAmount: number;
  downPayment: number;
  monthlyPayment: number;
  annualDebtService: number;
  adjustedProfit: number;        // SDE - owner salary - capex
  cashFlowAfterDebt: number;     // what's left per year after the loan payment
  monthlyCashFlowAfterDebt: number;
  dscr: number | null;           // debt service coverage ratio (lenders often want 1.25+)
  cashInvested: number;          // down + closing + working capital
  cashOnCashReturn: number | null; // % per year on cash invested
  paybackYears: number | null;   // years to earn back cash invested
  priceToProfitMultiple: number | null;
  profitMargin: number | null;   // SDE / revenue (%)
  maxPriceAtTargetDscr: number;  // highest price that still hits the DSCR target
  suggestedOffer: { low: number; high: number };
  verdict: Verdict;
  verdictLabel: string;
  headline: string;
  flags: string[];
  disclaimer: string;
}

export const DEFAULTS = {
  ownerSalary: 0,
  annualCapex: 0,
  downPaymentPct: 10,
  interestRate: 10.5,
  loanTermYears: 10,
  closingCosts: 0,
  workingCapital: 0,
} as const;

export const TARGET_DSCR = 1.25;

export const DISCLAIMER =
  'Estimates only, based entirely on the numbers you entered. Not a prediction, guarantee, ' +
  'or financial, legal, or lending advice. Verify all figures with tax returns, bank statements, ' +
  'and a qualified professional before making any offer.';

const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Standard amortized monthly payment. */
export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0) return 0;
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

/** Loan principal that a given monthly payment can support (inverse of monthlyPayment). */
export function principalForPayment(payment: number, annualRatePct: number, years: number): number {
  if (payment <= 0) return 0;
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return payment * n;
  return (payment * (1 - (1 + r) ** -n)) / r;
}

export class InputError extends Error {}

function num(v: unknown, field: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : Number(v);
  if (!Number.isFinite(n)) throw new InputError(`${field} must be a number`);
  if (n < min || n > max) throw new InputError(`${field} must be between ${min} and ${max}`);
  return n;
}

/** Validates and fills defaults. Throws InputError with a friendly message on bad input. */
export function normalizeInputs(raw: Record<string, unknown>): Required<DealInputs> {
  const opt = (k: keyof typeof DEFAULTS, opts?: { min?: number; max?: number }): number =>
    raw[k] === undefined || raw[k] === null || raw[k] === '' ? DEFAULTS[k] : num(raw[k], k, opts);

  const inputs: Required<DealInputs> = {
    askingPrice: num(raw.askingPrice, 'askingPrice', { min: 1 }),
    annualRevenue: num(raw.annualRevenue, 'annualRevenue'),
    sellerProfit: num(raw.sellerProfit, 'sellerProfit', { min: -1e12 }),
    ownerSalary: opt('ownerSalary'),
    annualCapex: opt('annualCapex'),
    downPaymentPct: opt('downPaymentPct', { min: 0, max: 100 }),
    interestRate: opt('interestRate', { min: 0, max: 40 }),
    loanTermYears: opt('loanTermYears', { min: 1, max: 30 }),
    closingCosts: opt('closingCosts'),
    workingCapital: opt('workingCapital'),
  };
  return inputs;
}

export function analyzeDeal(raw: Record<string, unknown>): DealResults {
  const a = normalizeInputs(raw);

  const downPayment = a.askingPrice * (a.downPaymentPct / 100);
  const loanAmount = a.askingPrice - downPayment;
  const pmt = monthlyPayment(loanAmount, a.interestRate, a.loanTermYears);
  const annualDebtService = pmt * 12;

  const adjustedProfit = a.sellerProfit - a.ownerSalary - a.annualCapex;
  const cashFlowAfterDebt = adjustedProfit - annualDebtService;
  const dscr = annualDebtService > 0 ? adjustedProfit / annualDebtService : null;

  const cashInvested = downPayment + a.closingCosts + a.workingCapital;
  const cashOnCashReturn = cashInvested > 0 ? (cashFlowAfterDebt / cashInvested) * 100 : null;
  const paybackYears = cashFlowAfterDebt > 0 && cashInvested > 0 ? cashInvested / cashFlowAfterDebt : null;
  const priceToProfitMultiple = a.sellerProfit > 0 ? a.askingPrice / a.sellerProfit : null;
  const profitMargin = a.annualRevenue > 0 ? (a.sellerProfit / a.annualRevenue) * 100 : null;

  // Highest price where adjusted profit still covers the loan at the target DSCR.
  const maxDebtService = Math.max(0, adjustedProfit / TARGET_DSCR);
  const maxLoan = principalForPayment(maxDebtService / 12, a.interestRate, a.loanTermYears);
  const financedShare = 1 - a.downPaymentPct / 100;
  const maxPriceAtTargetDscr = financedShare > 0 ? maxLoan / financedShare : a.askingPrice;

  const ceiling = Math.min(a.askingPrice, maxPriceAtTargetDscr);
  const suggestedOffer = { low: round(ceiling * 0.85, -3), high: round(ceiling, -3) };

  // Verdict
  let verdict: Verdict;
  if (cashFlowAfterDebt <= 0 || (dscr !== null && dscr < 1)) verdict = 'no_cash_flow';
  else if (dscr === null || dscr >= 1.5) verdict = 'strong';
  else if (dscr >= TARGET_DSCR) verdict = 'workable';
  else verdict = 'tight';

  const labels: Record<Verdict, string> = {
    strong: 'Strong deal',
    workable: 'Workable deal',
    tight: 'Tight: negotiate',
    no_cash_flow: "Doesn't cash flow",
  };

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const headline =
    verdict === 'no_cash_flow'
      ? `At ${fmt(a.askingPrice)}, this loses about ${fmt(Math.abs(cashFlowAfterDebt))}/yr after paying the loan and yourself.`
      : `About ${fmt(cashFlowAfterDebt)}/yr (${fmt(cashFlowAfterDebt / 12)}/mo) left after the loan payment and your salary.`;

  // Red flags
  const flags: string[] = [];
  if (a.ownerSalary === 0)
    flags.push('No owner salary entered. Someone has to run this business; add what you would pay yourself or a manager.');
  if (profitMargin !== null && profitMargin > 40)
    flags.push(`Profit margin is ${round(profitMargin)}%, unusually high for most small businesses. Verify with tax returns and bank statements.`);
  if (priceToProfitMultiple !== null && priceToProfitMultiple > 4)
    flags.push(`Priced at ${round(priceToProfitMultiple, 1)}x profit, which is on the expensive side for a small business.`);
  if (a.sellerProfit <= 0) flags.push('Seller profit is zero or negative. There is nothing to pay a loan with.');
  if (a.askingPrice > maxPriceAtTargetDscr)
    flags.push(`To hit a ${TARGET_DSCR} debt coverage ratio, price would need to be about ${fmt(maxPriceAtTargetDscr)} or lower, or financing terms would need to change.`);
  if (a.workingCapital === 0)
    flags.push('No working capital budgeted. Most buyers need a cash cushion for the first few months.');

  return {
    assumptions: a,
    loanAmount: round(loanAmount),
    downPayment: round(downPayment),
    monthlyPayment: round(pmt),
    annualDebtService: round(annualDebtService),
    adjustedProfit: round(adjustedProfit),
    cashFlowAfterDebt: round(cashFlowAfterDebt),
    monthlyCashFlowAfterDebt: round(cashFlowAfterDebt / 12),
    dscr: dscr === null ? null : round(dscr, 2),
    cashInvested: round(cashInvested),
    cashOnCashReturn: cashOnCashReturn === null ? null : round(cashOnCashReturn, 1),
    paybackYears: paybackYears === null ? null : round(paybackYears, 1),
    priceToProfitMultiple: priceToProfitMultiple === null ? null : round(priceToProfitMultiple, 2),
    profitMargin: profitMargin === null ? null : round(profitMargin, 1),
    maxPriceAtTargetDscr: round(maxPriceAtTargetDscr, -3),
    suggestedOffer,
    verdict,
    verdictLabel: labels[verdict],
    headline,
    flags,
    disclaimer: DISCLAIMER,
  };
}
