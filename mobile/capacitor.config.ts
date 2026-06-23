import type { CapacitorConfig } from "@capacitor/cli";

// Native shell config for the iOS + Android builds of the web client.
//
// The web app is built into ./www by build-mobile.mjs (it runs the normal
// Vite build with the production asset/WS URLs baked in, then copies only the
// app shell — index.html, JS bundle, UI chrome, icons — so the native app
// stays small and streams the ~120 MB of game art from the live CDN, exactly
// like the itch.io build).
const config: CapacitorConfig = {
  appId: "com.riseofcivilizations.game",
  appName: "Rise of Civilizations",
  webDir: "www",
  backgroundColor: "#0f0e0bff",
  android: {
    // The client talks to wss://server.rise-of-civilizations.com and loads art
    // over https, so cleartext is never needed.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0f0e0b",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0f0e0b",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
