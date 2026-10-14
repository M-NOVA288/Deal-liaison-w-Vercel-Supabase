# Deal Liaison

[![CI](https://github.com/M-NOVA288/Deal-liaison-w-Vercel-Supabase/actions/workflows/ci.yml/badge.svg)](https://github.com/M-NOVA288/Deal-liaison-w-Vercel-Supabase/actions/workflows/ci.yml)

A production full-stack service that takes real payments, built with reliability as a first-class
requirement: SLOs with an error budget, health checks, structured logs with request tracing,
OpenTelemetry, failure-mode tests, a containerized build, and blameless postmortems from real incidents.

**Live:** [deal-engine-rose.vercel.app](https://deal-engine-rose.vercel.app) · **Health:** [/api/health](https://deal-engine-rose.vercel.app/api/health)

Two products run on one Node.js/TypeScript codebase:
- **Deal Engine** (`/`): an SBA loan analyzer for people buying small businesses (loan amortization, debt coverage ratio, price ceiling, lease risk), with paid reviews and subscriptions.
- **Growth Check** (`/growth`): a diagnostic for e-commerce ad and email funnels, with a paid audit.

## Architecture

```
Browser ──► Vercel edge middleware ──► Next.js API routes (Node.js, serverless) ──► Supabase Postgres (RLS)
             • request ID                • zod input validation                    • constraints, unique indexes
             • CORS                      • per-IP rate limits                      • migrations 001–004
             • session refresh           • structured JSON logs + OTel spans
                                               │
                    ┌──────────────────────────┼───────────────────────────┐
                    ▼                          ▼                           ▼
             Stripe Checkout ──webhook──► /api/webhooks/stripe      Resend / Make (alerts)
             (payments)       (signed,   (idempotent upsert;        (5 s timeout, never
                              retried)    only place access          blocks a sale)
                                          is granted)
```

**Stack:** TypeScript, Node.js, Next.js 15, PostgreSQL (Supabase), Stripe, Vercel, Docker, GitHub Actions, OpenTelemetry, k6.

## Reliability engineering

| Practice | Implementation | Where |
|---|---|---|
| **SLIs / SLOs / error budget** | Checkout success, webhook first-delivery success, analyzer p95 latency, availability; budget policy that pauses features when exhausted | [`docs/SLO.md`](docs/SLO.md) |
| **Health checks** | Liveness (`?live=1`, no dependencies) and readiness (config + DB round trip, 3 s timeout); `down` → 503, `degraded` → 200 | [`app/api/health`](app/api/health/route.ts), [`lib/health.ts`](lib/health.ts) |
| **Observability** | One-JSON-object-per-line logs with event names, durations and request IDs; IDs returned in `x-request-id` and in 500 responses; OpenTelemetry auto-instruments requests and outbound calls | [`lib/log.ts`](lib/log.ts), [`middleware.ts`](middleware.ts), [`instrumentation.ts`](instrumentation.ts) |
| **Idempotency** | Stripe webhooks verified by signature; purchases upserted on a unique session id, so retries and duplicate deliveries are safe; 500 deliberately triggers Stripe's retry | [`app/api/webhooks/stripe`](app/api/webhooks/stripe/route.ts) |
| **Graceful degradation** | Alert/automation calls have hard timeouts and never throw; booking prefill falls back to a plain link | [`lib/automation.ts`](lib/automation.ts), [`app/welcome`](app/welcome/page.tsx) |
| **Failure-mode analysis** | Every dependency: blast radius, behavior, detection, known limits | [`docs/failure-modes.md`](docs/failure-modes.md) |
| **Fault-injection tests** | Simulated outage, hang and 5xx for downstream services; health timeout; secrets never leak from health output | [`tests/resilience.test.ts`](tests/resilience.test.ts) |
| **Incident response** | Runbook per alert; three blameless postmortems from real incidents with tracked action items | [`docs/runbook.md`](docs/runbook.md), [`docs/postmortems`](docs/postmortems) |
| **Automation (toil reduction)** | CI runs tests, a production build, then builds the container and probes its health endpoint on every push | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Containerization** | Multi-stage, non-root image with a `HEALTHCHECK` on the liveness probe; compose file with an optional Jaeger trace backend | [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml) |
| **Capacity testing** | k6 ramp test whose pass/fail thresholds are the SLOs | [`loadtest/smoke.js`](loadtest/smoke.js) |
| **Security / least privilege** | Row-level security on every table; service key server-only; access granted only by the verified webhook; per-IP rate limits | [`supabase/setup.sql`](supabase/setup.sql), [`lib/http.ts`](lib/http.ts) |

## Run it

```bash
npm install
npm test                       # 30 tests: calculation engines + failure modes
cp .env.example .env.local     # add your own keys (see docs/SETUP.md)
npm run dev                    # http://localhost:3000

docker compose up --build      # same app in a container
curl -s localhost:3000/api/health | jq

k6 run loadtest/smoke.js       # load test against production (read-only endpoints)
```

## Project layout

```
app/                    Next.js pages and API routes
  api/health/           liveness + readiness
  api/webhooks/stripe/  payment webhook (idempotent)
  growth/               Growth Check page
lib/                    analyzer, lease, growth engines; logging; health; automation
supabase/               schema, row-level security, migrations
tests/                  unit tests + failure-mode tests
docs/                   SLOs, failure modes, runbook, postmortems, setup guide
loadtest/               k6 script
```

## Known limits and next steps

Honest gaps, in priority order:
1. **External uptime monitor and alert rules** for the SLOs (configured outside the repo; not set up yet).
2. **Metrics backend.** Logs and traces exist; Prometheus/Grafana dashboards for the SLIs are not connected.
3. **Distributed rate limiting.** The current limiter is in memory per serverless instance; move to Redis.
4. **Circuit breaker** for the alert provider, so a long outage doesn't add latency to every sale.
5. **Git-based deploys** gated on CI, replacing manual API deploys (see the deploy postmortem).
6. **Single region.** One Vercel region and one Postgres instance; acceptable at current scale.

## More

- [Setup and operations guide](docs/SETUP.md): stand up your own copy (Stripe, Supabase, Vercel)
- [How the analyzer math works](docs/SETUP.md#analyzer-how-the-numbers-work)

Results from the analyzers are estimates based on user inputs, not financial or lending advice.
