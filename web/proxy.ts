import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// proxy.ts runs BEFORE every matching request (Next.js 16's name for "middleware").
// Two jobs:
//   1. Keep the login session fresh: if the access token is about to expire, Supabase
//      swaps the refresh token for a new pair, and we put the new cookies on the response.
//   2. Send signed-out visitors who open /upload or /videos to the login page.
//
// It's a convenience, not the security boundary: every API route checks the user again
// itself (see app/api/uploads/*), because a proxy can be bypassed by a misconfigured matcher.

const PROTECTED = ["/upload", "/videos"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          // Make refreshed cookies visible to this request's page/route AND send them to the browser.
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          // Supabase asks that responses carrying auth cookies are never cached.
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  // Checks (and if needed refreshes) the session. Don't put code between creating the
  // client and this call: it's what keeps users from being logged out at random.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;
  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Run on pages and API routes, but not on static files (JS/CSS chunks, images, favicon).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
