// Civ balance scorer — see docs/BALANCE.md.
//
// Scores every civ across its five pillars (passive ability, unique unit,
// unique infrastructure, leader ability, starting setup) in a single point
// currency (weights.ts), then prints a ranked table with the spread and the
// outliers so rebalancing is measurable rather than by-feel.
//
// Run:  bun run tools/balance/score.ts            (ranked table)
//       bun run tools/balance/score.ts --csv       (machine-readable)
//       bun run tools/balance/score.ts --civ rome  (one civ's breakdown)

import {
  CIVILIZATIONS,
  CIVICS,
  GOVERNMENTS,
  uniqueInfraForCiv,
  startingUnitsFor,
  capitalPopulationBonusFor,
  DEFAULT_STARTING_UNITS,
  type CivDef,
  type CivEffects,
  type CivicDef,
  type GovernmentDef,
} from "@roc/data";
import {
  UNIT_DEFS,
  TECH_DEFS,
  LEADER_ABILITIES,
  unitActiveAbilityIds,
  type UnitTypeId,
  type TechId,
} from "@roc/sim";
import {
  ERA_COST_BANDS,
  TIMING_WEIGHT,
  YIELD_PCT_PTS,
  CLASS_COMBAT_PTS,
  CLASS_COMBAT_DEFAULT,
  FLAT_CITY_YIELD_PTS,
  FLAT_TILE_YIELD_PTS,
  PTS,
  UU_SITUATIONAL_FACTOR,
  UU_BONUS_PTS,
  ABILITY_IMPACT,
  ABILITY_IMPACT_DEFAULT,
  INFRA_BUILDING_YIELD_PTS,
  INFRA_IMPROVEMENT_YIELD_PTS,
  INFRA_BASELINE_COST,
  INFRA_COST_PTS_PER_10,
  LEADER_DEFAULT_NET,
  LEADER_NET,
  frequencyFactor,
  OUTLIER_BAND,
  TARGET_TOTAL,
  CONDITIONAL_DISCOUNT,
  CIVIC_PTS,
  type Era,
} from "./weights";

// ---------------------------------------------------------------------------
// Timing: cumulative research cost → era → weight.
// ---------------------------------------------------------------------------

const CIVIC_COST = new Map(CIVICS.map((c) => [c.id, c.cost]));
// Civics no longer form a prereq tree (they gate on government branch/tier now);
// treat each as standalone for the timing model. Full integration lands in M-C5.
const CIVIC_PRE = new Map<string, readonly string[]>(CIVICS.map((c) => [c.id, [] as string[]]));

const cumCostMemo = new Map<string, number>();
/** Cumulative cost of a tech OR civic id: its own cost + all prerequisites'. */
function cumulativeCost(id: string): number {
  if (cumCostMemo.has(id)) return cumCostMemo.get(id)!;
  cumCostMemo.set(id, 0); // guard against cycles
  const tech = TECH_DEFS[id as TechId];
  let cost: number;
  let prereqs: readonly string[];
  if (tech) {
    cost = tech.cost;
    prereqs = tech.prereqs;
  } else if (CIVIC_COST.has(id)) {
    cost = CIVIC_COST.get(id)!;
    prereqs = CIVIC_PRE.get(id) ?? [];
  } else {
    return 0; // unknown id (e.g. no unlock) → treat as free/start
  }
  let total = cost;
  for (const p of prereqs) total += cumulativeCost(p);
  cumCostMemo.set(id, total);
  return total;
}

function eraOf(id: string | undefined): Era {
  if (!id) return "start";
  const c = cumulativeCost(id);
  if (c <= 0) return "start";
  for (const band of ERA_COST_BANDS) if (c < band.maxCumCost) return band.era;
  return "late";
}
const weightOf = (id: string | undefined): number => TIMING_WEIGHT[eraOf(id)];

// ---------------------------------------------------------------------------
// Magnitude: score a raw CivEffects object (no timing applied).
// ---------------------------------------------------------------------------

function sumYields(y: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number } | undefined): number {
  if (!y) return 0;
  let s = 0;
  for (const k of ["food", "production", "gold", "science", "culture", "faith"] as const) s += y[k] ?? 0;
  return s;
}

