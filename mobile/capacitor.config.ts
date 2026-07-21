import type { CapacitorConfig } from "@capacitor/cli";

// Native shell config for the iOS + Android builds of the web client.
//
// The web app is built into ./www by build-mobile.mjs (it runs the normal
// Vite build with the production asset/WS URLs baked in, then copies only the
// app shell — index.html, JS bundle, UI chrome, icons — so the native app
// stays small and streams the ~120 MB of game art from the live CDN, exactly
// like the itch.io build).
// Capacitor loads bundled ./www by default (production CDN URLs baked in at build time).
// For emulator/device live dev, point at your Vite server:
//   CAP_DEV_SERVER=http://10.0.2.2:5176 npm run run:android:dev
// (10.0.2.2 is the Android emulator's alias for your Mac/PC localhost.)
const devServer = process.env.CAP_DEV_SERVER?.trim();

const config: CapacitorConfig = {
  appId: "com.riseofcivilizations.game",
  appName: "Rise of Civilizations",
  webDir: "www",
  backgroundColor: "#0f0e0bff",
  ...(devServer
    ? {
        server: {
          url: devServer,
          cleartext: true,
        },
      }
    : {}),
  android: {
    // Capacitor loads the shell over https://localhost; ws:// to 10.0.2.2 is
    // mixed content unless this is enabled (needed for emulator dev builds).
    allowMixedContent: true,
    // Edge-to-edge is enabled in MainActivity (EdgeToEdge.enable). The web client
    // handles insets via viewport-fit=cover and env(safe-area-inset-*).
    backgroundColor: "#0f0e0b",
  },
  ios: {
    // Safe areas are handled in CSS (viewport-fit=cover + env(safe-area-inset-*)).
    // "always" double-insets the WebView and clips lobby footers on iOS.
    contentInset: "never",
    backgroundColor: "#0f0e0b",
  },
};

export default config;
