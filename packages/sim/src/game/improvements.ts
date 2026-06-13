import { getTile, type TerrainType } from "@roc/shared";
import type { GameState, Unit } from "./state";
import { playerById } from "./state";
import type { Yields } from "./terrain";

export type ImprovementKind = "farm" | "mine" | "road";

export interface ImprovementDef {
  kind: ImprovementKind;
  name: string;
  /** Terrain it can be built on (roads: any passable land — handled separately). */
  terrains?: TerrainType[];
  yields?: Partial<Yields>;
}

export const IMPROVEMENT_DEFS: Record<ImprovementKind, ImprovementDef> = {
  farm: { kind: "farm", name: "Farm", terrains: ["grassland", "plains"], yields: { food: 1 } },
  mine: { kind: "mine", name: "Mine", terrains: ["hills"], yields: { production: 1 } },
  road: { kind: "road", name: "Road", yields: {} },
};

/** Yield bonus a tile's improvement contributes when worked. */
export function improvementYields(improvement: string | undefined): Yields {
  if (!improvement) return { food: 0, production: 0, gold: 0, science: 0 };
  const def = IMPROVEMENT_DEFS[improvement as ImprovementKind];
  return {
    food: def?.yields?.food ?? 0,
    production: def?.yields?.production ?? 0,
    gold: def?.yields?.gold ?? 0,
    science: 0,
  };
}

const PASSABLE_FOR_ROAD: ReadonlySet<TerrainType> = new Set<TerrainType>([
  "plains", "grassland", "desert", "tundra", "snow", "forest", "jungle", "hills",
]);

/** Improvement kinds a worker could build on its current tile. */
export function buildableHere(state: GameState, unit: Unit): ImprovementKind[] {
  const tile = getTile(state.map, unit.col, unit.row);
  if (!tile) return [];
  const out: ImprovementKind[] = [];
  if (!tile.improvement) {
    for (const kind of ["farm", "mine"] as const) {
      if (IMPROVEMENT_DEFS[kind].terrains?.includes(tile.terrain)) out.push(kind);
    }
  }
  if (!tile.road && PASSABLE_FOR_ROAD.has(tile.terrain)) out.push("road");
  return out;
}

export interface BuildResult {
  ok: boolean;
  error?: string;
}

/** A worker builds an improvement on its tile (instant, consumes a charge). */
export function buildImprovement(state: GameState, unit: Unit, kind: ImprovementKind): BuildResult {
  if (unit.charges <= 0) return { ok: false, error: "no charges left" };
  if (!buildableHere(state, unit).includes(kind)) return { ok: false, error: "cannot build here" };
  const tile = getTile(state.map, unit.col, unit.row)!;
  if (kind === "road") tile.road = true;
  else tile.improvement = kind;
  unit.charges -= 1;
  unit.movementLeft = 0;
  const owner = playerById(state, unit.ownerId);
  state.log.push(`${owner?.name ?? "?"} built a ${IMPROVEMENT_DEFS[kind].name}.`);
  if (unit.charges <= 0) state.units.delete(unit.id);
  return { ok: true };
}
