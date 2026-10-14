export type AutomationEvent =
  | 'lead.created'
  | 'purchase.completed'
  | 'subscription.updated'
  | 'premium.requested';

const PRODUCT_LABELS: Record<string, string> = {
  playbook: 'Deal Playbook',
  pro_subscription: 'Deal Engine Pro',
  deal_review: 'Deal Review',
  workflow_audit: 'Workflow Audit',
  premium_plan: 'Done-for-you plan',
};

/** Sends events to Make (optional) and emails the owner about requests and sales. Never throws. */
export async function emitEvent(event: AutomationEvent, data: Record<string, unknown>) {
  await Promise.all([sendToMake(event, data), alertOwner(event, data)]);
}

async function sendToMake(event: AutomationEvent, data: Record<string, unknown>) {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, at: new Date().toISOString(), data }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`[automation] failed to send ${event}`, err);
  }
}

async function alertOwner(event: AutomationEvent, data: Record<string, unknown>) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_EMAIL;
  if (!key || !to) return;

  let subject: string;
  let lines: string[];
  const s = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));

  if (event === 'premium.requested') {
    subject = `New done-for-you request from ${s(data.name)}`;
    lines = [
      `Name: ${s(data.name)}`,
      `Email: ${s(data.email)}`,
      `Asking price: ${data.askingPrice ? '$' + Number(data.askingPrice).toLocaleString('en-US') : '—'}`,
      `Financing: ${s(data.financingType)}`,
      `Deadline: ${s(data.deadline)}`,
      '',
      'About the business:',
      s(data.businessDescription),
    ];
  } else if (event === 'purchase.completed') {
    const label = PRODUCT_LABELS[String(data.product)] ?? String(data.product);
    const amount = typeof data.amountCents === 'number' ? `$${(data.amountCents / 100).toLocaleString('en-US')}` : '';
    subject = `New sale: ${label} ${amount}`.trim();
    lines = [`Product: ${label}`, `Amount: ${amount || '—'}`, `Customer email: ${s(data.email)}`];
    if (data.details) lines.push(`${data.product === 'workflow_audit' ? 'Store' : 'Listing'}: ${s(data.details)}`);
    if (data.product === 'deal_review') {
      lines.push('', 'Reminder: confirm this business is not listed with your brokerage before starting.');
    }
  } else {
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ALERT_FROM || 'Deal Engine <onboarding@resend.dev>',
        to: [to],
        subject,
        text: lines.join('\n'),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('[alert] email failed', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.error('[alert] email failed', err);
  }
}
