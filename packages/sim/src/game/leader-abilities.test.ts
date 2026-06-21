import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { citiesOf, unitsOf, type City } from "./state";
import { canUseLeaderAbility, useLeaderAbility, getLeaderAbilityForCiv } from "./leader-abilities";
import { playerEffects, unitDisplayName, uniqueUnitForUnit } from "./civs";

function foundCapital(state: ReturnType<typeof createGame>): City {
  const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
  applyCommand(state, { type: "foundCity", unitId: settler.id }, 0);
  return citiesOf(state, 0)[0]!;
}

function player0(state: ReturnType<typeof createGame>) {
  return state.players.find((p) => p.id === 0)!;
}

describe("leader abilities", () => {
  it("reports not unlocked before the required tech is known", () => {
    const state = createGame({ seed: "la-lock", cols: 30, rows: 20, barbarians: false, civIds: ["sumer"] });
    foundCapital(state);
    const p = player0(state);
    const res = canUseLeaderAbility(state, p);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("not yet unlocked");
  });

  it("unlocks and spawns units once the required tech is researched", () => {
    const state = createGame({ seed: "la-sumer", cols: 30, rows: 20, barbarians: false, civIds: ["sumer"] });
    const city = foundCapital(state);
    city.population = 2;
    const p = player0(state);
    p.gold = 100;
    p.researched.add("the_wheel");

    const before = unitsOf(state, 0).length;
    const res = useLeaderAbility(state, p);
    expect(res.ok).toBe(true);
    expect(unitsOf(state, 0).length).toBe(before + 2);
    expect(unitsOf(state, 0).some((u) => u.type === "light_chariot")).toBe(true);
    expect(p.leaderAbilityLastUsedTurn).toBe(state.turn);
    expect(p.gold).toBe(0);
  });

  it("cannot be reused while on cooldown", () => {
    const state = createGame({ seed: "la-cool", cols: 30, rows: 20, barbarians: false, civIds: ["lydia"] });
    foundCapital(state);
    const p = player0(state);
    p.researched.add("coinage");
    expect(useLeaderAbility(state, p).ok).toBe(true);
    const second = useLeaderAbility(state, p);
    expect(second.ok).toBe(false);
    expect(second.error).toContain("cooldown");
  });

  it("can be issued through the command dispatcher", () => {
    const state = createGame({ seed: "la-cmd", cols: 30, rows: 20, barbarians: false, civIds: ["lydia"] });
    foundCapital(state);
    const p = player0(state);
    p.researched.add("coinage");
    const before = p.gold;
    const res = applyCommand(state, { type: "useLeaderAbility" }, 0);
    expect(res.ok).toBe(true);
    expect(p.gold).toBe(before + 300);
  });

  it("applies empire-wide timed modifiers that are merged into civ effects", () => {
    const state = createGame({ seed: "la-mod", cols: 30, rows: 20, barbarians: false, civIds: ["lydia"] });
    foundCapital(state);
    const p = player0(state);
    p.researched.add("coinage");
    useLeaderAbility(state, p);
    const eff = playerEffects(state, p.id);
    expect(eff.yieldPercent?.gold).toBe(5);
  });

  it("applies city-specific modifiers for abilities that target cities", () => {
    const state = createGame({ seed: "la-city", cols: 30, rows: 20, barbarians: false, civIds: ["egypt"] });
    foundCapital(state);
    const p = player0(state);
    p.researched.add("masonry");
    const city = citiesOf(state, 0)[0]!;
    const res = useLeaderAbility(state, p);
    expect(res.ok).toBe(true);
    expect(city.modifiers.length).toBeGreaterThan(0);
  });

  it("spawns the civ's unique unit, not the plain base unit", () => {
    const state = createGame({ seed: "la-rome", cols: 30, rows: 20, barbarians: false, civIds: ["rome"] });
    const city = foundCapital(state);
    city.population = 6;
    const p = player0(state);
    p.researched.add("iron_bloomery");

    const before = unitsOf(state, 0).length;
    const res = useLeaderAbility(state, p);
    expect(res.ok).toBe(true);
    expect(unitsOf(state, 0).length).toBe(before + 3);

    // The Citizen Levy spawns swordsmen, which resolve to Rome's unique Legionary.
    const spawned = unitsOf(state, 0).find((u) => u.type === "swordsman")!;
    expect(spawned).toBeDefined();
    expect(uniqueUnitForUnit(state, spawned)?.id).toBe("rome_legionary");
    expect(unitDisplayName(state, spawned)).toBe("Roman Legionary");
  });

  it("returns undefined for an unknown civilization", () => {
    expect(getLeaderAbilityForCiv("not_a_civ")).toBeUndefined();
  });
});
