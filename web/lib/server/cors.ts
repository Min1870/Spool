import "server-only";

// CORS (Cross-Origin Resource Sharing) headers for our PUBLIC API.
//
// Browsers block JavaScript on one site (say https://myblog.com) from reading responses
// from another site (our API) unless the API says it's OK. These headers say: anyone may
// read this, with a plain GET. That's safe here because the data is public anyway (the
// same as the watch page) and the API never uses cookies or changes anything.
//
// Note: only routes that are meant for other websites get these. The upload API does NOT:
// there, the browser's default "same site only" rule is exactly what we want.
export const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Browsers may remember this "OK" for a day instead of asking before every request.
  "Access-Control-Max-Age": "86400",
} as const;
