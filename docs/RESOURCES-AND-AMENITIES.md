# Resources & Amenities

Natural resources and amenities add a second economic layer to the map. Some tiles hold **bonus** resources that boost yields, **luxury** resources that keep cities happy, and **strategic** resources that gate the strongest military units.

This doc is the source-of-truth for the *design*; exact numbers live in `packages/sim/src/game/resources.ts` and `packages/sim/src/game/content.ts`.

---

## 1. Resource types

| Type | Purpose | Tradeable | Example |
|------|---------|-----------|---------|
| **Bonus** | Extra food/production/gold on a worked tile | No | Wheat, Bananas, Fish, Stone |
| **Luxury** | +Gold and +Amenities (happiness) | Yes (future diplomacy layer) | Wine, Silk, Ivory, Silver |
| **Strategic** | Stockpiled and consumed to build key units | Yes (future diplomacy layer) | Iron, Horses, Elephants, Copper |

A resource only gives its benefits once the tile is inside your territory **and** improved with the correct improvement (e.g. a Mine for Iron, a Plantation for Bananas).

---

## 2. Bonus resources

Bonus resources mainly add food and production. They are not stockpiled and are not consumed.

| ID | Name | Valid terrain | Improvement | Worked yields | Notes |
|----|------|---------------|-------------|---------------|-------|
| `wheat` | Wheat | Plains, Grassland, Desert | Farm | +1 Food | |
| `rice` | Rice | Grassland, Plains | Farm | +1 Food | |
| `maize` | Maize | Plains, Grassland | Farm | +1 Food | |
| `cattle` | Cattle | Grassland, Plains | Pasture | +1 Food | |
| `sheep` | Sheep | Hills, Grassland, Tundra | Pasture | +1 Food | |
| `deer` | Deer | Forest, Tundra | Camp | +1 Food | |
| `fish` | Fish | Coast, Lake, Ocean | Fishing Boats | +1 Food, +1 Gold | |
| `crabs` | Crabs | Coast, Ocean | Fishing Boats | +1 Food, +1 Gold | |
| `bananas` | Bananas | Jungle, Forest | Plantation | +2 Food, +1 Amenity | A food resource that also behaves as a local amenity |
| `stone` | Stone | Hills, Desert | Quarry | +1 Production | |

---

## 3. Luxury / amenity resources

Luxury resources give +1 Gold when worked and contribute **+1 Amenity** to your empire. Each *different* luxury type counts once for amenities, no matter how many copies you own.

| ID | Name | Valid terrain | Improvement | Worked yields |
|----|------|---------------|-------------|---------------|
| `wine` | Wine | Grassland, Plains, Hills | Plantation | +1 Gold |
| `incense` | Incense | Desert, Plains | Plantation | +1 Gold |
| `silk` | Silk | Forest, Jungle | Plantation | +1 Gold |
| `spices` | Spices | Jungle, Forest | Plantation | +1 Gold |
| `dyes` | Dyes | Jungle, Forest | Plantation | +1 Gold |
| `furs` | Furs | Tundra, Forest | Camp | +1 Gold |
| `ivory` | Ivory | Jungle, Forest | Camp | +1 Gold |
| `pearls` | Pearls | Coast, Lake | Fishing Boats | +1 Gold |
| `salt` | Salt | Hills, Desert | Mine | +1 Gold |
| `tea` | Tea | Grassland, Hills | Plantation | +1 Gold |
| `cocoa` | Cocoa | Jungle, Forest | Plantation | +1 Gold |
| `citrus` | Citrus | Grassland, Plains, Jungle | Plantation | +1 Gold |
| `tobacco` | Tobacco | Grassland, Plains | Plantation | +1 Gold |
| `silver` | Silver | Hills, Desert | Mine | +2 Gold |
| `gold_ore` | Gold | Hills, Desert | Mine | +2 Gold |

### Amenities & happiness

- Each city has **Amenities** and **Unhappiness**.
- `Unhappiness = city population`.
- `Amenities = unique luxury types owned + per-tile amenity bonuses (e.g. Bananas) + building bonuses`.
- If Amenities < Unhappiness, the city's **food surplus is reduced** by the ratio `Amenities / Unhappiness`. This slows growth but does not change base yields.
- Excess amenities do not currently grant bonuses; they simply prevent growth penalties.

