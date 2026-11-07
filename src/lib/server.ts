import "server-only";
import { authCookieOptions } from "./security";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
export async function database() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw Error("Supabase is not configured");
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Error("APP_ORIGIN is required");
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(origin),
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server Components cannot persist cookies; actions and callback can. */
        }
      },
    },
  });
}
export async function authenticated() {
  const db = await database();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw Error("Authentication required");
  return { db, user: data.user };
}
