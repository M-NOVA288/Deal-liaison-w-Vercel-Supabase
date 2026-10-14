# Failure modes

Design review of every external dependency: what breaks, what the user sees, and how the system
contains it. Rows marked **Tested** are covered by `tests/resilience.test.ts`.

| Dependency fails | Blast radius | What the system does | User sees | Detection | Status |
|---|---|---|---|---|---|
| **Supabase (database) down** | Accounts, saved deals, leads, purchase records | API routes return 500 with a request ID; webhook returns 500 so Stripe retries for up to 3 days; health returns `down` (503) | Error message on sign-in / signup; analyzer still works (runs in the browser) | `/api/health` 503, `request.unhandled_error` logs | Readiness check tested |
| **Stripe API down** | New checkouts | Checkout route returns 500; nothing is charged | "Something went wrong" on Buy | `request.unhandled_error` on `/api/checkout` | Handled |
| **Stripe webhook delivery fails / is retried** | Access after payment delayed | Signature verified; purchase upserted on unique `stripe_session_id` with `ignoreDuplicates`, so retries and duplicate deliveries are no-ops | Access appears once a delivery succeeds | `webhook.stripe.failed` logs, Stripe dashboard | Idempotent by design |
| **Forged webhook** | Fake purchases | Signature check fails → 400, nothing written | n/a | `webhook.stripe.bad_signature` | Handled |
| **Resend (alert email) down or slow** | Owner doesn't get sale alerts | 5 s timeout, error logged, sale completes normally | Nothing | `dependency.resend.failed` | **Tested** (unreachable, hang, 5xx) |
| **Make webhook down** | Automation events not forwarded | Same contract as Resend: timeout, log, continue | Nothing | `dependency.make.failed` | **Tested** |
| **Alert / booking config missing** | Alerts or Calendly button disappear | Feature switches off; health returns `degraded` (200), not `down` | Thank-you page says "I'll email you" instead of booking button | `/api/health` `optionalConfig` | **Tested** |
| **Calendly prefill lookup fails** | Booking link loses prefilled name/email | Retrieval wrapped in try/catch; plain link still shown | Has to type name/email | n/a | Handled |
| **Traffic spike / abuse on public endpoints** | Function cost, DB load | Per-IP rate limits (analyze 60/min, signup 5/min, leads 10/min) return 429 | "Too many requests" | 429s in logs; k6 run | Handled (per instance) |
| **A dependency hangs (no response)** | Requests pile up | Outbound calls have hard timeouts; health checks have a 3 s timeout | Fast error instead of a spinner | `ms` field in logs | **Tested** |

## Known limits (accepted for now)

- **Rate limiter is in memory, per serverless instance.** Under real abuse across many instances it under-counts. Fix: move counters to Redis/Upstash or Vercel's firewall rules.
- **No circuit breaker.** During a long Resend outage every sale still waits up to 5 s for the alert call. Fix: skip alert calls for N minutes after consecutive failures, or queue alerts.
- **Single region.** Functions run in one Vercel region (`iad1`) and one Supabase project; a regional outage takes the site down. Acceptable at current scale; documented in the SLO targets.
