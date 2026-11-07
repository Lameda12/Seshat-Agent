import { z } from "zod";
import { authenticated } from "../../../lib/server";
import { budgetSchema } from "../../../lib/engine";
import { grounded } from "../../../lib/tools";
import { OpenAIProvider } from "../../../lib/provider";
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length")) > 5000)
      return new Response("Too large", { status: 413 });
    const { db } = await authenticated();
    const { question } = z
      .object({ question: z.string().max(1000) })
      .parse(await req.json());
    const { data, error } = await db.from("budgets").select("state").single();
    if (error) throw error;
    const result = await grounded(
      new OpenAIProvider(),
      budgetSchema.parse(data.state),
      question,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("Authenticated budget required", { status: 401 });
  }
}
