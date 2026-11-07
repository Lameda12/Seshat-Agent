import { authenticated } from "../../../lib/server";
export async function GET() {
  try {
    const { db } = await authenticated();
    const tables = [
      "budgets",
      "records",
      "proposals",
      "audit",
      "alerts",
    ] as const;
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      const { data, error } = await db.from(table).select("*").limit(10000);
      if (error) throw error;
      result[table] = data;
    }
    return Response.json(result, {
      headers: {
        "Content-Disposition": 'attachment; filename="seshat-export.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Authentication required or export unavailable", {
      status: 401,
    });
  }
}
