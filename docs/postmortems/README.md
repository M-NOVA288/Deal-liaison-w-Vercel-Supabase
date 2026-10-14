# Postmortems

Blameless write-ups of real incidents and near misses from building and launching this service
(October 2026). Each follows the same template: impact, timeline, root cause, what went well,
what didn't, and action items with status. Times are approximate, reconstructed from build notes
and deployment history.

| Date | Incident | Severity | Status |
|---|---|---|---|
| 2026-10-12 | [Incomplete build promoted to production (near miss)](2026-10-12-incomplete-production-deploy.md) | SEV-3 (near miss) | Actions done |
| 2026-10-12 | [Payments configured against the wrong Stripe account](2026-10-12-wrong-stripe-account.md) | SEV-2 (pre-launch) | Actions done |
| 2026-10-12 | [Deploy pipeline blocked by expired credential scope](2026-10-12-deploy-credential-scope.md) | SEV-3 | Mostly done |
