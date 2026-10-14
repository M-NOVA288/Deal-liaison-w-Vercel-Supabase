'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { analyzeGrowth, CORE_FLOWS, GrowthInputError, type GrowthResults } from '@/lib/growth';

const FIELDS = ['adSpend', 'impressions', 'linkClicks', 'purchases', 'adRevenue', 'grossMarginPct', 'storeRevenue', 'emailRevenue', 'listSize', 'openRatePct', 'clickRatePct', 'hoursPerWeek', 'hourlyValue'] as const;
type Field = (typeof FIELDS)[number];
type Inputs = Record<Field, string>;

const PRESETS: Record<string, { v: Record<Field, number>; flows: string[] }> = {
  'Skincare brand': { v: { adSpend: 6000, impressions: 520000, linkClicks: 5200, purchases: 90, adRevenue: 7650, grossMarginPct: 70, storeRevenue: 32000, emailRevenue: 3200, listSize: 14000, openRatePct: 38, clickRatePct: 1.1, hoursPerWeek: 14, hourlyValue: 50 }, flows: ['Welcome series'] },
  'Apparel store': { v: { adSpend: 12000, impressions: 900000, linkClicks: 13500, purchases: 340, adRevenue: 30000, grossMarginPct: 55, storeRevenue: 70000, emailRevenue: 16000, listSize: 40000, openRatePct: 42, clickRatePct: 2.1, hoursPerWeek: 8, hourlyValue: 60 }, flows: ['Welcome series', 'Abandoned cart', 'Post-purchase'] },
  'Candle shop': { v: { adSpend: 1500, impressions: 160000, linkClicks: 1100, purchases: 9, adRevenue: 450, grossMarginPct: 65, storeRevenue: 6000, emailRevenue: 300, listSize: 2500, openRatePct: 30, clickRatePct: 0.7, hoursPerWeek: 18, hourlyValue: 35 }, flows: [] },
};

const toInputs = (v: Record<Field, number>): Inputs => Object.fromEntries(FIELDS.map((k) => [k, String(v[k])])) as Inputs;
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
const STAGE_LABEL = { economics: 'Unit economics', landing: 'Landing page', creative: 'Ad creative', retention: 'Email & workflow' } as const;

