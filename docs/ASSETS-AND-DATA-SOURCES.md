# Assets & Data Sources

Sourcing for (A) real-world map geodata and (B) free game assets, with licensing notes. Researched 2026-06-13.

**Licensing rule of thumb for this project:** prefer **public-domain / CC0** sources so we owe no attribution and have zero commercial restrictions (matters if we ever sell or app-store this). Where we use **CC-BY** (attribution-required) assets, that's fine — just maintain a `CREDITS.md` and an in-game credits screen. Avoid GPL/“share-alike” art unless we accept its terms. **Always record the license per asset at download time.**

---

## A. Real-world map data

### Primary: Natural Earth (the recommended source)
- **What:** Free vector + raster basemap data at three scales — **1:110m (coarse), 1:50m (medium), 1:10m (detailed)**. Land polygons, coastlines, country/admin boundaries, rivers, lakes, plus raster relief.
- **License:** **Public domain.** No attribution, no commercial restriction, no fees. (Cleanest possible license for us.)
- **Site:** https://www.naturalearthdata.com/ — Downloads: https://www.naturalearthdata.com/downloads/
- **Source repo (raw vectors):** https://github.com/nvkelso/natural-earth-vector

### Easiest to consume: world-atlas (pre-built TopoJSON of Natural Earth)
- **What:** Natural Earth repackaged as small TopoJSON files, ready for d3.
  - `countries-110m.json` / `countries-50m.json` / `countries-10m.json` (countries **and** land)
  - `land-110m.json` / `land-50m.json` / `land-10m.json` (land only)
- **Coordinates:** quantized **spherical coordinates, decimal degrees** (lon/lat) — *not* projected. We apply a d3-geo projection ourselves.
- **License:** public domain (redistributes Natural Earth 4.1.0).
- **Repo:** https://github.com/topojson/world-atlas
- **CDN (no install needed for the build tool):**
  `https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json`
  (swap filename for countries / other resolutions)
- **Sizes:** the 110m land file is on the order of ~100 KB; 50m/10m are larger for regional zoom. We process these in the **build tool only** — the game runtime never ships them.

### Optional: elevation (DEM) for terrain/mountains/hills
Use only if latitude+coastal heuristics aren't good enough; adds payload to the build step (not the runtime).
- **GTOPO30 / GMTED2010** — global, coarse (1km / 30–7.5 arc-sec), **public domain (USGS)**. Best fit: coarse is plenty for a hex game. https://www.usgs.gov/faqs/where-can-i-get-global-elevation-data
- **SRTM (30m)** and **ASTER GDEM v3 (30m)** — finer, public domain, free with registration via USGS EarthExplorer. Overkill for hex resolution.
- Natural Earth also ships **raster relief / hypsometric tints** if we just want a visual elevation hint.

### Optional: biome / climate classification (to assign terrain types)
- **Köppen–Geiger climate classification** rasters (e.g. Beck et al. 2018) — openly available; great for mapping climate → terrain (desert/tundra/jungle/etc.).
- **WorldClim bioclimatic variables** — GeoTIFF rasters (temp/precip). License: **CC BY 4.0** (attribution).
- **WWF Terrestrial Ecoregions** — biome polygons; check the per-dataset terms before shipping.
- **Fallback (no extra data):** approximate biome from **latitude band + coastal distance + the DEM sample**. Recommended for v1 to keep the pipeline simple.

### How we use it (recap from PLAN.md §3.1.1)
d3-geo + these files run in `tools/` at **build time**: sample each hex center with `d3.geoContains` → land/ocean; assign terrain from latitude/elevation/biome; bake to our compact hex map blob. **d3 and GeoJSON never reach the client.**

---

## B. Free game assets

Our art plan is procedural/vector + a tiny icon set, so we mostly need **icons, a few tile sprites, UI, fonts, and audio** — not big art packs.

### Icons (units, resources, tech, abilities) — highest-value for us
- **game-icons.net** — **4,180** SVG + PNG icons, heavy on medieval/fantasy/military/resources (swords, shields, ships, animals, buildings, crowns…). Perfect for unit/tech/resource iconography.
  - **License: CC BY 3.0** (attribution required). https://game-icons.net/ · about: https://game-icons.net/about.html
  - SVG = scales cleanly + recolorable in code = ideal for our vector style and tiny payload.

### Hex tiles & sprites
- **Kenney** — huge libraries of game assets, **all CC0** (public domain, no attribution).
  - Hexagon Tiles: https://kenney.nl/assets/hexagon-tiles · Hexagon Pack (310 tiles): https://kenney.nl/assets/hexagon-pack
  - Also UI packs, fonts, audio, particles — all CC0. Best single source for us.
- **OpenGameArt.org** — large community library (2D/3D/audio).
  - Hex sets: Hexagon tiles 93x, Hexagon Kit, Hexagon tiles: Buildings (castles/farms), Hexagon pack 310x.
  - **License varies per asset** (CC0, CC-BY, CC-BY-SA, GPL) — **must check each.** Filter to CC0 to stay attribution-free. https://opengameart.org/
- **itch.io** — many free CC0/CC-BY asset packs (search game-assets, filter license/tag). Quality varies; verify license per pack.

### Fonts
- **Kenney fonts** (CC0) and **Google Fonts** (open licenses, mostly OFL) for UI + historical flavor. Keep the bundled set tiny (1–2 families, subset).

### Audio (SFX + music)
- **Kenney audio** — CC0 SFX/music packs. https://kenney.nl/
- **Freesound** — 500k+ sounds; **filter by CC0** to avoid attribution (other sounds are CC-BY / per-clip). https://freesound.org/
- **OpenGameArt audio** — CC0 + CC-BY music/SFX (medieval/fantasy collections). License per asset.
- **Pixabay** — royalty-free SFX/music under the Pixabay license (free for commercial, no attribution). https://pixabay.com/sound-effects/
- **BigSoundBank** — CC0 royalty-free sounds.

---

## C. Recommendations for this project

1. **Maps:** start with **world-atlas `land-110m.json` via jsDelivr** in the build tool; add a DEM (GTOPO30) and optionally Köppen later if terrain realism needs it. Public domain throughout → no legal overhead.
2. **Icons:** adopt **game-icons.net** (CC BY 3.0) as the primary icon set — recolor SVGs in code to match civ/era palettes. Budget a credits screen for attribution.
3. **Tiles/UI/fonts/audio:** lean on **Kenney (CC0)** first to stay attribution-free; pull specific items from OpenGameArt/itch/Freesound only when CC0 and logged.
4. **Hygiene from day one:** keep a `CREDITS.md` + `assets/LICENSES/` folder; record source URL + license + author for every asset as it's added. Prefer CC0; treat CC-BY as acceptable-with-credit; avoid share-alike/GPL art.
5. **Runtime stays tiny:** geodata is build-time only; ship recolorable SVG icons + a small baked atlas, not multi-MB art packs (consistent with the download budget in PLAN.md §4.3).
