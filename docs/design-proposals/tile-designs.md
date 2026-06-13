# Tile & Improvement Design Proposal

> Review-only draft. Not yet wired into `packages/sim/src/game/terrain.ts`, `improvements.ts`, or `worldgen.ts`.

This document proposes the terrain types, resources, tile yields, and worker improvements that form the map layer of the game.

## 1. Design goals

- **Terrain tells a story:** plains, rivers, hills, forests, deserts, coasts each have clear economic and military identities.
- **Resources create decisions:** bonus resources feed cities, luxuries enable growth, strategic resources unlock units.
- **Improvements scale with tech:** farms get better with irrigation, mines with bronze/iron, camps with trapping, etc.
- **Military terrain matters:** forests, hills, rivers, and marshes modify movement and combat.
- **Renderer-friendly:** terrain is represented by base type + feature overlays; no custom art per tile.

## 2. Tile schema

```ts
interface Tile {
  q: number;
  r: number;
  base: TerrainBase;
  feature?: TerrainFeature;
  resource?: ResourceId;
  improvement?: ImprovementId;
  road?: boolean;
  river: boolean;         // river passing through/adjacent
  freshWater: boolean;    // river, lake, or oasis
  elevation: number;      // 0=flat, 1=hills, 2=mountain
  owner?: number;         // playerId if inside territory
}

type TerrainBase =
  | "ocean" | "coast" | "lake"
  | "plains" | "grassland" | "desert" | "tundra" | "snow";

type TerrainFeature =
  | "forest" | "jungle" | "marsh" | "hills" | "mountain" | "floodplain" | "oasis";
```

## 3. Base terrain

| Base | Move cost | Defense | Food | Prod | Gold | Notes |
|---|---|---|---|---|---|---|
| **Ocean** | — | — | 0 | 0 | 1 | Impassable until Astronomy/Cartography. |
| **Coast** | 1 (naval) | 0 | 1 | 0 | 2 | Embark/disembark here. Naval units heal. |
| **Lake** | 1 (naval) | 0 | 2 | 0 | 1 | Fresh water. |
| **Plains** | 1 | 0 | 1 | 1 | 0 | Balanced; good for farms and mines. |
| **Grassland** | 1 | 0 | 2 | 0 | 0 | High food, low production. |
| **Desert** | 1 | 0 | 0 | 0 | 0 | Needs Oasis/Floodplain/Canal to be useful. |
| **Tundra** | 1 | 0 | 1 | 0 | 0 | Low yields; some resources (furs, deer). |
| **Snow** | 2 | 0 | 0 | 0 | 0 | Harsh; mostly impassable/barren. |

## 4. Terrain features

Features stack on top of base terrain. A tile can have **one** feature plus a resource.

| Feature | Move cost | Defense | Yields added | Notes |
|---|---|---|---|---|
| **Hills** | 2 | +3 | +1 prod | Ranged units gain +1 sight. |
| **Forest** | 2 | +3 | +1 prod | Blocks sight; flanking harder. |
| **Jungle** | 2 | +3 | +1 food | Blocks movement; pasture/plantation viable. |
| **Marsh** | 3 | -1 | +1 food | Slow; can be drained to grassland. |
| **Mountain** | — | — | 0 | Impassable (except some civ abilities); adjacency bonuses. |
| **Floodplain** | 1 | 0 | +2 food | On desert/grassland next to rivers; can flood. |
| **Oasis** | 1 | 0 | +3 food, +1 gold | Fresh water; rare desert tile. |

### 4.1 Combat modifiers

- **Defender on Hill:** +3 strength.
- **Defender in Forest/Jungle:** +3 strength.
- **Defender across River:** +5 strength vs melee attacks.
- **Attacker into Marsh:** -2 strength.
- **Hills/Forest/Jungle:** units ending turn here are not visible to enemies beyond 1 hex unless adjacent (concealment).

## 5. Resources

### 5.1 Bonus resources

Provide base yield when improved; no empire-wide limit.

