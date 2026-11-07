import { z } from "zod";
import { Budget, forecast, spending, equivalent, date } from "./engine";
export const toolInput = z.object({
  name: z.enum([
    "spending",
    "comparison",
    "transactions",
    "bills",
    "forecast",
    "purchase",
    "goal",
  ]),
  start: date,
  end: date,
  amount: z.number().int().min(0).max(100000000).optional(),
});
export function runTool(b: Budget, input: z.infer<typeof toolInput>) {
  const t = toolInput.parse(input);
  switch (t.name) {
    case "spending":
      return spending(b, t.start, t.end);
    case "comparison": {
      const p = equivalent(t.start, t.end);
      return {
        current: spending(b, t.start, t.end),
        previous: spending(b, p.start, p.end),
        comparable: false,
        reason:
          "Account coverage has not been independently established; no causal comparison available.",
      };
    }
    case "transactions":
      return b.transactions
        .filter((r) => r.date >= t.start && r.date <= t.end)
        .slice(0, 50);
    case "bills":
      return b.plans.filter(
        (p) => p.kind === "bill" && p.date >= t.start && p.date <= t.end,
      );
    case "forecast":
      return forecast(b, t.end);
    case "purchase":
      return forecast(
        {
          ...b,
          snapshot: b.snapshot
            ? { ...b.snapshot, amount: b.snapshot.amount - (t.amount ?? 0) }
            : null,
        },
        t.end,
      );
    case "goal":
      return {
        id: "goal",
        saved: b.goal.saved,
        target: b.goal.target,
        source: "user-entered goal; not inferred from cash",
      };
  }
}
// Model output is a bounded selection of metric references, never arbitrary prose or SQL.
export const modelSelection = z
  .object({ tool: toolInput, language: z.enum(["en", "ru", "kk"]) })
  .strict();
export interface ModelProvider {
  select(question: string): Promise<unknown>;
}
export async function grounded(
  provider: ModelProvider,
  b: Budget,
  question: string,
) {
  try {
    const selection = modelSelection.parse(
      await provider.select(question.slice(0, 1000)),
    );
    return { language: selection.language, result: runTool(b, selection.tool) };
  } catch {
    return {
      language: "en",
      result: forecast(
        b,
        new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      ),
      fallback: true,
    };
  }
}
export type Proposal = {
  id: string;
  version: number;
  before: number;
  after: number;
};
export function approve(b: Budget, p: Proposal, seen: string[]) {
  if (seen.includes(p.id)) return b;
  if (b.version !== p.version || b.limit !== p.before)
    throw Error("Stale proposal; refresh and review again");
  if (!Number.isSafeInteger(p.after) || p.after < 0)
    throw Error("Invalid limit");
  return { ...b, limit: p.after, version: b.version + 1 };
}
