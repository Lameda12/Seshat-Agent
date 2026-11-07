import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { budgetSchema, insights } from "../../../lib/engine";
export async function POST(req: Request) {
  const expected = process.env.SCHEDULER_SECRET;
  const received = req.headers.get("authorization") ?? "";
  const wanted = `Bearer ${expected}`;
  if (
    !expected ||
    Buffer.byteLength(received) !== Buffer.byteLength(wanted) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(wanted))
  )
    return new Response("Unauthorized", { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return Response.json(
      { error: "Scheduler database credentials missing" },
      { status: 503 },
    );
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("budgets")
    .select("id,state")
    .limit(1000);
  if (error) return new Response("Job read failed", { status: 503 });
  let count = 0;
  const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  for (const row of data) {
    const parsed = budgetSchema.safeParse(row.state);
    if (!parsed.success) continue;
    for (const i of insights(parsed.data, end)) {
      const { error } = await db
        .from("alerts")
        .upsert(
          { budget_id: row.id, fingerprint: i.id, evidence: i },
          { onConflict: "budget_id,fingerprint", ignoreDuplicates: true },
        );
      if (error)
        return new Response("Job write failed; safe to retry", { status: 503 });
      count++;
    }
  }
  return Response.json({
    checked: data.length,
    insights: count,
    hasMore: data.length === 1000,
  });
}
