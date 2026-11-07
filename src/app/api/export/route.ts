import { z } from "zod";
import { authenticated } from "../../../lib/server";
import { RequestError } from "../../../lib/security";
import { collectExportPages } from "../../../lib/export";
const tableSchema = z.enum([
  "budgets",
  "records",
  "proposals",
  "audit",
  "alerts",
]);
export async function GET(req: Request) {
  try {
    if (req.headers.get("sec-fetch-site") === "cross-site")
      throw new RequestError(403, "Same-site download required");
    let session;
    try {
      session = await authenticated();
    } catch {
      throw new RequestError(401, "Authentication required");
    }
    const { db, user } = session;
    const { data: budgets, error } = await db
      .from("budgets")
      .select("id")
      .eq("owner", user.id);
    if (error) throw new RequestError(503, "Export unavailable");
    const ids = budgets.map((b) => b.id);
    async function read(table: z.infer<typeof tableSchema>, offset: number) {
      if (table !== "budgets" && !ids.length) return { rows: [], total: 0 };
      let q = db.from(table).select("*", { count: "exact" }).order("id");
      q = table === "budgets" ? q.eq("owner", user.id) : q.in("budget_id", ids);
      const { data, error, count } = await q.range(offset, offset + 499);
      if (error || count === null)
        throw new RequestError(503, "Export unavailable");
      return { rows: data ?? [], total: count };
    }
    const params = new URL(req.url).searchParams;
    const selected = params.get("table");
    let result: unknown;
    if (selected) {
      const table = tableSchema.parse(selected);
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000000)
        .parse(params.get("offset") ?? 0);
      const page = await read(table, offset);
      result = {
        table,
        ...page,
        offset,
        nextOffset:
          offset + page.rows.length < page.total
            ? offset + page.rows.length
            : null,
      };
    } else {
      const all: Record<string, unknown> = {};
      for (const table of tableSchema.options)
        all[table] = await collectExportPages((offset) => read(table, offset));
      result = all;
    }
    const body = JSON.stringify(result);
    if (new TextEncoder().encode(body).length > 5000000)
      throw new RequestError(
        413,
        "Use ?table=records&offset=0 and the returned nextOffset for paginated export",
      );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="seshat-export.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(
      e instanceof RequestError ? e.message : "Export unavailable",
      {
        status: e instanceof RequestError ? e.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
