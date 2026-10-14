export interface GrowthInputs {
  adSpend: number;
  impressions: number;
  linkClicks: number;
  purchases: number;
  adRevenue: number;
  grossMarginPct: number;
  storeRevenue?: number;
  emailRevenue?: number;
  listSize?: number;
  openRatePct?: number;
  clickRatePct?: number;
  flows?: string[];
  hoursPerWeek?: number;
  hourlyValue?: number;
}

export type GrowthVerdict = 'scaling' | 'break_even' | 'losing';
export type Stage = 'creative' | 'landing' | 'economics' | 'retention';

export interface Fix { stage: Stage; title: string; detail: string; priority: number }

export interface GrowthResults {
  cpm: number | null;
  ctrPct: number | null;
  cpc: number | null;
  conversionRatePct: number | null;
  cpa: number | null;
  roas: number | null;
  aov: number | null;
  breakEvenRoas: number;
  maxCpa: number | null;
  adProfit: number;
  emailSharePct: number | null;
  revenuePerSubscriber: number | null;
  missingFlows: string[];
  monthlyHours: number | null;
  monthlyTimeCost: number | null;
  bottleneck: Stage | null;
  verdict: GrowthVerdict;
  verdictLabel: string;
  headline: string;
  fixes: Fix[];
  disclaimer: string;
}

export const CORE_FLOWS = ['Welcome series', 'Abandoned cart', 'Browse abandonment', 'Post-purchase', 'Win-back'] as const;

export const GROWTH_DISCLAIMER =
  'Benchmarks are typical e-commerce ranges and vary by niche, price point and season. ' +
  'This is a diagnostic based only on the numbers you entered, not a prediction or guarantee of results.';

export class GrowthInputError extends Error {}

const round = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: n !== 0 && Math.abs(n) < 100 ? 2 : 0 });

function num(v: unknown, field: string, { min = 0, max = 1e12 } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : Number(v);
  if (!Number.isFinite(n)) throw new GrowthInputError(`${field} must be a number`);
  if (n < min || n > max) throw new GrowthInputError(`${field} must be between ${min} and ${max}`);
  return n;
}
const optNum = (raw: Record<string, unknown>, k: string, o?: { min?: number; max?: number }) =>
  raw[k] === undefined || raw[k] === null || raw[k] === '' ? undefined : num(raw[k], k, o);