function scoreEffects(e: CivEffects | undefined): number {
  if (!e) return 0;
  let s = 0;
  if (e.yieldPercent)
    for (const k of Object.keys(YIELD_PCT_PTS) as (keyof typeof YIELD_PCT_PTS)[])
      s += (e.yieldPercent[k] ?? 0) * YIELD_PCT_PTS[k];
  if (e.unitClassCombat)
    for (const [cls, v] of Object.entries(e.unitClassCombat))
      s += v * (CLASS_COMBAT_PTS[cls] ?? CLASS_COMBAT_DEFAULT);
  s += (e.cavalryMovementBonus ?? 0) * PTS.cavalryMovement;
  s += (e.navalMovementBonus ?? 0) * PTS.navalMovement;
  s += (e.landMovementBonus ?? 0) * PTS.landMovement;
  s += (e.allUnitMovementBonus ?? 0) * PTS.allUnitMovement;
  s += (e.mountedSightBonus ?? 0) * PTS.mountedSight;
  if (e.ignoreRoughTerrain) s += PTS.ignoreRoughTerrain;
  if (e.ignoreMountainMovement) s += PTS.ignoreMountainMovement;
  s += (e.embarkedCombatBonus ?? 0) * PTS.embarkedCombat;
  s += (e.meleeVsCityBonus ?? 0) * PTS.meleeVsCity;
  s += (e.siegeVsCityDefenseMultiplier ?? 0) * PTS.siegeVsCityMult;
  s += (e.unitHealPerTurn ?? 0) * PTS.unitHealPerTurn;
  s += (e.mountedHealPerTurn ?? 0) * PTS.mountedHealPerTurn;
  s += (e.tradeRouteGoldBonus ?? 0) * PTS.tradeRouteGold;
  s += (e.tradeRouteFaithBonus ?? 0) * PTS.tradeRouteFaith;
  s += (e.tradeRouteCapacityBonus ?? 0) * PTS.tradeRouteCapacity;
  if (e.rushWithFaith) s += PTS.rushWithFaith;
  if (e.rushWithCulture) s += PTS.rushWithCulture;
  s += (e.nonDesertCityFoodPercent ?? 0) * PTS.nonDesertCityFoodPct;
  s += sumYields(e.coastalCityYield) * FLAT_CITY_YIELD_PTS;
  s += sumYields(e.desertCityYield) * FLAT_CITY_YIELD_PTS;
  s += sumYields(e.islandCityYield) * FLAT_CITY_YIELD_PTS;
  s += (e.mineTileProductionBonus ?? 0) * PTS.mineTileProduction;
  s += (e.mineTileFoodPenalty ?? 0) * PTS.mineTileFoodPenalty;
  s += (e.pastureTileGoldBonus ?? 0) * PTS.pastureTileGold;
  s += (e.pastureTileFoodBonus ?? 0) * PTS.pastureTileFood;
  s += (e.farmTileFoodBonus ?? 0) * PTS.farmTileFood;
  s += (e.farmTileFaithBonus ?? 0) * PTS.farmTileFaith;
  s += (e.forestTileFaithBonus ?? 0) * PTS.forestTileFaith;
  s += (e.forestTileCombatBonus ?? 0) * PTS.forestTileCombat;
  s += (e.hillTileProductionBonus ?? 0) * PTS.hillTileProduction;
  s += (e.freshWaterTileFoodBonus ?? 0) * PTS.freshWaterTileFood;
  s += (e.freshWaterTileProductionBonus ?? 0) * PTS.freshWaterTileProduction;
  s += (e.coastalTileGoldBonus ?? 0) * PTS.coastalTileGold;
  s += (e.goldPerWorkedDesert ?? 0) * PTS.goldPerWorkedDesert;
  s += (e.captureCityPopulationBonus ?? 0) * PTS.captureCityPopulation;
  s += (e.raidGoldPercent ?? 0) * PTS.raidGoldPct;
  s += (e.coastalRaidGoldPercent ?? 0) * PTS.coastalRaidGoldPct;
  s += (e.raidSciencePercent ?? 0) * PTS.raidSciencePct;
  if (e.newCityFreeBuilding) s += PTS.newCityFreeBuilding;
  s += (e.newCityExtraPopulation ?? 0) * PTS.newCityExtraPopulation;
  s += (e.trainTimePercent ?? 0) * -PTS.trainTimePctFaster; // negative pct = faster = value
  s += (e.startMoraleBonus ?? 0) * PTS.startMorale;
  s += (e.startXpBonus ?? 0) * PTS.startXp;
  s += (e.trainingSlotsBonus ?? 0) * PTS.trainingSlots;
  s += (e.freeTrainingFamilies?.length ?? 0) * PTS.freeTrainingFamily;
  // ---- civics & governments: conditional + M-C1 fields (docs/CIVICS §9) ----
  const cy = (obj: Parameters<typeof sumYields>[0], disc: number): number => {
    if (!obj) return 0;
    let t = 0;
    for (const k of ["food", "production", "gold", "science", "culture", "faith"] as const) t += (obj[k] ?? 0) * YIELD_PCT_PTS[k];
    return t * disc;
  };
  s += cy(e.warYieldPercent, CONDITIONAL_DISCOUNT.warOrPeace);
  s += cy(e.peaceYieldPercent, CONDITIONAL_DISCOUNT.warOrPeace);
  s += cy(e.capitalYieldPercent, CONDITIONAL_DISCOUNT.capital);
  s += (e.allUnitCombat ?? 0) * CIVIC_PTS.allUnitCombat;
  s += (e.homeCombat ?? 0) * CIVIC_PTS.homeCombat * CONDITIONAL_DISCOUNT.homeOrForeign;
  s += (e.foreignCombat ?? 0) * CIVIC_PTS.foreignCombat * CONDITIONAL_DISCOUNT.homeOrForeign;
  s += (e.combatVsOtherReligion ?? 0) * CIVIC_PTS.combatVsOtherReligion * CONDITIONAL_DISCOUNT.religion;
  s += (e.cityDefenseBonus ?? 0) * CIVIC_PTS.cityDefenseBonus;
  s += (e.cultureOnKill ?? 0) * CIVIC_PTS.cultureOnKill;
  s += (e.faithOnKill ?? 0) * CIVIC_PTS.faithOnKill;
  s += (e.enemyReligionPressurePercent ?? 0) * -CIVIC_PTS.enemyReligionPressurePercent; // −50% → +5
  if (e.garrisonFreeUpkeep) s += CIVIC_PTS.garrisonFreeUpkeep;
  s += (e.homeHealBonus ?? 0) * CIVIC_PTS.homeHealBonus * CONDITIONAL_DISCOUNT.homeOrForeign;
  if (e.convertOnCapture) s += CIVIC_PTS.convertOnCapture * CONDITIONAL_DISCOUNT.religion;
  s += (e.unitUpkeepPercent ?? 0) * -CIVIC_PTS.unitUpkeepPct; // +40% upkeep → −12
  return s;
}

