'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { analyzeDeal, DEFAULTS, InputError, type DealResults } from '@/lib/analyzer';
import { PROFILE } from '@/lib/profile';
import { analyzeLease, LeaseInputError, type LeaseResults } from '@/lib/lease';

/* ---------- helpers ---------- */

type Me = {
  email: string;
  plan: 'free' | 'pro';
  has_playbook: boolean;
  is_admin: boolean;
} | null;

async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { status: res.status });
  return data as T;
}

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');

const FIELDS = [
  'askingPrice', 'annualRevenue', 'sellerProfit', 'ownerSalary', 'annualCapex',
  'downPaymentPct', 'interestRate', 'loanTermYears', 'closingCosts', 'workingCapital',
] as const;
type Field = (typeof FIELDS)[number];
type Inputs = Record<Field, string>;

const PRESETS: Record<string, Record<Field, number>> = {
  Laundromat: { askingPrice: 400000, annualRevenue: 300000, sellerProfit: 150000, ownerSalary: 50000, annualCapex: 8000, downPaymentPct: 10, interestRate: 10.5, loanTermYears: 10, closingCosts: 12000, workingCapital: 20000 },
  'Car wash': { askingPrice: 900000, annualRevenue: 600000, sellerProfit: 160000, ownerSalary: 60000, annualCapex: 15000, downPaymentPct: 10, interestRate: 10.5, loanTermYears: 10, closingCosts: 20000, workingCapital: 30000 },
  'HVAC company': { askingPrice: 650000, annualRevenue: 1400000, sellerProfit: 230000, ownerSalary: 90000, annualCapex: 10000, downPaymentPct: 10, interestRate: 10.5, loanTermYears: 10, closingCosts: 15000, workingCapital: 40000 },
};

const toInputs = (p: Record<Field, number>): Inputs =>
  Object.fromEntries(FIELDS.map((k) => [k, String(p[k])])) as Inputs;

type Lease = { monthlyBaseRent: string; monthlyExtras: string; annualEscalationPct: string; yearsRemaining: string; renewalYears: string; assignable: string };
const LEASE_PRESETS: Record<string, Lease> = {
  Laundromat: { monthlyBaseRent: '1500', monthlyExtras: '300', annualEscalationPct: '3', yearsRemaining: '5', renewalYears: '10', assignable: 'landlord_approval' },
  'Car wash': { monthlyBaseRent: '6500', monthlyExtras: '1500', annualEscalationPct: '4', yearsRemaining: '4', renewalYears: '0', assignable: 'landlord_approval' },
  'HVAC company': { monthlyBaseRent: '2800', monthlyExtras: '0', annualEscalationPct: '3', yearsRemaining: '3', renewalYears: '10', assignable: 'yes' },
};

/* ---------- page ---------- */

