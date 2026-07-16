import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { combatPreviewDetail } from "./combat-preview-detail";
import { resolveAttack } from "./combat";
import { serializeState, deserializeState } from "./serialize";
import { isWaterTerrain } from "./terrain";
import { UNIT_DEFS, type PromotionId } from "./content";
import { makeUnit, type GameState, type Unit } from "./state";

/** Two adjacent, open, non-water tiles so a melee attack is actually legal. */
function landPair(state: GameState): { a: { col: number; row: number }; b: { col: number; row: number } } {
  for (let row = 1; row < state.map.rows - 1; row++) {
    for (let col = 1; col < state.map.cols - 2; col++) {
      const a = getTile(state.map, col, row);
      const b = getTile(state.map, col + 1, row);
      if (!a || !b) continue;
      if (isWaterTerrain(a.terrain) || isWaterTerrain(b.terrain)) continue;
      if (a.terrain === "mountains" || b.terrain === "mountains") continue;
      if (a.terrain === "volcano" || b.terrain === "volcano") continue;
      return { a: { col, row }, b: { col: col + 1, row } };
    }
  }
  throw new Error("no adjacent land pair on this map");
}

function bareGame(): GameState {
  const state = createGame({ seed: "preview", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  state.units.set(id, u);
  return u;
}

function placeCity(state: GameState, owner: number, col: number, row: number, population: number): number {
  const id = state.nextEntityId++;
  state.cities.set(id, {
    id,
    ownerId: owner,
    name: "Rome",
    col,
    row,
    population,
    foodStored: 0,
    productionStored: 0,
    production: null,
    buildings: [],
    specialists: [],
    wonders: [],
    workedTiles: [],
    isCapital: true,
    foundedAsCapital: true,
    hp: 100,
    lastAttackedTurn: 0,
    rangedAttackUsed: false,
    training: {},
    trainingQueue: [],
    modifiers: [],
  } as never);
  return id;
}

describe("combatPreviewDetail", () => {
  it("returns preview with modifiers on both sides", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5);
    const def = place(state, 1, "warrior", 6, 5);
    const detail = combatPreviewDetail(state, atk, def.col, def.row);
    expect(detail).not.toBeNull();
    expect(detail!.preview.toDefender).toBeGreaterThan(0);
    expect(detail!.attackerTokenId).toBeTruthy();
    expect(detail!.attackerHpAfter).toBe(Math.max(0, detail!.attackerHp - detail!.preview.toAttacker));
    expect(detail!.defenderHpAfter).toBe(Math.max(0, detail!.defenderHp - detail!.preview.toDefender));
    expect(detail!.attackerDamage).toBe(detail!.preview.toDefender);
  });

  it("reports no retaliation for ranged attacks", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    const target = place(state, 1, "warrior", 7, 5);
    const detail = combatPreviewDetail(state, archer, target.col, target.row);
    expect(detail).not.toBeNull();
    expect(detail!.preview.toAttacker).toBe(0);
    expect(detail!.defenderTokenId).toBeTruthy();
  });

  it("includes city defenses when attacking a city", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5);
    placeCity(state, 1, 6, 5, 2);
    const detail = combatPreviewDetail(state, atk, 6, 5);
    expect(detail).not.toBeNull();
    expect(detail!.preview.vsCity).toBe(true);
    expect(detail!.defenderCityTier).not.toBeNull();
    expect(detail!.defenderTokenId).toBeNull();
    expect(detail!.defenderName).toBe("Rome");
  });

  // The tier names a buildings/city_<tier>.png file; only city_1..city_10 exist on disk.
  it("maps every city population to a sprite tier that exists on disk", () => {
    for (const population of [1, 2, 3, 9, 10, 11, 25]) {
      const state = bareGame();
      const atk = place(state, 0, "swordsman", 5, 5);
      placeCity(state, 1, 6, 5, population);
      const tier = combatPreviewDetail(state, atk, 6, 5)!.defenderCityTier!;
      expect(tier).toBeGreaterThanOrEqual(1);
      expect(tier).toBeLessThanOrEqual(10);
    }
  });

  it("shows the smallest city sprite for a population-1 city", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5);
    placeCity(state, 1, 6, 5, 1);
    expect(combatPreviewDetail(state, atk, 6, 5)!.defenderCityTier).toBe(1);
  });
});