// ---------------------------------------------------------------------------
// Pillar scorers.
// ---------------------------------------------------------------------------

/** Passive civ ability — always on from turn 1, so it takes the "start" weight. */
function scorePassive(civ: CivDef): number {
  return scoreEffects(civ.effects) * TIMING_WEIGHT.start;
}

function scoreUU(civ: CivDef): number {
  const def = findUU(civ.id);
  if (!def) return 0;
  const base = UNIT_DEFS[def.replaces as UnitTypeId];
  const combat = def.bonus * UU_BONUS_PTS;
  // Bespoke-ability value = this UU's abilities minus the base unit's stock abilities.
  const uuAbilities = unitActiveAbilityIds(def.replaces as UnitTypeId, def.id);
  const baseAbilities = unitActiveAbilityIds(def.replaces as UnitTypeId);
  const abilityPts = abilityImpact(uuAbilities) - abilityImpact(baseAbilities);
  const raw = (combat + Math.max(0, abilityPts)) * UU_SITUATIONAL_FACTOR;
  return raw * weightOf(base?.reqTech);
}

function abilityImpact(ids: readonly string[]): number {
  let s = 0;
  for (const id of ids) s += ABILITY_IMPACT[id] ?? ABILITY_IMPACT_DEFAULT;
  return s;
}

function scoreInfra(civ: CivDef): number {
  const inf = uniqueInfraForCiv(civ.id);
  if (!inf) return 0;
  const yieldPts =
    sumYields(inf.yields) * (inf.kind === "improvement" ? INFRA_IMPROVEMENT_YIELD_PTS : INFRA_BUILDING_YIELD_PTS);
  const effectPts = scoreEffects(inf.effects);
  const costPenalty = inf.kind === "building" ? Math.max(0, (inf.cost - INFRA_BASELINE_COST) / 10) * INFRA_COST_PTS_PER_10 : 0;
  return Math.max(0, yieldPts + effectPts - costPenalty) * weightOf(inf.reqTech);
}

