# Runbook

First steps for the alerts in `docs/SLO.md`. Every response includes an `x-request-id` header;
ask the user for it, then search logs for that id.

## Site down (`/api/health` failing)

1. `curl -s https://deal-engine-rose.vercel.app/api/health | jq` and read `checks`.
2. `config` failing → an environment variable was removed. Vercel → Settings → Environment Variables; restore it and redeploy.
3. `database` failing or slow → check the Supabase status page and project dashboard (paused project, connection limits, failed migration).
4. Health itself doesn't respond → check the latest Vercel deployment. If the last deploy is the cause, **roll back** (Vercel → Deployments → previous → Promote) before debugging.

## Webhooks failing

1. Stripe Dashboard → Developers → Webhooks → endpoint → failed attempts: read the response body and status.
2. 400 `Invalid signature` → `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint (common after recreating the endpoint or switching test/live).
3. 500 → search logs for `webhook.stripe.failed` with that `stripeEventId`; usually a database error.
4. After fixing, **resend the failed events from the Stripe dashboard**. Processing is idempotent, so resending is safe.

## Checkout errors

1. Search logs for `request.unhandled_error` with `path: /api/checkout`.
2. `Missing environment variable: STRIPE_PRICE_...` → a price ID is unset. `No such price` → price is from the wrong Stripe account or mode.

## Customer says they paid but have no access

1. Find the payment in Stripe; open its Checkout Session id (`cs_...`).
2. Check the webhook delivery for that session (above).
3. Confirm the row in `purchases` (`stripe_session_id`). For the playbook, the customer must sign in with the **same email** used at checkout.

## Changing an environment variable

Vercel only reads environment variables at build time for a deployment. After adding or changing
one, **redeploy the current production deployment** (Deployments → latest → Redeploy) rather than
re-uploading files. Then confirm with `/api/health` that `config` and `optionalConfig` are `ok`.
