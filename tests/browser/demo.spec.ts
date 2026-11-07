import { test, expect } from "@playwright/test";
test("demo import, evidence, question, insight and approval persist through reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.screenshot({
    path: test.info().outputPath("demo.png"),
    fullPage: true,
  });
  await expect(
    page.getByText("Projected shortfall against buffer:"),
  ).toContainText("$50.00");
  await page.locator(".hero summary").click();
  await expect(page.locator(".hero pre")).toContainText('"lowest": 10000');
  await page.getByLabel("CSV file").setInputFiles("public/sample.csv");
  await page
    .getByLabel("I reviewed potential overlaps", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Imported 2 rows");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator("#ask pre").first()).toContainText("deterministic");
  await page.getByRole("button", { name: "Propose limit adjustment" }).click();
  await expect(page.locator("#ask")).toContainText("$200.00 → $150.00");
  await page.getByRole("button", { name: "Confirm demo change" }).click();
  await page.reload();
  await expect(page.getByText("Demo Cafe", { exact: true })).toBeVisible();
  await page.getByText("Approval audit", { exact: true }).click();
  await expect(page.locator("#ask pre")).toContainText("Confirmed");
  await page.getByLabel("CSV file").setInputFiles("public/sample.csv");
  await page
    .getByLabel("I reviewed potential overlaps", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("already imported");
  await page.getByRole("button", { name: "Snooze 1 day" }).first().click();
  await expect(page.locator("body")).toContainText("Upcoming: Rent");
  expect(errors).toEqual([]);
});
test("unconfigured real account and unauthorized scheduler are explicit", async ({
  page,
  request,
}) => {
  await page.goto("/account");
  await expect(
    page.getByText("Supabase is not configured.", { exact: false }),
  ).toBeVisible();
  const r = await request.post("/api/job");
  expect(r.status()).toBe(401);
});
