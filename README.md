# Seshat

**Know where your money goes. Know what comes next.**

An independently implemented, evidence-first budget assistant for irregular income. Strict TypeScript, Next.js App Router, Tailwind, Zod, Vitest, Playwright and Supabase. Synthetic fixtures are separate from authenticated accounts. Nothing connects to a bank or moves money.

## Run the synthetic demo

Node 24 and npm 11 were used. Dependencies are exact-pinned; use npm only.

```sh
cd /workspace/Seshat-Agent
npm ci --cache /workspace/.npm-cache
npm run dev
```

Open the app in your normal development browser. No credentials are needed. Demo data is dated **November 7, 2026**, in USD and persists only in this browser. Reset clears the demo and restores fixtures. No model is called in demo mode. Questions produce explicitly labeled deterministic summaries.

Try: import `public/sample.csv`, map columns, review rows and overlaps, confirm, expand **Show calculation**, ask the $300 purchase question, inspect the buffer insight, propose a limit change, review before/after, and explicitly confirm. Reload and reimport to check persistence and unchanged totals. Settings support dated closing balances, income/bill plans, matching payment IDs, buffer and savings goal inputs. Ledger classifications and cash/card account selection are editable.

## Financial rules

- Exact integer minor units; two decimal places for USD, RUB and KZT. Parsing never multiplies a binary floating point decimal. Per-input bounds and bounded row counts keep sums within safe integer range. Formatting rounds only at display boundaries.
- A closing **aggregate liquid cash snapshot** anchors the forecast. Transactions on or before its date are already included. Multiple individual-account snapshots and intraday snapshots are not supported; enter a closing total across the same liquid accounts. Investments and credit limits must be excluded.
- Availability = `max(0, lowest projected cash - buffer)`. Shortfall = `max(0, buffer - lowest projected cash)`. Starting cash participates in the minimum. Negative movements precede positive movements on a date. Uncertain income and pending credits are excluded; pending cash debits are reserved.
- Card purchases count as spending, but not cash movement. Card payments reduce cash without adding spending. Internal transfers within the snapshot's aggregate account coverage do neither. Refunds reduce spending on the refund date and retain their signed cash movement. Imports preserve original signed amounts; a refund should have a positive source amount.
- A planned bill is not reserved twice when an exact cash debit of the same amount is explicitly matched by ID. Unmatched or pending payments do not discharge it. Bill amounts are positive plans. Pay dates and snapshots are ledger dates, not timestamps; the demo discloses America/Halifax.
- Hand-worked fixture: $800 closing cash − $700 tomorrow = $100 before $500 income the next day. With a $150 buffer: **$0 available, $50 shortfall**. The later income does not remove the earlier risk.
- Missing snapshots return unknown, not zero. Evidence shows range, sources, exclusions, freshness and assumptions. Equivalent periods are computed, but causal comparisons are deliberately withheld because complete account coverage is not established. Snapshot age is disclosed; stale data must be refreshed before relying on projections.

## Import contract

CSV UTF-8 with headers, ISO `YYYY-MM-DD`, negative debit / positive credit, one budget currency. Maximum 1 MB, 2,000 rows per upload and 10,000 transactions per budget. Quoted CSV fields are parsed by Papa Parse; text is rendered as escaped React text. Map date, amount, merchant and category. Errors identify source row numbers. Confirmation requires explicit overlap review. Source values are retained as JSON, with SHA-256 file identity plus source row index in transaction IDs. An exact-byte repeated file is a no-op for totals. Distinct files can overlap: no automatic destructive deduplication of legitimate identical same-day purchases. Refunds, transfers and card payments require user classification. No currency conversion or balance inference occurs.

## Configured real accounts (live integration unverified)

