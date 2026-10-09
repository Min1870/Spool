import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/server/env";

// A Supabase client that acts AS THE LOGGED-IN USER (not as the admin).
//
// How login works: when you sign in, Supabase gives the browser two tokens (a short-lived
// "access token" and a "refresh token"). @supabase/ssr stores them in cookies, so every
// request to our server carries them. This client reads those cookies to know who you are,
// and writes refreshed ones when the access token is about to expire.
//
// It uses the PUBLISHABLE key, so Row Level Security applies: it can only see what the
// user is allowed to see. (supabaseAdmin() in lib/server/supabase.ts is the all-powerful one.)
export async function supabaseForUser() {
  const cookieStore = await cookies();
  return createServerClient(env().NEXT_PUBLIC_SUPABASE_URL, env().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. That's fine: proxy.ts refreshes the
          // session cookies on every request before the page renders.
        }
      },
    },
  });
}

export type CurrentUser = { id: string; email: string | null };

/**
 * Who is signed in, or null. getClaims() checks the access token's signature, so a
 * tampered or expired cookie is rejected (never trust the cookie contents blindly).
 */
export async function currentUser(): Promise<CurrentUser | null> {
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
}
