import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { resolveAttack } from "./combat";
import { makeUnit, playerById, type GameState, type Unit } from "./state";
import {
  startingUnitMorale,
  moraleAttackMultiplier,
  moraleDefenseMultiplier,
  unitMorale,
  globalMoraleOf,
  onEnemyDefeated,
  onUnitLost,
  onUnitPromoted,
  onWarDeclared,
  decayGlobalMorale,
  routeChance,
  maybeRoute,
  upkeepGoldMultiplier,
  upkeepMoraleGain,
  upkeepDecayMultiplier,
  GLOBAL_MORALE_BASE,
  KILL_MORALE_SELF,
  KILL_MORALE_ADJACENT,
  DEATH_MORALE_ADJACENT,
} from "./morale";
import { unitUpkeep } from "./economy";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "morale", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  warAll(state);
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number, morale = 100): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row, 0, morale);
  u.movementLeft = 2;
  state.units.set(id, u);
  return u;
}

describe("morale — bounds & starting value", () => {
  it("a new unit starts at base + half the global morale", () => {
    const state = bareGame();
    playerById(state, 0)!.globalMorale = 100;
    expect(startingUnitMorale(state, 0)).toBe(100); // 50 + 100/2

    playerById(state, 0)!.globalMorale = GLOBAL_MORALE_BASE; // 50
    expect(startingUnitMorale(state, 0)).toBe(75); // 50 + 50/2

    // Building bonus stacks; result is clamped to the 0–200 range.
    playerById(state, 0)!.globalMorale = 200;
    expect(startingUnitMorale(state, 0, 80)).toBe(200);
  });

  it("legacy units/players read as neutral / base", () => {
    const u = makeUnit(1, 0, "warrior", 0, 0);
    delete u.morale;
    expect(unitMorale(u)).toBe(100);
    expect(globalMoraleOf(undefined)).toBe(GLOBAL_MORALE_BASE);
  });
});

describe("morale — combat buff/debuff", () => {
  it("at 0 morale a unit attacks 20% less and defends 10% less", () => {
    const u = makeUnit(1, 0, "warrior", 0, 0, 0, 0);
    expect(moraleAttackMultiplier(u)).toBeCloseTo(0.8);
    expect(moraleDefenseMultiplier(u)).toBeCloseTo(0.9);
  });

  it("at neutral morale there is no modifier; high morale buffs", () => {
    const neutral = makeUnit(1, 0, "warrior", 0, 0, 0, 100);
    expect(moraleAttackMultiplier(neutral)).toBeCloseTo(1);
    expect(moraleDefenseMultiplier(neutral)).toBeCloseTo(1);

    const high = makeUnit(2, 0, "warrior", 0, 0, 0, 200);
    expect(moraleAttackMultiplier(high)).toBeCloseTo(1.2);
    expect(moraleDefenseMultiplier(high)).toBeCloseTo(1.1);
  });
});

describe("morale — battlefield swings", () => {
  it("defeating an enemy rallies the victor, nearby allies, and global morale", () => {
    const state = bareGame();
    const killer = place(state, 0, "warrior", 5, 5, 100);
    const ally = place(state, 0, "warrior", 6, 5, 100); // adjacent to killer
    const foe = place(state, 1, "warrior", 7, 7, 100);
    const before = globalMoraleOf(playerById(state, 0));
    onEnemyDefeated(state, killer, foe);
    expect(unitMorale(killer)).toBe(100 + KILL_MORALE_SELF);
    expect(unitMorale(ally)).toBe(100 + KILL_MORALE_ADJACENT);
    expect(globalMoraleOf(playerById(state, 0))).toBe(before + Math.round(KILL_MORALE_SELF * 0.1));
  });

  it("killing a barbarian inspires less than killing a major civ's unit", () => {
    const state = createGame({ seed: "morale-barb", cols: 30, rows: 20, barbarians: true });
    state.units.clear();
    warAll(state);
    const barbId = state.players.find((p) => p.isBarbarian)!.id;

    const slayerA = place(state, 0, "warrior", 5, 5, 100);
    const civFoe = place(state, 1, "warrior", 8, 8, 100);
    onEnemyDefeated(state, slayerA, civFoe);
    const vsCiv = unitMorale(slayerA) - 100;

    const slayerB = place(state, 0, "warrior", 15, 15, 100);
    const barbFoe = place(state, barbId, "warrior", 18, 18, 100);
    onEnemyDefeated(state, slayerB, barbFoe);
    const vsBarb = unitMorale(slayerB) - 100;

    expect(vsBarb).toBeGreaterThan(0);
    expect(vsBarb).toBeLessThan(vsCiv);
  });

  it("losing a unit shakes nearby allies and lowers global morale", () => {
    const state = bareGame();
    const dying = place(state, 0, "warrior", 5, 5, 100);
    const ally = place(state, 0, "warrior", 6, 5, 100);
    const before = globalMoraleOf(playerById(state, 0));
    onUnitLost(state, dying);
    expect(unitMorale(ally)).toBe(100 - DEATH_MORALE_ADJACENT);
    expect(globalMoraleOf(playerById(state, 0))).toBeLessThan(before);
  });

  it("promotion heartens the unit and its neighbours", () => {
    const state = bareGame();
    const u = place(state, 0, "warrior", 5, 5, 100);
    const ally = place(state, 0, "warrior", 6, 5, 100);
    onUnitPromoted(state, u);
    expect(unitMorale(u)).toBeGreaterThan(100);
    expect(unitMorale(ally)).toBeGreaterThan(100);
  });
});