1. Use an existing Supabase project; this task does not provision paid resources. Apply all SQL files under `supabase/migrations/` in filename order via your normal reviewed migration workflow.
2. Copy `.env.example` to ignored `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL`, its public anon key and `APP_ORIGIN`. Never put service-role or model keys in public variables. Configure Supabase email sign-in and allowed redirect `/auth/confirm` for that origin.
3. Restart and visit `/account`, sign in, choose one currency and create a private budget. Enter a snapshot before using forecasts. Use **Save private budget** after edits; concurrent saves use a version comparison and reject stale state. Reload after concurrent edits. Real account state never enters the demo local-storage adapter.
4. Optional server-only `MODEL_API_KEY` and `MODEL_ID` enable **Ask configured model**. Allow `api.openai.com` plus your exact Supabase project hostname in environment network settings. No keys are currently provided here. The model sees the question only and returns a bounded read-tool selection. It cannot write SQL, approve, or author financial narrative. Values and evidence come from the engine. Invalid provider output/timeouts fall back to deterministic evidence. No retries or agent loops.
5. Optional `SCHEDULER_SECRET` (random, at least 32 characters) and server-only `SUPABASE_SERVICE_ROLE_KEY` enable the job. Keep these secure; the service role is used only inside the protected job handler. Invoke from a trusted scheduler:

```sh
curl --fail -X POST -H "Authorization: Bearer $SCHEDULER_SECRET" "$APP_ORIGIN/api/job"
```

The job checks up to 1,000 budgets per request and reports `hasMore`; pagination for larger installations remains future work. Alert inserts use stable fingerprints and conflict-ignore retries, preserving dismiss/snooze columns. The workspace also computes insights immediately after imports and has a local trigger. Demo snooze/dismiss is persisted; real workspace snooze/dismiss is saved with budget state. Scheduled alert rows and workspace state are separate stores in this slice.

All regular server operations derive identity using Supabase `getUser`, and RLS scopes database reads/writes. An approval RPC locks both proposal and budget, checks version and before-value, updates limit and workspace state, and records one audit event atomically. Repeated approval IDs are idempotent. Export includes the private budget state and audit records; deletion cascades all budget tables (does not remove the Supabase Auth identity).

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
bash scripts/test-db.sh
```

Playwright starts the production app itself and checks desktop plus mobile Chromium. Here it uses `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_PATH` to your Chromium executable elsewhere. The standard Playwright browser download was denied by this environment's domain policy. Browser tests include console/page errors, import, evidence, questions, insights, approval, reload, repeat import, unconfigured-account state and unauthorized scheduler requests.

The Docker database check creates a disposable PostgreSQL 17.6 instance and tears it down. It installs the actual migration, creates two fixture users and tests RLS under the `authenticated` role with an `auth.uid()` JWT-claim stand-in. This verifies PostgreSQL policy behavior, **not real Supabase session authentication**. Live Supabase Auth, live model API and a successful authenticated scheduler job require credentials and remain unverified. No mocked tests establish those integrations.

## Scope and remaining work

This is a reviewable first MVP slice, not a complete production finance product. English/Russian/Kazakh navigation headings are implemented; full form/error translation and independent language-quality review remain incomplete. Category breakdown and an overall spending-limit proposal are implemented; per-category configurable limits are not. Comparison refuses unsupported causal claims. The model selects one tool rather than a multistep conversational agent. Demo questions recognize a small set of intents and the documented $300 scenario. Scheduled-alert dismiss/snooze synchronization and historical data-coverage tracking need expansion. External Supabase/model workflows must be verified before using real financial data.

See `VERIFICATION.md` for run outcomes and `PR_DESCRIPTION.md` for the review summary. No deployment, merge or push to main is part of this task. Use the existing isolated task checkout; do not create a worktree for routine development.

## Security hardening

Read `SECURITY_REVIEW.md` before configured use. Model requests require the exact HTTPS `APP_ORIGIN` (loopback HTTP is permitted for development), bounded JSON, and authenticated per-user quotas. Session cookies are HttpOnly. The second migration closes direct/generic-save limit-change bypasses; do not omit it. CSV instructions are data, not authority. CSP uses per-response script nonces, so HTML is dynamically rendered and not cached. Full dependency audits include development tools. Large exports support `GET /api/export?table=records&offset=0`; follow the returned `nextOffset`. Exports detect incomplete pages and changing counts, but are not transactionally consistent backups.
