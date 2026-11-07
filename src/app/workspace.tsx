"use client";
import { useEffect, useState } from "react";
import { saveBudget, proposeLimit, approveLimit } from "./account/actions";
import { budgetSchema } from "../lib/engine";
import { demo } from "../lib/demo";
import {
  Budget,
  forecast,
  spending,
  insights,
  money,
  date,
  transaction,
} from "../lib/engine";
import { preview, fileId, mergeImport, Mapping } from "../lib/import";
import { approve, Proposal, runTool } from "../lib/tools";
const labels = {
  en: [
    "Your money, clearly.",
    "Available before payday",
    "Ask Seshat",
    "Upcoming & attention",
    "Import transactions",
    "Budget settings",
  ],
  ru: [
    "Ваши деньги — ясно.",
    "Доступно до зарплаты",
    "Спросить Сешат",
    "Предстоящие платежи",
    "Импорт операций",
    "Настройки бюджета",
  ],
  kk: [
    "Қаржыңыз анық көрінеді.",
    "Табысқа дейін қолжетімді",
    "Сешаттан сұрау",
    "Алдағы төлемдер",
    "Операцияларды импорттау",
    "Бюджет баптаулары",
  ],
};
const storage = "seshat-synthetic-v1";
export default function Home({
  initial = demo,
  initialAudit = [],
  real = false,
}: {
  initial?: Budget;
  initialAudit?: string[];
  real?: boolean;
}) {
  const [baseVersion, setBaseVersion] = useState(initial.version),
    [b, setB] = useState<Budget>(initial),
    [ready, setReady] = useState(false),
    [lang, setLang] = useState<"en" | "ru" | "kk">("en"),
    [now, setNow] = useState(0),
    [end, setEnd] = useState(() =>
      real
        ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        : "2026-11-14",
    ),
    [question, setQuestion] = useState(
      "What changes if I spend $300 before payday?",
    ),
    [answer, setAnswer] = useState<unknown>(null),
    [raw, setRaw] = useState(""),
    [mapping, setMapping] = useState<Mapping>({
      date: "date",
      amount: "amount",
      merchant: "merchant",
      category: "category",
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [hidden, setHidden] = useState<Record<string, number>>(
      initial.alertStates ?? {},
    ),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [seen, setSeen] = useState<string[]>([]),
    [audit, setAudit] = useState<string[]>(initialAudit),
    [overlap, setOverlap] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      const saved = real ? null : localStorage.getItem(storage);
      if (saved) {
        const state = JSON.parse(saved);
        if (
          state.b?.currency === "USD" &&
          Array.isArray(state.b.transactions)
        ) {
          state.b.transactions.forEach((t: unknown) => transaction.parse(t));
          setB(budgetSchema.parse(state.b));
          setHidden(state.hidden ?? {});
          setSeen(state.seen ?? []);
          setAudit(state.audit ?? []);
        }
      }
    } catch {
      setError("Saved demo data could not be loaded. Reset demo to recover.");
    }
    setReady(true);
  }, [real]);
  useEffect(() => {
    if (ready && !real)
      localStorage.setItem(storage, JSON.stringify({ b, hidden, seen, audit }));
  }, [b, hidden, seen, audit, ready, real]);
  const f = forecast(b, end),
    s = spending(b, end.slice(0, 7) + "-01", end),
    alerts = insights(b, end).filter(
      (i) => !hidden[i.id] || hidden[i.id] < now,
    ),
    t = labels[lang];
  const format = (v: number | null) =>
    v === null
      ? "Insufficient data"
      : new Intl.NumberFormat(lang, {
          style: "currency",
          currency: b.currency,
        }).format(v / 100);
  let parsed: ReturnType<typeof preview> | null = null;
  try {
    if (raw) parsed = preview(raw, mapping, b.currency);
  } catch (e) {
    parsed = { rows: [], errors: [String(e)], headers: [], raw };
  }
  const evidence = (v: unknown) => (
    <details>
      <summary>Show calculation</summary>
      <pre>{JSON.stringify(v, null, 2)}</pre>
    </details>
  );
  function ask() {
    const q = question.toLowerCase();
    const name = /why|more|срав|неге/.test(q)
      ? "comparison"
      : /300|spend.*before|purchase/.test(q)
        ? "purchase"
        : /goal/.test(q)
          ? "goal"
          : /bill/.test(q)
            ? "bills"
            : /transaction/.test(q)
              ? "transactions"
              : /spent|spending/.test(q)
                ? "spending"
                : "forecast";
    setAnswer({
      label: real
        ? "Calculated summary · no model call"
        : "Demo summary · deterministic calculation, no model call",
      responseLanguage: lang,
      note:
        name === "comparison"
          ? "Comparable coverage is not established; Seshat cannot explain a cause."
          : name === "purchase"
            ? "Scenario reserves $300 immediately; this is not an approved purchase."
            : "Evidence from synthetic records only.",
      result: runTool(b, {
        name,
        start: end.slice(0, 7) + "-01",
        end,
        amount: name === "purchase" ? 30000 : undefined,
      }),
    });
  }
  async function confirmImport() {
    try {
      if (!parsed || parsed.errors.length)
        throw Error("Resolve row errors first");
      const hash = await fileId(raw);
      const rows = mergeImport(b.transactions, parsed.rows, hash);
      const count = rows.length - b.transactions.length;
      setB({ ...b, transactions: rows, version: b.version + 1 });
      setMessage(
        count
          ? `Imported ${count} rows. Insights refreshed.`
          : "This file was already imported; totals unchanged.",
      );
      setRaw("");
      setOverlap(false);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <main>
      <header>
        <div>
          <div className="eyebrow">◈ SESHAT / PERSONAL LEDGER</div>
          <h1>{t[0]}</h1>
          <p className="muted">
            Know where your money goes. Know what comes next.
          </p>
        </div>
        <label>
          Language
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
          </select>
        </label>
      </header>
      <nav>
        <a href="#ask">Ask</a> · <a href="#import">Import</a> ·{" "}
        <a href="#settings">Settings</a> · <a href="/account">Real account</a>
      </nav>
      <p className="muted">
        {real
          ? "PRIVATE ACCOUNT · Save changes to persist"
          : "SYNTHETIC DEMO · Isolated browser storage"}{" "}
        · {b.currency} · Snapshot: {b.snapshot?.date}. Dates are ledger dates in
        America/Halifax. Data may be stale; refresh your snapshot before relying
        on it.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {real && (
        <button
          onClick={async () => {
            try {
              await saveBudget({ ...b, alertStates: hidden }, baseVersion);
              setBaseVersion(baseVersion + 1);
              setB({ ...b, version: baseVersion + 1 });
              setMessage("Private budget saved.");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Save private budget
        </button>
      )}
      <section className="hero">
        <div className="eyebrow" style={{ color: "#bce0cc" }}>
          {t[1]}
        </div>
        <div className="amount">{format(f.value)}</div>
        <p>
          Projected shortfall against buffer:{" "}
          <strong>{format(f.shortfall)}</strong>
        </p>
        <label>
          Forecast through
          <input
            type="date"
            value={end}
            min={b.snapshot?.date}
            onChange={(e) => {
              if (date.safeParse(e.target.value).success)
                setEnd(e.target.value);
            }}
          />
        </label>
        <p>
          Baseline includes confirmed plans. A later paycheck cannot cover an
          earlier bill.
        </p>
        {evidence(f)}
      </section>
      <div className="grid">
        <div>
          <section className="card">
            <h2>{t[3]}</h2>
            {!alerts.length && (
              <p>No active insights with sufficient evidence.</p>
            )}
            {alerts.map((i) => (
              <article key={i.id}>
                <h3>{i.title}</h3>
                <p>{i.action}</p>
                <p className="muted">
                  Snapshot freshness: {i.evidence.freshness}
                </p>
                {evidence(i.evidence)}
                <button
                  onClick={() =>
                    setHidden({ ...hidden, [i.id]: Number.MAX_SAFE_INTEGER })
                  }
                >
                  Dismiss
                </button>
                <button
                  onClick={() =>
                    setHidden({ ...hidden, [i.id]: Date.now() + 86400000 })
                  }
                >
                  Snooze 1 day
                </button>
              </article>
            ))}
            <button
              onClick={() => {
                setMessage(
                  "Local checks refreshed. Stable insight IDs prevent duplicate alerts.",
                );
                setHidden({ ...hidden });
              }}
            >
              Run insight checks
            </button>
          </section>
          <section className="card">
            <h2>Recorded spending</h2>
            <h3>{format(s.value)}</h3>
            {evidence(s)}
            <p className="muted">
              Category breakdown: gross recorded purchases (refunds are included
              only in the net total above).
            </p>
            {Object.entries(
              b.transactions
                .filter((t) => t.kind === "purchase" && !t.pending)
                .reduce<
                  Record<string, number>
                >((a, t) => ({ ...a, [t.category]: (a[t.category] ?? 0) + Math.abs(t.amount) }), {}),
            ).map(([category, value]) => (
              <p key={category}>
                {category}: {format(value)}
              </p>
            ))}
            <p>
              Comparison: insufficient evidence of equivalent account coverage.
            </p>
            <p>
              Savings goal: {format(b.goal.saved)} / {format(b.goal.target)}{" "}
              (user-entered plan)
            </p>
            {evidence({
              id: "goal",
              ...b.goal,
              assumptions: ["User-entered saved amount, not inferred cash"],
              freshness: b.snapshot?.date,
            })}
          </section>
        </div>
        <div>
          <section className="card" id="ask">
            <h2>{t[2]}</h2>
            <p className="muted">
              Demo summaries use bounded tools. Interface translations are
              provided; language quality has not been independently tested.
            </p>
            <label>
              Your question
              <input
                value={question}
                maxLength={1000}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <button onClick={ask}>Ask</button>
            {real && (
              <button
                onClick={async () => {
                  try {
                    const r = await fetch("/api/ask", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ question }),
                    });
                    if (!r.ok) throw Error("Live question failed");
                    setAnswer(await r.json());
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Ask configured model
              </button>
            )}
            <button
              onClick={() => setQuestion("Why did I spend more this month?")}
            >
              Compare periods
            </button>
            {answer !== null && (
              <pre aria-live="polite">{JSON.stringify(answer, null, 2)}</pre>
            )}
            <p>Suggested limit change</p>
            <button
              onClick={async () => {
                try {
                  const id = real ? await proposeLimit() : crypto.randomUUID();
                  setProposal({
                    id,
                    version: b.version,
                    before: b.limit,
                    after: 15000,
                  });
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Propose limit adjustment
            </button>
            {proposal && (
              <div>
                <p>
                  Spending limit: {format(proposal.before)} →{" "}
                  {format(proposal.after)}
                </p>
                <p>This updates a demo plan; it does not move money.</p>
                <button
                  onClick={async () => {
                    try {
                      if (real) {
                        if (b.version !== baseVersion)
                          throw Error(
                            "Save changes and reload before approval",
                          );
                        await approveLimit(proposal.id);
                        setBaseVersion(baseVersion + 1);
                      }
                      setB(approve(b, proposal, seen));
                      setSeen([...seen, proposal.id]);
                      setAudit([
                        ...audit,
                        `Confirmed ${proposal.id}: ${proposal.before} → ${proposal.after}`,
                      ]);
                      setProposal(null);
                      setMessage(
                        "Demo budget change approved. Audit recorded.",
                      );
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Confirm demo change
                </button>
              </div>
            )}
            <details>
              <summary>Approval audit</summary>
              <pre>{audit.join("\n") || "No approved changes."}</pre>
            </details>
          </section>
          <section className="card" id="import">
            <h2>{t[4]}</h2>
            <p>
              ISO dates YYYY-MM-DD. Negative amounts are debits, positive
              amounts are income. One currency ({b.currency}); classify refunds
              and transfers after import. Imports never infer a balance.
            </p>
            <a href="/sample.csv" download>
              Download sample CSV
            </a>
            <label>
              CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 1000000) {
                      setError("CSV must be under 1 MB");
                      return;
                    }
                    setRaw(await file.text());
                    setOverlap(false);
                  }
                }}
              />
            </label>
            {raw && (
              <>
                <h3>Column mapping</h3>
                {(Object.keys(mapping) as (keyof Mapping)[]).map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      value={mapping[k]}
                      onChange={(e) =>
                        setMapping({ ...mapping, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <pre>{JSON.stringify(parsed?.rows, null, 2)}</pre>
                {parsed?.errors.map((e) => (
                  <p className="error" key={e}>
                    {e}
                  </p>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={overlap}
                    onChange={(e) => setOverlap(e.target.checked)}
                  />{" "}
                  I reviewed potential overlaps with existing records. Separate
                  identical purchases may be legitimate.
                </label>
                <button
                  disabled={
                    !overlap || !!parsed?.errors.length || !parsed?.rows.length
                  }
                  onClick={confirmImport}
                >
                  Confirm import
                </button>
              </>
            )}
          </section>
        </div>
      </div>
      <section className="card">
        <h2>Transaction ledger</h2>
        <p className="muted">
          Cash movements use the original signed amount. Reclassifying internal
          transfers excludes both spending and aggregate liquid cash movement.
          Card purchases must be assigned to the card account.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Classification</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {b.transactions.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.merchant}</td>
                  <td>{format(row.amount)}</td>
                  <td>
                    <input
                      aria-label={`Category ${row.merchant}`}
                      value={row.category}
                      maxLength={80}
                      onChange={(e) =>
                        setB({
                          ...b,
                          version: b.version + 1,
                          transactions: b.transactions.map((t) =>
                            t.id === row.id
                              ? { ...t, category: e.target.value }
                              : t,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Classification ${row.merchant}`}
                      value={row.kind}
                      onChange={(e) =>
                        setB({
                          ...b,
                          version: b.version + 1,
                          transactions: b.transactions.map((t) =>
                            t.id === row.id
                              ? { ...t, kind: e.target.value as typeof t.kind }
                              : t,
                          ),
                        })
                      }
                    >
                      {[
                        "purchase",
                        "refund",
                        "income",
                        "transfer",
                        "card_payment",
                      ].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Account ${row.merchant}`}
                      value={row.account}
                      onChange={(e) =>
                        setB({
                          ...b,
                          version: b.version + 1,
                          transactions: b.transactions.map((t) =>
                            t.id === row.id
                              ? {
                                  ...t,
                                  account: e.target.value as typeof t.account,
                                }
                              : t,
                          ),
                        })
                      }
                    >
                      <option>cash</option>
                      <option>card</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card" id="settings">
        <h2>{t[5]}</h2>
        <p>
          One budget currency; existing records are never converted silently.
          Snapshot is closing liquid cash.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const data = new FormData(e.currentTarget);
              const snapshotDate = date.parse(data.get("date"));
              const balance = money(String(data.get("balance")));
              const buffer = money(String(data.get("buffer")));
              if (buffer < 0) throw Error("Buffer must be nonnegative");
              setB({
                ...b,
                snapshot: { date: snapshotDate, amount: balance },
                buffer,
                version: b.version + 1,
              });
              setMessage("Snapshot saved.");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <label>
            Snapshot date
            <input
              name="date"
              type="date"
              defaultValue={b.snapshot?.date}
              required
            />
          </label>
          <label>
            Liquid balance
            <input
              name="balance"
              defaultValue={(b.snapshot?.amount ?? 0) / 100}
              required
            />
          </label>
          <label>
            Cash buffer
            <input name="buffer" defaultValue={b.buffer / 100} required />
          </label>
          <button>Save snapshot</button>
        </form>
        <h3>Dated plans</h3>
        {b.plans.map((p) => (
          <p key={p.id}>
            {p.date} · {p.label} · {format(p.amount)} · {p.kind} ·{" "}
            {p.certain ? "confirmed" : "uncertain"}{" "}
            <button
              onClick={() =>
                setB({
                  ...b,
                  version: b.version + 1,
                  plans: b.plans.filter((x) => x.id !== p.id),
                })
              }
            >
              Remove {p.label}
            </button>
          </p>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const d = new FormData(e.currentTarget);
              const amount = money(String(d.get("amount")));
              if (amount <= 0) throw Error("Plan must be positive");
              setB({
                ...b,
                version: b.version + 1,
                plans: [
                  ...b.plans,
                  {
                    id: crypto.randomUUID(),
                    date: date.parse(d.get("date")),
                    amount,
                    kind: d.get("kind") as "bill" | "income",
                    label: String(d.get("label")).slice(0, 100),
                    certain: d.get("certain") === "on",
                    paidBy: String(d.get("paidBy")) || undefined,
                  },
                ],
              });
              setMessage("Plan added.");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <label>
            Plan name
            <input name="label" required maxLength={100} />
          </label>
          <label>
            Due date
            <input name="date" type="date" required />
          </label>
          <label>
            Plan amount
            <input name="amount" required />
          </label>
          <label>
            Plan type
            <select name="kind">
              <option>bill</option>
              <option>income</option>
            </select>
          </label>
          <label>
            <input name="certain" type="checkbox" /> Confirmed income
          </label>
          <label>
            Matched payment transaction ID (optional)
            <input name="paidBy" />
          </label>
          <button>Add plan</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const d = new FormData(e.currentTarget);
              const target = money(String(d.get("target"))),
                saved = money(String(d.get("saved")));
              if (target <= 0 || saved < 0) throw Error("Invalid goal");
              setB({ ...b, version: b.version + 1, goal: { target, saved } });
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <label>
            Goal target
            <input name="target" defaultValue={b.goal.target / 100} />
          </label>
          <label>
            Goal saved
            <input name="saved" defaultValue={b.goal.saved / 100} />
          </label>
          <button>Save goal</button>
        </form>
        <button
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(
              new Blob([JSON.stringify({ b, audit }, null, 2)], {
                type: "application/json",
              }),
            );
            a.download = "seshat-demo-export.json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          {real ? "Export workspace data" : "Export demo data"}
        </button>
        <button
          disabled={real}
          onClick={() => {
            if (
              confirm(
                "Delete all saved demo data and restore synthetic fixtures?",
              )
            ) {
              setB(demo);
              setHidden({});
              setSeen([]);
              setAudit([]);
              setMessage("Demo reset.");
            }
          }}
        >
          Reset demo
        </button>
      </section>
      <footer className="muted">
        Seshat · Projections are plans, not guarantees. No bank connections or
        money movement.
      </footer>
    </main>
  );
}
