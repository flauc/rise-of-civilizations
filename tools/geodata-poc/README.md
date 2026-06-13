# geodata-poc — real-world map → hex baker (proof of concept)

Validates [PLAN.md §3.1.1](../../docs/PLAN.md): can we turn open geodata into our hex map format cheaply, with nothing heavy shipping to the client?

**Answer: yes.** `bake.mjs` fetches the public-domain Natural Earth land polygons (world-atlas TopoJSON, ~100 KB, from jsDelivr), lays a pointy-top hex grid over an equirectangular world, tests each hex center for land/ocean with `d3.geoContains`, assigns a placeholder terrain by latitude, and writes a baked `*.hexmap.json`. d3/topojson and the GeoJSON are used **only here at build time** — only the baked JSON would reach the game.

## Run
```bash
npm install
node bake.mjs                 # default 100 columns, 110m scale
node bake.mjs --cols=110      # finer grid
node bake.mjs --res=50m --cols=160   # higher-detail source for a regional map
```
Options: `--cols=<n>` grid width · `--res=110m|50m|10m` Natural Earth scale · `--out=<file>`.

## What it proves / what's still placeholder
- ✅ Geodata sourcing, TopoJSON→GeoJSON, spherical point-in-polygon, hex sampling, baking — all real.
- ✅ Output is recognizable as Earth (continents in the right places) — visible in the console ASCII preview.
- ⏳ **Terrain is a latitude placeholder.** Real pipeline samples a DEM (GTOPO30) + Köppen climate to assign desert/jungle/tundra/hills/mountains (see ASSETS-AND-DATA-SOURCES.md §A).
- ⏳ **Projection area.** Equirectangular over-represents polar latitudes (Antarctica/Arctic look huge, land% reads ~33% vs Earth's ~29%). The real tool will use an equal-area or per-region projection and likely crop Antarctica.
- ⏳ **Output compaction.** The naive JSON stores every ocean tile (~235 KB at 110 cols). Production format: palette + typed/run-length land tiles → a few KB. Resources & historical start positions are a curated overlay added after this land/terrain pass.
- ⏳ Hex coordinates here are simple offset `(col,row)`; the real tool emits the engine's axial `(q,r)` from `packages/shared`.

## Next integration step
Move this into `tools/` proper once the monorepo exists, import hex math + the map schema from `packages/shared`, swap the placeholder classifier for DEM+biome sampling, and add curated region presets (Mediterranean, Americas, …).
