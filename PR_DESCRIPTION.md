# Add Seshat's evidence-first budget demo and authenticated storage foundation

Opening the previously empty repository now presents a usable synthetic budget without credentials. Reviewers can import a mapped CSV, inspect calculation evidence, ask deterministic budget questions, review a cash-buffer insight, and explicitly confirm an auditable spending-limit proposal. Demo records persist across reloads and an exact repeated file cannot change totals.

The independent engine uses integer minor units and anchors cash movement to a dated closing liquid snapshot. It separates spending from card payments and internal transfers, reserves unpaid overdue bills, matches each payment to at most one obligation, and uses the lowest projected cash balance before subtracting the buffer. The hand-worked $800 / $700 bill / later $500 income fixture correctly reports $0 available and a $50 shortfall.

Adds strict TypeScript, pinned npm dependencies and lockfile, mobile-first Next.js UI, CSV sample/provenance, bounded read tools, a server-only model-selection provider, Supabase auth/actions, RLS migrations, atomic idempotent approvals, export/deletion and a protected scheduler endpoint. No deployment, money movement or main push.

Validation: frozen install, lint, strict typecheck, 31 unit tests, production build, 8 mobile/desktop browser tests, disposable PostgreSQL policy/approval checks, and zero full dependency-audit advisories. Browser checks assert no console/page errors. PostgreSQL tests use two claim-backed fixture identities, not live Supabase sessions.

Live Supabase Auth and model calls are unverified because credentials are absent. Full form translations, per-category configurable limits, historical account-coverage inference and scheduled-alert/workspace-state synchronization remain incomplete. See README.md and VERIFICATION.md for exact commands, assumptions, limits and rerun requirements. This change is a verified demo slice and an integration foundation; it does not claim the entire requested production MVP is complete.

Follow-up security hardening closes audited-approval bypasses at the database layer, adds durable model quotas, strict model parameter validation, bounded requests/responses, nonce CSP, HttpOnly auth cookie options, safe export pagination and adversarial regression tests. See SECURITY_REVIEW.md for the review findings and unverified operational boundaries.
