import { z } from "zod";
import { Budget, forecast, spending, equivalent, date, money } from "./engine";
export const toolInput = z
  .strictObject({
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
  })
  .refine(
    (t) =>
      t.end >= t.start &&
      Date.parse(t.end) - Date.parse(t.start) <= 366 * 86400000,
    "Select an ordered range of at most 367 days",
  )
  .refine(
    (t) => t.name !== "purchase" || t.amount !== undefined,
    "Purchase scenarios require an explicit amount",
  );
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
    case "purchase": {
      const scenario = forecast(
        {
          ...b,
          snapshot: b.snapshot
            ? { ...b.snapshot, amount: b.snapshot.amount - t.amount! }
            : null,
        },
        t.end,
      );
      return {
        ...scenario,
        id: "purchase_scenario",
        inputs: {
          recordedSnapshot: b.snapshot,
          reservedPurchase: t.amount,
          effectiveCashStart: b.snapshot ? b.snapshot.amount - t.amount! : null,
          buffer: b.buffer,
          plans: b.plans,
        },
        assumptions: [
          ...scenario.assumptions,
          "Hypothetical purchase is reserved immediately; recorded balances are unchanged.",
        ],
      };
    }
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
export type ToolContext = { start: string; end: string };
export interface ModelProvider {
  select(question: string, context: ToolContext): Promise<unknown>;
}
export function purchaseAmount(
  question: string,
  currency: string,
): number | null {
  const matches = [
    ...question.matchAll(
      /(?:([$₽₸])\s*|\b(?:spend|spending|purchase)\s+)(\d+(?:\.\d{1,2})?)(?![\d.,]|\s+\d)/gi,
    ),
  ];
  if (matches.length !== 1) return null;
  const [, symbol, value] = matches[0];
  if (symbol && { $: "USD", "₽": "RUB", "₸": "KZT" }[symbol] !== currency)
    return null;
  try {
    return money(value);
  } catch {
    return null;
  }
}
export async function grounded(
  provider: ModelProvider,
  b: Budget,
  question: string,
  context: ToolContext = {
    start: new Date().toISOString().slice(0, 7) + "-01",
    end: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  },
) {
  try {
    const selection = modelSelection.parse(
      await provider.select(question.slice(0, 1000), context),
    );
    const allowedDates = new Set([
      context.start,
      context.end,
      ...(question.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []),
    ]);
    if (
      !allowedDates.has(selection.tool.start) ||
      !allowedDates.has(selection.tool.end)
    )
      throw Error("Unrequested model dates");
    if (
      selection.tool.name === "purchase" &&
      selection.tool.amount !== purchaseAmount(question, b.currency)
    )
      throw Error("Unrequested model amount");
    return {
      language: selection.language,
      selection: selection.tool,
      result: runTool(b, selection.tool),
    };
  } catch {
    return {
      language: "en",
      result: forecast(b, context.end),
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