function Num({ id, label, hint, pre, suf, value, onChange }: { id: Field; label: string; hint?: string; pre?: string; suf?: string; value: string; onChange: (k: Field, v: string) => void }) {
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

export default function GrowthCheck() {
  const [inputs, setInputs] = useState<Inputs>(toInputs(PRESETS['Skincare brand'].v));
  const [flows, setFlows] = useState<string[]>(PRESETS['Skincare brand'].flows);
  const set = (k: Field, v: string) => setInputs((s) => ({ ...s, [k]: v }));
  const toggle = (f: string) => setFlows((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));

  const result = useMemo<{ r?: GrowthResults; error?: string }>(() => {
    try {
      const raw: Record<string, unknown> = { flows };
      for (const k of FIELDS) raw[k] = inputs[k] === '' ? undefined : inputs[k];
      return { r: analyzeGrowth(raw) };
    } catch (e) {
      return { error: e instanceof GrowthInputError ? 'Check the numbers: ' + e.message.replace(/([A-Z])/g, ' $1').toLowerCase() : 'Enter your numbers to see results.' };
    }
  }, [inputs, flows]);
  const r = result.r;
  const vClass = r ? (r.verdict === 'scaling' ? 'v-strong' : r.verdict === 'break_even' ? 'v-tight' : 'v-no_cash_flow') : '';

  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="/growth">Growth Check</a>
        <nav className="nav" aria-label="Main"><a href="#check">Health check</a><a href="#audit">Workflow audit</a></nav>
      </header>

      <section className="hero">
        <div>
          <h1>Find where your ads and emails leak money</h1>
          <p>Enter last month's Meta Ads and email numbers. See whether your ads actually make a profit, which part of the funnel is losing customers, and what to fix first.</p>
          <p className="trust">For e-commerce brands running Meta Ads with Klaviyo or Mailchimp</p>
        </div>
        <Capture />
      </section>

      <section className="section" id="check">
        <h2 className="head">Health check</h2>
        <p className="lede">Free. Start from an example store or enter last month's numbers.</p>
        <div className="desk">
          <form className="sheet" onSubmit={(e) => e.preventDefault()} autoComplete="off">
            <h3>Meta Ads, last 30 days</h3>
            <div className="presets" aria-label="Example stores">
              {Object.keys(PRESETS).map((p) => (
                <button type="button" key={p} onClick={() => { setInputs(toInputs(PRESETS[p].v)); setFlows(PRESETS[p].flows); }}>{p}</button>
              ))}
            </div>
            <div className="fields">
              <div className="pair">
                <Num id="adSpend" label="Ad spend" pre="$" value={inputs.adSpend} onChange={set} />
                <Num id="adRevenue" label="Purchase value" hint="from ads" pre="$" value={inputs.adRevenue} onChange={set} />
              </div>
              <div className="pair">
                <Num id="impressions" label="Impressions" value={inputs.impressions} onChange={set} />
                <Num id="linkClicks" label="Link clicks" value={inputs.linkClicks} onChange={set} />
              </div>
              <div className="pair">
                <Num id="purchases" label="Purchases" value={inputs.purchases} onChange={set} />
                <Num id="grossMarginPct" label="Gross margin" hint="after product + shipping" suf="%" value={inputs.grossMarginPct} onChange={set} />
              </div>
              <details open>
                <summary>Email (Klaviyo or Mailchimp)</summary>
                <div className="fields">
                  <div className="pair">
                    <Num id="storeRevenue" label="Total store revenue" pre="$" value={inputs.storeRevenue} onChange={set} />
                    <Num id="emailRevenue" label="Email revenue" pre="$" value={inputs.emailRevenue} onChange={set} />
                  </div>
                  <div className="pair">
                    <Num id="listSize" label="List size" value={inputs.listSize} onChange={set} />
                    <Num id="clickRatePct" label="Avg click rate" suf="%" value={inputs.clickRatePct} onChange={set} />
                  </div>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Flows you have running</legend>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {CORE_FLOWS.map((f) => (
                        <label key={f} className="check" style={{ color: 'var(--ink)' }}>
                          <input type="checkbox" checked={flows.includes(f)} onChange={() => toggle(f)} /> {f}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </details>
              <details>
                <summary>Your time</summary>
                <div className="fields">
                  <div className="pair">
                    <Num id="hoursPerWeek" label="Hours / week" hint="ads, Canva, email, planning" value={inputs.hoursPerWeek} onChange={set} />
                    <Num id="hourlyValue" label="Your hour is worth" pre="$" value={inputs.hourlyValue} onChange={set} />
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
                <div className={`verdict ${vClass}`}>
                  <span className="stamp">{r.verdictLabel}</span>
                  <p className="headline">{r.headline}</p>
                  <div className="offer-range" style={{ marginTop: 4 }}>
                    <span>ROAS vs. break-even</span>
                    <b>{r.roas === null ? 'n/a' : r.roas.toFixed(2)} / {r.breakEvenRoas.toFixed(2)}</b>
                  </div>
                </div>
                <dl className="figs">
                  {[
                    ['Cost per purchase', r.cpa === null ? 'n/a' : money(r.cpa)],
                    ['Max you can pay', r.maxCpa === null ? 'n/a' : money(r.maxCpa)],
                    ['Avg order value', r.aov === null ? 'n/a' : money(r.aov)],
                    ['Link click rate', r.ctrPct === null ? 'n/a' : `${r.ctrPct}%`],
                    ['Click → purchase', r.conversionRatePct === null ? 'n/a' : `${r.conversionRatePct}%`],
                    ['CPM', r.cpm === null ? 'n/a' : `$${r.cpm.toFixed(2)}`],
                    ['Email share of revenue', r.emailSharePct === null ? 'n/a' : `${r.emailSharePct}%`],
                    ['Revenue / subscriber', r.revenuePerSubscriber === null ? 'n/a' : `$${r.revenuePerSubscriber.toFixed(2)}`],
                    ['Time on marketing', r.monthlyHours === null ? 'n/a' : `${r.monthlyHours} hrs/mo`],
                  ].map(([k, v]) => (
                    <div className="fig" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
                <div className="lease">
                  <div className="lease-top">
                    <h3>Fix first</h3>
                    {r.bottleneck && <span className="chip" style={{ color: 'var(--warn)', background: 'var(--warn-bg)' }}>Biggest leak: {STAGE_LABEL[r.bottleneck]}</span>}
                  </div>
                  {r.fixes.length ? (
                    <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10 }}>
                      {r.fixes.map((f) => (
                        <li key={f.title}><b>{f.title}.</b> <span style={{ color: 'var(--muted)' }}>{f.detail}</span></li>
                      ))}
                    </ol>
                  ) : (
                    <ul className="flags"><li className="none">No leaks on these numbers. Keep testing creative and scale carefully.</li></ul>
                  )}
                </div>
                <p className="fine">{r.disclaimer}</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="section" id="fix">
        <h2 className="head">Want it fixed for you?</h2>
        <p className="lede">I condense Meta Ads, Canva, Notion and Klaviyo or Mailchimp into one workflow: ad structures that are built to test, templates your team can reuse, email flows that run on their own, and one workspace to plan it all.</p>
        <Audit />
      </section>

      <footer>
        <span>Results are estimates based only on the numbers you enter, using typical e-commerce ranges. They are not a prediction or guarantee of results.</span>
      </footer>
    </div>
  );
}

function Audit() {
  const [state, setState] = useState<'idle' | 'busy' | string>('idle');
  async function buy() {
    setState('busy');
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'workflow_audit' }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data?.error || 'Something went wrong. Please try again.');
      window.location.href = data.url;
    } catch (err: any) { setState(err.message); }
  }
  return (
    <div className="tier hl" id="audit" style={{ maxWidth: 640 }}>
      <span className="name">Workflow Audit</span>
      <span className="price">$299 <small>one time · credited toward a done-for-you build</small></span>
      <ul>
        <li>I go through your Meta Ads account, email platform, Canva and Notion setup</li>
        <li>A call to walk through where money and hours are leaking, and what to fix first</li>
        <li>A written fix plan you can hand to your team or have me build</li>
        <li>The full $299 comes off a done-for-you build if you go ahead</li>
      </ul>
      <button className="btn" onClick={buy} disabled={state === 'busy'} style={{ justifySelf: 'start' }}>
        {state === 'busy' ? 'Opening checkout…' : 'Book a workflow audit'}
      </button>
      {state !== 'idle' && state !== 'busy' && <p className="notice bad" style={{ margin: 0 }}>{state}</p>}
    </div>
  );
}

function Capture() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(true);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('busy');
    const src = new URLSearchParams(window.location.search).get('src') || '';
    try {
      const res = await fetch('/api/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent, list: 'growth', source: ['tiktok', 'instagram', 'facebook', 'youtube'].includes(src) ? src : 'other' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Something went wrong. Please try again.');
      setState('done');
    } catch (err: any) { setState(err.message); }
  }

  return (
    <form className="capture" onSubmit={submit}>
      <h2>Get growth breakdowns by email</h2>
      {state === 'done' ? (
        <p className="notice good" style={{ margin: 0 }}>You're on the list. Check your inbox.</p>
      ) : (
        <>
          <div className="row">
            <input type="email" required placeholder="you@brand.com" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn primary" disabled={state === 'busy'}>Join</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Send me growth breakdowns and offers. Unsubscribe anytime.
          </label>
          {state !== 'idle' && state !== 'busy' && <p className="notice bad" style={{ margin: 0 }}>{state}</p>}
        </>
      )}
    </form>
  );
}
