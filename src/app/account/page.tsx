import Link from "next/link";
import { budgetSchema } from "../../lib/engine";
import Workspace from "../workspace";
import { authenticated } from "../../lib/server";
import { signIn, confirmProposal, createBudget, deleteBudget } from "./actions";
export const dynamic = "force-dynamic";
export default async function Account() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return (
      <main>
        <h1>Real account</h1>
        <p>
          Supabase is not configured. The synthetic demo remains available and
          never writes to real accounts.
        </p>
        <Link href="/">Return to demo</Link>
      </main>
    );
  let session;
  try {
    session = await authenticated();
  } catch {
    return (
      <main>
        <h1>Sign in to Seshat</h1>
        <form action={signIn}>
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <button>Send sign-in link</button>
        </form>
        <Link href="/">Synthetic demo</Link>
      </main>
    );
  }
  const { db } = session;
  const { data: budgets, error } = await db.from("budgets").select("*");
  if (error)
    return (
      <main>
        <h1>Database unavailable</h1>
        <p>Check the versioned migrations and Supabase configuration.</p>
      </main>
    );
  const { data: proposals } = await db
    .from("proposals")
    .select("*")
    .is("approved_at", null)
    .limit(20);
  const { data: audit } = await db
    .from("audit")
    .select("proposal_id,before_limit,after_limit")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (budgets?.[0]?.state)
    return (
      <>
        <Workspace
          initial={budgetSchema.parse(budgets[0].state)}
          initialAudit={(audit ?? []).map(
            (a) =>
              `Confirmed ${a.proposal_id}: ${a.before_limit} → ${a.after_limit}`,
          )}
          real
        />
        <main>
          <a href="/api/export">Export private budget</a>
          <form action={deleteBudget}>
            <label>
              <input type="checkbox" name="confirm" required /> I confirm
              deletion of all my budget data
            </label>
            <button>Delete private budget</button>
          </form>
        </main>
      </>
    );
  return (
    <main>
      <h1>Your private budget</h1>
      <p>
        Authenticated real-data storage. Demo fixtures are never copied into
        this account.
      </p>
      {!budgets?.length ? (
        <form action={createBudget}>
          <label>
            Budget currency
            <select name="currency">
              <option>USD</option>
              <option>KZT</option>
              <option>RUB</option>
            </select>
          </label>
          <button>Create budget</button>
        </form>
      ) : (
        <>
          <pre>{JSON.stringify(budgets, null, 2)}</pre>
          <p>
            This legacy budget has no workspace state. Export your data before
            recreating it.
          </p>
        </>
      )}
      {proposals?.map((p) => (
        <form action={confirmProposal} key={p.id}>
          <input type="hidden" name="proposal" value={p.id} />
          <p>
            Limit (minor units): {p.before_limit} → {p.after_limit}
          </p>
          <button>Explicitly confirm change</button>
        </form>
      ))}
      <form action={deleteBudget}>
        <label>
          <input type="checkbox" required /> Delete all my budget data
          (irreversible)
        </label>
        <button>Delete my budget data</button>
      </form>
      <a href="/api/export">Export budget JSON</a>
      <p>
        <Link href="/">Return to demo</Link>
      </p>
    </main>
  );
}