describe("morale — routing", () => {
  it("route chance falls to zero at high morale and is reduced by resistance", () => {
    const low = makeUnit(1, 0, "warrior", 0, 0, 0, 0);
    const mid = makeUnit(2, 0, "warrior", 0, 0, 0, 100);
    const high = makeUnit(3, 0, "warrior", 0, 0, 0, 150);
    expect(routeChance(low)).toBeGreaterThan(routeChance(mid));
    expect(routeChance(mid)).toBeGreaterThan(0);
    expect(routeChance(high)).toBe(0);

    // A disciplined unit (legionary, routeResistance) routs less at equal morale.
    const legionary = makeUnit(4, 0, "legionary", 0, 0, 0, 0);
    expect(routeChance(legionary)).toBeLessThan(routeChance(low));
  });

  it("high-morale units never rout; low-morale units sometimes do (and flee)", () => {
    const state = bareGame();
    // Steadfast: morale 200 → no rout, ever.
    for (let i = 0; i < 20; i++) {
      const u = place(state, 0, "warrior", 5, 5, 200);
      state.turn = i;
      expect(maybeRoute(state, u)).toBe(false);
      state.units.delete(u.id);
    }

    // Broken: morale 0 → a meaningful fraction rout across turns.
    let routed = 0;
    for (let i = 0; i < 40; i++) {
      const u = place(state, 0, "warrior", 15, 10, 0);
      // place an enemy nearby so the router has something to flee from
      const enemy = place(state, 1, "swordsman", 16, 10, 100);
      state.turn = i;
      if (maybeRoute(state, u)) {
        routed++;
        expect(u.routedUntilTurn).toBe(state.turn + 1);
        expect(u.movementLeft).toBe(0);
      }
      state.units.delete(u.id);
      state.units.delete(enemy.id);
    }
    expect(routed).toBeGreaterThan(0);
  });
});

describe("morale — global decay", () => {
  it("does not decay during the grace period, then ramps up but never below base", () => {
    const state = bareGame();
    const p = playerById(state, 0)!;
    p.globalMorale = 120;
    p.lastMoraleGainTurn = 0;

    // Within the 3-turn grace window: no decay.
    state.turn = 3;
    decayGlobalMorale(state, p);
    expect(p.globalMorale).toBe(120);

    // First decaying turn (turn 4): 1% of 120 → ~119.
    state.turn = 4;
    decayGlobalMorale(state, p);
    expect(p.globalMorale).toBe(119);

    // Far out, decay can't push morale below the base of 50.
    p.globalMorale = 60;
    p.lastMoraleGainTurn = 0;
    state.turn = 40;
    decayGlobalMorale(state, p);
    expect(p.globalMorale).toBeGreaterThanOrEqual(GLOBAL_MORALE_BASE);

    // Already at base: decay is a no-op.
    p.globalMorale = GLOBAL_MORALE_BASE;
    decayGlobalMorale(state, p);
    expect(p.globalMorale).toBe(GLOBAL_MORALE_BASE);
  });

  it("the ramp accelerates the longer morale goes unearned", () => {
    const state = bareGame();
    const early = playerById(state, 0)!;
    early.globalMorale = 150;
    early.lastMoraleGainTurn = 0;
    state.turn = 5; // decayTurns = 2 → 2%
    decayGlobalMorale(state, early);
    const earlyDrop = 150 - early.globalMorale;

    const late = playerById(state, 1)!;
    late.globalMorale = 150;
    late.lastMoraleGainTurn = 0;
    state.turn = 12; // decayTurns = 9 → 9%
    decayGlobalMorale(state, late);
    const lateDrop = 150 - late.globalMorale;

    expect(lateDrop).toBeGreaterThan(earlyDrop);
  });
});

