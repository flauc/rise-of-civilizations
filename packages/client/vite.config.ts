import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";

// Explicit aliases to the workspace package sources so Vite/esbuild transpiles
// them directly (no build step needed for shared/sim during development).
export default defineConfig(({ mode }) => {
  const disableHmr = mode === "no-hmr";
  // Web deploy uses "/" so deep links like /privacy load /assets/… correctly.
  // itch.io and similar builds pass VITE_BASE=./ for relative asset paths.
  const base = process.env.VITE_BASE?.trim() || "./";
  const analyze = process.env.ANALYZE === "1";

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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("d3-geo") || id.includes("topojson") || id.includes("world-atlas")) {
              return "geo-vendor";
            }
            if (id.includes("@capacitor")) return "capacitor";
          },
        },
      },
    },
    plugins: [
      analyze &&
        visualizer({
          filename: "dist/bundle-stats.html",
          gzipSize: true,
          open: false,
        }),
    ].filter(Boolean),
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
        "/api": {
          target: process.env.VITE_WS_URL?.trim()?.replace(/^ws/, "http").replace(/\/ws\/?$/, "") ||
            "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
