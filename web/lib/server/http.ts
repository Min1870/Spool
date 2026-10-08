import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

/** Every API error is JSON: { error: "human-readable message" }. */
export function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Read and validate a JSON request body. Returns the parsed data, or a ready-made
 * 400 response explaining what was wrong.
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S>; response?: undefined } | { data?: undefined; response: NextResponse }> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return { response: errorResponse(400, `Invalid request. ${where}${first?.message ?? ""}`.trim()) };
  }
  return { data: parsed.data };
}

/** Log the real error on the server, return a generic message to the browser. */
export function serverError(context: string, err: unknown) {
  console.error(`[api] ${context}:`, err);
  return errorResponse(500, "Something went wrong on our side. Please try again.");
}
