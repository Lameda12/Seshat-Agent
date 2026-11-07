import { it, expect } from "vitest";
import { collectExportPages } from "../src/lib/export";
it("exports all rows despite a server page cap lower than requested", async () => {
  const rows = Array.from({ length: 501 }, (_, id) => ({ id }));
  expect(
    await collectExportPages(async (offset) => ({
      rows: rows.slice(offset, offset + 100),
      total: 501,
    })),
  ).toEqual(rows);
});
it("refuses silent truncation, changing counts, excessive rows and excessive data", async () => {
  await expect(
    collectExportPages(async () => ({ rows: [], total: 1 })),
  ).rejects.toHaveProperty("status", 503);
  let calls = 0;
  await expect(
    collectExportPages(async () => ({
      rows: [{ id: calls }],
      total: ++calls === 1 ? 2 : 3,
    })),
  ).rejects.toHaveProperty("status", 409);
  await expect(
    collectExportPages(async () => ({ rows: [], total: 10001 })),
  ).rejects.toHaveProperty("status", 413);
  await expect(
    collectExportPages(
      async () => ({ rows: [{ data: "x".repeat(100) }], total: 1 }),
      10000,
      10,
    ),
  ).rejects.toHaveProperty("status", 413);
});
