/**
 * Lease analysis. Pure functions; safe on server or in the browser.
 *
 * Key idea: the seller's profit (SDE) already has TODAY's rent taken out. So the lease only
 * changes the deal through FUTURE rent increases, plus risks the profit number can't show
 * (lease ending before the loan, landlord blocking the transfer).
 */

export type Assignable = 'yes' | 'landlord_approval' | 'no' | 'unknown';

export interface LeaseInputs {
  monthlyBaseRent: number;     // $ / month
  monthlyExtras?: number;      // NNN / CAM / taxes / insurance passed through, $ / month
  annualEscalationPct?: number; // yearly rent increase, %
  yearsRemaining: number;      // years left on the current term
  renewalYears?: number;       // total years of renewal options available to the tenant
  assignable?: Assignable;     // can the lease transfer to a new owner?
}

export interface LeaseContext {
  annualRevenue: number;
  adjustedProfit: number;      // from the analyzer: SDE - owner salary - capex (today's rent already deducted)
  annualDebtService: number;   // from the analyzer
  loanTermYears: number;       // from the analyzer
}

export interface LeaseYear {
  year: number;
  annualRent: number;          // base + extras, escalated
  cashFlowAfterDebt: number;   // after extra rent from escalations
  dscr: number | null;
}

export type LeaseVerdict = 'solid' | 'watch' | 'risky';

export interface LeaseResults {
  assumptions: Required<LeaseInputs>;
  annualOccupancyCost: number;     // year 1, base + extras
  occupancyRatioPct: number | null; // year-1 occupancy cost / revenue
  totalTermYears: number;          // remaining + renewals
  coversLoanTerm: boolean;
  coverageGapYears: number;        // years the loan outlasts the lease (0 if covered)
  years: LeaseYear[];              // one row per loan year
  finalYearRent: number;
  rentIncreaseOverLoan: number;    // final-year rent minus year-1 rent
  firstNegativeYear: number | null; // first year cash flow after debt goes below zero
  worstCashFlowAfterDebt: number;
  verdict: LeaseVerdict;
  verdictLabel: string;
  flags: string[];
}

export class LeaseInputError extends Error {}

const round = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');

function num(v: unknown, field: string, { min = 0, max = 1e12 } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : Number(v);
  if (!Number.isFinite(n)) throw new LeaseInputError(`${field} must be a number`);
  if (n < min || n > max) throw new LeaseInputError(`${field} must be between ${min} and ${max}`);
  return n;
}

export function normalizeLease(raw: Record<string, unknown>): Required<LeaseInputs> {
  const opt = (k: string, d: number, o?: { min?: number; max?: number }) =>
    raw[k] === undefined || raw[k] === null || raw[k] === '' ? d : num(raw[k], k, o);
  const a = raw.assignable;
  return {
    monthlyBaseRent: num(raw.monthlyBaseRent, 'monthlyBaseRent'),
    monthlyExtras: opt('monthlyExtras', 0),
    annualEscalationPct: opt('annualEscalationPct', 3, { min: 0, max: 25 }),
    yearsRemaining: num(raw.yearsRemaining, 'yearsRemaining', { min: 0, max: 99 }),
    renewalYears: opt('renewalYears', 0, { max: 99 }),
    assignable: a === 'yes' || a === 'landlord_approval' || a === 'no' ? a : 'unknown',
  };
}

