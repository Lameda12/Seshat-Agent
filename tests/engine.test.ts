import { describe, it, expect } from "vitest";
import { demo } from "../src/lib/demo";
import {
  forecast,
  money,
  spending,
  equivalent,
  insights,
} from "../src/lib/engine";
import { preview, mergeImport } from "../src/lib/import";
describe("independently worked financial examples", () => {
  it("800 - 700 = 100 before 500 income; buffer 150 means 50 short", () => {
    const f = forecast(demo, "2026-11-14");
    expect(f.value).toBe(0);
    expect(f.shortfall).toBe(5000);
    expect(f.lowest).toBe(10000);
  });
  it("parses exact minor units", () => {
    expect(money("0.29")).toBe(29);
    expect(money("-10.01")).toBe(-1001);
    expect(() => money("1.001")).toThrow();
  });
  it("counts card purchases but excludes transfers and card payments; refunds reduce spending", () => {
    const t = demo.transactions[0];
    const b = {
      ...demo,
      transactions: [
        { ...t, id: "a", amount: -10000, account: "card" as const },
        { ...t, id: "b", amount: -10000, kind: "card_payment" as const },
        { ...t, id: "c", amount: -5000, kind: "transfer" as const },
        { ...t, id: "d", amount: 2000, kind: "refund" as const },
      ],
    };
    expect(spending(b, "2026-11-01", "2026-11-30").value).toBe(8000);
  });
  it("does not count movements included in snapshot or reserve matched bills twice", () => {
    const b = {
      ...demo,
      transactions: [
        {
          ...demo.transactions[0],
          id: "paid",
          date: "2026-11-08",
          amount: -70000,
        },
      ],
      plans: [{ ...demo.plans[0], paidBy: "paid" }],
    };
    expect(forecast(b, "2026-11-14").lowest).toBe(10000);
  });
  it("debits precede same day credits; uncertain income excluded", () => {
    const b = {
      ...demo,
      plans: demo.plans.map((p) => ({ ...p, date: "2026-11-08" })),
    };
    expect(forecast(b, "2026-11-14").shortfall).toBe(5000);
    expect(
      forecast(
        { ...b, plans: b.plans.map((p) => ({ ...p, certain: false })) },
        "2026-11-14",
      ).lowest,
    ).toBe(10000);
  });
  it("missing snapshot is unknown", () =>
    expect(
      forecast({ ...demo, snapshot: null }, "2026-11-14").value,
    ).toBeNull());
  it("equivalent periods have equal days across month boundary", () =>
    expect(equivalent("2026-03-01", "2026-03-07")).toEqual({
      start: "2026-02-22",
      end: "2026-02-28",
    }));
  it("stable insight identifiers deduplicate retries and expose freshness", () => {
    expect(insights(demo, "2026-11-14")).toEqual(insights(demo, "2026-11-14"));
    expect(insights(demo, "2026-11-14")[0].evidence.freshness).toBe(
      "2026-11-07",
    );
  });
  it("repeated import leaves totals unchanged; identical purchases in one file survive", () => {
    const p = preview(
      "date,amount,merchant,category\n2026-11-07,-1.10,Cafe,Food\n2026-11-07,-1.10,Cafe,Food",
      {
        date: "date",
        amount: "amount",
        merchant: "merchant",
        category: "category",
      },
      "USD",
    );
    expect(p.errors).toEqual([]);
    const once = mergeImport([], p.rows, "hash");
    expect(once).toHaveLength(2);
    expect(mergeImport(once, p.rows, "hash")).toEqual(once);
  });
  it("row-specific errors", () =>
    expect(
      preview(
        "date,amount,merchant\nwrong,1.123,Cafe",
        {
          date: "date",
          amount: "amount",
          merchant: "merchant",
          category: "category",
        },
        "USD",
      ).errors[0],
    ).toContain("Row 2"));
});
it("excludes pending income but reserves pending debits; never includes other currencies", () => {
  const t = demo.transactions[0];
  const b = {
    ...demo,
    plans: [],
    transactions: [
      { ...t, id: "credit", date: "2026-11-08", pending: true, amount: 100000 },
      { ...t, id: "debit", date: "2026-11-08", pending: true, amount: -10000 },
      {
        ...t,
        id: "foreign",
        date: "2026-11-08",
        currency: "KZT",
        amount: -50000,
      },
    ],
  };
  expect(forecast(b, "2026-11-14").value).toBe(55000);
  expect(spending(b, "2026-11-01", "2026-11-14").value).toBe(0);
});
it("unmatched payment references cannot erase a bill", () => {
  const b = { ...demo, plans: [{ ...demo.plans[0], paidBy: "groceries" }] };
  expect(forecast(b, "2026-11-14").shortfall).toBe(5000);
});
it("aggregate liquid internal transfer is not a cash loss", () => {
  const b = {
    ...demo,
    plans: [],
    transactions: [
      {
        ...demo.transactions[0],
        date: "2026-11-08",
        kind: "transfer" as const,
        amount: -10000,
      },
    ],
  };
  expect(forecast(b, "2026-11-14").value).toBe(65000);
});
it("unpaid overdue obligations are reserved immediately", () => {
  const b = { ...demo, plans: [{ ...demo.plans[0], date: "2026-11-01" }] };
  expect(forecast(b, "2026-11-14").shortfall).toBe(5000);
});
it("one payment cannot discharge two bills", () => {
  const b = {
    ...demo,
    plans: [
      { ...demo.plans[0], paidBy: "payment" },
      { ...demo.plans[0], id: "second", paidBy: "payment" },
    ],
    transactions: [
      {
        ...demo.transactions[0],
        id: "payment",
        date: "2026-11-08",
        amount: -70000,
      },
    ],
  };
  expect(forecast(b, "2026-11-14").lowest).toBe(-60000);
});
