import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` throws when imported outside a React Server environment; tests are fine.
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
