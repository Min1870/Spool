"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/server/env";
import { supabaseForUser } from "@/lib/supabase/server";

// Server Actions: functions that run on the server but can be called straight from a
// <form>. The browser posts the form, this code talks to Supabase Auth, and the session
// cookies are set on the response. No password ever touches our database.

// email is sent back so the form can keep it filled in (React resets forms after an action).
export type AuthState = { error?: string; message?: string; email?: string };

const credentials = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for the password."),
});

/** Only follow same-site paths after login (an attacker can't send you to evil.com). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/upload";
}

function parse(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const parsed = credentials.safeParse({ email, password: formData.get("password") });
  return parsed.success ? { data: parsed.data, email } : { error: parsed.error.issues[0]?.message ?? "Check the form.", email };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { data, error, email } = parse(formData);
  if (!data) return { error, email };

  const supabase = await supabaseForUser();
  const { error: authError } = await supabase.auth.signInWithPassword(data);
  if (authError) {
    return {
      error: authError.message === "Email not confirmed" ? "Confirm your email first (check your inbox)." : "Wrong email or password.",
      email,
    };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { data, error, email } = parse(formData);
  if (!data) return { error, email };
  const next = safeNext(formData.get("next"));

  const supabase = await supabaseForUser();
  const { data: result, error: authError } = await supabase.auth.signUp({
    ...data,
    // Where the "confirm your email" link sends you back to.
    options: { emailRedirectTo: `${env().APP_ORIGIN}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (authError) return { error: authError.message, email };

  // With "Confirm email" turned off in Supabase you're signed in right away.
  if (result.session) redirect(next);
  return { email, message: "Almost there: we sent you an email. Click the link in it to finish creating your account." };
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseForUser();
  await supabase.auth.signOut();
  redirect("/");
}
