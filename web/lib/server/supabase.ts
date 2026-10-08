import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// A Supabase client that uses the SECRET key. It bypasses Row Level Security, so it
// must only ever run on the server (API routes, Server Components).
let client: SupabaseClient | undefined;

export function supabaseAdmin(): SupabaseClient {
  client ??= createClient(env().NEXT_PUBLIC_SUPABASE_URL, env().SUPABASE_SECRET_KEY, {
    // Server code has no logged-in user session to remember or refresh.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
