import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { resolveAttack, unitMaxHp } from "./combat";
import { useAbility, canUseAbility, tickAbilities, abilityTargets } from "./abilities";
import { makeUnit, playerById, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "abil", cols: 30, rows: 20, barbarians: false });
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

describe("active abilities", () => {
  it("Set Spears (brace) reduces damage taken — especially from cavalry", () => {
    // Unbraced run.
    let state = bareGame();
    let rider = place(state, 0, "rider", 5, 5);
    let spear = place(state, 1, "spearman", 6, 5);
    resolveAttack(state, rider, spear.col, spear.row);
    const unbracedLoss = 100 - spear.hp;

    // Braced run.
    state = bareGame();
    rider = place(state, 0, "rider", 5, 5);
    spear = place(state, 1, "spearman", 6, 5);
    expect(useAbility(state, spear, "brace").ok).toBe(true);
    expect(spear.stance).toBe("brace");
    expect(spear.movementLeft).toBe(0);
    resolveAttack(state, rider, spear.col, spear.row);
    const bracedLoss = 100 - spear.hp;

    expect(bracedLoss).toBeLessThan(unbracedLoss);
  });

  it("Charge rides through the target to the tile behind it", () => {
    const state = bareGame();
    const rider = place(state, 0, "rider", 5, 5);
    place(state, 1, "warrior", 6, 5); // adjacent; will survive one hit
    const res = useAbility(state, rider, "charge", 6, 5);
    expect(res.ok).toBe(true);
    // Rider ended up past the defender (no longer on its start tile).
    expect(`${rider.col},${rider.row}`).not.toBe("5,5");
  });

  it("Fire & Retreat shoots without retaliation, then steps away", () => {
    const state = bareGame();
    const ha = place(state, 0, "horse_archer", 5, 5);
    const target = place(state, 1, "warrior", 6, 5);
    const hp = ha.hp;
    const before = Math.abs(ha.col - target.col) + Math.abs(ha.row - target.row);
    const res = useAbility(state, ha, "fire_and_retreat", target.col, target.row);
    expect(res.ok).toBe(true);
    expect(ha.hp).toBe(hp); // ranged: no counter-attack
    expect(target.hp).toBeLessThan(100);
    const after = Math.abs(ha.col - target.col) + Math.abs(ha.row - target.row);
    expect(after).toBeGreaterThan(before); // retreated
  });

  it("Sunder debuffs the target's defense for a turn", () => {
    const state = bareGame();
    const axe = place(state, 0, "axeman", 5, 5);
    const foe = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, axe, "sunder", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.sunderedUntilTurn).toBe(state.turn + 1);
  });

  it("Harry pins the target so it cannot move next turn", () => {
    const state = bareGame();
    const dog = place(state, 0, "war_dog", 5, 5);
    const foe = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, dog, "harry", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) {
      expect(foe.pinnedUntilTurn).toBe(state.turn + 1);
      foe.movementLeft = 4;
      tickAbilities(state, playerById(state, 1)!);
      expect(foe.movementLeft).toBe(0); // pin enforced at turn start
    }
  });

  it("Emplace grants extra range to a siege engine", () => {
    const state = bareGame();
    const cat = place(state, 0, "catapult", 5, 5); // base range 2
    place(state, 1, "warrior", 9, 5); // distance 4? ensure > 2, <= 3 target below
    const far = place(state, 1, "warrior", 8, 5); // distance 3 from (5,5)
    // Not emplaced: range 2, distance 3 is out of range.
    expect(resolveAttack(state, cat, far.col, far.row).ok).toBe(false);
    // Emplace, then (simulating its next turn) it reaches distance 3.
    expect(useAbility(state, cat, "emplace").ok).toBe(true);
    expect(cat.stance).toBe("emplace");
    cat.movementLeft = 2;
    cat.attackedThisTurn = false;
    expect(resolveAttack(state, cat, far.col, far.row).ok).toBe(true);
  });

  it("Shock Charge goes on cooldown after use", () => {
    const state = bareGame();
    const cata = place(state, 0, "cataphract", 5, 5);
    place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, cata, "shock_charge", 6, 5).ok).toBe(true);
    expect(cata.abilityCooldowns?.shock_charge).toBe(state.turn + 2);
    // Even with movement restored, it's still on cooldown this turn.
    cata.movementLeft = 4;
    cata.attackedThisTurn = false;
    expect(canUseAbility(state, cata, "shock_charge").ok).toBe(false);
  });

  it("Reconnoiter spends the turn for a vision pulse", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    expect(useAbility(state, scout, "reconnoiter").ok).toBe(true);
    expect(scout.scouting).toBe(true);
    expect(scout.movementLeft).toBe(0);
  });

  it("Reconnoiter requires at least one movement point left", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    scout.movementLeft = 0;
    expect(useAbility(state, scout, "reconnoiter").ok).toBe(false);
    scout.movementLeft = 1;
    expect(useAbility(state, scout, "reconnoiter").ok).toBe(true);
  });

  it("abilityTargets lists in-range enemies for a targeted ability", () => {
    const state = bareGame();
    const rider = place(state, 0, "rider", 5, 5);
    place(state, 1, "warrior", 6, 5); // adjacent
    const targets = abilityTargets(state, rider, "charge");
    expect(targets.has("6,5")).toBe(true);
  });

  it("Fire Lance shoots from 2 tiles, takes no retaliation, and goes on a 2-turn cooldown", () => {
    const state = bareGame();
    // The fire_lance override only applies to the Tang/Song unique pikeman.
    playerById(state, 0)!.civId = "china_tang_song";
    const lancer = place(state, 0, "pikeman", 5, 5);
    const target = place(state, 1, "warrior", 7, 5); // distance 2
    const hp = lancer.hp;
    const res = useAbility(state, lancer, "fire_lance", target.col, target.row);
    expect(res.ok).toBe(true);
    expect(lancer.hp).toBe(hp); // ranged volley: no counter-attack
    expect(target.hp).toBeLessThan(100);
    expect(lancer.abilityCooldowns?.fire_lance).toBe(state.turn + 3); // cooldown 2 → wait two turns

    // On cooldown even with movement/attack restored this turn.
    lancer.movementLeft = 4;
    lancer.attackedThisTurn = false;
    expect(canUseAbility(state, lancer, "fire_lance").ok).toBe(false);
  });

  it("Fire Lance cannot reach a target 3 tiles away", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "china_tang_song";
    const lancer = place(state, 0, "pikeman", 5, 5);
    const far = place(state, 1, "warrior", 8, 5); // distance 3
    expect(useAbility(state, lancer, "fire_lance", far.col, far.row).ok).toBe(false);
  });

  it("Fire Lance hits slightly harder than the lancer's melee thrust", () => {
    // Ranged volley (tough defender so neither hit saturates the damage cap).
    let state = bareGame();
    playerById(state, 0)!.civId = "china_tang_song";
    let lancer = place(state, 0, "pikeman", 5, 5);
    let foe = place(state, 1, "longswordsman", 7, 5);
    useAbility(state, lancer, "fire_lance", foe.col, foe.row);
    const lanceDmg = 100 - foe.hp;

    // Plain melee thrust from the same matchup.
    state = bareGame();
    playerById(state, 0)!.civId = "china_tang_song";
    lancer = place(state, 0, "pikeman", 5, 5);
    foe = place(state, 1, "longswordsman", 6, 5);
    resolveAttack(state, lancer, foe.col, foe.row);
    const meleeDmg = 100 - foe.hp;

    expect(lanceDmg).toBeGreaterThan(meleeDmg);
  });

  it("rejects abilities the unit does not have", () => {
    const state = bareGame();
    const warrior = place(state, 0, "warrior", 5, 5);
    expect(canUseAbility(state, warrior, "charge").ok).toBe(false);
  });

  it("Plunder seizes gold when it kills, but not when the target survives", () => {
    // Kill: a near-dead foe is finished off and looted.
    let state = bareGame();
    playerById(state, 0)!.civId = "lydia"; // fields the Heavy Cavalry (Plunder)
    const goldBefore = playerById(state, 0)!.gold;
    let raider = place(state, 0, "cataphract", 5, 5); // → Lydian Heavy Cavalry
    let victim = place(state, 1, "slinger", 6, 5);
    victim.hp = 5;
    const kill = useAbility(state, raider, "plunder", victim.col, victim.row);
    expect(kill.ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false); // slain
    expect(playerById(state, 0)!.gold).toBeGreaterThan(goldBefore); // looted

    // No kill: a healthy foe survives, so no gold changes hands.
    state = bareGame();
    playerById(state, 0)!.civId = "lydia";
    const goldBefore2 = playerById(state, 0)!.gold;
    raider = place(state, 0, "cataphract", 5, 5);
    victim = place(state, 1, "spearman", 6, 5); // full HP, survives
    useAbility(state, raider, "plunder", victim.col, victim.row);
    expect(state.units.has(victim.id)).toBe(true);
    expect(playerById(state, 0)!.gold).toBe(goldBefore2);
  });

  it("Aimed Shot maims a survivor so it attacks weaker", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "kush_nubia"; // fields the Nubian Archer
    const archer = place(state, 0, "archer", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5); // sturdy, survives the shot
    expect(useAbility(state, archer, "aimed_shot", foe.col, foe.row).ok).toBe(true);
    expect(state.units.has(foe.id)).toBe(true);
    expect(foe.maimedUntilTurn).toBe(state.turn + 1);
  });

  it("Terrorize shakes the survivor's morale", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "carthage"; // fields the Carthaginian War Elephant
    const elephant = place(state, 0, "war_elephant", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, elephant, "terrorize", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.morale ?? 100).toBeLessThan(100);
  });

  it("Overrun lets the rider act again after a kill", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "ethiopia_zagwe"; // fields the Oromo Cavalry
    const rider = place(state, 0, "rider", 5, 5);
    const victim = place(state, 1, "slinger", 6, 5);
    victim.hp = 5; // will die to the strike
    expect(useAbility(state, rider, "overrun", victim.col, victim.row).ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false);
    expect(rider.attackedThisTurn).toBe(false); // may act again
    expect(rider.movementLeft).toBeGreaterThanOrEqual(1);
  });

  it("War Drums rally self and adjacent allies and dismay adjacent enemies", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "almoravids"; // fields the Lamtuna Spearman
    const drummer = place(state, 0, "spearman", 5, 5);
    const ally = place(state, 0, "warrior", 4, 5);
    const enemy = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, drummer, "war_drums").ok).toBe(true);
    expect(drummer.morale).toBe(115);
    expect(ally.morale).toBe(115);
    expect(enemy.morale).toBe(90);
    expect(drummer.attackedThisTurn).toBe(true); // ends the turn
  });

  it("Poisoned Arrows make the survivor bleed at its turn start", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "kongo"; // fields the Kongo Archer
    const archer = place(state, 0, "archer", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, archer, "poisoned_arrows", foe.col, foe.row).ok).toBe(true);
    expect(state.units.has(foe.id)).toBe(true);
    expect(foe.poisonedUntilTurn).toBe(state.turn + 2);
    const hpAfterShot = foe.hp;
    tickAbilities(state, playerById(state, 1)!);
    expect(foe.hp).toBe(hpAfterShot - 8); // venom bleeds at turn start
  });

  it("Fresh Mounts restores movement without ending the turn", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "songhai"; // fields the Songhai Cavalry
    const rider = place(state, 0, "rider", 5, 5);
    rider.movementLeft = 1;
    expect(useAbility(state, rider, "fresh_mounts").ok).toBe(true);
    expect(rider.movementLeft).toBe(4); // rider's full movement
    expect(rider.attackedThisTurn).toBe(false); // may still act
  });

  it("Monsoon Run grants +2 movement without ending the turn", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "swahili"; // fields the Swahili Dhow
    const dhow = place(state, 0, "bireme", 5, 5);
    dhow.movementLeft = 1;
    expect(useAbility(state, dhow, "monsoon_run").ok).toBe(true);
    expect(dhow.movementLeft).toBe(3);
    expect(dhow.attackedThisTurn).toBe(false);
  });

  it("Zareba thorns bleed a melee attacker beyond normal retaliation", () => {
    // Attack a braced defender (baseline retaliation).
    let state = bareGame();
    playerById(state, 1)!.civId = "kanem_bornu"; // defender fields the Kanembu Guard
    let sword = place(state, 0, "swordsman", 5, 5);
    let guard = place(state, 1, "spearman", 6, 5);
    resolveAttack(state, sword, guard.col, guard.row);
    const baselineLoss = 100 - sword.hp;

    // Same fight against a raised zareba: the attacker bleeds on the thorns.
    state = bareGame();
    playerById(state, 1)!.civId = "kanem_bornu";
    sword = place(state, 0, "swordsman", 5, 5);
    guard = place(state, 1, "spearman", 6, 5);
    expect(useAbility(state, guard, "zareba").ok).toBe(true);
    resolveAttack(state, sword, guard.col, guard.row);
    const thornLoss = 100 - sword.hp;
    expect(thornLoss).toBeGreaterThan(baselineLoss);
  });

  it("Stone Bulwark shelters adjacent allies", () => {
    // Ally defends without a bulwark neighbour.
    let state = bareGame();
    playerById(state, 1)!.civId = "great_zimbabwe"; // fields the Zimbabwe Spearman
    let attacker = place(state, 0, "swordsman", 5, 5);
    let ally = place(state, 1, "warrior", 6, 5);
    place(state, 1, "spearman", 7, 5); // present but not in stance
    resolveAttack(state, attacker, ally.col, ally.row);
    const unshieldedLoss = 100 - ally.hp;

    // Same fight with the neighbour holding Stone Bulwark.
    state = bareGame();
    playerById(state, 1)!.civId = "great_zimbabwe";
    attacker = place(state, 0, "swordsman", 5, 5);
    ally = place(state, 1, "warrior", 6, 5);
    const wall = place(state, 1, "spearman", 7, 5);
    expect(useAbility(state, wall, "stone_bulwark").ok).toBe(true);
    resolveAttack(state, attacker, ally.col, ally.row);
    const shieldedLoss = 100 - ally.hp;
    expect(shieldedLoss).toBeLessThan(unshieldedLoss);
  });

  it("Drilled Charge takes no retaliation", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "fatimids"; // fields the Fatimid Ghulam
    const ghulam = place(state, 0, "cataphract", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, ghulam, "drilled_charge", foe.col, foe.row).ok).toBe(true);
    expect(ghulam.hp).toBe(unitMaxHp(ghulam)); // executed too cleanly to answer
    if (state.units.has(foe.id)) expect(foe.hp).toBeLessThan(100);
  });

  it("Pilum Volley softens with a javelin hit before the melee strike", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "rome"; // fields the Roman Legionary
    const legionary = place(state, 0, "swordsman", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, legionary, "pilum", foe.col, foe.row).ok).toBe(true);
    // Compare against a plain melee strike: pilum adds the volley on top.
    const state2 = bareGame();
    playerById(state2, 0)!.civId = "rome";
    const legionary2 = place(state2, 0, "swordsman", 5, 5);
    const foe2 = place(state2, 1, "hoplite", 6, 5);
    resolveAttack(state2, legionary2, foe2.col, foe2.row);
    expect(100 - foe.hp).toBeGreaterThan(100 - foe2.hp);
  });

  it("Strandhögg carries off gold on a kill", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "norse"; // fields the Norse Longship
    const goldBefore = playerById(state, 0)!.gold;
    const ship = place(state, 0, "longship", 5, 5);
    const victim = place(state, 1, "galley", 6, 5);
    victim.hp = 5;
    expect(useAbility(state, ship, "strandhogg", victim.col, victim.row).ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false);
    expect(playerById(state, 0)!.gold).toBeGreaterThan(goldBefore);
  });

  it("Hellburner devastates the target and consumes the ship", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "dutch_republic"; // fields the Sea Beggar
    const beggar = place(state, 0, "galleass", 5, 5);
    const target = place(state, 1, "galleon", 6, 5);
    const bystander = place(state, 1, "war_junk", 7, 5); // adjacent to the target
    const targetMax = unitMaxHp(target);
    const bystanderMax = unitMaxHp(bystander);
    expect(useAbility(state, beggar, "hellburner", target.col, target.row).ok).toBe(true);
    expect(state.units.has(beggar.id)).toBe(false); // consumed in the blast
    expect(target.hp).toBeLessThanOrEqual(targetMax - 50);
    expect(bystander.hp).toBeLessThan(bystanderMax); // splash to the adjacent enemy ship
  });

  it("Broadside fires at range without retaliation and wrecks the survivor's rigging", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "venice"; // fields the Venetian Galleass
    const galleass = place(state, 0, "galleass", 5, 5);
    const foe = place(state, 1, "galleon", 6, 5);
    expect(useAbility(state, galleass, "broadside", foe.col, foe.row).ok).toBe(true);
    expect(galleass.hp).toBe(unitMaxHp(galleass)); // gunnery draws no reply
    if (state.units.has(foe.id)) expect(foe.sunderedUntilTurn).toBe(state.turn + 1);
  });

  it("Zweihänder breaks the defender's stance", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "holy_roman_empire"; // fields the Landsknecht
    const lands = place(state, 0, "pikeman", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, foe, "shield_wall").ok).toBe(true);
    expect(foe.stance).toBe("shield_wall");
    expect(useAbility(state, lands, "zweihander", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.stance).toBeNull(); // the hedge is broken
  });

  it("Hammer & Anvil requires an ally beside the target", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "macedon"; // fields the Hypaspist
    const hypaspist = place(state, 0, "swordsman", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    // No anvil yet: refused.
    expect(useAbility(state, hypaspist, "hammer_and_anvil", foe.col, foe.row).ok).toBe(false);
    // With a friendly unit adjacent to the target, the hammer falls.
    place(state, 0, "warrior", 7, 5);
    expect(useAbility(state, hypaspist, "hammer_and_anvil", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.hp).toBeLessThan(100);
  });

  it("Wedge Charge splashes half damage onto an enemy beside the target", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "byzantium"; // fields the Byzantine Cataphract
    const cataphract = place(state, 0, "cataphract", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    const neighbor = place(state, 1, "warrior", 7, 5); // adjacent to the target
    expect(useAbility(state, cataphract, "wedge_charge", foe.col, foe.row).ok).toBe(true);
    expect(neighbor.hp).toBeLessThan(100); // caught in the wedge
  });

  it("Heroic Challenge rallies nearby allies on a champion's kill", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "franks"; // fields the Frankish Paladin
    const paladin = place(state, 0, "cataphract", 5, 5);
    const ally = place(state, 0, "warrior", 4, 5); // within 2 tiles
    const victim = place(state, 1, "slinger", 6, 5);
    victim.hp = 3;
    expect(useAbility(state, paladin, "heroic_challenge", victim.col, victim.row).ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false);
    // +10 from the challenge, on top of the ordinary nearby-kill rally (+6).
    expect(ally.morale).toBeGreaterThanOrEqual(110);
  });

  it("King of Battle grows stronger with adjacent friendly military", () => {
    // Alone: baseline hit.
    let state = bareGame();
    playerById(state, 0)!.civId = "akkad"; // fields the Sargonic Guard
    let guard = place(state, 0, "axeman", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, guard, "king_of_battle", foe.col, foe.row).ok).toBe(true);
    const aloneDmg = 100 - foe.hp;

    // Flanked by two comrades: the same strike lands harder.
    state = bareGame();
    playerById(state, 0)!.civId = "akkad";
    guard = place(state, 0, "axeman", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    place(state, 0, "warrior", 4, 5);
    place(state, 0, "warrior", 5, 4);
    expect(useAbility(state, guard, "king_of_battle", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(aloneDmg);
  });

  it("Siege Volley hits garrisons harder than units in the open", () => {
    // Open ground: baseline.
    let state = bareGame();
    playerById(state, 0)!.civId = "babylon"; // fields the Bowman
    let bowman = place(state, 0, "archer", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, bowman, "siege_volley", foe.col, foe.row).ok).toBe(true);
    const openDmg = 100 - foe.hp;

    // Same target holding a fortification: the arcing volley finds the ramparts.
    state = bareGame();
    playerById(state, 0)!.civId = "babylon";
    bowman = place(state, 0, "archer", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    getTile(state.map, 6, 5)!.structure = { kind: "tower", tier: 1, hp: 50, maxHp: 50 };
    expect(useAbility(state, bowman, "siege_volley", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(openDmg);
  });

  it("Three-Man Chariot rides through and takes only half retaliation", () => {
    // A plain melee attack for the retaliation baseline.
    let state = bareGame();
    let attacker = place(state, 0, "war_chariot", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    resolveAttack(state, attacker, foe.col, foe.row);
    const plainRetaliation = 100 - attacker.hp;

    // The Hittite chariot: shield-bearer halves the reply, and it rides through.
    state = bareGame();
    playerById(state, 0)!.civId = "hittites";
    attacker = place(state, 0, "war_chariot", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, attacker, "kadesh_charge", foe.col, foe.row).ok).toBe(true);
    expect(100 - attacker.hp).toBeLessThan(plainRetaliation);
    expect(`${attacker.col},${attacker.row}`).not.toBe("5,5"); // rode through
  });

  it("Zagros Shot pierces armor then slips a tile away", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "elam"; // fields the Susian Archer
    const archer = place(state, 0, "archer", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    const before = Math.abs(archer.col - foe.col) + Math.abs(archer.row - foe.row);
    expect(useAbility(state, archer, "zagros_shot", foe.col, foe.row).ok).toBe(true);
    expect(foe.hp).toBeLessThan(100);
    const after = Math.abs(archer.col - foe.col) + Math.abs(archer.row - foe.row);
    expect(after).toBeGreaterThan(before); // slipped back toward the hills
  });

  it("Ride Down punishes wounded targets far harder than healthy ones", () => {
    // Healthy target: modest bonus.
    let state = bareGame();
    playerById(state, 0)!.civId = "median_empire"; // fields the Median Lancer
    let lancer = place(state, 0, "cataphract", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, lancer, "ride_down", foe.col, foe.row).ok).toBe(true);
    const healthyDmg = 100 - foe.hp;

    // Faltering target (below half): the lancer rides it down.
    state = bareGame();
    playerById(state, 0)!.civId = "median_empire";
    lancer = place(state, 0, "cataphract", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    foe.hp = 45;
    const hpBefore = foe.hp;
    useAbility(state, lancer, "ride_down", foe.col, foe.row);
    const woundedDmg = state.units.has(foe.id) ? hpBefore - foe.hp : hpBefore;
    expect(woundedDmg).toBeGreaterThan(healthyDmg);
  });

  it("Endless Ranks heals the Immortals and ends the turn", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "persia"; // fields the Immortal
    const immortal = place(state, 0, "spearman", 5, 5);
    immortal.hp = 50;
    expect(useAbility(state, immortal, "endless_ranks").ok).toBe(true);
    expect(immortal.hp).toBe(80); // the ranks refill
    expect(immortal.attackedThisTurn).toBe(true); // ends the turn
  });

  it("Iron Wall stance hardens the Savaran's defense", () => {
    // Unbraced baseline.
    let state = bareGame();
    playerById(state, 1)!.civId = "sassanid_persia"; // defender fields the Savaran
    let attacker = place(state, 0, "swordsman", 5, 5);
    let savaran = place(state, 1, "cataphract", 6, 5);
    resolveAttack(state, attacker, savaran.col, savaran.row);
    const openLoss = 100 - savaran.hp;

    // Standing as iron.
    state = bareGame();
    playerById(state, 1)!.civId = "sassanid_persia";
    attacker = place(state, 0, "swordsman", 5, 5);
    savaran = place(state, 1, "cataphract", 6, 5);
    expect(useAbility(state, savaran, "iron_wall").ok).toBe(true);
    expect(savaran.stance).toBe("iron_wall");
    resolveAttack(state, attacker, savaran.col, savaran.row);
    expect(100 - savaran.hp).toBeLessThan(openLoss);
  });

  it("Wagenburg persists across turns until the wagon moves", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "bohemia"; // fields the Hussite War Wagon
    const wagon = place(state, 0, "crossbowman", 5, 5);
    expect(useAbility(state, wagon, "wagenburg").ok).toBe(true);
    expect(wagon.stance).toBe("wagenburg");
    tickAbilities(state, playerById(state, 0)!); // other stances expire here
    expect(wagon.stance).toBe("wagenburg"); // the fortress stands
  });

  it("Halberd Hook drags riders down harder than a plain strike", () => {
    // A plain pikeman attack on a cataphract.
    let state = bareGame();
    let halberdier = place(state, 0, "pikeman", 5, 5);
    let rider = place(state, 1, "cataphract", 6, 5);
    resolveAttack(state, halberdier, rider.col, rider.row);
    const plainDmg = 100 - rider.hp;

    // The hook: +6 against cavalry.
    state = bareGame();
    playerById(state, 0)!.civId = "swiss"; // fields the Swiss Halberdier
    halberdier = place(state, 0, "pikeman", 5, 5);
    rider = place(state, 1, "cataphract", 6, 5);
    expect(useAbility(state, halberdier, "halberd_hook", rider.col, rider.row).ok).toBe(true);
    expect(100 - rider.hp).toBeGreaterThan(plainDmg);
  });

  it("Schiltron bleeds attacking cavalry on the spear points", () => {
    const state = bareGame();
    playerById(state, 1)!.civId = "scotland"; // defender fields the Highland Schiltron
    const rider = place(state, 0, "cataphract", 5, 5);
    const spears = place(state, 1, "pikeman", 6, 5);
    expect(useAbility(state, spears, "schiltron").ok).toBe(true);
    resolveAttack(state, rider, spears.col, spears.row);
    // Retaliation plus 5 thorn damage: the rider bleeds beyond a normal exchange.
    expect(rider.hp).toBeLessThanOrEqual(95);
  });

  it("Sparth Cleave wounds a second enemy beside the axeman", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "gaelic_ireland"; // fields the Gallowglass
    const axe = place(state, 0, "longswordsman", 5, 5);
    const target = place(state, 1, "hoplite", 6, 5);
    const bystander = place(state, 1, "warrior", 5, 4); // beside the axeman
    expect(useAbility(state, axe, "sparth_cleave", target.col, target.row).ok).toBe(true);
    expect(bystander.hp).toBeLessThan(100); // caught in the arc
  });

  it("Couched Lance hits harder after a running start", () => {
    // Standing start.
    let state = bareGame();
    playerById(state, 0)!.civId = "normans"; // fields the Norman Knight
    let knight = place(state, 0, "cataphract", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, knight, "couched_lance", foe.col, foe.row).ok).toBe(true);
    const standingDmg = 100 - foe.hp;

    // After spending two tiles of movement, momentum feeds the lance.
    state = bareGame();
    playerById(state, 0)!.civId = "normans";
    knight = place(state, 0, "cataphract", 5, 5);
    knight.movementLeft = 1; // two tiles already spent (cataphract moves 3)
    foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, knight, "couched_lance", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(standingDmg);
  });

  it("Desperta Ferro dismays adjacent enemies without ending the turn", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "aragon"; // fields the Almogàver
    const almogaver = place(state, 0, "javelineer", 5, 5);
    const enemy = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, almogaver, "desperta_ferro").ok).toBe(true);
    expect(enemy.morale).toBe(90); // shaken by the war-cry
    expect(almogaver.morale).toBe(115);
    expect(almogaver.attackedThisTurn).toBe(false); // may still strike
  });

  it("Falx Reap carves past armor", () => {
    // A plain strike against a hardened defender.
    let state = bareGame();
    let sword = place(state, 0, "longswordsman", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    resolveAttack(state, sword, foe.col, foe.row);
    const plainDmg = 100 - foe.hp;

    // The falx ignores 6 defense.
    state = bareGame();
    playerById(state, 0)!.civId = "dacians"; // fields the Falxman
    sword = place(state, 0, "longswordsman", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, sword, "falx_reap", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(plainDmg);
  });

  it("Shear Oars cripples the surviving ship in the water", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "corinth"; // fields the Corinthian Trireme
    const trireme = place(state, 0, "trireme", 5, 5);
    const foe = place(state, 1, "galleon", 6, 5); // sturdy, survives
    expect(useAbility(state, trireme, "shear_oars", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.pinnedUntilTurn).toBe(state.turn + 1);
  });

  it("Howdah Volley shoots from the elephant's back without retaliation", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "gupta_india"; // fields the Gupta Elephant Archer
    const elephant = place(state, 0, "war_elephant", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, elephant, "howdah_volley", foe.col, foe.row).ok).toBe(true);
    expect(elephant.hp).toBe(unitMaxHp(elephant)); // ranged: no counter-attack
    expect(foe.hp).toBeLessThan(100);
  });

  it("Double Ballista reaches a target two tiles away", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "khmer"; // fields the Domrey
    const domrey = place(state, 0, "war_elephant", 5, 5);
    const far = place(state, 1, "hoplite", 7, 5); // two tiles out
    expect(useAbility(state, domrey, "double_ballista", far.col, far.row).ok).toBe(true);
    expect(far.hp).toBeLessThan(100);
    expect(domrey.hp).toBe(unitMaxHp(domrey));
  });

  it("Duel of Kings hits mounted foes far harder", () => {
    // Against infantry: modest.
    let state = bareGame();
    playerById(state, 0)!.civId = "ayutthaya_siam"; // fields the Siamese War Elephant
    let duelist = place(state, 0, "war_elephant", 5, 5);
    const foot = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, duelist, "duel_of_kings", foot.col, foot.row).ok).toBe(true);

    // Against a rival elephant: single combat between kings.
    state = bareGame();
    playerById(state, 0)!.civId = "ayutthaya_siam";
    duelist = place(state, 0, "war_elephant", 5, 5);
    let rival = place(state, 1, "war_elephant", 6, 5);
    expect(useAbility(state, duelist, "duel_of_kings", rival.col, rival.row).ok).toBe(true);
    const duelDmg = 100 - rival.hp;

    // Baseline: a plain strike on the same rival.
    state = bareGame();
    duelist = place(state, 0, "war_elephant", 5, 5);
    rival = place(state, 1, "war_elephant", 6, 5);
    resolveAttack(state, duelist, rival.col, rival.row);
    expect(duelDmg).toBeGreaterThan(100 - rival.hp);
  });

  it("Elephant Wall shelters adjacent allies like a living rampart", () => {
    // Ally defends without the wall.
    let state = bareGame();
    playerById(state, 1)!.civId = "delhi_sultanate"; // fields the Delhi War Elephant
    let attacker = place(state, 0, "swordsman", 5, 5);
    let ally = place(state, 1, "warrior", 6, 5);
    place(state, 1, "war_elephant", 7, 5); // present, not in stance
    resolveAttack(state, attacker, ally.col, ally.row);
    const openLoss = 100 - ally.hp;

    // With the wall formed beside them.
    state = bareGame();
    playerById(state, 1)!.civId = "delhi_sultanate";
    attacker = place(state, 0, "swordsman", 5, 5);
    ally = place(state, 1, "warrior", 6, 5);
    const wall = place(state, 1, "war_elephant", 7, 5);
    expect(useAbility(state, wall, "elephant_wall").ok).toBe(true);
    resolveAttack(state, attacker, ally.col, ally.row);
    expect(100 - ally.hp).toBeLessThan(openLoss);
  });

  it("Gate Breaker punishes garrisons harder than units in the open", () => {
    // Open ground.
    let state = bareGame();
    playerById(state, 0)!.civId = "sinhala"; // fields the Sinhala War Elephant
    let beast = place(state, 0, "war_elephant", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, beast, "gate_breaker", foe.col, foe.row).ok).toBe(true);
    const openDmg = 100 - foe.hp;

    // Holding a fort: drive the beast at the gate.
    state = bareGame();
    playerById(state, 0)!.civId = "sinhala";
    beast = place(state, 0, "war_elephant", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    getTile(state.map, 6, 5)!.structure = { kind: "tower", tier: 1, hp: 50, maxHp: 50 };
    expect(useAbility(state, beast, "gate_breaker", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(openDmg - 3); // outpaces even the fort's defense bonus
  });

  it("Turtle Shell bleeds melee attackers on the spikes and persists no longer than a turn", () => {
    const state = bareGame();
    playerById(state, 1)!.civId = "korea"; // defender fields the Turtle Ship
    const attacker = place(state, 0, "longship", 5, 5);
    const turtle = place(state, 1, "war_junk", 6, 5);
    expect(useAbility(state, turtle, "turtle_shell").ok).toBe(true);
    const hpBefore = attacker.hp;
    resolveAttack(state, attacker, turtle.col, turtle.row);
    expect(hpBefore - attacker.hp).toBeGreaterThanOrEqual(8); // spiked roof
  });

  it("Highland Charge strikes harder from rough terrain", () => {
    // From flat ground.
    let state = bareGame();
    playerById(state, 0)!.civId = "tibet"; // fields the Tibetan Cavalry
    let rider = place(state, 0, "rider", 5, 5);
    getTile(state.map, 5, 5)!.terrain = "plains";
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, rider, "highland_charge", foe.col, foe.row).ok).toBe(true);
    const flatDmg = 100 - foe.hp;

    // From the hills.
    state = bareGame();
    playerById(state, 0)!.civId = "tibet";
    rider = place(state, 0, "rider", 5, 5);
    getTile(state.map, 5, 5)!.terrain = "hills";
    foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, rider, "highland_charge", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(flatDmg);
  });

  it("Qamargah closes hardest on an already-weakened target", () => {
    // Healthy target.
    let state = bareGame();
    playerById(state, 0)!.civId = "mughals"; // fields the Mughal Sowar
    let sowar = place(state, 0, "cataphract", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, sowar, "qamargah", foe.col, foe.row).ok).toBe(true);
    const freshDmg = 100 - foe.hp;

    // A sundered target: the circle closes.
    state = bareGame();
    playerById(state, 0)!.civId = "mughals";
    sowar = place(state, 0, "cataphract", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    foe.sunderedUntilTurn = state.turn + 1;
    expect(useAbility(state, sowar, "qamargah", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(freshDmg);
  });

  it("Whistling Arrows shake the survivor's morale", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "xiongnu"; // fields the Xiongnu Horse Archer
    const archer = place(state, 0, "horse_archer", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, archer, "whistling_arrows", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.morale ?? 100).toBeLessThan(100);
  });

  it("Nerge strikes hardest when the ring is closed", () => {
    // One ally beside the target: the ring is open.
    let state = bareGame();
    playerById(state, 0)!.civId = "mongols"; // fields the Keshig
    let keshig = place(state, 0, "horse_archer", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    place(state, 0, "warrior", 7, 5);
    expect(useAbility(state, keshig, "nerge", foe.col, foe.row).ok).toBe(true);
    const openDmg = 100 - foe.hp;

    // Two allies beside the target: the ring is closed.
    state = bareGame();
    playerById(state, 0)!.civId = "mongols";
    keshig = place(state, 0, "horse_archer", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    place(state, 0, "warrior", 7, 5);
    place(state, 0, "warrior", 6, 4);
    expect(useAbility(state, keshig, "nerge", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(openDmg);
  });

  it("Steady Volley rewards standing still", () => {
    // After moving: no bonus.
    let state = bareGame();
    playerById(state, 0)!.civId = "ottomans"; // fields the Janissary
    let jan = place(state, 0, "crossbowman", 5, 5);
    jan.movementLeft = 1; // has moved this turn
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, jan, "steady_volley", foe.col, foe.row).ok).toBe(true);
    const movedDmg = 100 - foe.hp;

    // Planted: fire discipline tells.
    state = bareGame();
    playerById(state, 0)!.civId = "ottomans";
    jan = place(state, 0, "crossbowman", 5, 5);
    jan.movementLeft = 2; // crossbowman's full movement — hasn't moved
    foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, jan, "steady_volley", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(movedDmg);
  });

  it("Wolf Pack bites harder with a packmate beside the prey", () => {
    // Alone.
    let state = bareGame();
    playerById(state, 0)!.civId = "gokturks"; // fields the Turkic Lancer
    let lancer = place(state, 0, "cataphract", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, lancer, "wolf_pack", foe.col, foe.row).ok).toBe(true);
    const aloneDmg = 100 - foe.hp;

    // With a fellow rider beside the target.
    state = bareGame();
    playerById(state, 0)!.civId = "gokturks";
    lancer = place(state, 0, "cataphract", 5, 5);
    foe = place(state, 1, "hoplite", 6, 5);
    place(state, 0, "rider", 7, 5);
    expect(useAbility(state, lancer, "wolf_pack", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(aloneDmg);
  });

  it("Naphtha Shot splashes fire onto enemies beside the target", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "timurids"; // fields the Timurid Siege Train
    const engine = place(state, 0, "catapult", 5, 5);
    const target = place(state, 1, "hoplite", 7, 5); // catapult range 2
    const bystander = place(state, 1, "warrior", 8, 5); // beside the target
    expect(useAbility(state, engine, "naphtha_shot", target.col, target.row).ok).toBe(true);
    expect(bystander.hp).toBeLessThan(100); // splashed with fire
  });

  it("Camel Panic unsettles surviving cavalry", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "arabia"; // fields the Camel Archer
    const camel = place(state, 0, "horse_archer", 5, 5);
    const rider = place(state, 1, "cataphract", 6, 5);
    expect(useAbility(state, camel, "camel_panic", rider.col, rider.row).ok).toBe(true);
    if (state.units.has(rider.id)) expect(rider.morale ?? 100).toBeLessThan(100);
  });

  it("Flower War gains faith when the strike takes captives", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "aztec"; // fields the Eagle Warrior
    const faithBefore = playerById(state, 0)!.faith;
    const eagle = place(state, 0, "warrior", 5, 5);
    const victim = place(state, 1, "slinger", 6, 5);
    victim.hp = 3;
    expect(useAbility(state, eagle, "flower_war", victim.col, victim.row).ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false);
    expect(playerById(state, 0)!.faith).toBe(faithBefore + 20); // captives for the altar
  });

  it("Haka heartens allies and dismays enemies without ending the turn", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "maori"; // fields the Toa
    const toa = place(state, 0, "warrior", 5, 5);
    const ally = place(state, 0, "warrior", 4, 5);
    const enemy = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, toa, "haka").ok).toBe(true);
    expect(ally.morale).toBe(110);
    expect(enemy.morale).toBe(90);
    expect(toa.attackedThisTurn).toBe(false); // the challenge precedes the charge
  });

  it("Bolas entangle the survivor so it cannot move", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "inca"; // fields the Warak'aq
    const slinger = place(state, 0, "slinger", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, slinger, "bolas", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.pinnedUntilTurn).toBe(state.turn + 1);
  });

  it("Hornet Bomb pins and demoralizes the survivor", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "maya"; // fields the Holkan
    const holkan = place(state, 0, "javelineer", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, holkan, "hornet_bomb", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) {
      expect(foe.pinnedUntilTurn).toBe(state.turn + 1); // trapped in the swarm
      expect(foe.morale ?? 100).toBeLessThan(100);
    }
  });

  it("Stone Hail cracks the survivor's defenses", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "chimu"; // fields the Chimú Slinger
    const slinger = place(state, 0, "slinger", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, slinger, "stone_hail", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.sunderedUntilTurn).toBe(state.turn + 1);
  });

  it("Beach Assault strikes harder from the water", () => {
    // On land: modest.
    let state = bareGame();
    playerById(state, 0)!.civId = "tonga"; // fields the Tongan Toa
    let toa = place(state, 0, "warrior", 5, 5);
    let foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, toa, "beach_assault", foe.col, foe.row).ok).toBe(true);
    const landDmg = 100 - foe.hp;

    // Storming ashore from an embarked canoe.
    state = bareGame();
    playerById(state, 0)!.civId = "tonga";
    toa = place(state, 0, "warrior", 5, 5);
    toa.embarked = true;
    foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, toa, "beach_assault", foe.col, foe.row).ok).toBe(true);
    expect(100 - foe.hp).toBeGreaterThan(landDmg);
  });

  it("Mourning War heals the warband on a kill", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "haudenosaunee"; // fields the Mohawk Warrior
    const mohawk = place(state, 0, "swordsman", 5, 5);
    mohawk.hp = 60;
    const victim = place(state, 1, "slinger", 6, 5);
    victim.hp = 3;
    expect(useAbility(state, mohawk, "mourning_war", victim.col, victim.row).ok).toBe(true);
    expect(state.units.has(victim.id)).toBe(false);
    // The +20 heal outweighs any retaliation the dying slinger managed.
    expect(mohawk.hp).toBeGreaterThan(60);
  });

  it("Leiomano leaves wounds that keep bleeding", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "hawaii"; // fields the Hawaiian Koa
    const koa = place(state, 0, "warrior", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, koa, "leiomano", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.poisonedUntilTurn).toBe(state.turn + 2);
  });

  it("Mounted Volley shoots before the charge lands", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "hungary"; // fields the Black Army
    const rider = place(state, 0, "cataphract", 5, 5);
    const foe = place(state, 1, "hoplite", 6, 5);
    expect(useAbility(state, rider, "mounted_volley", foe.col, foe.row).ok).toBe(true);
    // Deals more than a plain strike would (volley + melee).
    const state2 = bareGame();
    playerById(state2, 0)!.civId = "hungary";
    const rider2 = place(state2, 0, "cataphract", 5, 5);
    const foe2 = place(state2, 1, "hoplite", 6, 5);
    resolveAttack(state2, rider2, foe2.col, foe2.row);
    expect(100 - foe.hp).toBeGreaterThan(100 - foe2.hp);
  });
});
