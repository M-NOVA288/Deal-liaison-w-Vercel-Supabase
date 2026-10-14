# Payments configured against the wrong Stripe account

**Date:** 2026-10-12 · **Severity:** SEV-2 (would have taken live payments into the wrong account; caught before launch) · **Status:** Actions done

## Summary
During launch setup, products and a webhook were created in one Stripe account while the API key
in production belonged to another, and test-mode (sandbox) objects were mixed with live ones.
Checkout would have failed with "No such price" or, worse, charged customers into the wrong account.

## Impact
Launch delayed while configuration was sorted out. No customer payments were affected; the
service had no paying customers yet.

## Timeline (approximate)
- Products created in the first account the tooling was connected to.
- Live API keys pasted from a different account (renamed, so the names didn't match what was expected).
- Sandbox screenshots and live keys were being compared side by side, adding confusion.
- The tooling was reconnected to the intended account, products and the webhook recreated there, and environment variables updated.
- One price turned out to be $27/month instead of the planned $29; it was kept, and the revenue-reporting constant was updated to match.

## Root cause
Account identity wasn't verified before creating resources. Stripe account names are free text
and can be renamed, so names weren't a reliable identifier; the account ID (`acct_...`) is.

## What went well
- Caught before any real customer paid.
- Stripe price IDs are environment variables, so switching accounts needed no code change.

## What didn't
- A restricted live key was pasted into a chat during setup, so it must be treated as exposed.
- The old account kept stale products and an active webhook.

## Action items
| Action | Type | Status |
|---|---|---|
| Identify Stripe accounts by `acct_...` id, never by display name | Process | Done |
| Health check fails (`down`) if any required price or key is missing | Automation | Done (`/api/health`) |
| Keep the reporting price constant (`PRO_PRICE_CENTS`) in sync with Stripe | Config | Done |
| Roll the restricted key that was pasted in chat | Security | Open |
| Archive products and disable the webhook in the unused account | Cleanup | Open |
