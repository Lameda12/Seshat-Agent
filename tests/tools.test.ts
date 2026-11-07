import { it, expect } from "vitest";
import { approve, grounded } from "../src/lib/tools";
import { demo } from "../src/lib/demo";
it("rejects stale approvals and makes retry idempotent", () => {
  const p = { id: "p", version: 0, before: 20000, after: 15000 };
  const next = approve(demo, p, []);
  expect(next.limit).toBe(15000);
  expect(approve(next, p, ["p"])).toEqual(next);
  expect(() => approve(next, p, [])).toThrow("Stale");
});
it("invalid model prose and unsupported financial claims fall back", async () => {
  const answer = await grounded(
    { select: async () => ({ text: "You have $9999" }) },
    demo,
    "Can I spend?",
  );
  expect(answer.fallback).toBe(true);
  expect(answer.result).toHaveProperty("value", 0);
});
