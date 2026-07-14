import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Explicit aliases to the workspace package sources so Vite/esbuild transpiles
// them directly (no build step needed for shared/sim during development).
export default defineConfig(({ mode }) => {
  const disableHmr = mode === "no-hmr";
  // Web deploy uses "/" so deep links like /privacy load /assets/… correctly.
  // itch.io and similar builds pass VITE_BASE=./ for relative asset paths.
  const base = process.env.VITE_BASE?.trim() || "./";

  return {
    base,
    appType: "spa",
    resolve: {
      alias: {
        "@roc/shared": fileURLToPath(
          new URL("../shared/src/index.ts", import.meta.url),
        ),
        "@roc/sim": fileURLToPath(
          new URL("../sim/src/index.ts", import.meta.url),
        ),
        "@roc/data": fileURLToPath(
          new URL("../data/src/index.ts", import.meta.url),
        ),
      },
    },
    server: {
      host: true, // expose on the LAN so a phone can load it for mobile testing
      port: process.env.PORT ? Number(process.env.PORT) : 5176,
      hmr: disableHmr ? false : undefined,
      proxy: {
        "/analytics": {
          target: process.env.VITE_WS_URL?.trim()?.replace(/^ws/, "http").replace(/\/ws\/?$/, "") ||
            "http://localhost:3001",
          changeOrigin: true,
        },
        "/support": {
          target: process.env.VITE_WS_URL?.trim()?.replace(/^ws/, "http").replace(/\/ws\/?$/, "") ||
            "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
