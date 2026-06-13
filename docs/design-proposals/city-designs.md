# City Design Proposal

> Review-only draft. Not yet wired into `packages/sim/src/game/state.ts`, `economy.ts`, or `commands.ts`.

This document proposes how cities grow, produce, defend, and specialize. It is designed to plug into the existing yield economy (food, production, gold, science, culture, faith) and the territory system already in M4.

## 1. Design goals

- **Cities are the economic engine:** every yield except a few empire-wide bonuses flows from cities.
- **Population matters:** citizens work tiles or fill specialist slots; growth is a deliberate choice, not automatic.
- **Lightweight districts:** a city has a small number of quarter slots, each unlocking buildings of a theme. No heavy art requirement.
- **Defense is active:** walls, garrison, and ranged strike make attacking a city a real project.
- **Loyalty keeps blobs in check:** distant or conquered cities can flip if neglected.

## 2. City model schema

```ts
interface City {
  id: number;
  name: string;
  ownerId: number;
  tile: { q: number; r: number };   // city center hex
  population: number;               // citizens
  foodStore: number;                // progress toward next citizen
  health: number;                   // 0–100 city HP
  defense: number;                  // base + walls/garrison
  productionQueue: QueueItem[];     // units, buildings, wonders
  productionProgress: number;       // accumulated production
  buildings: BuildingId[];
  wonders: WonderId[];              // world/national wonders built here
  workedTiles: Set<TileIndex>;      // tiles currently worked
  specialists: Record<Specialist, number>; // assigned specialists
  isCapital: boolean;
  loyalty: number;                  // 0–100
  unrest: number;                   // 0–100; high = riots, low yields
}

type QueueItem =
  | { kind: "unit"; unitId: UnitTypeId }
  | { kind: "building"; buildingId: BuildingId }
  | { kind: "wonder"; wonderId: WonderId }
  | { kind: "project"; projectId: string }; // e.g. "bread_and_circuses"

type Specialist = "scientist" | "merchant" | "artist" | "priest" | "engineer";
```

## 3. Population & growth

### 3.1 Food mechanics

- Each citizen consumes **2 food** per turn.
- Surplus food fills the `foodStore` bucket.
- When `foodStore` reaches the threshold, population increases by 1 and the bucket resets to 0.
- The threshold scales by population: `15 + 8 * (pop - 1) + pop²`.

| Population | Food to grow |
|---|---|
| 1 → 2 | 15 |
| 2 → 3 | 31 |
| 3 → 4 | 49 |
| 4 → 5 | 69 |
| 5 → 6 | 91 |
| 10 → 11 | 195 |

- **Granary** adds +2 food and stores 50% of surplus food when the city would starve (emergency buffer).
- Starvation: if food income is negative, the store drains; at 0 the city loses 1 population after `max(3, pop)` turns of starvation.

### 3.2 Citizen assignment

- A city of population `N` has `N` citizens to assign.
- Each citizen can be either:
  - **Working a tile** within city territory (rings 1–3, depending on culture/pop).
  - **A specialist** in a building that provides specialist slots.
- The city UI shows best-tile recommendations but the player can lock assignments.
- At population 1 the center tile is always worked automatically.

### 3.3 Working radius unlocks

| Population | Unlocked rings | Notes |
|---|---|---|
| 1 | 1 (adjacent) | Center + 6 tiles. |
| 4 | 2 | 12 more tiles. |
| 8 | 3 | 18 more tiles. |

## 4. Districts / quarters

Each city can build one of each district. Districts do not require a specific tile placement (kept lightweight); they are flags on the city that unlock buildings.

| District | Unlocked buildings | Default effect |
|---|---|---|
| **City Center** | (built-in) | +2 food, +1 production from center tile; ranged strike when attacked. |
| **Sacred Quarter** | Shrine, Temple, Cathedral | Faith + religious pressure; Priest specialists. |
| **Campus Quarter** | Library, Academy, University | Science; Scientist specialists. |
| **Market Quarter** | Market, Bank, Stock Exchange | Gold + trade routes; Merchant specialists. |
| **Military Quarter** | Barracks, Stable, Armory, Castle | Unit XP + production; Engineer specialists. |
| **Harbor Quarter** | Harbor, Lighthouse, Shipyard | Coastal required; naval production + gold. |
| **Theater Quarter** | Monument, Amphitheater, Museum | Culture + Great Work slots; Artist specialists. |
| **Industrial Quarter** | Workshop, Forge, Watermill, Lumber Mill | Production; Engineer specialists. |
| **Aqueduct** | (standalone) | Fresh-water housing bonus; +2 food. |

A district costs **production × 0.75** of its era baseline and has a one-time build time. Buildings inside it then become available in the production queue.

## 5. Building roster

Existing buildings from `content.ts` are kept; proposed additions/extensions are marked **(new)**.

### 5.1 Food / growth

| ID | Name | Cost | Tech | Yields | Effect |
|---|---|---|---|---|---|
| `granary` | Granary | 20 | `pottery_kiln` | +2 food | Surplus preservation. |
| `aqueduct` | Aqueduct | 30 | `engineering` | +2 food | Allows larger cities; fresh-water housing. |
| `hospital` | Hospital | 60 | `medicine` (new) | +3 food | -50% disease/unrest from plague events. |

### 5.2 Production

| ID | Name | Cost | Tech | Yields | Effect |
|---|---|---|---|---|---|
| `workshop` | Workshop | 18 | `native_copper` | +1 prod | +10% production toward units. |
| `forge` | Forge | 26 | `smelting` | +2 prod | +10% production toward melee/siege. |
| `lumber_mill` | Lumber Mill | 24 | `machinery` (new) | +2 prod | Forest tiles worked by city +1 prod. |
| `watermill` | Watermill | 28 | `engineering` | +2 prod | Must be on river; +1 food. |

