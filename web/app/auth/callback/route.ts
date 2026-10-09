import { NextResponse, type NextRequest } from "next/server";
import { supabaseForUser } from "@/lib/supabase/server";

// GET /auth/callback?code=...: where the "confirm your email" link lands.
// Supabase adds a one-time `code`; we swap it for a session (which sets the login
// cookies) and send the user on to where they were going.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/upload";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/upload";

  if (code) {
    const supabase = await supabaseForUser();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
