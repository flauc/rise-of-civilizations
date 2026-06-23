import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Mirrors the client config: alias the shared package source so no build step is
// needed during development. Runs on its own port so it can coexist with the game.
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@roc/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
  },
});
