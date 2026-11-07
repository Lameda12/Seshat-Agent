import { z } from "zod";
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
  );
export const minor = z
  .number()
  .int()
  .safe()
  .min(-100000000000)
  .max(100000000000);
export const transaction = z.object({
  id: z.string(),
  date,
  amount: minor,
  currency: z.string().length(3),
  merchant: z.string().max(200),
  category: z.string().max(80),
  kind: z.enum(["purchase", "refund", "income", "transfer", "card_payment"]),
  account: z.enum(["cash", "card"]),
  pending: z.boolean().default(false),
  source: z.string(),
});
export type Transaction = z.infer<typeof transaction>;
export type Plan = {
  id: string;
  date: string;
  amount: number;
  kind: "bill" | "income";
  label: string;
  certain: boolean;
  paidBy?: string;
};
export type Budget = {
  currency: string;
  snapshot: { date: string; amount: number } | null;
  buffer: number;
  transactions: Transaction[];
  plans: Plan[];
  limit: number;
  version: number;
  goal: { target: number; saved: number };
  alertStates?: Record<string, number>;
};
export type Metric = {
  inputs?: unknown;
  sourceRows?: Transaction[];
  id: string;
  value: number | null;
  currency: string;
  range: string[];
  sources: string[];
  exclusions: string[];
  assumptions: string[];
  freshness: string;
};
export function money(text: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(text))
    throw Error("Use a decimal amount with at most two decimal places");
  const negative = text.startsWith("-");
  const [whole, decimal = ""] = text.replace("-", "").split(".");
  const n = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100000000000)
    throw Error("Amount too large");
  return negative ? -n : n;
}
export function spending(b: Budget, start: string, end: string): Metric {
  const rows = b.transactions.filter(
    (t) =>
      t.date >= start &&
      t.date <= end &&
      t.currency === b.currency &&
      !t.pending &&
      (t.kind === "purchase" || t.kind === "refund"),
  );
  return {
    id: "spending",
    sourceRows: rows,
    value: rows.reduce(
      (s, t) =>
        s + (t.kind === "refund" ? -Math.abs(t.amount) : Math.abs(t.amount)),
      0,
    ),
    currency: b.currency,
    range: [start, end],
    sources: rows.map((t) => t.id),
    exclusions: [
      "Transfers, income, card payments, pending rows and other currencies",
    ],
    assumptions: [
      "Refunds reduce spending on their recorded date; purchases include credit cards.",
    ],
    freshness: b.snapshot?.date ?? "Unknown",
  };
}
export function forecast(
  b: Budget,
  end: string,
): Metric & {
  shortfall: number | null;
  lowest: number | null;
  events: { id: string; date: string; amount: number; balance: number }[];
} {
  const base = {
    id: "available",
    inputs: { snapshot: b.snapshot, buffer: b.buffer, plans: b.plans },
    currency: b.currency,
    range: [b.snapshot?.date ?? "unknown", end],
    sources: [] as string[],
    exclusions: [
      "Uncertain income, pending credits, card purchases (card bills are separate), and movements on/before the closing snapshot",
    ],
    assumptions: [
      "Snapshot is closing liquid cash, excludes investments and credit limits.",
      "Debits precede credits on the same date. Pending cash debits are reserved. Uncertain income is excluded. Unpaid overdue bills are reserved immediately; one payment can discharge only one plan.",
    ],
    freshness: b.snapshot?.date ?? "Unknown",
  };
  if (!b.snapshot || end < b.snapshot.date)
    return { ...base, value: null, shortfall: null, lowest: null, events: [] };
  const movements = b.transactions
    .filter(
      (t) =>
        t.currency === b.currency &&
        t.account === "cash" &&
        t.kind !== "transfer" &&
        t.date > b.snapshot!.date &&
        t.date <= end &&
        (!t.pending || t.amount < 0),
    )
    .map((t) => ({ id: t.id, date: t.date, amount: t.amount }));
  const matched = new Set<string>();
  const usedPayments = new Set<string>();
  for (const p of b.plans) {
    const payment = b.transactions.find(
      (t) =>
        t.id === p.paidBy &&
        !usedPayments.has(t.id) &&
        !t.pending &&
        t.kind !== "transfer" &&
        t.account === "cash" &&
        t.currency === b.currency &&
        t.amount === -p.amount &&
        t.date <= end,
    );
    if (payment) {
      matched.add(p.id);
      usedPayments.add(payment.id);
    }
  }
  for (const p of b.plans) {
    if (
      (p.kind === "bill" || p.date > b.snapshot.date) &&
      p.date <= end &&
      !matched.has(p.id) &&
      (p.kind === "bill" || p.certain)
    )
      movements.push({
        id: p.id,
        date: p.date < b.snapshot.date ? b.snapshot.date : p.date,
        amount: p.kind === "bill" ? -p.amount : p.amount,
      });
  }
  movements.sort((a, c) => a.date.localeCompare(c.date) || a.amount - c.amount);
  let balance = b.snapshot.amount;
  let lowest = balance;
  const events = movements.map((e) => {
    balance += e.amount;
    lowest = Math.min(lowest, balance);
    return { ...e, balance };
  });
  return {
    ...base,
    value: Math.max(0, lowest - b.buffer),
    shortfall: Math.max(0, b.buffer - lowest),
    lowest,
    events,
    sources: ["snapshot", ...movements.map((e) => e.id)],
  };
}
export function equivalent(start: string, end: string) {
  const s = new Date(start + "T00:00:00Z"),
    e = new Date(end + "T00:00:00Z");
  const days = Math.round((+e - +s) / 86400000) + 1;
  return {
    start: new Date(+s - days * 86400000).toISOString().slice(0, 10),
    end: new Date(+s - 86400000).toISOString().slice(0, 10),
  };
}
export function insights(b: Budget, end: string) {
  const f = forecast(b, end);
  const list: {
    id: string;
    title: string;
    action: string;
    evidence: Metric;
  }[] = [];
  if (f.shortfall)
    list.push({
      id: "buffer",
      title: "Cash may fall below your buffer",
      action: "Review upcoming bills before discretionary spending.",
      evidence: f,
    });
  const m = spending(b, b.snapshot?.date ?? end, end);
  if (m.value !== null && m.value > b.limit)
    list.push({
      id: "limit",
      title: "Spending exceeds your limit",
      action: "Review your spending limit.",
      evidence: m,
    });
  for (const p of b.plans.filter(
    (p) =>
      p.kind === "bill" &&
      p.date > (b.snapshot?.date ?? end) &&
      p.date <= end &&
      !p.paidBy,
  ))
    list.push({
      id: p.id,
      title: `Upcoming: ${p.label}`,
      action: "Check that cash is available on the due date.",
      evidence: f,
    });
  return list;
}
export const budgetSchema = z
  .object({
    alertStates: z.record(z.string(), z.number()).optional(),
    currency: z.enum(["USD", "RUB", "KZT"]),
    snapshot: z.object({ date, amount: minor }).nullable(),
    buffer: minor.nonnegative(),
    transactions: z.array(transaction).max(10000),
    plans: z
      .array(
        z.object({
          id: z.string(),
          date,
          amount: minor.positive(),
          kind: z.enum(["bill", "income"]),
          label: z.string().max(100),
          certain: z.boolean(),
          paidBy: z.string().optional(),
        }),
      )
      .max(1000),
    limit: minor.nonnegative(),
    version: z.number().int().nonnegative(),
    goal: z.object({ target: minor.positive(), saved: minor.nonnegative() }),
  })
  .refine(
    (b) => b.transactions.every((t) => t.currency === b.currency),
    "Mixed currency budget",
  );