export default function SalesPage() {
  const [me, setMe] = useState<Me>(null);
  const [authOpen, setAuthOpen] = useState<null | { reason?: string }>(null);
  const [notice, setNotice] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try { setMe(await api('/api/me')); } catch { setMe(null); }
  }, []);

  useEffect(() => {
    loadMe();
    const q = new URLSearchParams(window.location.search);
    if (q.get('checkout') === 'canceled') setNotice({ kind: 'info', text: 'Checkout canceled. You were not charged.' });
    if (q.get('auth') === 'failed') setNotice({ kind: 'bad', text: 'That sign-in link expired or was already used. Sign in again to get a new one.' });
  }, [loadMe]);

  async function checkout(product: 'playbook' | 'pro_subscription' | 'deal_review') {
    if (product === 'pro_subscription' && !me) {
      setAuthOpen({ reason: 'Create an account or sign in first, so Pro is unlocked on the right account.' });
      return;
    }
    setBusy(product);
    setNotice(null);
    try {
      const { url } = await api<{ url: string }>('/api/checkout', { body: { product } });
      window.location.href = url;
    } catch (e: any) {
      setNotice({ kind: 'bad', text: e.message });
      setBusy(null);
    }
  }

  async function billing() {
    setBusy('billing');
    try {
      const { url } = await api<{ url: string }>('/api/billing/portal', { method: 'POST' });
      window.location.href = url;
    } catch (e: any) { setNotice({ kind: 'bad', text: e.message }); setBusy(null); }
  }

  async function playbook() {
    setBusy('playbook-dl');
    try {
      const { url } = await api<{ url: string }>('/api/playbook');
      window.location.href = url;
    } catch (e: any) { setNotice({ kind: 'bad', text: e.message }); }
    setBusy(null);
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setMe(null);
  }

  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="/">Deal Engine</a>
        <nav className="nav" aria-label="Main">
          <a href="#analyzer">Analyzer</a>
          <a href="#offers">Offers</a>
          <a href="#work-with-me">Work with me</a>
          {me ? (
            <button className="link" onClick={signOut}>Sign out</button>
          ) : (
            <button className="link" onClick={() => setAuthOpen({})}>Sign in</button>
          )}
        </nav>
      </header>

      {me && (
        <div className="account">
          <span>
            {me.email}
            <span className={`pill ${me.plan === 'pro' ? 'pro' : ''}`}>{me.plan === 'pro' ? 'Pro' : 'Free'}</span>
          </span>
          <div className="actions">
            {me.has_playbook && (
              <button className="btn ghost" onClick={playbook} disabled={busy === 'playbook-dl'}>Download playbook</button>
            )}
            {me.plan === 'pro' && (
              <button className="btn ghost" onClick={billing} disabled={busy === 'billing'}>Manage billing</button>
            )}
          </div>
        </div>
      )}

      {notice && <div className={`notice ${notice.kind === 'info' ? '' : notice.kind}`} role="status">{notice.text}</div>}

      <Hero />
      <Analyzer />
      <Offers me={me} busy={busy} onBuy={checkout} />
      <BehindTheNumbers />
      <PremiumIntake />

      <footer>
        <span>All analyzer results are estimates based only on the numbers you enter. Nothing on this site is a prediction, guarantee, or financial, legal, or lending advice.</span>
        <span>Results from any business purchase vary and depend on capital, effort, financing, and market conditions.</span>
      </footer>

      {authOpen && (
        <AuthModal
          reason={authOpen.reason}
          onClose={() => setAuthOpen(null)}
          onSignedIn={async () => { setAuthOpen(null); await loadMe(); setNotice({ kind: 'good', text: 'You are signed in.' }); }}
        />
      )}
    </div>
  );
}

/* ---------- hero + email capture ---------- */

function Hero() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(true);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('busy');
    const source = new URLSearchParams(window.location.search).get('src') || 'direct';
    try {
      await api('/api/leads', { body: { email, consent, source: ['tiktok', 'instagram', 'facebook', 'youtube'].includes(source) ? source : 'direct' } });
      setState('done');
    } catch (err: any) { setState(err.message); }
  }

  return (
    <section className="hero">
      <div>
        <h1>Run the numbers before you buy a business</h1>
        <p>Plug in any listing and see what's left after the loan payment and your salary, how much a lender would likely finance, and the red flags sellers don't mention.</p>
        <p className="trust">
          Lender-grade financial modeling and valuation
          {PROFILE.credential && <> · {PROFILE.credential.short}</>}
          {' '}· Done-for-you plans reviewed by a person, not a bot
        </p>
      </div>
      <form className="capture" onSubmit={submit}>
        <h2>Get my deal breakdowns by email</h2>
        {state === 'done' ? (
          <p className="notice good" style={{ margin: 0 }}>You're on the list. Check your inbox.</p>
        ) : (
          <>
            <div className="row">
              <input id="lead-email" type="email" required placeholder="you@email.com" aria-label="Email address"
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn primary" disabled={state === 'busy'}>Join</button>
            </div>
            <label className="check">
              <input id="lead-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Send me deal breakdowns and offers. Unsubscribe anytime.
            </label>
            {state !== 'idle' && state !== 'busy' && <p className="notice bad" style={{ margin: 0 }}>{state}</p>}
          </>
        )}
      </form>
    </section>
  );
}

/* ---------- analyzer ---------- */

