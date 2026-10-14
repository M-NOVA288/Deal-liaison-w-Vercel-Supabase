# Deploy pipeline blocked by expired credential scope

**Date:** 2026-10-12 · **Severity:** SEV-3 (no customer impact; changes couldn't ship) · **Status:** Partially done

## Summary
Deploys failed with `403 forbidden` for the team scope after the deploy credential lost access to
it. After reconnecting, deploys that referenced previously uploaded files by hash failed with
`400 missing_files`, so every file had to be re-uploaded in full.

## Impact
New features (paid Deal Review, pricing change) were finished but couldn't be released for part
of an evening. The live site kept working on the previous version.

## Timeline (approximate)
- Deploy calls that passed an explicit team ID began returning 403.
- The credential was reconnected; calls **without** the explicit team ID succeeded, calls with it still failed.
- First deploy after reconnecting failed with `missing_files`: the file hashes from earlier uploads weren't available to the new credential.
- Redeployed with every file uploaded inline; build succeeded and the live site was verified.

## Root cause
1. Releases depended on one interactive credential with no fallback.
2. The deploy method relied on files cached by a previous session's credential, an implicit dependency nobody had written down.

## What went well
- Production was unaffected; failed deploys never replace a working deployment.
- The error messages (`403` scope, `missing_files`) pointed directly at the causes.

## What didn't
- No second way to deploy (for example, git-based deploys) when the API path broke.

## Action items
| Action | Type | Status |
|---|---|---|
| Source of truth moved to GitHub; CI builds every push | Automation | Done |
| Container image builds in CI, giving a deploy path independent of Vercel | Automation | Done (`Dockerfile`, CI `docker` job) |
| Connect Vercel to the GitHub repo so `main` deploys automatically after CI | Automation | Open |
| Document the redeploy-with-env-change path (redeploy an existing deployment instead of re-uploading) | Docs | Done (runbook) |
