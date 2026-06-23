# Rise of Civilizations — Mobile (iOS + Android)

Native app wrappers around the existing web client, built with
[Capacitor](https://capacitorjs.com). The web game runs inside a native WebView;
the ~120 MB of game art and the multiplayer/analytics server are streamed from
the live infrastructure (`game.` / `server.rise-of-civilizations.com`), exactly
like the itch.io build, so the installed app is only a few MB.

- **App ID:** `com.riseofcivilizations.game`
- **App name:** Rise of Civilizations

## How it works

`build-mobile.mjs` runs the normal Vite build with the production asset + WS
URLs baked in (`VITE_ASSET_BASE_URL`, `VITE_WS_URL`), then copies only the app
shell (`index.html`, JS bundle, `ui/`, icons, manifest) into `www/`. Capacitor
syncs `www/` into the native `android/` and `ios/` projects.

To point at different hosts (e.g. staging):

```sh
ASSET_BASE=https://staging.example.com/ WS_URL=wss://staging.example.com/ws npm run build:web
```

## One-time setup

```sh
cd mobile
npm install
```

Android also needs the SDK location in `android/local.properties` (created
automatically by Android Studio, or write it yourself):

```
sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
```

## Android (buildable on Windows/macOS/Linux)

Prereqs: JDK 17 + Android SDK (Android Studio). Both are already installed on
this machine.

```sh
# Build the web shell, sync, and produce a debug APK in one step:
npm run apk
# -> android/app/build/outputs/apk/debug/app-debug.apk  (install on any device)
```

Other targets:

```sh
npm run build          # rebuild web shell + cap sync (no APK)
npm run open:android   # open the project in Android Studio
npm run run:android    # build + install + launch on a connected device/emulator
npm run apk:release    # release APK (needs signing config, see below)
npm run bundle:release # release .aab for the Play Store
```

Install the debug APK on a phone (USB debugging on):

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Signing for the Play Store

1. Create a keystore (once):
   ```sh
   keytool -genkey -v -keystore roc-release.keystore -alias roc \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add to `android/app/build.gradle` a `signingConfigs.release` reading the
   keystore from `android/key.properties` (kept out of git), and reference it in
   `buildTypes.release`.
3. `npm run bundle:release` → upload `android/app/build/outputs/bundle/release/app-release.aab`
   to the Google Play Console.

## iOS (requires a Mac with Xcode)

The Xcode project is scaffolded in `ios/`, but Apple only allows building and
submitting from macOS. On a Mac:

```sh
cd mobile
npm install
sudo gem install cocoapods   # if not present
npm run build                # build web shell + cap sync
npm run open:ios             # opens ios/App/App.xcworkspace in Xcode
```

In Xcode: select your Team under Signing & Capabilities, set the bundle ID to
`com.riseofcivilizations.game`, then Product → Archive → Distribute App to push
to App Store Connect / TestFlight.

## App icons & splash screens

Source images live in `mobile/assets/` and are expanded into every platform
density by [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

- `icon-only.png` (1024²) — full-bleed iOS app icon (navy `#1a2b47` corners; iOS rounds it).
- `icon-foreground.png` (1024²) — Android adaptive **foreground** (logo full-bleed, transparent corners; the adaptive layer adds the 16.7% safe-zone inset).
- `icon-background.png` (1024²) — Android adaptive **background** (solid navy `#1a2b47`, so the foreground card blends seamlessly).
- `splash.png` / `splash-dark.png` (2732²) — launch splash (logo centered on navy).

These were derived from `packages/client/public/icon-512.png` (white corners cut
to transparent, recomposited on navy). To regenerate after changing the source art:

```sh
npx @capacitor/assets generate --android --ios
```

Then rebuild (`npm run apk` / re-archive in Xcode).

## Updating the apps after a game change

Any time the web client changes, re-run `npm run build` (rebuilds the shell +
syncs both platforms), then rebuild the APK / re-archive in Xcode. No native
code changes are needed unless you add a Capacitor plugin.
