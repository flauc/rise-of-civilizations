# Store screenshots

Generates App Store / Play Store screenshots: real in-game portrait captures
placed in a phone frame on a branded (dark + Cinzel gold) canvas with a headline.

## Output
- `out/appstore/*.png` — 1290×2796 (Apple 6.7")
- `out/playstore/*.png` — 1080×1920 (Google Play phone)
- `out/_contact-*.png` — review contact sheets

Six designs: `empire, cities, tech, greatpeople, legends, civs`.

## Regenerate

1. Start the client dev server (any port; default below is 5180):
   ```
   PORT=5180 "C:/Users/filip/.bun/bin/bun.exe" run --filter @roc/client dev
   ```
2. Capture fresh portrait game screenshots (headless Chromium, drives a Single
   Player game ~14 turns then opens each panel) → `raw/*.png`:
   ```
   node capture.mjs            # ROC_URL=http://localhost:5180/ by default
   ```
3. Frame them with headlines/phone/background → `out/`:
   ```
   node frame.mjs
   ```

## Customizing
- Headlines / subtitles / which shots: edit `SHOTS` in `frame.mjs`.
- Canvas sizes, fonts, phone bezel, colors: `STORES` + the constants in `frame.mjs`.
- What gets captured (panels, turn count): `capture.mjs`.

## Device frames
Real device-frame PNGs live in `frames/` (with `offsets.json`), from
**[fastlane/frameit-frames](https://github.com/fastlane/frameit-frames)** —
free/open-source, generated from Facebook's device template set:
- App Store → `iphone16pro-black.png` (iPhone 16 Pro, Black Titanium)
- Play Store → `galaxy-s21-black.png` (Samsung Galaxy S21 5G, Black)

To swap devices: download another frame from that repo into `frames/`, then set
`frame`/`fw`/`fh` and the screen rect (`sx,sy,sw,sh` — the transparent screen
area; width/offset come from `frames/offsets.json`, height = the device's native
screen pixel height) in the matching `STORES` entry of `frame.mjs`.

## Notes
- Captures use a 412×893 logical viewport @3x → the game's mobile UI (bottom
  sheets, bottom bar), matching real phone presentation.
- Headline font is **Cinzel** (game brand); body is **Lato**. TTFs in `fonts/`.
- The device's notch/Dynamic-Island/punch-hole floats over the game's own top
  bar (authentic full-bleed look). Want a clean status strip instead? Recapture
  with a top safe-area inset.
- Requires ImageMagick 7 (`magick`) with freetype delegate and a Playwright
  Chromium in the local `ms-playwright` cache.
- Pass ImageMagick **forward-slash** paths only — it eats Windows backslashes.