---

## 4. Strategic resources

Strategic resources are **stockpiled** per player. Each turn, every active strategic tile inside your borders adds +1 to your stockpile. Many advanced units require a strategic resource to build.

| ID | Name | Valid terrain | Improvement | Worked yields | Unlocks |
|----|------|---------------|-------------|---------------|---------|
| `copper` | Copper | Hills | Mine | +1 Production | Bronze melee units: Axeman, Maceman, Spearman, Hoplite |
| `tin` | Tin | Hills, Desert | Mine | +1 Production | No current unit; reserved for future bronze mechanics |
| `iron` | Iron | Hills | Mine | +1 Production | Swordsman, Longswordsman, Pikeman |
| `horses` | Horses | Plains, Grassland, Tundra | Pasture | +1 Food | Light Chariot, War Chariot, Rider, Horse Archer, Cataphract |
| `elephants` | Elephants | Jungle, Grassland, Plains | Pasture | +1 Food | War Elephant |
| `saltpeter` | Saltpeter | Desert, Hills, Tundra | Mine | — | Reserved for future gunpowder units |

### How stockpiling works

- Income: +1 of the resource per turn for each improved strategic tile in your territory.
- Consumption: when a unit/building with a resource requirement finishes production, the cost is deducted from the stockpile.
- A city can only start production if the owner has enough of the required resource in stock.
- Stockpiles persist across turns and are saved/loaded with the game.

---

## 5. Improvements required by resources

Resources are inactive until the matching improvement is built on the tile by a city's specialists (via Works).

| Improvement | Built by discipline | Resource examples |
|-------------|---------------------|-------------------|
| **Farm** | Carpentry | Wheat, Rice, Maize |
| **Pasture** | Carpentry | Horses, Cattle, Sheep, Elephants |
| **Plantation** | Carpentry | Bananas, Wine, Silk, Spices, Dyes, Cocoa, Citrus, Tobacco, Tea, Incense |
| **Camp** | Carpentry | Deer, Furs, Ivory |
| **Fishing Boats** | Survey | Fish, Crabs, Pearls |
| **Mine** | Masonry | Copper, Tin, Iron, Saltpeter, Salt, Silver, Gold |
| **Quarry** | Masonry | Stone |

Improvements still have three tiers as in the base rules; higher tiers add their own yields on top of the resource.

---

## 6. Map generation

Resources are placed deterministically after terrain and tribal/barbarian features:

1. The world generator creates terrain and coasts.
2. `placeFeatures` scatters villages and barbarian camps.
3. `placeResources` scatters resources on valid terrain tiles, avoiding features and exact starting positions.
4. Placement is seeded from the game seed, so the same seed always produces the same resource layout.

Resource density scales with map area. Rarer resources (e.g. Elephants, Saltpeter) appear less often than common ones (e.g. Wheat, Fish).

---

## 7. Unit / building resource requirements

Only strategic resources are used as build costs today. The following units require 1 unit of the listed resource:

| Unit | Resource |
|------|----------|
| Bronze Axeman | Copper |
| Maceman | Copper |
| Spearman | Copper |
| Hoplite | Copper |
| Swordsman | Iron |
| Longswordsman | Iron |
| Pikeman | Iron |
| Light Chariot | Horses |
| War Chariot | Horses |
| Rider | Horses |
| Horse Archer | Horses |
| Cataphract | Horses |
| War Elephant | Elephants |

If a unit needs both a tech and a resource, both must be satisfied before it appears in the production list.

---

## 8. Trading resources

Inter-player resource trading is **planned** but not implemented in this milestone. The design assumes:

- Luxuries and strategics can be traded in diplomatic deals.
- Trading a luxury does *not* remove the tile yields from the seller; it transfers the "amenity copy" or a strategic income copy to the buyer.
- Domestic trade routes currently only carry gold/food/production/science; resource hauling is a future extension.

---

## 9. Future extensions

- **Resource revealing techs** (e.g. a tech that reveals Iron on the map).
- **Per-turn strategic upkeep** for units, making stockpile management tighter.
- **Resource monopoly / scarcity** bonuses for controlling many copies of one luxury.
- **Great Merchant** ability to acquire or create a luxury resource.
- **International trade deals** to exchange resources between players.
