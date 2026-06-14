# Art Generator

A small standalone tool that uses **Google Gemini Nano Banana 2** to generate
Rise of Civilizations tile/unit/building art and then post-processes the result
with **ImageMagick** (and optionally `rembg`) to resize and remove backgrounds.

## Setup

1. Install [Bun](https://bun.sh/) (the repo already uses it).
2. Install [ImageMagick](https://imagemagick.org/) and make sure `magick` is on
   your `PATH`.
3. (Optional) Install [`rembg`](https://github.com/danielgatis/rembg) for better
   background removal on unit/building icons.
4. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/).
5. Set the environment variable:
   ```bash
   export GEMINI_API_KEY="your-key-here"
   ```
   On Windows PowerShell:
   ```powershell
   $env:GEMINI_API_KEY="your-key-here"
   ```

## Usage

Run from the repo root.

```bash
# One unit
bun run tools/art-generator/generate.ts --unit archer

# One terrain tile
bun run tools/art-generator/generate.ts --tile forest

# One building
bun run tools/art-generator/generate.ts --building granary

# Whole subsets
bun run tools/art-generator/generate.ts --subset terrain
bun run tools/art-generator/generate.ts --subset units
bun run tools/art-generator/generate.ts --subset buildings
bun run tools/art-generator/generate.ts --all

# Multiple variants (for randomized tiles)
bun run tools/art-generator/generate.ts --subset terrain --variations 5
```

Common options:

| Flag | Description |
|------|-------------|
| `--model <id>` | Gemini image model (default: `gemini-3.1-flash-image`) |
| `--size <512\|1K\|2K\|4K>` | Generated resolution before resize (default: `1K`) |
| `--reference-dir <path>` | Folder containing reference hex tiles |
| `--reference <path>` | Use a single reference tile for every generation |
| `--out-dir <path>` | Output folder (default: `assets/generated`) |
| `--variations <n>` | Generate n variants per asset (default: 1) |
| `--skip-base` | Only create numbered variants (`_1`..`_n`), leave the base file intact |
| `--concurrency <n>` | Max parallel API calls (default: 3) |
| `--no-post` | Skip ImageMagick post-processing |
| `--rembg` | Use `rembg` for unit/building background removal |
| `--dry-run` | Print what would happen without calling the API |
| `--list` | List every asset ID the script knows about |

## Output layout

```
assets/generated/
  raw/
    tiles/       # Unprocessed model output
    units/
    buildings/
    resources/   # Unprocessed model output
  tiles/         # Final hex-masked tiles (256x384)
  units/         # Final transparent-background tokens (128x128)
  buildings/     # Final transparent-background icons (128x128)
  resources/     # Final transparent-background icons (96x96)
```

## How it works

1. **Prompt construction** — Each asset has a default prompt in
   `config.ts`. Tiles ask for a hand-painted pointy-top hex; units/buildings/resources ask
   for a centered icon on a solid white background.
2. **Reference image** — The prompt is sent together with one of the existing
   `Hex Samples/` tiles so the model can match the game's style.
3. **Generation** — The script calls the Gemini `generateContent` REST endpoint
   with `responseModalities: ["TEXT", "IMAGE"]` and the requested aspect ratio
   / size.
4. **Post-processing** —
   - **Tiles:** the reference tile's alpha channel is scaled to the generated
     size and used as an opacity mask, then the result is resized to 256x384.
   - **Units/buildings:** a white background is color-keyed to transparent
     (or `rembg` is used if requested), the image is trimmed, then padded to
     128x128.
   - **Resources:** same transparent-background treatment as units, but padded
     to 96x96 so they read as small map tokens.

## Customizing

Add more assets by editing the arrays in `config.ts`:

- `TERRAIN_SUBSET` — 12 terrain types from `packages/shared/src/map.ts`.
- `UNIT_SUBSET` — a representative set of unit IDs from
  `packages/sim/src/game/content.ts`.
- `BUILDING_SUBSET` — building IDs from the same file.
- `RESOURCE_SUBSET` — resource IDs from `packages/sim/src/game/resources.ts`.

You can also change target sizes, aspect ratios, reference tile mappings, and
prompt templates there.

## Costs and quotas

Gemini image generation is billed per image. The default `1K` size is the
 cheapest practical size; bulk runs with `--all` will make many API calls. Use
 `--dry-run` first to count assets, and consider starting with `--subset units`
 to test the pipeline.