| ID | Name | Found on | Improvement | Yields | Notes |
|---|---|---|---|---|---|
| `wheat` | Wheat | Plains/Grassland/Floodplain | Farm | +2 food | Strong early growth. |
| `rice` | Rice | Grassland/Marsh/Floodplain | Farm | +2 food | Marsh-adjacent bonus. |
| `maize` | Maize | Plains/Grassland | Farm | +2 food | Americas bias. |
| `cattle` | Cattle | Grassland/Plains | Pasture | +1 food, +1 prod | Also counts as livestock. |
| `sheep` | Sheep | Hills/Grassland/Tundra | Pasture | +1 food, +1 prod | Hill synergy. |
| `deer` | Deer | Forest/Tundra | Camp | +1 food, +1 prod | Forest synergy. |
| `fish` | Fish | Coast/Lake | Fishing Boats | +2 food | Coastal growth. |
| `crabs` | Crabs | Coast | Fishing Boats | +1 food, +1 gold | Coastal gold. |
| `bananas` | Bananas | Jungle | Plantation | +2 food | Jungle synergy. |
| `stone` | Stone | Plains/Desert/Hills | Quarry | +1 prod, +1 gold | Building/wonder bonus. |

### 5.2 Luxury resources

Each unique luxury grants **+4 amenities** empire-wide (typically covers 2 cities). Traded luxuries count for both parties.

| ID | Name | Found on | Improvement | Notes |
|---|---|---|---|---|
| `wine` | Wine | Hills/Grassland | Plantation | Mediterranean/European bias. |
| `incense` | Incense | Desert/Plains | Plantation | Religious civs value it. |
| `silk` | Silk | Forest | Camp | Asian/European bias. |
| `spices` | Spices | Jungle | Plantation | Tropical bias. |
| `dyes` | Dyes | Jungle/Forest | Plantation | Coastal/warm bias. |
| `furs` | Furs | Forest/Tundra | Camp | Northern bias. |
| `ivory` | Ivory | Plains/Forest | Camp | Enables War Elephant units. |
| `pearls` | Pearls | Coast | Fishing Boats | Coastal luxury. |
| `salt` | Salt | Plains/Desert | Mine | +1 food, +1 gold when improved. |
| `tea` | Tea | Hills/Grassland | Plantation | Asian bias. |
| `cocoa` | Cocoa | Jungle | Plantation | American/tropical bias. |
| `citrus` | Citrus | Grassland/Plains | Plantation | Mediterranean bias. |
| `tobacco` | Tobacco | Grassland/Plains | Plantation | Exploration-era trade. |
| `silver` | Silver | Hills/Desert | Mine | High gold. |
| `gold_ore` | Gold | Hills/Desert | Mine | Very high gold. |

### 5.3 Strategic resources

Required for certain units/buildings; revealed by specific techs.

| ID | Name | Revealed by | Found on | Improvement | Used by |
|---|---|---|---|---|---|
| `horses` | Horses | `animal_taming` | Plains/Grassland | Pasture | Chariots, Riders, Horse Archers, Knights. |
| `copper` | Copper | `native_copper` | Hills/Desert | Mine | Early bronze units. |
| `tin` | Tin | `bronze_alloying` | Hills/Plains | Mine | Bronze alloy units. |
| `iron` | Iron | `iron_bloomery` | Hills/Forest | Mine | Swordsman, Knight, Cataphract. |
| `saltpeter` | Saltpeter | `gunpowder` | Plains/Desert | Mine | Musketeer, Arquebusier, Cannon. |
| `ivory` | Ivory | `animal_taming` | Plains/Forest | Camp | War Elephants (also luxury). |

## 6. Improvements

Built by Workers. Each improvement costs 1 charge (or a fraction) and takes a number of turns based on production/tech.

