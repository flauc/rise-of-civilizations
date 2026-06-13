# Hex Terrain Generator

Generates standalone pointy-top hex terrain tiles for *Rise of Civilizations*. These assets are intentionally **not wired into the game** yet — they live under `assets/hex-terrain/` so artists/designers can iterate before integration.

## Output

- `assets/hex-terrain/<terrain>.svg` — scalable source tile.
- `assets/hex-terrain/<terrain>.png` — 1× raster export (97×112 px).
- `assets/hex-terrain/<terrain>@2x.png` — 2× raster export (194×224 px).
- `assets/hex-terrain/spritesheet.svg` — all terrains arranged in a single row.
- `tools/hex-terrain-generator/rasterize.html` — open in a browser to export PNGs at custom scales.

## Regenerate SVGs

From the repo root:

```bash
bun run tools/hex-terrain-generator/generate.ts
```

Or from this directory:

```bash
bun run generate
```

If Bun is not in your PATH, Node 24+ also works:

```bash
node --experimental-strip-types tools/hex-terrain-generator/generate.ts
```

## Regenerate PNGs

The checked-in PNGs were exported from the SVGs with ImageMagick:

```bash
cd assets/hex-terrain
for terrain in ocean coast lake plains grassland desert tundra snow forest jungle hills mountains; do
  magick "${terrain}.svg" "${terrain}.png"
  magick -density 192 "${terrain}.svg" "${terrain}@2x.png"
done
```

Or open `rasterize.html` in a browser to save PNGs at any scale. Because it loads SVGs with `fetch`, serve the repo root (e.g. `npx serve .` or `python -m http.server`) rather than opening the file directly with `file://`.

## Design notes

- Hex geometry matches the main client: pointy-top, size 56 (center-to-corner) in the SVG coordinate space.
- Colors are taken from `packages/client/src/palette.ts` so the tiles harmonize with the existing vector renderer.
- Each tile includes a subtle inset border to reduce visible seams when rendered edge-to-edge.