// The dialog's whole job is to tell the truth about what an attack will do. These
// run the prediction and then the real attack on an identical state and compare.
describe("combatPreviewDetail matches resolveAttack", () => {
  interface Scenario {
    name: string;
    attacker: Unit["type"];
    defender?: Unit["type"];
    city?: boolean;
    promotions?: PromotionId[];
    defenderPromotions?: PromotionId[];
    defenderStance?: Unit["stance"];
    attackerHp?: number;
    defenderHp?: number;
    level?: number;
    /** Civic/leader effects granted to the attacker's player. */
    effects?: Record<string, unknown>;
  }

  const SCENARIOS: Scenario[] = [
    { name: "melee vs melee", attacker: "swordsman", defender: "warrior" },
    { name: "ranged vs melee", attacker: "archer", defender: "warrior" },
    { name: "melee vs city", attacker: "swordsman", city: true },
    { name: "ranged vs city", attacker: "archer", city: true },
    { name: "wounded attacker", attacker: "swordsman", defender: "warrior", attackerHp: 40 },
    { name: "wounded defender", attacker: "swordsman", defender: "warrior", defenderHp: 30 },
    { name: "veteran attacker", attacker: "swordsman", defender: "warrior", level: 4 },
    { name: "stacked charges", attacker: "rider", defender: "warrior", promotions: ["charge", "cavalry_charge"] },
    { name: "shock on open ground", attacker: "swordsman", defender: "warrior", promotions: ["shock"] },
    { name: "suppression cuts retaliation", attacker: "swordsman", defender: "warrior", promotions: ["suppression"] },
    { name: "defender braced", attacker: "swordsman", defender: "spearman", defenderStance: "brace" },
    { name: "defender in testudo", attacker: "archer", defender: "warrior", defenderStance: "testudo" },
    { name: "defender stalwart", attacker: "swordsman", defender: "warrior", defenderPromotions: ["stalwart"] },
    { name: "defender brawler", attacker: "swordsman", defender: "warrior", defenderPromotions: ["brawler"] },
    { name: "veteran city assault", attacker: "swordsman", city: true, promotions: ["city_assault"], level: 3 },
    { name: "wounded vs city", attacker: "swordsman", city: true, attackerHp: 45 },
    // These three cover effects the old preview silently dropped on the city path.
    { name: "melee vs city with a melee-vs-city civic", attacker: "swordsman", city: true, effects: { meleeVsCityBonus: 4 } },
    { name: "siege vs city with a siege civic", attacker: "catapult", city: true, effects: { siegeVsCityDefenseMultiplier: 50 } },
    { name: "melee vs city with an empire-wide combat civic", attacker: "swordsman", city: true, effects: { allUnitCombat: 5 } },
    { name: "empire-wide combat civic vs a unit", attacker: "swordsman", defender: "warrior", effects: { allUnitCombat: 5 } },
  ];

  function build(s: Scenario): { state: GameState; attackerId: number; target: { col: number; row: number } } {
    const state = bareGame();
    const { a, b } = landPair(state);
    if (s.effects) {
      state.players[0]!.modifiers.push({ source: "test", effect: s.effects, expiresOnTurn: state.turn + 10 } as never);
    }
    const atk = place(state, 0, s.attacker, a.col, a.row);
    atk.movementLeft = UNIT_DEFS[s.attacker].movement;
    if (s.promotions) atk.promotions.push(...s.promotions);
    if (s.level) atk.level = s.level;
    if (s.attackerHp !== undefined) atk.hp = s.attackerHp;
    if (s.city) {
      placeCity(state, 1, b.col, b.row, 5);
    } else {
      const def = place(state, 1, s.defender!, b.col, b.row);
      if (s.defenderPromotions) def.promotions.push(...s.defenderPromotions);
      if (s.defenderStance) def.stance = s.defenderStance;
      if (s.defenderHp !== undefined) def.hp = s.defenderHp;
    }
    return { state, attackerId: atk.id, target: b };
  }

  for (const s of SCENARIOS) {
    it(`predicts ${s.name}`, () => {
      const { state, attackerId, target } = build(s);
      const defenderId = [...state.units.values()].find((u) => u.ownerId === 1)?.id;
      const detail = combatPreviewDetail(state, state.units.get(attackerId)!, target.col, target.row);
      expect(detail).not.toBeNull();

      // Re-run the identical setup on a clone and resolve the attack for real.
      const after = deserializeState(serializeState(state));
      const liveAttacker = after.units.get(attackerId)!;
      const attackerHpBefore = liveAttacker.hp;
      const cityBefore = [...after.cities.values()].find((c) => c.col === target.col && c.row === target.row);
      const defHpBefore = s.city ? cityBefore!.hp : after.units.get(defenderId!)!.hp;

      const res = resolveAttack(after, liveAttacker, target.col, target.row);
      expect(res.ok).toBe(true);

      const defAfter = s.city
        ? [...after.cities.values()].find((c) => c.col === target.col && c.row === target.row)!.hp
        : (after.units.get(defenderId!)?.hp ?? 0);
      const dealt = defHpBefore - defAfter;
      // `liveAttacker` is the state's own object, so its hp is right even if it died.
      const taken = attackerHpBefore - liveAttacker.hp;

      // A killing blow removes the defender, so the observed HP delta caps at what
      // it had; the preview reports the raw (uncapped) damage.
      const lethal = s.city ? defAfter <= 0 : !after.units.has(defenderId!);
      if (lethal) expect(detail!.attackerDamage).toBeGreaterThanOrEqual(defHpBefore);
      else expect(detail!.attackerDamage).toBe(dealt);
      expect(detail!.defenderDamage).toBe(taken);
    });
  }
});
