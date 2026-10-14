# Setup and operations guide

How to stand up your own copy of the service from scratch. For architecture and reliability design, see the main README.

## Setup (about an hour, no coding required)

### 1. Stripe (start first: verification can take a few days)
1. Create an account at stripe.com and complete business verification.
2. **Product catalog → Add product:**
   - "Deal Playbook": one-time price (e.g. $47). Copy the **price ID** (`price_...`).
   - "Pro": recurring monthly price (e.g. $27/mo). Copy its price ID.
3. **Developers → API keys:** copy the **secret key**.
4. Stay in **test mode** until everything works end to end.

### 2. Supabase
1. Create a project at supabase.com.
2. **SQL Editor → New query:** paste all of `supabase/setup.sql` → **Run**. (It combines all migration files, so you only run one.)
3. **Project Settings → API:** copy the Project URL, `anon` key, and `service_role` key.
4. **Authentication → URL Configuration:** set Site URL to your domain and add `https://YOUR-SITE/auth/callback` as a redirect URL.
5. **Storage → playbook:** upload your playbook PDF named `deal-playbook.pdf`.
6. After you sign up on your own site, make yourself the owner in the SQL Editor:
   `update public.profiles set is_admin = true where email = 'you@example.com';`

### 3. Deploy to Vercel
1. Put this folder in a GitHub repository (private).
2. At vercel.com: **Add New → Project → import the repo**.
3. Under **Environment Variables**, add every variable from `.env.example` with your real values.
4. Deploy. Copy your site URL and set it as `NEXT_PUBLIC_SITE_URL`, then redeploy.

### 4. Connect the Stripe webhook
1. Stripe → **Developers → Webhooks → Add endpoint**
   - URL: `https://YOUR-SITE/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
2. Copy the **signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.
3. **Settings → Billing → Customer portal:** turn it on and allow cancellations and card updates (needed for `/api/billing/portal`).

### 5. Make.com automation (optional but recommended)
1. New scenario → first module **Webhooks → Custom webhook** → copy its URL into `MAKE_WEBHOOK_URL`.
2. Every event arrives as `{ event, at, data }`. Add a **Router** and branch on `event`:
   - `lead.created` → Kit: add subscriber (tag with `data.source`)
   - `purchase.completed` + `product = playbook` → Kit: tag "playbook buyer" (Kit sends the download)
   - `subscription.updated` → Kit: tag/untag "pro"
   - `premium.requested` → email/text yourself + add a card to your Notion client board

### 6. Test the whole flow (test mode)
- Analyzer: `curl -X POST https://YOUR-SITE/api/analyze -H "Content-Type: application/json" -d '{"askingPrice":400000,"annualRevenue":300000,"sellerProfit":150000,"ownerSalary":50000}'`
- Buy the playbook with Stripe's test card `4242 4242 4242 4242` → check the `purchases` table in Supabase.
- Subscribe to Pro as a signed-in user → your `profiles.plan` should flip to `pro`.
- Cancel in Stripe → it should flip back to `free`.

When all of that works, switch Stripe to **live mode**, create live prices and a live webhook, and update the keys in Vercel.

---

## Running it on your own computer (optional)
```bash
npm install
cp .env.example .env.local   # fill in your keys
npm test                     # checks the deal math
npm run dev                  # http://localhost:3000
```
For local Stripe testing, install the Stripe CLI and run
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

---

## Analyzer: how the numbers work
- **Loan payment:** standard amortized loan on (price − down payment). Defaults: 10% down, 10.5%, 10 years. Every default can be overridden per request, and you should confirm current rates with lenders.
- **Adjusted profit** = seller's profit − your salary (or a manager's) − yearly equipment/repairs
- **Cash flow after debt** = adjusted profit − yearly loan payments
- **DSCR** (debt coverage) = adjusted profit ÷ yearly loan payments. Many lenders look for roughly 1.25 or higher.
- **Max price** = highest price where DSCR still hits 1.25 at the same terms. The **offer range** is 85–100% of the lower of that and the asking price.
- **Verdict:** Strong (DSCR ≥ 1.5) · Workable (≥ 1.25) · Tight (1.0–1.25) · Doesn't cash flow (< 1.0 or negative)
- **Red flags:** no owner salary, margin above 40%, price above 4× profit, no working capital, price above the DSCR ceiling.

Every response includes a disclaimer that the results are estimates based on the user's inputs, not predictions or advice. Keep it visible anywhere results appear, including your videos.

---

## Security notes
- `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` are server-only. Never paste them into Framer or any front-end code.
- Row-level security means users can only read their own profile, deals, and purchases.
- Pro access and playbook access are granted **only** by the verified Stripe webhook.
- Public endpoints have basic rate limiting. For heavy traffic, add Vercel's firewall or Upstash rate limiting.

## Connecting your Framer page
Add your Framer domain to `ALLOWED_ORIGINS`. Then from Framer forms or code components:
- Email form → `POST /api/leads` with `{ email, source: "tiktok", consent: true }`
- Buy buttons → `POST /api/checkout` with `{ product: "playbook" }` or `{ product: "pro_subscription" }`, then send the browser to the returned `url`
- Premium form → `POST /api/premium`, then show the returned `bookingUrl`

## Seeing how it sells
Call `GET /api/admin/stats` while signed in as the owner. It returns revenue (all-time and last 30 days),
revenue by product, active Pro members and MRR, lead → signup → buyer conversion rates, leads by platform,
your premium pipeline by status, and a day-by-day revenue and lead trend.