function scoreLeader(civ: CivDef): number {
  const def = LEADER_ABILITIES[civ.id];
  if (!def) return 0;
  const net = LEADER_NET[civ.id] ?? LEADER_DEFAULT_NET;
  const unlockId = def.unlock.kind === "tech" ? def.unlock.id : def.unlock.id;
  return net * weightOf(unlockId) * frequencyFactor(def.cooldown);
}

/** Starting setup — turn-1 loadout delta vs the default, plus capital population. */
function scoreStart(civ: CivDef): number {
  const units = startingUnitsFor(civ.id);
  const cost = (list: readonly string[]) =>
    list.reduce((a, u) => a + (UNIT_DEFS[u as UnitTypeId]?.cost ?? 0), 0);
  const unitDelta = (cost(units) - cost(DEFAULT_STARTING_UNITS)) * 0.2;
  const capPop = capitalPopulationBonusFor(civ.id) * PTS.capitalPopulation;
  return (unitDelta + capPop) * TIMING_WEIGHT.start;
}

// UU lookup by civ (UNIQUE_UNITS isn't re-exported per-civ, so scan once).
import { UNIQUE_UNITS } from "@roc/data";
const UU_BY_CIV = new Map(UNIQUE_UNITS.map((u) => [u.civId, u]));
function findUU(civId: string) {
  return UU_BY_CIV.get(civId);
}

// ---------------------------------------------------------------------------
// Aggregate + report.
// ---------------------------------------------------------------------------

interface Score {
  civ: CivDef;
  passive: number;
  uu: number;
  infra: number;
  leader: number;
  start: number;
  total: number;
}

function scoreCiv(civ: CivDef): Score {
  const passive = scorePassive(civ);
  const uu = scoreUU(civ);
  const infra = scoreInfra(civ);
  const leader = scoreLeader(civ);
  const start = scoreStart(civ);
  return { civ, passive, uu, infra, leader, start, total: passive + uu + infra + leader + start };
}

const r1 = (n: number) => n.toFixed(1);
const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);

// ---------------------------------------------------------------------------
// Civics & governments balance report (docs/CIVICS-AND-GOVERNMENTS.md §9).
// Each is scored on raw effect magnitude (conditional effects auto-discounted in
// scoreEffects); we then check that entries within a tier land in an acceptance
// band around that tier's mean — ±20% for civics, ±15% for governments.
// ---------------------------------------------------------------------------

function reportTierGroup<T extends { name: string; tier: number; effects: CivEffects }>(
  label: string,
  items: T[],
  bandPct: number,
  extra: (x: T) => string,
): void {
  const byTier = new Map<number, T[]>();
  for (const it of items) (byTier.get(it.tier) ?? byTier.set(it.tier, []).get(it.tier)!).push(it);
  console.log(`\n  ${label} — acceptance band ±${Math.round(bandPct * 100)}% of the tier mean\n`);
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const group = byTier.get(tier)!.map((it) => ({ it, score: scoreEffects(it.effects) }));
    const mean = group.reduce((a, g) => a + g.score, 0) / group.length;
    const lo = mean * (1 - bandPct), hi = mean * (1 + bandPct);
    console.log(`  Tier ${tier}  (mean ${r1(mean)} · ${group.length} entries)`);
    group.sort((a, b) => b.score - a.score);
    for (const { it, score } of group) {
      const flag = score < lo ? "⤢ weak" : score > hi ? "⤡ strong" : "✓";
      console.log(`    ${pad(it.name, 24)}${padL(r1(score), 7)}   ${pad(flag, 8)} ${extra(it)}`);
    }
    console.log("");
  }
}