| ID | Name | Build on | Yields | Tech req | Notes |
|---|---|---|---|---|---|
| `farm` | Farm | Plains/Grassland/Floodplain | +1 food | — | +1 additional food at Irrigation; +1 at Crop Rotation (new). |
| `pasture` | Pasture | Cattle/Sheep/Horses | +1 food, +1 prod | `animal_husbandry` (new) | Required for strategic livestock. |
| `plantation` | Plantation | Wine/Spices/Bananas/etc. | +2 gold | `cultivation` | Luxuries and jungle resources. |
| `mine` | Mine | Hills/Desert/Forest | +1 prod | `mining` (new) | +1 at Bronze Working; +1 at Iron Working. |
| `quarry` | Quarry | Stone/Hills | +1 prod, +1 gold | `masonry` | Bonus to wonder production. |
| `camp` | Camp | Deer/Furs/Ivory | +1 food, +1 gold | `trapping` (new) | Forest/tundra resources. |
| `fishing_boats` | Fishing Boats | Fish/Crabs/Pearls | +2 food | `sailing` (new) | Coastal only. |
| `lumber_mill` | Lumber Mill | Forest | +1 prod | `machinery` (new) | Keeps forest; city must work it. |
| `road` | Road | Any land | — | `the_wheel` | Movement cost 1/2 for all units; enables trade routes. |
| `fort` | Fort | Any land | — | `engineering` | +4 defense; units heal +5/turn. |
| `trading_post` | Trading Post | Any land | +1 gold | `currency` (new) | +1 gold per adjacent road/river. |
| `terrace_farm` | Terrace Farm | Hills (Inca only) | +1 food, +1 prod | — | Unique improvement; mountain adjacency bonus. |
| `polder` | Polder | Marsh/Coast (Dutch only) | +3 food, +1 prod | `engineering` | Unique improvement. |

### 6.1 Improvement stacking rules

- One improvement per tile.
- A tile with a resource **must** have the matching improvement to get the resource bonus.
- Roads and features (forest/jungle) can coexist with improvements unless the improvement says otherwise.
- Removing a forest gives a one-time production burst but removes the forest defense/movement modifier.

## 7. Tile yield summary

Final tile yield = base + feature + resource + improvement + building adjacency + civ ability.

Example tiles:

| Tile composition | Food | Prod | Gold | Notes |
|---|---|---|---|---|
| Grassland + Farm | 3 | 0 | 0 | 2 base + 1 improvement. |
| Plains Hill + Mine | 1 | 3 | 0 | 1 base + hill + mine. |
| Grassland + Wheat + Farm | 5 | 0 | 0 | 2 + 2 + 1. |
| Coast + Fish + Fishing Boats | 3 | 0 | 2 | 1 + 2 + coast gold. |
| Desert Floodplain + Farm | 4 | 0 | 0 | 0 + 2 flood + 2 farm. |
| Hills + Iron + Mine | 0 | 4 | 0 | Hill + mine + iron. |

## 8. Renderer representation

Because the game uses procedural canvas rendering, each tile is drawn from a small palette:

- **Base fill color:** by terrain (ocean = dark blue, plains = tan, grassland = green, desert = yellow, tundra = pale gray, snow = white).
- **Feature overlay:** forest = green clump, jungle = darker clump, hills = raised edge, mountains = peak icon, marsh = blue speckles.
- **Resource icon:** tiny colored dot + letter (g = gold, f = food, p = prod, s = strategic, l = luxury).
- **Improvement icon:** simple geometric mark (farm = small square, mine = crossed picks, pasture = fence line, etc.).
- **Road:** thin line connecting adjacent road tiles.

## 9. World generation notes

- Resources are placed by latitude + terrain bias + seeded scatter.
- Strategic resources are rarer and clustered near historical regions (horses on steppes/plains, iron in hills, etc.).
- Luxury resources ensure each region has 2–3 locally available luxuries for amenity viability.
- Rivers are generated from elevation flow and create fresh-water tiles.

## 10. Open questions for review

1. Should Marshes be drainable (turn into Grassland/Farm) or remain a permanent feature?
2. Should Farms get a freshwater bonus, or is the Floodplain/Oasis bonus enough?
3. Should removing Forest/Jungle have an opportunity cost beyond one-time production?
4. Is the 1-improvement-per-tile rule too restrictive for late-game tile optimization?
5. Should roads be built by Workers or automatically between trade-route cities?