### 5.3 Science

| ID | Name | Cost | Tech | Yields | Effect |
|---|---|---|---|---|---|
| `library` | Archive | 26 | `writing` | +2 science | 1 scientist slot. |
| `academy` | Academy | 34 | `philosophy` | +3 science | 1 scientist slot; +10% science in city. |
| `university` | University | 50 | `education` (new) | +4 science | 2 scientist slots; jungle adjacency bonus. |
| `observatory` | Observatory | 55 | `astronomy` (new) | +4 science | Mountain adjacency bonus. |

### 5.4 Gold / trade

| ID | Name | Cost | Tech | Yields | Effect |
|---|---|---|---|---|---|
| `market` | Market | 24 | `coinage` | +3 gold | +1 trade route capacity; 1 merchant slot. |
| `bank` | Bank | 50 | `banking` (new) | +5 gold | +1 trade route capacity. |
| `stock_exchange` | Stock Exchange | 80 | `economics` (new) | +8 gold | +25% gold in city. |

### 5.5 Culture / faith

| ID | Name | Cost | Tech | Yields | Effect |
|---|---|---|---|---|---|
| `monument` | Monument | 28 | `monumental_architecture` | +1 culture | +20% border growth speed. |
| `shrine` | Shrine | 18 | `ritual_burial` | +1 faith | 1 priest slot. |
| `temple` | Temple | 30 | `writing` | +2 faith | 1 priest slot; Pantheon points. |
| `cathedral` | Cathedral | 60 | `theology` (new) | +3 faith | 1 priest slot; religion founder slot. |
| `amphitheater` | Amphitheater | 40 | `drama_poetry` (new) | +2 culture | 1 Great Work of Writing slot. |
| `museum` | Museum | 70 | `humanism` (new) | +3 culture | 2 Great Work slots. |

### 5.6 Military / defense

| ID | Name | Cost | Tech | Yields | Effect |
|---|---|---|---|---|---|
| `walls` | Walls | 24 | `masonry` | — | +50 city HP, +5 defense, ranged strike. |
| `barracks` | Barracks | 22 | `bronze_alloying` | — | Units built here start with +5 XP. |
| `stable` | Stable | 20 | `equestrian` | +1 prod | +15% production toward cavalry. |
| `armory` | Armory | 40 | `steel` (new) | — | +10% combat strength for garrisoned units. |
| `castle` | Castle | 55 | `castles` (new) | — | +50 city HP, +5 defense; requires walls. |
| `shipyard` | Shipyard | 35 | `shipbuilding` (new) | +2 prod | +25% production toward naval units. |

## 6. City defense & capture

- **City base defense:** `5 + population/2 + walls bonus + garrison bonus`.
- **City HP:** 100 base; +50 with Walls; +50 with Castle.
- **Ranged strike:** cities with Walls/Castle can attack adjacent enemy units each turn for `15 + era` damage.
- **Garrison:** a military unit stationed in the city adds its strength/2 to city defense and enables the ranged strike range extension.
- **Capture:** when city HP reaches 0, a melee unit can capture it. The attacker chooses **keep** or **raze**.
- **Raze:** city is destroyed over several turns; yields production to the razing player.
- **Pillage:** enemy units can pillage tile improvements without attacking the city directly.

## 7. Production queue

- Cities spend accumulated production each turn on the front item in the queue.
- If production overflows, it carries over to the next item.
- Queue items can be reordered or cancelled; cancelling returns 50% of invested production as gold.
- **Wonder rush:** production can be bought with gold at a 4:1 ratio (expensive).

## 8. Loyalty & unrest

### 8.1 Loyalty pressure

- Each city exerts loyalty pressure on nearby cities based on population, culture, amenities, and government.
- A city's loyalty changes each turn by the net pressure from all cities within 9 hexes.
- Foreign cities exert negative pressure; own cities exert positive pressure.
- Conquered cities start at 50 loyalty and have a large "recently conquered" malus.

### 8.2 Loyalty outcomes

| Loyalty | Effect |
|---|---|
| 100–76 | Normal yields, +10% growth. |
| 75–51 | Normal yields. |
| 50–26 | -25% yields, no growth. |
| 25–1 | -50% yields, rebels may spawn. |
| 0 | City flips to the strongest neighboring culture or becomes a Free City. |

### 8.3 Amenities

- Amenities counteract population pressure: `required = ceil(pop / 2)`.
- Sources: luxury resources (4 each), buildings (Temple, Circus, Thermal Bath), policies, religion, wonders.
- At +1 or better: growth and yields bonus. At -1 or worse: growth penalty, then rebellion risk.

## 9. City founding rules

- A Settler founds a city on its current tile.
- Minimum distance: cities cannot be founded within **4 hexes** of another city center.
- The city claims the center tile and ring 1 immediately.
- Founding removes the Settler unit.
- Some civ abilities trigger on founding (e.g. Rome gets a free Monument).

## 10. Open questions for review

1. Should districts require a specific tile (Civ VI style) or remain abstract city flags (Civ V style)? The proposal keeps them abstract for art simplicity.
2. Should wonders compete globally and block if another city finishes first?
3. Should city capture always allow raze, or should capitals be raze-locked?
4. Do we want national wonders that require a district in every city?
5. How much should housing matter? Currently growth is food-gated; adding housing could deepen city planning.
