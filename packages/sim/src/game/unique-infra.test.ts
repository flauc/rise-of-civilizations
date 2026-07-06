import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { playerEffects, uniqueBuildingForCiv, uniqueImprovementForCiv } from "./civs";
import { availableProduction } from "./economy";
import { isUniqueImpKind, nextTierAt } from "./works";
import { improvementYields, isUniqueImprovementKind } from "./improvements";
import { citiesOf, unitsOf, type GameState } from "./state";
import type { TechId } from "./content";
import { getTile } from "@roc/shared";

function game(): GameState {
  const s = createGame({ seed: "infra-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  return s;
}

function foundCity(s: GameState, owner = 0) {
  const settler = unitsOf(s, owner).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id }, owner);
  return citiesOf(s, owner)[0]!;
}

describe("unique infrastructure", () => {
  it("offers a civ's unique BUILDING only after its tech, and only to that civ", () => {
    const s = game();
    s.players[0]!.civId = "lydia"; // Mint, a building unlocked by Coinage
    const city = foundCity(s, 0);
    const ub = uniqueBuildingForCiv("lydia")!;
    const offered = () =>
      availableProduction(s, s.players[0]!, city).some((o) => o.item.kind === "building" && o.item.id === ub.id);

    s.players[0]!.researched.delete(ub.reqTech as TechId);
    expect(offered()).toBe(false); // tech not known yet
    s.players[0]!.researched.add(ub.reqTech as TechId);
    expect(offered()).toBe(true);

    // A different civ (Egypt — whose infra is an improvement, not a building) is
    // never offered Lydia's building.
    s.players[0]!.civId = "egypt";
    expect(availableProduction(s, s.players[0]!, city).some((o) => o.item.kind === "building" && o.item.id === ub.id)).toBe(false);
  });

  it("applies a unique building's empire-wide CivEffects once it is built", () => {
    const s = game();
    s.players[0]!.civId = "carthage"; // Cothon → empire-wide naval +1 movement
    const city = foundCity(s, 0);
    const ub = uniqueBuildingForCiv("carthage")!;
    const before = playerEffects(s, 0).navalMovementBonus ?? 0;
    city.buildings.push(ub.id);
    const after = playerEffects(s, 0).navalMovementBonus ?? 0;
    expect(after).toBe(before + 1);
  });

  it("stacks a capped unique building's empire-wide effect per copy, up to its cap", () => {
    const s = game();
    s.players[0]!.civId = "hittites"; // Storm Temple → +1 melee per copy, capped at +4
    const city = foundCity(s, 0);
    const ub = uniqueBuildingForCiv("hittites")!;
    const melee = () => playerEffects(s, 0).unitClassCombat?.melee ?? 0;
    const base = melee(); // the Hittite civ ability's own melee bonus, before any building

    // Each copy (raised in a different city) adds +1 on top of the baseline...
    for (let n = 1; n <= 4; n++) {
      const c = citiesOf(s, 0)[n - 1] ?? city;
      c.buildings.push(ub.id);
      expect(melee()).toBe(base + n);
    }
    // ...but past the cap of 4, extra copies grant nothing more.
    city.buildings.push(ub.id, ub.id);
    expect(melee()).toBe(base + 4);
  });

  it("keeps an UNCAPPED unique building's effect once, no matter how many copies", () => {
    const s = game();
    s.players[0]!.civId = "carthage"; // Cothon → naval +1 movement, no effectsCap
    const city = foundCity(s, 0);
    const ub = uniqueBuildingForCiv("carthage")!;
    const nav = () => playerEffects(s, 0).navalMovementBonus ?? 0;

    city.buildings.push(ub.id);
    expect(nav()).toBe(1);
    city.buildings.push(ub.id, ub.id); // still just +1 — uncapped effects don't stack
    expect(nav()).toBe(1);
  });

  it("recognizes a civ's unique IMPROVEMENT kind with its worked yields and placement", () => {
    const s = game();
    const imp = uniqueImprovementForCiv("inca")!; // Terrace Farm
    expect(isUniqueImpKind(imp.id)).toBe(true);
    expect(isUniqueImprovementKind(imp.id)).toBe(true);
    expect(improvementYields(imp.id).food).toBe(imp.yields.food);

    const tile = getTile(s.map, 6, 6)!;
    tile.terrain = imp.terrain![0]! as typeof tile.terrain; // valid terrain
    tile.improvement = undefined;
    tile.structure = undefined;
    expect(nextTierAt(tile, imp.id)).toBe(1); // not built yet → build tier 1
    tile.terrain = "ocean" as typeof tile.terrain;
    expect(nextTierAt(tile, imp.id)).toBeNull(); // wrong terrain
  });

  it("lets a civ's unique IMPROVEMENT level up through three tiers, buffing its yields", () => {
    const imp = uniqueImprovementForCiv("inca")!; // Terrace Farm, base food 2
    const base = imp.yields.food ?? 0;

    // Each tier adds +2 to every yield the base produces (steeper than a generic
    // improvement's +1/tier — the buff that makes a unique improvement worth building).
    expect(improvementYields(imp.id, 1).food).toBe(base);
    expect(improvementYields(imp.id, 2).food).toBe(base + 2);
    expect(improvementYields(imp.id, 3).food).toBe(base + 4);

    // nextTierAt walks a built improvement up to (and stops at) tier 3.
    const s = game();
    const tile = getTile(s.map, 6, 6)!;
    tile.terrain = imp.terrain![0]! as typeof tile.terrain;
    tile.structure = undefined;
    tile.improvement = imp.id;
    tile.improvementLevel = 1;
    expect(nextTierAt(tile, imp.id)).toBe(2); // upgrade available
    tile.improvementLevel = 2;
    expect(nextTierAt(tile, imp.id)).toBe(3);
    tile.improvementLevel = 3;
    expect(nextTierAt(tile, imp.id)).toBeNull(); // maxed out
  });
});
