// Starts the Next.js CLI with the repo-root .env loaded.
//
//   node scripts/next-with-env.mjs dev     (what `npm run dev` runs)
//
// Why: Spool has ONE .env file at the repo root, shared by docker-compose, this app and
// the worker. Next.js only looks for .env files inside web/, and it starts several
// processes (API routes run in their own). Loading the file here, before Next starts,
// puts the variables in this process's environment, and every process Next spawns
// inherits them.
//
// On a server without a .env file (production), real environment variables are used.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const envFile = path.resolve(import.meta.dirname, "..", "..", ".env");
try {
  process.loadEnvFile(envFile); // built into Node 21.7+; doesn't need the dotenv package
} catch (err) {
  if (err.code !== "ENOENT") throw err;
  console.warn(`[spool] No .env at ${envFile}; using the existing environment variables.`);
}

// Run `next <args>` as a child process with the same terminal.
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], { stdio: "inherit" });

// Pass Ctrl+C / stop signals on to Next, and exit with its exit code.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
