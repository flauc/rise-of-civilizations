import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { canFoundReligion, foundReligion, spreadReligion, FAITH_TO_FOUND } from "./religion";
import { playerEffects } from "./civs";
import { citiesOf, unitsOf } from "./state";

function gameWithCity() {
  const s = createGame({ seed: "rel-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  s.players[0]!.researched.add("ritual_burial"); // religion is gated behind Ritual & Burial
  return s;
}

describe("religion", () => {
  it("founds a religion once enough faith is stored; beliefs apply to the founder", () => {
    const s = gameWithCity();
    expect(canFoundReligion(s, 0)).toBe(false); // no faith yet
    s.players[0]!.faith = FAITH_TO_FOUND;
    const city = citiesOf(s, 0)[0]!;
    expect(canFoundReligion(s, 0)).toBe(true);
    const res = foundReligion(s, 0, city.id, "Sun Cult", ["scholarship", "tithe"]);
    expect(res.ok).toBe(true);
    expect(s.religions).toHaveLength(1);
    expect(city.religion).toBe(s.religions[0]!.id);
    expect(s.players[0]!.foundedReligionId).toBe(s.religions[0]!.id);
    // scholarship (+15% science) belief is now in the founder's effects
    expect(playerEffects(s, 0).yieldPercent?.science ?? 0).toBeGreaterThanOrEqual(15);
  });

  it("spreads from a holy city to a nearby city", () => {
    const s = gameWithCity();
    const holy = citiesOf(s, 0)[0]!;
    s.players[0]!.faith = FAITH_TO_FOUND;
    foundReligion(s, 0, holy.id, "Sun Cult", []);
    // Plant a neutral city two tiles away.
    const nid = s.nextEntityId++;
    s.cities.set(nid, {
      id: nid, ownerId: 0, name: "Nearby", col: holy.col + 2, row: holy.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [],
    });
    expect(s.cities.get(nid)!.religion).toBeUndefined();
    spreadReligion(s);
    expect(s.cities.get(nid)!.religion).toBe(s.religions[0]!.id);
  });
});
