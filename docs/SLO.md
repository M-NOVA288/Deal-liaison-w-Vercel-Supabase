# Service Level Objectives

Deal Engine is small, but the money path (checkout → Stripe webhook → access granted) has to be
dependable. These SLOs define "reliable enough" so reliability work can be prioritized against
features with an error budget instead of guesswork.

## User journeys and SLIs

| Journey | SLI (what we measure) | Source |
|---|---|---|
| Checkout | % of `POST /api/checkout` requests returning non-5xx | Vercel request logs, `request.unhandled_error` events |
| Access after payment | % of Stripe `checkout.session.completed` events processed successfully on first delivery | `webhook.stripe.processed` vs `webhook.stripe.failed` log events; Stripe dashboard delivery stats |
| Deal analyzer | p95 latency of `POST /api/analyze` | k6 (`loadtest/smoke.js`), Vercel function duration |
| Site up | % of 1-minute probes where `GET /api/health` returns 200 | External uptime monitor (e.g. UptimeRobot / Better Stack) |

## Objectives (rolling 28 days)

| SLI | SLO | Error budget (28 days) |
|---|---|---|
| Checkout non-5xx rate | 99.5% | 0.5% of checkout requests |
| Webhook first-delivery success | 99.0% | 1% of events (Stripe retries for up to 3 days, so a miss delays access, it doesn't lose it) |
| Analyzer p95 latency | < 800 ms | 5% of 5-minute windows may exceed |
| Health probe availability | 99.5% | ~3.4 hours |

Targets are deliberately below what the managed platforms advertise (Vercel, Supabase, Stripe),
because this service depends on all three at once and its availability can't exceed theirs combined.

## Error budget policy

- **Budget healthy (< 50% spent):** ship features normally.
- **Budget at risk (50–100% spent):** every deploy needs passing CI plus a manual check of `/api/health` and one test checkout in Stripe test mode.
- **Budget exhausted:** feature work pauses; the next work items are the top causes from postmortems until the 28-day window recovers.

## Alerting (symptom-based, not cause-based)

| Alert | Condition | Severity |
|---|---|---|
| Site down | Health probe fails 3 times in a row (3 minutes) | Page |
| Webhooks failing | Any `webhook.stripe.failed` in 15 minutes, or Stripe "webhook delivery failing" email | Page |
| Checkout errors | > 2% of checkout requests 5xx over 30 minutes | Page |
| Degraded | Health returns `degraded` for 30 minutes (alerts or booking links misconfigured) | Ticket |

## What's measured today vs. next

- **In place:** structured logs with event names and durations, request IDs, health endpoint, OpenTelemetry instrumentation hook, k6 thresholds that encode these SLOs, Stripe's own delivery dashboard.
- **Not yet:** an external uptime monitor and log-based alert rules are configured outside the repo; a metrics backend (Prometheus/Grafana) is not connected. These are the next steps listed in the README.
