# Incomplete build promoted to production (near miss)

**Date:** 2026-10-12 · **Severity:** SEV-3 (near miss, no customer impact) · **Status:** Actions done

## Summary
While testing the deploy process, a deployment containing only part of the app's files was
created with `target: production`. It was noticed while still building and cancelled before it
was aliased to the production domain. Had it finished, the live site would have served a broken
build.

## Impact
None to customers. The previous production deployment kept serving traffic throughout.

## Timeline (approximate)
- Deploys were being made through the Vercel API by listing every file in the request.
- A test request meant to check one file reference was sent with the production target and an incomplete file list.
- The deployment appeared in the deployment list as `BUILDING` for production.
- It was cancelled before reaching `READY`; production stayed on the previous deployment.

## Root cause
The deploy method had no separation between "try something" and "ship to production": every
API deploy defaulted to the production target, and nothing checked that the file list was complete.

## What went well
- Vercel only moves the production alias after a build succeeds, which gave time to cancel.
- Deployment status was being checked after every deploy, so the bad one was seen quickly.

## What didn't
- No preview/staging step before production.
- No automated check that a build was complete before it could go live.

## Action items
| Action | Type | Status |
|---|---|---|
| Use preview deployments (no `target`) for experiments; production only for verified builds | Process | Done |
| Verify the live site after every production deploy (fetch the page and check key content) | Process | Done |
| CI builds the full app on every push; a broken build fails before anyone deploys it | Automation | Done (`.github/workflows/ci.yml`) |
| Production deploys built from the GitHub `main` branch, after a preview build of the same commit | Process | Done (2026-10-14) |
| Gate production on CI automatically | Automation | Open |