function civicsReport(): void {
  console.log(`\n  Civics & Governments Balance (raw magnitude; conditional effects discounted)`);
  reportTierGroup<GovernmentDef>("Governments", GOVERNMENTS.filter((g) => g.tier > 0), 0.15, (g) => `${g.branch.join("/") || "—"} · ${g.slots} slots · ${g.cost}🎭`);
  reportTierGroup<CivicDef>("Civics", CIVICS as CivicDef[], 0.20, (c) => `${c.branch}${c.government ? ` (${c.government})` : ""} · ${c.cost}🎭`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--civics")) return civicsReport();
  const scores = CIVILIZATIONS.map(scoreCiv).sort((a, b) => b.total - a.total);

  const csv = args.includes("--csv");
  const one = args.includes("--civ") ? args[args.indexOf("--civ") + 1] : undefined;

  if (one) {
    const s = scores.find((x) => x.civ.id === one);
    if (!s) return console.error(`no civ '${one}'`);
    const uu = findUU(s.civ.id);
    const inf = uniqueInfraForCiv(s.civ.id);
    const lead = LEADER_ABILITIES[s.civ.id];
    console.log(`\n${s.civ.name} (${s.civ.id}) — total ${r1(s.total)}\n`);
    console.log(`  Passive  ${padL(r1(s.passive), 6)}   ${s.civ.abilityName}: ${s.civ.abilityDesc}`);
    console.log(`  UniqueU  ${padL(r1(s.uu), 6)}   ${uu?.name} (+${uu?.bonus}, base ${uu?.replaces} · ${eraOf(UNIT_DEFS[uu?.replaces as UnitTypeId]?.reqTech)})`);
    console.log(`  Infra    ${padL(r1(s.infra), 6)}   ${inf?.name} (${inf?.kind} · ${eraOf(inf?.reqTech)})`);
    console.log(`  Leader   ${padL(r1(s.leader), 6)}   ${lead?.name} (cd ${lead?.cooldown} · ${eraOf(lead?.unlock.id)}${LEADER_NET[s.civ.id] ? "" : " · default net"})`);
    console.log(`  Start    ${padL(r1(s.start), 6)}   ${startingUnitsFor(s.civ.id).join("+")}${capitalPopulationBonusFor(s.civ.id) ? ` +${capitalPopulationBonusFor(s.civ.id)} cap pop` : ""}`);
    return;
  }

  const totals = scores.map((s) => s.total);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const sd = Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length);
  const gap = (t: number) => TARGET_TOTAL - t; // + = needs buff, − = over budget

  if (csv) {
    console.log("rank,civ,id,total,gap,passive,uu,infra,leader,start");
    scores.forEach((s, i) =>
      console.log([i + 1, s.civ.name, s.civ.id, s.total, gap(s.total), s.passive, s.uu, s.infra, s.leader, s.start].map((x) => (typeof x === "number" ? x.toFixed(1) : x)).join(",")),
    );
    return;
  }

  console.log(`\n  Civ Balance — ${scores.length} civs · target ${TARGET_TOTAL} ±${OUTLIER_BAND} · mean ${r1(mean)} · stdev ${r1(sd)}\n`);
  console.log(`  ${pad("#", 4)}${pad("Civilization", 22)}${padL("Total", 7)}${padL("Gap", 7)}${padL("Pass", 7)}${padL("UU", 6)}${padL("Infra", 7)}${padL("Lead", 6)}${padL("Start", 6)}  `);
  console.log("  " + "─".repeat(74));
  scores.forEach((s, i) => {
    const g = gap(s.total);
    const flag = g > OUTLIER_BAND ? " ⤢buff" : g < -OUTLIER_BAND ? " ⤡nerf" : " ✓";
    console.log(
      `  ${pad(String(i + 1), 4)}${pad(s.civ.name, 22)}${padL(r1(s.total), 7)}${padL((g >= 0 ? "+" : "") + r1(g), 7)}${padL(r1(s.passive), 7)}${padL(r1(s.uu), 6)}${padL(r1(s.infra), 7)}${padL(r1(s.leader), 6)}${padL(r1(s.start), 6)}${flag}`,
    );
  });
  const inBand = scores.filter((s) => Math.abs(gap(s.total)) <= OUTLIER_BAND).length;
  const needBuff = scores.filter((s) => gap(s.total) > OUTLIER_BAND).length;
  const overBudget = scores.filter((s) => gap(s.total) < -OUTLIER_BAND).length;
  const totalDeficit = scores.reduce((a, s) => a + Math.max(0, gap(s.total)), 0);
  console.log(`\n  ${inBand}/${scores.length} in band · ${needBuff} need a buff · ${overBudget} over budget. Total buff debt: ${r1(totalDeficit)} pts.\n`);
}

main();