function NumField({ id, label, hint, pre, suf, value, onChange }: {
  id: Field; label: string; hint?: string; pre?: string; suf?: string; value: string; onChange: (k: Field, v: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label} {hint && <span className="hint">{hint}</span>}</label>
      <div className={`inp ${pre ? 'has-pre' : ''} ${suf ? 'has-suf' : ''}`}>
        {pre && <span className="pre">{pre}</span>}
        <input id={id} type="number" inputMode="decimal" value={value} onChange={(e) => onChange(id, e.target.value)} />
        {suf && <span className="suf">{suf}</span>}
      </div>
    </div>
  );
}

function Analyzer() {
  const [inputs, setInputs] = useState<Inputs>(toInputs(PRESETS.Laundromat));
  const set = (k: Field, v: string) => setInputs((s) => ({ ...s, [k]: v }));
  const [lease, setLease] = useState<Lease>(LEASE_PRESETS.Laundromat);
  const setL = (k: keyof Lease) => (e: { target: { value: string } }) => setLease((s) => ({ ...s, [k]: e.target.value }));
  const loadPreset = (p: string) => { setInputs(toInputs(PRESETS[p])); setLease(LEASE_PRESETS[p]); };

  const result = useMemo<{ r?: DealResults; error?: string }>(() => {
    try {
      const raw: Record<string, unknown> = {};
      for (const k of FIELDS) raw[k] = inputs[k] === '' ? (k in DEFAULTS ? undefined : 0) : inputs[k];
      return { r: analyzeDeal(raw) };
    } catch (e) {
      return { error: e instanceof InputError ? 'Check the numbers: ' + e.message.replace(/([A-Z])/g, ' $1').toLowerCase() : 'Enter numbers to see results.' };
    }
  }, [inputs]);

  const r = result.r;

  const leaseResult = useMemo<{ l?: LeaseResults; error?: string; empty?: boolean }>(() => {
    if (!r) return { empty: true };
    if (lease.monthlyBaseRent === '' || lease.yearsRemaining === '') return { empty: true };
    try {
      return {
        l: analyzeLease(lease, {
          annualRevenue: r.assumptions.annualRevenue,
          adjustedProfit: r.adjustedProfit,
          annualDebtService: r.annualDebtService,
          loanTermYears: r.assumptions.loanTermYears,
        }),
      };
    } catch (e) {
      return { error: e instanceof LeaseInputError ? 'Check the lease numbers: ' + e.message.replace(/([A-Z])/g, ' $1').toLowerCase() : 'Enter lease numbers to check the lease.' };
    }
  }, [lease, r]);

  const dscrPos = (() => {
    if (!r) return 0;
    const d = r.dscr === null ? 3 : Math.max(0, Math.min(3, r.dscr));
    return d <= 1.5 ? (d / 1.5) * 50 : 50 + ((d - 1.5) / 1.5) * 50;
  })();

  return (
    <section className="section" id="analyzer">
      <h2 className="head">Deal analyzer</h2>
      <p className="lede">Free. Start from an example listing or enter your own numbers.</p>
      <div className="desk">
        <form className="sheet" onSubmit={(e) => e.preventDefault()} autoComplete="off">
          <h3>The listing</h3>
          <div className="presets" aria-label="Example listings">
            {Object.keys(PRESETS).map((p) => (
              <button type="button" key={p} onClick={() => loadPreset(p)}>{p}</button>
            ))}
          </div>
          <div className="fields">
            <NumField id="askingPrice" label="Asking price" pre="$" value={inputs.askingPrice} onChange={set} />
            <NumField id="annualRevenue" label="Yearly revenue" pre="$" value={inputs.annualRevenue} onChange={set} />
            <NumField id="sellerProfit" label="Seller's profit (SDE)" hint="what the listing claims" pre="$" value={inputs.sellerProfit} onChange={set} />
            <NumField id="ownerSalary" label="Your salary or a manager's" hint="per year" pre="$" value={inputs.ownerSalary} onChange={set} />
            <details>
              <summary>Loan terms and extras</summary>
              <div className="fields">
                <div className="pair">
                  <NumField id="downPaymentPct" label="Down payment" suf="%" value={inputs.downPaymentPct} onChange={set} />
                  <NumField id="interestRate" label="Interest rate" suf="%" value={inputs.interestRate} onChange={set} />
                </div>
                <div className="pair">
                  <NumField id="loanTermYears" label="Loan term" suf="yrs" value={inputs.loanTermYears} onChange={set} />
                  <NumField id="annualCapex" label="Repairs / yr" pre="$" value={inputs.annualCapex} onChange={set} />
                </div>
                <div className="pair">
                  <NumField id="closingCosts" label="Closing costs" pre="$" value={inputs.closingCosts} onChange={set} />
                  <NumField id="workingCapital" label="Cash cushion" pre="$" value={inputs.workingCapital} onChange={set} />
                </div>
              </div>
            </details>
            <details open>
              <summary>The lease</summary>
              <div className="fields">
                <div className="pair">
                  <div className="field"><label htmlFor="l-rent">Base rent / mo</label><div className="inp has-pre"><span className="pre">$</span><input id="l-rent" type="number" inputMode="decimal" value={lease.monthlyBaseRent} onChange={setL('monthlyBaseRent')} /></div></div>
                  <div className="field"><label htmlFor="l-extras">Extras / mo <span className="hint">NNN, CAM</span></label><div className="inp has-pre"><span className="pre">$</span><input id="l-extras" type="number" inputMode="decimal" value={lease.monthlyExtras} onChange={setL('monthlyExtras')} /></div></div>
                </div>
                <div className="pair">
                  <div className="field"><label htmlFor="l-years">Years left</label><div className="inp has-suf"><input id="l-years" type="number" inputMode="decimal" value={lease.yearsRemaining} onChange={setL('yearsRemaining')} /><span className="suf">yrs</span></div></div>
                  <div className="field"><label htmlFor="l-renew">Renewal options</label><div className="inp has-suf"><input id="l-renew" type="number" inputMode="decimal" value={lease.renewalYears} onChange={setL('renewalYears')} /><span className="suf">yrs</span></div></div>
                </div>
                <div className="pair">
                  <div className="field"><label htmlFor="l-esc">Yearly increase</label><div className="inp has-suf"><input id="l-esc" type="number" inputMode="decimal" value={lease.annualEscalationPct} onChange={setL('annualEscalationPct')} /><span className="suf">%</span></div></div>
                  <div className="field">
                    <label htmlFor="l-assign">Transfers to buyer?</label>
                    <select id="l-assign" value={lease.assignable} onChange={setL('assignable')}>
                      <option value="yes">Yes</option>
                      <option value="landlord_approval">Landlord must approve</option>
                      <option value="no">No</option>
                      <option value="unknown">Not sure</option>
                    </select>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </form>

        <div className="readout" aria-live="polite">
          {!r ? (
            <div className="verdict"><p className="headline">{result.error}</p></div>
          ) : (
            <>
              <div className={`verdict v-${r.verdict}`}>
                <span className="stamp">{r.verdictLabel}</span>
                <p className="headline">{r.headline}</p>
                <div className="gauge">
                  <div className="gauge-top"><span>Debt coverage (DSCR)</span><b>{r.dscr === null ? 'No loan' : r.dscr.toFixed(2)}</b></div>
                  <div className="gauge-track"><div className="gauge-pin" style={{ left: `${dscrPos}%` }} /></div>
                  <div className="gauge-scale"><span>0</span><span>1.0</span><span>1.25</span><span>1.5</span><span>3.0+</span></div>
                </div>
              </div>
              <dl className="figs">
                {[
                  ['Monthly loan payment', usd(r.monthlyPayment)],
                  ['Cash flow after debt / mo', usd(r.monthlyCashFlowAfterDebt)],
                  ['Cash you put in', usd(r.cashInvested)],
                  ['Payback', r.paybackYears === null ? 'Never' : `${r.paybackYears.toFixed(1)} yrs`],
                  ['Cash-on-cash return', r.cashOnCashReturn === null ? 'n/a' : `${r.cashOnCashReturn.toFixed(1)}%`],
                  ['Price to profit', r.priceToProfitMultiple === null ? 'n/a' : `${r.priceToProfitMultiple.toFixed(2)}x`],
                ].map(([k, v]) => (
                  <div className="fig" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <div className="offer-range">
                <span>Suggested offer range</span>
                <b>{r.suggestedOffer.high <= 0 ? 'Walk away' : `${usd(r.suggestedOffer.low)} – ${usd(r.suggestedOffer.high)}`}</b>
              </div>
              <ul className="flags">
                {r.flags.length
                  ? r.flags.map((f) => <li key={f}>{f}</li>)
                  : <li className="none">No red flags on these numbers. Still verify everything with records.</li>}
              </ul>
              <LeaseCheck result={leaseResult} />
              <p className="fine">{r.disclaimer}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- lease check ---------- */

function LeaseCheck({ result }: { result: { l?: LeaseResults; error?: string; empty?: boolean } }) {
  if (result.empty) {
    return <div className="lease"><h3>Lease check</h3><p className="fine" style={{ margin: 0 }}>Add the base rent and years left on the lease to check it.</p></div>;
  }
  if (!result.l) {
    return <div className="lease"><h3>Lease check</h3><p className="fine" style={{ margin: 0 }}>{result.error}</p></div>;
  }
  const l = result.l;
  const show = l.years.filter((y) => y.year === 1 || y.year % 3 === 0 || y.year === l.years.length);
  return (
    <div className={`lease l-${l.verdict}`}>
      <div className="lease-top">
        <h3>Lease check</h3>
        <span className="chip">{l.verdictLabel}</span>
      </div>
      <dl className="figs lease-figs">
        <div className="fig"><dt>Rent as % of revenue</dt><dd>{l.occupancyRatioPct === null ? 'n/a' : `${l.occupancyRatioPct}%`}</dd></div>
        <div className="fig"><dt>Lease vs. loan</dt><dd>{l.coversLoanTerm ? `${l.totalTermYears} yrs ✓` : `${l.coverageGapYears} yrs short`}</dd></div>
        <div className="fig"><dt>Rent in final loan year</dt><dd>{usd(l.finalYearRent)}</dd></div>
      </dl>
      <div className="table-wrap">
        <table className="lease-table">
          <thead><tr><th>Loan year</th><th>Rent / yr</th><th>Cash flow after debt</th><th>DSCR</th></tr></thead>
          <tbody>
            {show.map((y) => (
              <tr key={y.year} className={y.cashFlowAfterDebt < 0 ? 'neg' : ''}>
                <td>{y.year}</td>
                <td>{usd(y.annualRent)}</td>
                <td>{usd(y.cashFlowAfterDebt)}</td>
                <td>{y.dscr === null ? '—' : y.dscr.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine" style={{ margin: 0 }}>Assumes flat revenue, so it shows how rent increases alone squeeze cash flow. Today's rent is already counted in the seller's profit.</p>
      {l.flags.length > 0 && (
        <ul className="flags">{l.flags.map((f) => <li key={f}>{f}</li>)}</ul>
      )}
    </div>
  );
}

/* ---------- offers ---------- */

function Offers({ me, busy, onBuy }: {
  me: Me; busy: string | null; onBuy: (p: 'playbook' | 'pro_subscription' | 'deal_review') => void;
}) {
  return (
    <section className="section" id="offers">
      <h2 className="head">Go further</h2>
      <p className="lede">Payments are handled securely by Stripe.</p>
      <div className="tiers">
        <div className="tier">
          <span className="name">Deal Playbook</span>
          <span className="price">$47 <small>one time</small></span>
          <ul>
            <li>Step-by-step method for evaluating a business</li>
            <li>Due-diligence checklist</li>
            <li>Questions to ask every seller</li>
          </ul>
          {me?.has_playbook ? (
            <button className="btn" disabled>You own this</button>
          ) : (
            <button className="btn" onClick={() => onBuy('playbook')} disabled={busy === 'playbook'}>
              {busy === 'playbook' ? 'Opening checkout…' : 'Get the playbook'}
            </button>
          )}
        </div>
        <div className="tier hl">
          <span className="name">Deal Engine Pro</span>
          <span className="price">$27 <small>/ month</small></span>
          <ul>
            <li>Save and compare unlimited deals</li>
            <li>Track each deal from review to close</li>
            <li>Cancel anytime from your account</li>
          </ul>
          {me?.plan === 'pro' ? (
            <button className="btn" disabled>You're on Pro</button>
          ) : (
            <button className="btn" onClick={() => onBuy('pro_subscription')} disabled={busy === 'pro_subscription'}>
              {busy === 'pro_subscription' ? 'Opening checkout…' : 'Start Pro'}
            </button>
          )}
        </div>
        <div className="tier">
          <span className="name">Done-for-you plan</span>
          <span className="price">From $2,500 <small>per deal</small></span>
          <ul>
            <li>Lender-ready acquisition plan</li>
            <li>Projections and debt-service math</li>
            <li>Limited spots each month</li>
          </ul>
          <a className="btn" href="#work-with-me" style={{ textAlign: 'center', textDecoration: 'none' }}>Request a plan</a>
        </div>
      </div>
      <div className="tier hl" id="deal-review" style={{ marginTop: 14 }}>
        <span className="name">Deal Review: a second set of eyes on one deal</span>
        <span className="price">$299 <small>one time · credited toward a done-for-you plan</small></span>
        <ul>
          <li>I review the listing and the seller's numbers for one business</li>
          <li>A call to walk through what the price supports, the red flags, and what to ask the seller next</li>
          <li>The full $299 comes off your done-for-you plan if you go ahead</li>
        </ul>
        <button className="btn" onClick={() => onBuy('deal_review')} disabled={busy === 'deal_review'} style={{ justifySelf: 'start' }}>
          {busy === 'deal_review' ? 'Opening checkout…' : 'Book a deal review'}
        </button>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Not available for businesses listed with my brokerage.
        </p>
      </div>
    </section>
  );
}

/* ---------- credibility ---------- */

function BehindTheNumbers() {
  const c = PROFILE.credential;
  return (
    <section className="section" id="behind-the-numbers">
      <div className="about">
        <div className="about-mark" aria-hidden="true">{c ? c.short : 'FM&V'}</div>
        <div className="about-body">
          <h2 className="head">Behind the numbers</h2>
          <p>
            The analyzer uses the same financial modeling and valuation methods lenders use: cash flow after debt,
            debt coverage, and price measured against real earnings. Done-for-you plans go further. I check every
            figure against the tax returns and bank statements before you get a verdict.
          </p>
          <ul className="about-points">
            <li>Lender-grade models, not chatbot estimates</li>
            <li>Done-for-you figures traced back to source documents</li>
            <li>Red flags called out in plain language</li>
          </ul>
          {PROFILE.affiliation && (
            <p style={{ margin: '14px 0 0', paddingTop: 12, borderTop: '1px dashed var(--line)', fontSize: 14 }}>{PROFILE.affiliation}</p>
          )}
          {c && (
            <p className="cred">
              {c.long}, {c.issuer} · <a href={c.verifyUrl} target="_blank" rel="noreferrer">Verify credential</a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- premium intake ---------- */

function PremiumIntake() {
  const [form, setForm] = useState({ name: '', email: '', businessDescription: '', askingPrice: '', financingType: '', deadline: '' });
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'done' | 'error'; msg?: string; bookingUrl?: string | null }>({ status: 'idle' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ status: 'busy' });
    try {
      const body: Record<string, unknown> = { name: form.name, email: form.email, businessDescription: form.businessDescription };
      if (form.askingPrice) body.askingPrice = Number(form.askingPrice);
      if (form.financingType) body.financingType = form.financingType;
      if (form.deadline) body.deadline = form.deadline;
      const res = await api<{ bookingUrl: string | null }>('/api/premium', { body });
      setState({ status: 'done', bookingUrl: res.bookingUrl });
    } catch (err: any) {
      setState({ status: 'error', msg: err.message });
    }
  }

  return (
    <section className="section" id="work-with-me">
      <h2 className="head">Skip the back-and-forth</h2>
      <p className="lede">You could spend hours feeding a listing into AI, fixing its mistakes, and still not know if the numbers are right. Or you send me the deal, and I hand you back a finished, lender-ready plan. No prompting, no guessing, no wasted weekends.</p>
      <p className="lede" style={{ color: 'var(--ink)', fontWeight: 600, marginTop: -8 }}>Proof is in the actual metrics, not in a bot.</p>
      <div className="sheet" style={{ marginBottom: 20, maxWidth: '72ch' }}>
        <h3>Could you do this yourself?</h3>
        <p style={{ margin: '0 0 10px' }}>Absolutely. Everything I do is learnable. The question is whether it's worth the weeks it takes to learn it on a deal that's live right now.</p>
        <ul className="about-points" style={{ margin: '0 0 10px' }}>
          <li>I list businesses, so I know which add-backs are real and which are padding.</li>
          <li>I know what lenders push back on, from the package format to the lease terms.</li>
          <li>I see many deals, not one, so I know what normal pricing and margins look like.</li>
        </ul>
        <p style={{ margin: 0, fontWeight: 600 }}>You're paying for the shortcut, not the math.</p>
      </div>
      <div className="premium">
        <ol className="steps">
          <li><b>Tell me about the deal.</b> A few details so I can see if it's a fit.</li>
          <li><b>Intro call.</b> We go through the listing and your financing.</li>
          <li><b>Quote and agreement.</b> A fixed price for a defined scope.</li>
          <li><b>Delivery.</b> Your acquisition plan, projections, and the red flags I found.</li>
        </ol>
        {state.status === 'done' ? (
          <div className="sheet">
            <p className="notice good" style={{ margin: 0 }}>Got it. I'll review your deal and reply by email.</p>
            {state.bookingUrl && (
              <p style={{ marginBottom: 0 }}><a className="btn primary" href={state.bookingUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-block' }}>Book your intro call</a></p>
            )}
          </div>
        ) : (
          <form className="sheet fields" onSubmit={submit}>
            <div className="pair">
              <div className="field"><label htmlFor="p-name">Name</label><input id="p-name" type="text" required value={form.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="p-email">Email</label><input id="p-email" type="email" required value={form.email} onChange={set('email')} /></div>
            </div>
            <div className="field">
              <label htmlFor="p-desc">The business <span className="hint">type, location, what you know so far</span></label>
              <textarea id="p-desc" required minLength={10} value={form.businessDescription} onChange={set('businessDescription')} />
            </div>
            <div className="pair">
              <div className="field"><label htmlFor="p-price">Asking price <span className="hint">optional</span></label><input id="p-price" type="number" inputMode="numeric" value={form.askingPrice} onChange={set('askingPrice')} /></div>
              <div className="field">
                <label htmlFor="p-fin">Financing</label>
                <select id="p-fin" value={form.financingType} onChange={set('financingType')}>
                  <option value="">Not sure yet</option>
                  <option value="sba">SBA loan</option>
                  <option value="seller_financing">Seller financing</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="field"><label htmlFor="p-deadline">Deadline <span className="hint">optional</span></label><input id="p-deadline" type="date" value={form.deadline} onChange={set('deadline')} /></div>
            {state.status === 'error' && <p className="notice bad" style={{ margin: 0 }}>{state.msg}</p>}
            <button className="btn primary" disabled={state.status === 'busy'}>{state.status === 'busy' ? 'Sending…' : 'Send my deal'}</button>
          </form>
        )}
      </div>
    </section>
  );
}

/* ---------- auth modal ---------- */

function AuthModal({ reason, onClose, onSignedIn }: { reason?: string; onClose: () => void; onSignedIn: () => void }) {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'signup') {
        const res = await api<{ needsEmailConfirmation: boolean }>('/api/auth/signup', { body: { email, password } });
        if (res.needsEmailConfirmation) {
          setMsg({ kind: 'good', text: 'Check your email and tap the confirmation link, then come back and sign in.' });
        } else {
          onSignedIn();
        }
      } else {
        await api('/api/auth/login', { body: { email, password } });
        onSignedIn();
      }
    } catch (err: any) {
      setMsg({ kind: 'bad', text: err.message });
    }
    setBusy(false);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="Account">
        <h2>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h2>
        {reason && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{reason}</p>}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>Create account</button>
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</button>
        </div>
        <div className="field"><label htmlFor="a-email">Email</label><input id="a-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="a-pass">Password {mode === 'signup' && <span className="hint">at least 8 characters</span>}</label>
          <input id="a-pass" type="password" required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {msg && <p className={`notice ${msg.kind}`} style={{ margin: 0 }}>{msg.text}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="link" onClick={onClose} style={{ justifySelf: 'center' }}>Not now</button>
      </form>
    </div>
  );
}
