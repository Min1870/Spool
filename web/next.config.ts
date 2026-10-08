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
const nextConfig: NextConfig = {};

export default nextConfig;
