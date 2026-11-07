"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticated, database } from "../../lib/server";
export async function signIn(data: FormData) {
  const email = z.string().max(320).email().parse(data.get("email"));
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Error("APP_ORIGIN is required");
  const db = await database();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) throw Error("Could not send sign-in email");
}
export async function confirmProposal(data: FormData) {
  const id = z.string().uuid().parse(data.get("proposal"));
  const { db } = await authenticated();
  const { error } = await db.rpc("approve_proposal", { proposal_id: id });
  if (error) throw Error("Approval rejected: proposal may be stale");
  revalidatePath("/account");
}
export async function deleteBudget(data: FormData) {
  if (data.get("confirm") !== "on")
    throw Error("Explicit deletion confirmation required");
  const { db, user } = await authenticated();
  const { error } = await db.from("budgets").delete().eq("owner", user.id);
  if (error) throw Error("Could not delete budget");
  revalidatePath("/account");
}
export async function createBudget(data: FormData) {
  const { db, user } = await authenticated();
  const currency = z.enum(["USD", "KZT", "RUB"]).parse(data.get("currency"));
  const { error } = await db.from("budgets").insert({
    owner: user.id,
    currency,
    state: {
      currency,
      snapshot: null,
      buffer: 0,
      transactions: [],
      plans: [],
      limit: 0,
      version: 0,
      goal: { target: 100000, saved: 0 },
    },
  });
  if (error) throw Error("Could not create budget");
  revalidatePath("/account");
}
export async function exportBudget() {
  await headers();
  const { db } = await authenticated();
  const { data, error } = await db.from("budgets").select("*");
  if (error) throw Error("Export failed");
  return data;
}
export async function saveBudget(input: unknown, expectedVersion: number) {
  const { validatedBudget } = await import("../../lib/engine");
  const state = validatedBudget.parse(input);
  const { db } = await authenticated();
  const { error } = await db.rpc("save_budget", {
    new_state: state,
    expected_version: z.number().int().nonnegative().parse(expectedVersion),
  });
  if (error)
    throw Error("Save failed. Reload to check for concurrent changes.");
  revalidatePath("/account");
}
export async function proposeLimit() {
  const { db, user } = await authenticated();
  const { data: b, error } = await db
    .from("budgets")
    .select("id,version,state")
    .eq("owner", user.id)
    .single();
  if (error || !b?.state) throw Error("Save your budget first");
  const { data: p, error: failure } = await db
    .from("proposals")
    .insert({
      budget_id: b.id,
      expected_version: b.version,
      before_limit: b.state.limit,
      after_limit: 15000,
    })
    .select("id")
    .single();
  if (failure) throw Error("Could not propose change");
  return p.id as string;
}
export async function approveLimit(id: string) {
  const { db } = await authenticated();
  const { error } = await db.rpc("approve_proposal", {
    proposal_id: z.string().uuid().parse(id),
  });
  if (error) throw Error("Stale or unavailable proposal; reload and review");
  revalidatePath("/account");
}

export async function signOut() {
  const { db } = await authenticated();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) throw Error("Sign-out failed");
  redirect("/");
}
