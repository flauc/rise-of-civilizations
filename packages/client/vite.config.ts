import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Explicit aliases to the workspace package sources so Vite/esbuild transpiles
// them directly (no build step needed for shared/sim during development).
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@roc/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
      "@roc/sim": fileURLToPath(new URL("../sim/src/index.ts", import.meta.url)),
      "@roc/data": fileURLToPath(new URL("../data/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: true, // expose on the LAN so a phone can load it for mobile testing
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
