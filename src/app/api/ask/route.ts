import { z } from "zod";
import { authenticated } from "../../../lib/server";
import { validatedBudget } from "../../../lib/engine";
import { grounded } from "../../../lib/tools";
import { OpenAIProvider } from "../../../lib/provider";
import {
  boundedJson,
  boundedResult,
  RequestError,
  requireSameOrigin,
} from "../../../lib/security";
export async function POST(req: Request) {
  try {
    requireSameOrigin(req, process.env.APP_ORIGIN);
    const body = z
      .strictObject({ question: z.string().trim().min(1).max(1000) })
      .safeParse(await boundedJson(req, 5000));
    if (!body.success) throw new RequestError(400, "Invalid question");
    let session;
    try {
      session = await authenticated();
    } catch {
      throw new RequestError(401, "Authentication required");
    }
    const { db, user } = session;
    const { data, error } = await db
      .from("budgets")
      .select("state")
      .eq("owner", user.id)
      .single();
    if (error) throw new RequestError(503, "Budget unavailable");
    if (process.env.MODEL_API_KEY) {
      const { data: allowed, error } = await db.rpc("consume_model_quota");
      if (error) throw new RequestError(503, "Model quota unavailable");
      if (!allowed)
        return new Response("Model request quota exceeded", {
          status: 429,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        });
    }
    const result = await grounded(
      new OpenAIProvider(),
      validatedBudget.parse(data.state),
      body.data.question,
    );
    return Response.json(boundedResult(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 503;
    return new Response(
      error instanceof RequestError
        ? error.message
        : "Question service unavailable",
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
