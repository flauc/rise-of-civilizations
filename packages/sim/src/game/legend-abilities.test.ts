// Legend (hero) signature abilities & passives — the real mechanics behind each
// hero's power (docs/UNIT-ABILITIES.md §9, docs/GREAT-PEOPLE.md §2).

import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { useAbility, abilityTargets } from "./abilities";
import { effectiveAbilities, playerEffects, cityEffects } from "./civs";
import { cityDefenseStrength } from "./combat";
import { legendCombatBonus } from "./legends";
import { tickLegendPassives } from "./legend-passives";
import { unitMorale, globalMoraleOf } from "./morale";
import { makeUnit, playerById, type City, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "legend-abil", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  warAll(state);
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 4;
  state.units.set(id, u);
  return u;
}

function placeLegend(state: GameState, owner: number, legendId: string, baseType: Unit["type"], col: number, row: number): Unit {
  const u = place(state, owner, baseType, col, row);
  u.legendId = legendId;
  return u;
}

function addCity(state: GameState, ownerId: number, col: number, row: number): City {
  const id = state.nextEntityId++;
  const city: City = {
    id, ownerId, name: `City${id}`, col, row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [],
    specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true,
    hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  };
  state.cities.set(id, city);
  return city;
}

describe("legend signature kits", () => {
  it("a legend fields its hero kit instead of the base unit's abilities", () => {
    const state = bareGame();
    const leonidas = placeLegend(state, 0, "leonidas", "hoplite", 5, 5);
    const kit = effectiveAbilities(state, leonidas);
    expect(kit).toContain("last_stand"); // Thermopylae
    expect(kit).not.toContain("shield_wall"); // replaced, not stacked (one stance per hero)
    // A plain hoplite still fields its base kit.
    const hoplite = place(state, 0, "hoplite", 7, 7);
    expect(effectiveAbilities(state, hoplite)).toContain("shield_wall");
  });

  it("Ashoka renounces the charge — no active abilities after Kalinga", () => {
    const state = bareGame();
    const ashoka = placeLegend(state, 0, "ashoka", "war_elephant", 5, 5);
    expect(effectiveAbilities(state, ashoka)).toEqual([]);
  });
});

describe("legend active abilities", () => {
  it("Slay the Beast kills hearten the hero and adjacent allies", () => {
    const state = bareGame();
    playerById(state, 1)!.isBarbarian = true;
    const gilgamesh = placeLegend(state, 0, "gilgamesh", "axeman", 5, 5);
    const ally = place(state, 0, "warrior", 4, 5);
    const beast = place(state, 1, "warrior", 6, 5);
    beast.hp = 4; // one blow fells it
    const allyMorale = unitMorale(ally);
    expect(useAbility(state, gilgamesh, "slay_the_beast", 6, 5).ok).toBe(true);
    expect(state.units.has(beast.id)).toBe(false);
    expect(unitMorale(ally)).toBeGreaterThanOrEqual(allyMorale + 10);
  });

  it("Uprising converts an adjacent barbarian war-band and only targets barbarians", () => {
    const state = bareGame();
    playerById(state, 1)!.isBarbarian = true;
    const boudica = placeLegend(state, 0, "boudica", "war_chariot", 5, 5);
    const band = place(state, 1, "warrior", 6, 5);
    expect(abilityTargets(state, boudica, "uprising").has("6,5")).toBe(true);
    expect(useAbility(state, boudica, "uprising", 6, 5).ok).toBe(true);
    expect(band.ownerId).toBe(0); // the tribe joins her revolt
    expect(state.units.has(band.id)).toBe(true);
  });

  it("Uprising cannot rouse a rival civilization's soldiers", () => {
    const state = bareGame();
    const boudica = placeLegend(state, 0, "boudica", "war_chariot", 5, 5);
    place(state, 1, "warrior", 6, 5); // a rival's soldier, not a tribe
    expect(abilityTargets(state, boudica, "uprising").has("6,5")).toBe(false);
    expect(useAbility(state, boudica, "uprising", 6, 5).ok).toBe(false);
  });

  it("Sacred Banner heals and heartens Joan and adjacent allies", () => {
    const state = bareGame();
    const joan = placeLegend(state, 0, "joan_of_arc_legend", "longswordsman", 5, 5);
    const ally = place(state, 0, "warrior", 6, 5);
    joan.hp = 50;
    ally.hp = 50;
    const allyMorale = unitMorale(ally);
    expect(useAbility(state, joan, "sacred_banner").ok).toBe(true);
    expect(joan.hp).toBe(60);
    expect(ally.hp).toBe(60);
    expect(unitMorale(ally)).toBe(allyMorale + 15);
    expect(joan.attackedThisTurn).toBe(true); // ends the turn
  });

  it("Pyramid of Skulls spreads terror when the target falls", () => {
    const state = bareGame();
    const tamerlane = placeLegend(state, 0, "tamerlane", "cataphract", 5, 5);
    const victim = place(state, 1, "warrior", 6, 5);
    victim.hp = 4;
    const witness = place(state, 1, "warrior", 8, 5); // 2 tiles from the kill
    const witnessMorale = unitMorale(witness);
    expect(useAbility(state, tamerlane, "pyramid_of_skulls", 6, 5).ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false);
    expect(unitMorale(witness)).toBe(witnessMorale - 15);
  });

  it("The Basilica outranges a regular catapult and draws no retaliation", () => {
    const state = bareGame();
    const mehmed = placeLegend(state, 0, "mehmed_ii", "catapult", 5, 5);
    const target = place(state, 1, "warrior", 8, 5); // 3 tiles: beyond base siege range
    expect(abilityTargets(state, mehmed, "basilica_bombard").has("8,5")).toBe(true);
    const hp = mehmed.hp;
    expect(useAbility(state, mehmed, "basilica_bombard", 8, 5).ok).toBe(true);
    expect(mehmed.hp).toBe(hp); // a ranged shot — no counter-blow
    expect(target.hp).toBeLessThan(100);
  });
});

