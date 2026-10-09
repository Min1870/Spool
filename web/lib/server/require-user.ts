import "server-only";
import type { NextResponse } from "next/server";
import { currentUser, type CurrentUser } from "@/lib/supabase/server";
import { errorResponse } from "./http";

/**
 * For API routes that need a signed-in user. Returns the user, or a ready-made 401
 * response. The browser can't fake this: the session cookie's signature is checked.
 */
export async function requireUser(): Promise<{ user: CurrentUser; response?: undefined } | { user?: undefined; response: NextResponse }> {
  const user = await currentUser();
  if (!user) return { response: errorResponse(401, "Please sign in to upload.") };
  return { user };
}