export function analyzeLease(raw: Record<string, unknown>, ctx: LeaseContext): LeaseResults {
  const a = normalizeLease(raw);
  const loanYears = Math.max(1, Math.round(ctx.loanTermYears));

  const rent1 = (a.monthlyBaseRent + a.monthlyExtras) * 12;
  const occupancyRatioPct = ctx.annualRevenue > 0 ? (rent1 / ctx.annualRevenue) * 100 : null;

  const totalTermYears = a.yearsRemaining + a.renewalYears;
  const coversLoanTerm = totalTermYears >= loanYears;
  const coverageGapYears = coversLoanTerm ? 0 : round(loanYears - totalTermYears, 1);

  const cf1 = ctx.adjustedProfit - ctx.annualDebtService;
  const years: LeaseYear[] = [];
  for (let y = 1; y <= loanYears; y++) {
    const rent = rent1 * (1 + a.annualEscalationPct / 100) ** (y - 1);
    const extra = rent - rent1; // today's rent is already inside the seller's profit
    const cf = cf1 - extra;
    const profitAfterRent = ctx.adjustedProfit - extra;
    years.push({
      year: y,
      annualRent: round(rent),
      cashFlowAfterDebt: round(cf),
      dscr: ctx.annualDebtService > 0 ? round(profitAfterRent / ctx.annualDebtService, 2) : null,
    });
  }

  const finalYearRent = years[years.length - 1].annualRent;
  const firstNeg = years.find((y) => y.cashFlowAfterDebt < 0);
  const worst = Math.min(...years.map((y) => y.cashFlowAfterDebt));

  // Flags and scoring
  const flags: string[] = [];
  let risk = 0;

  if (occupancyRatioPct !== null) {
    if (occupancyRatioPct > 15) {
      risk += 2;
      flags.push(`Rent is ${round(occupancyRatioPct, 1)}% of revenue. That's heavy for most small businesses; compare against typical ranges for this industry.`);
    } else if (occupancyRatioPct > 10) {
      risk += 1;
      flags.push(`Rent is ${round(occupancyRatioPct, 1)}% of revenue. Workable for some industries, tight for others. Check the norm for this type of business.`);
    }
  }
  if (!coversLoanTerm) {
    risk += 2;
    flags.push(`The lease (including renewals) runs ${totalTermYears} years but the loan runs ${loanYears}. Lenders generally want the lease to cover the loan term. Ask for a new lease or extension before closing.`);
  }
  if (a.assignable === 'no') {
    risk += 3;
    flags.push('The lease cannot be transferred to a new owner. Without a new lease from the landlord, the deal likely cannot close.');
  } else if (a.assignable === 'landlord_approval') {
    risk += 1;
    flags.push('The landlord must approve the transfer. Get written consent, and check for personal guarantees or rent resets tied to it.');
  } else if (a.assignable === 'unknown') {
    risk += 1;
    flags.push("Transfer terms unknown. Read the lease's assignment clause before making an offer.");
  }
  if (a.annualEscalationPct > 5) {
    risk += 1;
    flags.push(`Rent rises ${a.annualEscalationPct}% a year, above the typical range. Try to negotiate it down with the landlord.`);
  }
  if (firstNeg) {
    risk += 2;
    flags.push(`Rent increases push cash flow after debt below zero in year ${firstNeg.year}, unless revenue grows to keep up.`);
  } else if (rent1 > 0 && finalYearRent - rent1 > 0.25 * Math.max(cf1, 1)) {
    risk += 1;
    flags.push(`By year ${loanYears}, rent is ${fmt(finalYearRent - rent1)}/yr higher than today, eating a large share of your cash flow.`);
  }

  const verdict: LeaseVerdict = risk >= 3 ? 'risky' : risk >= 1 ? 'watch' : 'solid';
  const labels: Record<LeaseVerdict, string> = { solid: 'Lease looks solid', watch: 'Lease: review terms', risky: 'Lease is a risk' };

  return {
    assumptions: a,
    annualOccupancyCost: round(rent1),
    occupancyRatioPct: occupancyRatioPct === null ? null : round(occupancyRatioPct, 1),
    totalTermYears,
    coversLoanTerm,
    coverageGapYears,
    years,
    finalYearRent,
    rentIncreaseOverLoan: round(finalYearRent - rent1),
    firstNegativeYear: firstNeg ? firstNeg.year : null,
    worstCashFlowAfterDebt: round(worst),
    verdict,
    verdictLabel: labels[verdict],
    flags,
  };
}