describe("morale — declaring war", () => {
  it("high morale rises on a war declaration; low morale falls further", () => {
    const state = bareGame();

    // Confident: global ≥ 100 and a steady unit → both rise.
    const bold = playerById(state, 0)!;
    bold.globalMorale = 120;
    const boldUnit = place(state, 0, "warrior", 5, 5, 130);
    onWarDeclared(state, 0);
    expect(bold.globalMorale).toBeGreaterThan(120);
    expect(unitMorale(boldUnit)).toBeGreaterThan(130);

    // Shaky: global < 100 and a wavering unit → both fall.
    const shaky = playerById(state, 1)!;
    shaky.globalMorale = 70;
    const shakyUnit = place(state, 1, "warrior", 15, 15, 60);
    onWarDeclared(state, 1);
    expect(shaky.globalMorale).toBeLessThan(70);
    expect(unitMorale(shakyUnit)).toBeLessThan(60);
  });
});

describe("morale — military pay (upkeep)", () => {
  it("scales gold upkeep from 0× at −100% to 3× at +200%", () => {
    expect(upkeepGoldMultiplier({ upkeepModifierPct: -100 } as never)).toBeCloseTo(0);
    expect(upkeepGoldMultiplier({ upkeepModifierPct: 0 } as never)).toBeCloseTo(1);
    expect(upkeepGoldMultiplier({ upkeepModifierPct: 200 } as never)).toBeCloseTo(3);
    expect(upkeepGoldMultiplier(undefined)).toBeCloseTo(1);

    const state = bareGame();
    const u = place(state, 0, "swordsman", 5, 5); // base upkeep 2
    const base = unitUpkeep(state, u);
    expect(base).toBeGreaterThan(0);
    playerById(state, 0)!.upkeepModifierPct = -100;
    expect(unitUpkeep(state, u)).toBe(0); // starved army costs nothing
    playerById(state, 0)!.upkeepModifierPct = 100;
    expect(unitUpkeep(state, u)).toBe(base * 2); // double pay, double cost
  });

  it("pay slows, halts, or reverses morale decay", () => {
    const mk = (pid: number, pct: number) => {
      const p = playerById(bareState, pid)!;
      p.globalMorale = 120;
      p.lastMoraleGainTurn = 0;
      p.upkeepModifierPct = pct;
      return p;
    };
    const bareState = bareGame();
    bareState.turn = 8; // well past the grace window

    const starved = mk(0, -100);
    decayGlobalMorale(bareState, starved);
    const starvedDrop = 120 - starved.globalMorale;

    const normal = mk(1, 0);
    decayGlobalMorale(bareState, normal);
    const normalDrop = 120 - normal.globalMorale;

    // Underpaying decays faster than the baseline.
    expect(starvedDrop).toBeGreaterThan(normalDrop);
    expect(normalDrop).toBeGreaterThan(0);

    // Paying +100% fully arrests decay.
    const funded = mk(0, 100);
    funded.globalMorale = 120;
    decayGlobalMorale(bareState, funded);
    expect(funded.globalMorale).toBe(120);
  });

  it("over-funding the army raises morale each turn, even between battles", () => {
    expect(upkeepMoraleGain(100)).toBe(0);
    expect(upkeepMoraleGain(200)).toBeGreaterThan(0);
    expect(upkeepMoraleGain(150)).toBeGreaterThan(0);
    expect(upkeepMoraleGain(150)).toBeLessThan(upkeepMoraleGain(200));
    expect(upkeepDecayMultiplier(-100)).toBeCloseTo(2);
    expect(upkeepDecayMultiplier(0)).toBeCloseTo(1);
    expect(upkeepDecayMultiplier(100)).toBeCloseTo(0);

    const state = bareGame();
    const p = playerById(state, 0)!;
    p.globalMorale = 80;
    p.lastMoraleGainTurn = 0;
    p.upkeepModifierPct = 200; // lavish pay
    state.turn = 20; // long since a battle — decay would normally bite
    decayGlobalMorale(state, p);
    expect(p.globalMorale).toBeGreaterThan(80); // morale climbs instead of fading
  });
});

describe("morale — combat integration", () => {
  it("a kill in combat raises the victor's global morale", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5, 100);
    // a lone weak target the swordsman can one-shot
    const def = place(state, 1, "scout", 6, 5, 50);
    def.hp = 1;
    const before = globalMoraleOf(playerById(state, 0));
    resolveAttack(state, atk, def.col, def.row);
    expect(state.units.has(def.id)).toBe(false); // defender died
    expect(unitMorale(atk)).toBeGreaterThan(100);
    expect(globalMoraleOf(playerById(state, 0))).toBeGreaterThan(before);
  });
});
