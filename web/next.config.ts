import type { NextConfig } from "next";

// Env vars: there is ONE .env file, at the repo root. The npm scripts in package.json
// start Next through scripts/next-with-env.mjs, which loads ../.env first, so every
// Next process (including the ones that run API routes) gets those variables. On a
// server without a .env file, real environment variables are used instead.
//
// Shared code (types, queue name, storage paths) lives in web/shared/ and the worker
// imports it from there. It's inside web/ on purpose: Next's bundler only watches and
// compiles files inside its own folder, and widening that to the whole repo made it
// rebuild in an endless loop (it saw its own log file change on every request).
const nextConfig: NextConfig = {
  // Who may show our pages inside an <iframe> ("frame-ancestors").
  //   /embed/*        → any website (that's the point of an embed)
  //   everything else → only our own site. This blocks "clickjacking": a malicious site
  //                     loading our upload or login page invisibly in a frame and
  //                     tricking you into clicking buttons on it.
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Every path that does NOT start with /embed/ (a regular expression in the path).
        source: "/:path((?!embed/).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" }, // the same rule, for older browsers
        ],
      },
    ];
  },
};

export default nextConfig;