export function analyzeGrowth(raw: Record<string, unknown>): GrowthResults {
  const a: GrowthInputs = {
    adSpend: num(raw.adSpend, 'adSpend'),
    impressions: num(raw.impressions, 'impressions'),
    linkClicks: num(raw.linkClicks, 'linkClicks'),
    purchases: num(raw.purchases, 'purchases'),
    adRevenue: num(raw.adRevenue, 'adRevenue'),
    grossMarginPct: num(raw.grossMarginPct, 'grossMarginPct', { min: 1, max: 100 }),
    storeRevenue: optNum(raw, 'storeRevenue'),
    emailRevenue: optNum(raw, 'emailRevenue'),
    listSize: optNum(raw, 'listSize'),
    openRatePct: optNum(raw, 'openRatePct', { max: 100 }),
    clickRatePct: optNum(raw, 'clickRatePct', { max: 100 }),
    flows: Array.isArray(raw.flows) ? raw.flows.map(String) : [],
    hoursPerWeek: optNum(raw, 'hoursPerWeek', { max: 168 }),
    hourlyValue: optNum(raw, 'hourlyValue'),
  };
  if (a.linkClicks > a.impressions && a.impressions > 0) throw new GrowthInputError('linkClicks cannot be more than impressions');
  if (a.purchases > a.linkClicks && a.linkClicks > 0) throw new GrowthInputError('purchases cannot be more than linkClicks');

  const margin = a.grossMarginPct / 100;
  const cpm = a.impressions > 0 ? (a.adSpend / a.impressions) * 1000 : null;
  const ctrPct = a.impressions > 0 ? (a.linkClicks / a.impressions) * 100 : null;
  const cpc = a.linkClicks > 0 ? a.adSpend / a.linkClicks : null;
  const conversionRatePct = a.linkClicks > 0 ? (a.purchases / a.linkClicks) * 100 : null;
  const cpa = a.purchases > 0 ? a.adSpend / a.purchases : null;
  const roas = a.adSpend > 0 ? a.adRevenue / a.adSpend : null;
  const aov = a.purchases > 0 ? a.adRevenue / a.purchases : null;
  const breakEvenRoas = 1 / margin;
  const maxCpa = aov !== null ? aov * margin : null;
  const adProfit = a.adRevenue * margin - a.adSpend;

  const emailSharePct = a.storeRevenue && a.emailRevenue !== undefined && a.storeRevenue > 0 ? (a.emailRevenue / a.storeRevenue) * 100 : null;
  const revenuePerSubscriber = a.listSize && a.emailRevenue !== undefined && a.listSize > 0 ? a.emailRevenue / a.listSize : null;
  const missingFlows = CORE_FLOWS.filter((f) => !a.flows!.includes(f));
  const monthlyHours = a.hoursPerWeek !== undefined ? a.hoursPerWeek * 4.33 : null;
  const monthlyTimeCost = monthlyHours !== null && a.hourlyValue !== undefined ? monthlyHours * a.hourlyValue : null;

  const fixes: Fix[] = [];
  const severity: Record<Stage, number> = { creative: 0, landing: 0, economics: 0, retention: 0 };

  if (ctrPct !== null && ctrPct < 0.8) {
    severity.creative = 2;
    fixes.push({ stage: 'creative', priority: 2, title: 'Ads aren\'t stopping the scroll', detail: `Link click rate is ${round(ctrPct, 2)}%. Around 1% or more is typical for e-commerce. Test new hooks in the first 3 seconds and new angles before raising budget.` });
  } else if (ctrPct !== null && ctrPct < 1) {
    severity.creative = 1;
    fixes.push({ stage: 'creative', priority: 1, title: 'Creative is borderline', detail: `Link click rate is ${round(ctrPct, 2)}%. Refresh creative every 2 to 4 weeks to keep it above 1%.` });
  }
  if (cpm !== null && cpm > 30) {
    severity.creative = Math.max(severity.creative, 1);
    fixes.push({ stage: 'creative', priority: 1, title: 'Paying a lot to be seen', detail: `CPM is ${money(round(cpm, 2))}. Narrow audiences, ad fatigue or a weak relevance signal often push this up. Broaden targeting and refresh creative.` });
  }
  if (conversionRatePct !== null && a.linkClicks >= 50 && conversionRatePct < 1) {
    severity.landing = 3;
    fixes.push({ stage: 'landing', priority: 3, title: 'Clicks aren\'t turning into orders', detail: `Only ${round(conversionRatePct, 2)}% of ad clicks buy. 1.5% to 3% is common. Check that the page matches the ad, loads fast on mobile, and shows price, shipping and reviews up front.` });
  } else if (conversionRatePct !== null && a.linkClicks >= 50 && conversionRatePct < 1.5) {
    severity.landing = 1;
    fixes.push({ stage: 'landing', priority: 1, title: 'Landing page has room to improve', detail: `${round(conversionRatePct, 2)}% of clicks buy. Test a stronger offer, a bundle, or clearer social proof.` });
  }
  if (roas !== null && roas < breakEvenRoas) {
    severity.economics = 3;
    fixes.push({ stage: 'economics', priority: 3, title: 'Ads lose money on each sale', detail: `ROAS is ${round(roas, 2)} but you need ${round(breakEvenRoas, 2)} to break even at a ${a.grossMarginPct}% margin. Ads cost about ${money(round(-adProfit))} more than they earned in gross profit this month. Raise average order value or fix conversion before spending more.` });
  } else if (roas !== null && roas < breakEvenRoas * 1.2) {
    severity.economics = 1;
    fixes.push({ stage: 'economics', priority: 2, title: 'Ads barely break even', detail: `ROAS of ${round(roas, 2)} is just above break-even (${round(breakEvenRoas, 2)}). Bundles, upsells or free-shipping thresholds that lift order value give you room to scale.` });
  }
  if (cpa !== null && maxCpa !== null && cpa > maxCpa && severity.economics < 3) {
    severity.economics = Math.max(severity.economics, 2);
    fixes.push({ stage: 'economics', priority: 2, title: 'Each customer costs more than they earn you', detail: `It costs ${money(round(cpa, 2))} to get an order that makes ${money(round(maxCpa, 2))} in gross profit.` });
  }
  if (emailSharePct !== null && emailSharePct < 15) {
    severity.retention = 2;
    fixes.push({ stage: 'retention', priority: 2, title: 'Email is underused', detail: `Email brings in ${round(emailSharePct, 1)}% of store revenue. Brands with solid flows often see 20% to 30% or more. This is usually the cheapest revenue you can add.` });
  }
  if (missingFlows.length) {
    severity.retention = Math.max(severity.retention, missingFlows.length >= 3 ? 2 : 1);
    fixes.push({ stage: 'retention', priority: missingFlows.includes('Abandoned cart') || missingFlows.includes('Welcome series') ? 2 : 1, title: `Missing ${missingFlows.length} core email flow${missingFlows.length > 1 ? 's' : ''}`, detail: `Not set up: ${missingFlows.join(', ')}. These run on autopilot in Klaviyo or Mailchimp once built.` });
  }
  if (a.clickRatePct !== undefined && a.clickRatePct < 1) {
    severity.retention = Math.max(severity.retention, 1);
    fixes.push({ stage: 'retention', priority: 1, title: 'Emails get opened but not clicked', detail: `Click rate is ${a.clickRatePct}%. Around 1.5% or more is healthy. Use one clear offer and one button per email.` });
  }
  if (monthlyHours !== null && monthlyHours > 40) {
    fixes.push({ stage: 'retention', priority: 1, title: 'Marketing is eating your week', detail: `About ${round(monthlyHours)} hours a month go into ads, design and email${monthlyTimeCost !== null ? `, worth about ${money(round(monthlyTimeCost))} of your time` : ''}. Templates and a single planning workspace usually cut this sharply.` });
  }

  fixes.sort((x, y) => y.priority - x.priority);
  const order: Stage[] = ['landing', 'economics', 'creative', 'retention'];
  const top = Math.max(...order.map((s) => severity[s]));
  const bottleneck = top > 0 ? order.find((s) => severity[s] === top)! : null;

  const verdict: GrowthVerdict =
    roas === null || roas < breakEvenRoas ? 'losing' : roas < breakEvenRoas * 1.2 ? 'break_even' : 'scaling';
  const labels: Record<GrowthVerdict, string> = { scaling: 'Profitable: ready to scale', break_even: 'Break-even: fix before scaling', losing: 'Ads are losing money' };
  const stageWords: Record<Stage, string> = { creative: 'the ads themselves', landing: 'the landing page', economics: 'the unit economics', retention: 'email and retention' };
  const headline =
    verdict === 'losing'
      ? `Ads earned ${money(round(a.adRevenue))} on ${money(round(a.adSpend))} spend, about ${money(round(-adProfit))} short of covering product costs.${bottleneck ? ` The biggest leak is ${stageWords[bottleneck]}.` : ''}`
      : `Ads made about ${money(round(adProfit))} in gross profit after spend this month.${bottleneck ? ` The biggest leak is ${stageWords[bottleneck]}.` : ''}`;

  return {
    cpm: cpm === null ? null : round(cpm, 2),
    ctrPct: ctrPct === null ? null : round(ctrPct, 2),
    cpc: cpc === null ? null : round(cpc, 2),
    conversionRatePct: conversionRatePct === null ? null : round(conversionRatePct, 2),
    cpa: cpa === null ? null : round(cpa, 2),
    roas: roas === null ? null : round(roas, 2),
    aov: aov === null ? null : round(aov, 2),
    breakEvenRoas: round(breakEvenRoas, 2),
    maxCpa: maxCpa === null ? null : round(maxCpa, 2),
    adProfit: round(adProfit),
    emailSharePct: emailSharePct === null ? null : round(emailSharePct, 1),
    revenuePerSubscriber: revenuePerSubscriber === null ? null : round(revenuePerSubscriber, 2),
    missingFlows,
    monthlyHours: monthlyHours === null ? null : round(monthlyHours),
    monthlyTimeCost: monthlyTimeCost === null ? null : round(monthlyTimeCost),
    bottleneck,
    verdict,
    verdictLabel: labels[verdict],
    headline,
    fixes,
    disclaimer: GROWTH_DISCLAIMER,
  };
}
