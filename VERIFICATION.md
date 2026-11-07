# Verification record — November 7, 2026

Runtime: Linux, Node 24.22.1, npm 11.9.0. All data in fixtures and browser checks is synthetic.

| Path | Status | Evidence / limitation |
| --- | --- | --- |
| Locked dependency installation | Verified | `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` completed after dependency upgrades. |
| Lint and strict TypeScript | Verified | `npm run lint`, `npm run typecheck`. Third-party declarations use the standard Next.js `skipLibCheck`; application checking is strict. |
| Engine and bounded tools | Verified | 17 Vitest tests: exact parsing; early cash trough; unknown snapshot; transfers; card purchases/payments; refund policy; uncertain/pending income; pending debit; mixed-currency exclusion; matching; overdue unpaid bills; one-payment-one-bill; equivalent dates; import replay; row errors; stale/idempotent approvals; invalid provider output fallback. |
| Production compilation | Verified | `npm run build` with Next.js 16.4.5 and webpack. |
| Demo user flow | Verified | 4 Playwright tests over desktop and mobile Chromium, including import → calculation → question → insight → explicit approval, reload and repeated import; browser console/page errors checked. |
| PostgreSQL migration and policies | Verified | `bash scripts/test-db.sh` on disposable PostgreSQL 17.6: two fixture identities under authenticated role, cross-user read/write/approval denial, atomic audit, approval retry, stale proposal rejection. Uses an auth.uid() claim stand-in, not real Supabase login. |
| Production dependency advisories | Verified | `npm audit --omit=dev` reports 0 advisories after upgrading Next.js and Zod. This is not a guarantee of security. |
| Supabase Auth, real-account save/import/approval/export/delete | Implemented but unverified | No Supabase URL, anon key, or authorized test users supplied. The real workspace is separate from demo storage. Run against a dedicated test project before real data. |
| Live model selection | Implemented but unverified | No model key supplied. Server-only provider uses configurable model ID, one bounded selection, no prose claims, and deterministic fallback. No live model call is simulated. |
| Protected scheduler | Partially verified | Missing/invalid bearer is rejected in browser API tests. Successful job and real Supabase alert writes remain unverified without database/service-role credentials. Retry deduplication uses database uniqueness plus conflict-ignore. |
| Translation | Partial | English/Russian/Kazakh headings and locale-aware amount formatting implemented; full form/error localization and independent translation review remain incomplete. |
| Per-category configurable limits | Not implemented | Category breakdown plus an overall spending-limit proposal are present. |
| Full comparison/coverage inference | Intentionally unavailable | Adjacent equal-length periods are calculated; no unsupported claim of comparable account coverage or cause is made. |
| Deployment, GitHub push, fresh-task snapshot restoration | Not performed | Changes remain in the task checkout. No paid infrastructure provisioned or main push performed. |

## Diagnosed failures during development

- npm's default home cache was unavailable: moved cache to `/workspace/.npm-cache`, then completed a frozen installation.
- Original lint errors and incompatible dependency declarations were corrected; installed compatible pinned Supabase packages.
- Playwright browser downloads from `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` returned `403 Domain forbidden`. Used the existing `/usr/bin/chromium` with verification intact.
- First browser console check caught a missing icon; supplied an app icon.
- A framework upgrade run caught React hydration errors while source was changing during a build. Development-mode diagnosis showed no errors; a fresh build from stable sources passed the browser checks. Do not edit sources while creating production artifacts.
- Dependency audit identified advisories in older framework/transitive/validation packages; upgraded, rebuilt, and reran checks.

## Live rerun requirements

Use a dedicated Supabase test project. Apply the migration, configure email redirect and the variables in `.env.example`, restart, sign in as two distinct users, create separate budgets, import the synthetic sample into each, and verify neither can read/write the other's IDs through the Supabase API or approve the other's proposal. Exercise save concurrency, repeated approval, export and deletion. Run the authenticated scheduler twice and inspect one alert per fingerprint. Configure `MODEL_API_KEY` and `MODEL_ID`, ask the documented questions via **Ask configured model**, and verify returned tool metric IDs against the engine evidence. These steps have not run here.

Credential values must be entered securely; never paste them into chat, tracked files or test logs. Supabase project host access must be allowed in environment network settings. A local checkout and installed dependencies can be snapshotted by the environment product; live processes and authentication do not survive snapshots. Local-only Git commits have not been tested for restoration in a fresh task.