describe("legend situational combat passives", () => {
  it("Belisarius fights harder the more he is outnumbered", () => {
    const state = bareGame();
    const belisarius = placeLegend(state, 0, "belisarius", "cataphract", 5, 5);
    place(state, 1, "warrior", 6, 5);
    const oneEnemy = legendCombatBonus(state, belisarius);
    place(state, 1, "warrior", 4, 5);
    place(state, 1, "warrior", 5, 4);
    const threeEnemies = legendCombatBonus(state, belisarius);
    expect(threeEnemies).toBe(oneEnemy + 4); // +2 per enemy beyond the first
  });

  it("El Cid gains strength beyond his own borders", () => {
    const state = bareGame();
    const elCid = placeLegend(state, 0, "el_cid", "cataphract", 5, 5);
    // No city owns this ground — the frontier.
    expect(legendCombatBonus(state, elCid)).toBe(9 - 2 + 4);
  });

  it("Cleopatra's Allure weakens adjacent enemies", () => {
    const state = bareGame();
    placeLegend(state, 1, "cleopatra", "warrior", 5, 5);
    const foe = place(state, 0, "warrior", 6, 5);
    expect(legendCombatBonus(state, foe)).toBe(-3);
  });

  it("Qin Shi Huang's Great Wall strengthens every city he rules", () => {
    const state = bareGame();
    const city = addCity(state, 0, 10, 10);
    const without = cityDefenseStrength(state, city);
    placeLegend(state, 0, "qin_shi_huang", "swordsman", 3, 3); // anywhere in the empire
    expect(cityDefenseStrength(state, city)).toBe(without + 10);
  });
});

describe("legend empire & city presence effects", () => {
  it("Pachacuti's roads let land units ignore rough terrain", () => {
    const state = bareGame();
    expect(playerEffects(state, 0).ignoreRoughTerrain).toBeFalsy();
    placeLegend(state, 0, "pachacuti", "swordsman", 5, 5);
    expect(playerEffects(state, 0).ignoreRoughTerrain).toBe(true);
  });

  it("Zheng He's treasure fleet speeds every ship", () => {
    const state = bareGame();
    placeLegend(state, 0, "zheng_he_legend", "trireme", 5, 5);
    expect(playerEffects(state, 0).navalMovementBonus ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("Ramesses II boosts the city he holds court in", () => {
    const state = bareGame();
    const city = addCity(state, 0, 5, 5);
    expect(cityEffects(state, city).yieldPercent?.production ?? 0).toBe(0);
    placeLegend(state, 0, "ramesses_ii", "war_chariot", 5, 5);
    const eff = cityEffects(state, city);
    expect(eff.yieldPercent?.production).toBe(25);
    expect(eff.yieldPercent?.culture).toBe(25);
  });
});

describe("legend per-turn passives (tickLegendPassives)", () => {
  it("Mansa Musa floods the treasury with gold", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    placeLegend(state, 0, "mansa_musa", "swordsman", 5, 5);
    const gold = player.gold;
    tickLegendPassives(state, player);
    expect(player.gold).toBe(gold + 14);
  });

  it("Hammurabi's Code steadies empire-wide morale", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    placeLegend(state, 0, "hammurabi", "spearman", 5, 5);
    const before = globalMoraleOf(player);
    tickLegendPassives(state, player);
    expect(globalMoraleOf(player)).toBe(before + 2);
  });

  it("Ashoka yields faith and heals adjacent allies", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    placeLegend(state, 0, "ashoka", "war_elephant", 5, 5);
    const ally = place(state, 0, "warrior", 6, 5);
    ally.hp = 50;
    const faith = player.faith;
    tickLegendPassives(state, player);
    expect(player.faith).toBe(faith + 4);
    expect(ally.hp).toBe(65);
  });

  it("Cyrus grants marching speed to himself and adjacent allies", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    const cyrus = placeLegend(state, 0, "cyrus", "cataphract", 5, 5);
    const ally = place(state, 0, "warrior", 6, 5);
    const cyrusMove = cyrus.movementLeft;
    const allyMove = ally.movementLeft;
    tickLegendPassives(state, player);
    expect(cyrus.movementLeft).toBe(cyrusMove + 1);
    expect(ally.movementLeft).toBe(allyMove + 1);
  });

  it("Sun Tzu drills adjacent troops", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    placeLegend(state, 0, "sun_tzu_legend", "swordsman", 5, 5);
    const student = place(state, 0, "warrior", 6, 5);
    tickLegendPassives(state, player);
    expect(student.xp).toBeGreaterThanOrEqual(3);
  });

  it("Genghis Khan's dread erodes adjacent enemies' morale", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    placeLegend(state, 0, "genghis_khan", "horse_archer", 5, 5);
    const foe = place(state, 1, "warrior", 6, 5);
    const morale = unitMorale(foe);
    tickLegendPassives(state, player);
    expect(unitMorale(foe)).toBe(morale - 3);
  });
});
