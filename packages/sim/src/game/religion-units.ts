// Religion unique units. Every founded faith fields ONE unique unit (see
// @roc/data RELIGION_KITS for its presentation identity), trainable in any city
// that follows the faith and owns a Temple. Each unit carries a signature kit of
// passive powers (auras, harvests, garrison boons) and sometimes an active
// ability; magnitudes — and the unit's own strength — scale with the religion's
// tier, and some units unlock a second active at tier 4.
//
// This module is deliberately dependency-light (data + content + state only):
// the mutating hooks that apply these kits live at the existing engine seams —
// combat.ts (strength, per-turn tick, deaths), morale.ts (faith on kill),
// training.ts (temple gate), civs.ts (tier-4 ability unlock), abilities.ts
// (active resolutions).

import { getReligionByName, getReligionKit } from "@roc/data";
import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { UNIT_DEFS, type ActiveAbilityId, type UnitTypeId } from "./content";
import { isForestTerrain } from "./terrain";
import type { City, GameState, Religion, Unit } from "./state";
import { areEnemies, playerById } from "./state";

/** Passive powers a religion unit radiates. All magnitudes are BASE (tier 1)
 *  values; apply `religionTierScale` for the live number. Auras reach adjacent
 *  tiles unless noted. */
export interface ReligionUnitPassives {
  /** Adjacent friendly units fight at +N combat. */
  allyCombatAura?: number;
  /** Adjacent enemy units fight at −N combat. */
  enemyCombatAura?: number;
  /** Adjacent friendly units heal +N HP at their owner's turn start. */
  healAura?: number;
  /** Adjacent friendly units gain +N morale per turn. */
  moraleAura?: number;
  /** Adjacent enemy units lose N morale per turn. */
  enemyMoraleAura?: number;
  /** Adjacent friendly military units earn +N XP per turn. */
  xpAura?: number;
  /** Cities within 2 tiles receive N religious pressure of this unit's faith per turn. */
  pressureAura?: number;
  /** Faith to this unit's owner each time it kills an enemy unit. */
  faithOnKillSelf?: number;
  /** Faith to this unit's owner whenever ANY unit dies adjacent to it. */
  faithOnNearbyDeath?: number;
  /** When an adjacent FRIENDLY unit dies, other nearby friendlies gain +N morale. */
  deathRally?: number;
  /** Gold per turn while garrisoned in a city that follows this unit's faith. */
  goldGarrisoned?: number;
  /** Culture per turn while garrisoned in a city that follows this unit's faith. */
  cultureGarrisoned?: number;
  /** The garrison city trains units N% faster. */
  trainPercentGarrisoned?: number;
  /** Adjacent friendly units get +N movement at their owner's turn start. */
  moveAura?: number;
  /** +N combat while standing on a tile of the owner's own territory. */
  homelandCombat?: number;
  /** All of this unit's auras are DOUBLED while it stands in forest. */
  forestAffinity?: boolean;
  /** This unit refuses violence: it can never attack. */
  cannotAttack?: boolean;
  /** A melee attacker striking this unit loses N morale (shame/serenity). */
  thornMorale?: number;
}

export interface ReligionUnitKit {
  unit: UnitTypeId;
  /** Religion def id (@roc/data RELIGIONS). */
  religionId: string;
  /** Display name of the signature kit, e.g. "Apostolic Mission". */
  abilityName: string;
  passives: ReligionUnitPassives;
  /** Active ability unlocked when the religion reaches tier 4. */
  tier4Active?: ActiveAbilityId;
  /** Human-readable kit summary (base magnitudes) for the UI and wiki. */
  desc: string;
}

const K = (k: ReligionUnitKit): ReligionUnitKit => k;

export const RELIGION_UNIT_KITS: Record<string, ReligionUnitKit> = {
  evangelist: K({
    unit: "evangelist", religionId: "christianity", abilityName: "Apostolic Mission",
    passives: { healAura: 5, pressureAura: 4 },
    desc: "Heals adjacent allies 5 HP per turn and presses the faith into cities within 2 tiles. Benediction blesses one ally (heal + morale).",
  }),
  templar_knight: K({
    unit: "templar_knight", religionId: "catholicism", abilityName: "Militant Order",
    passives: { allyCombatAura: 1, faithOnKillSelf: 4 },
    tier4Active: "deus_vult",
    desc: "A true combat unit: adjacent allies fight at +1, and each kill yields faith. At tier 4 unlocks the Deus Vult charge (+5, +8 vs cities).",
  }),
  hesychast_monk: K({
    unit: "hesychast_monk", religionId: "orthodoxy", abilityName: "Prayer of the Heart",
    passives: { moraleAura: 6, healAura: 3, thornMorale: 5 },
    desc: "Radiates stillness: adjacent allies gain +6 morale and heal 3 HP per turn; those who strike him lose heart.",
  }),
  ghazi_warrior: K({
    unit: "ghazi_warrior", religionId: "islam", abilityName: "Ghazw",
    passives: { faithOnKillSelf: 6, moraleAura: 4 },
    tier4Active: "takbir",
    desc: "A frontier warrior whose kills yield faith and whose presence steadies allies. At tier 4 unlocks the Takbīr battle-cry.",
  }),
  maccabee_zealot: K({
    unit: "maccabee_zealot", religionId: "judaism", abilityName: "Covenant Defender",
    passives: { homelandCombat: 4, deathRally: 8 },
    desc: "Fights at +4 on home soil, and every brother who falls beside him only steels the line (+8 morale to nearby allies).",
  }),
  sadhu: K({
    unit: "sadhu", religionId: "hinduism", abilityName: "Wandering Dharma",
    passives: { pressureAura: 3, healAura: 3 },
    desc: "Carries the dharma into cities within 2 tiles and mends adjacent allies. Darshan blesses one ally (heal + morale).",
  }),
  bodhisattva: K({
    unit: "bodhisattva", religionId: "buddhism", abilityName: "Compassionate Presence",
    passives: { healAura: 6, enemyMoraleAura: 5 },
    tier4Active: "metta",
    desc: "Heals adjacent allies 6 HP per turn while enemies beside him lose the will to fight. At tier 4 unlocks Mettā (area heal + morale).",
  }),
  flame_magus: K({
    unit: "flame_magus", religionId: "zoroastrianism", abilityName: "Atar's Dread",
    passives: { enemyCombatAura: 2 },
    desc: "Adjacent enemies fight at −2 before the sacred fire. Purifying Flame scours every adjacent enemy (damage + morale loss).",
  }),
  ahimsa_ascetic: K({
    unit: "ahimsa_ascetic", religionId: "jainism", abilityName: "Perfect Ahimsa",
    passives: { cannotAttack: true, enemyCombatAura: 3, healAura: 4, thornMorale: 10 },
    desc: "Can never attack — yet enemies falter beside him (−3 combat), allies mend (+4 HP/turn), and any who strike him are shamed (−10 morale).",
  }),
  nihang_warrior: K({
    unit: "nihang_warrior", religionId: "sikhism", abilityName: "Sant-Sipahi",
    passives: { allyCombatAura: 1, moraleAura: 5 },
    tier4Active: "chakkar",
    desc: "Saint-soldier: adjacent allies fight at +1 with +5 morale per turn. At tier 4 unlocks Chakkar — one whirling strike on every adjacent enemy.",
  }),
  sage_of_the_way: K({
    unit: "sage_of_the_way", religionId: "taoism", abilityName: "Effortless Path",
    passives: { moveAura: 1, healAura: 3 },
    desc: "The Way opens before his companions: adjacent allies start their turn with +1 movement and heal 3 HP.",
  }),
  imperial_scholar: K({
    unit: "imperial_scholar", religionId: "confucianism", abilityName: "Rectification of Names",
    passives: { xpAura: 2, trainPercentGarrisoned: 15, cultureGarrisoned: 2 },
    desc: "Drills adjacent troops (+2 XP/turn); while garrisoned, his city trains 15% faster and gains +2 culture per turn.",
  }),
  miko_priestess: K({
    unit: "miko_priestess", religionId: "shinto", abilityName: "Kami's Sight",
    passives: { moraleAura: 4 },
    desc: "Sees far and pierces every ambush (reveals hidden units); adjacent allies gain +4 morale per turn. Kagura heals and heartens all allies within 2 tiles.",
  }),
  sky_shaman: K({
    unit: "sky_shaman", religionId: "tengrism", abilityName: "Wind of the Steppe",
    passives: { moraleAura: 4, moveAura: 1 },
    tier4Active: "storm_call",
    desc: "Rides with the horde: adjacent allies gain +4 morale and +1 movement per turn. At tier 4 unlocks Storm Call.",
  }),
  gothi_warpriest: K({
    unit: "gothi_warpriest", religionId: "norse", abilityName: "Promise of Valhalla",
    passives: { deathRally: 10, faithOnNearbyDeath: 4 },
    desc: "Every death beside him feeds the faith (+4 faith), and a fallen comrade rallies the line (+10 morale) — the slain feast in Valhalla.",
  }),
  oracle_of_delphi: K({
    unit: "oracle_of_delphi", religionId: "hellenism", abilityName: "Delphic Sight",
    passives: { allyCombatAura: 1 },
    desc: "Sees what is hidden (reveals concealed units, sight 5); adjacent allies fight at +1 under divine favor. Doom Prophecy curses enemies within 2 tiles.",
  }),
  mortuary_priest: K({
    unit: "mortuary_priest", religionId: "egyptian", abilityName: "Rites of Passage",
    passives: { faithOnNearbyDeath: 6, healAura: 2 },
    desc: "Harvests 6 faith from every soul — friend or foe — that falls beside him, and tends adjacent allies (+2 HP/turn).",
  }),
  ziggurat_astrologer: K({
    unit: "ziggurat_astrologer", religionId: "mesopotamian", abilityName: "Reading the Heavens",
    passives: { xpAura: 1, goldGarrisoned: 2 },
    tier4Active: "omen_of_ishtar",
    desc: "Omens school adjacent troops (+1 XP/turn) and enrich his garrison city (+2 gold/turn). At tier 4 unlocks the Omen of Ishtar.",
  }),
  archdruid: K({
    unit: "archdruid", religionId: "druidism", abilityName: "Keeper of the Groves",
    passives: { forestAffinity: true, healAura: 4, enemyCombatAura: 1 },
    desc: "Heals allies (+4 HP/turn) and unsettles enemies (−1 combat) — ALL his powers double in forest, where he can also Hide.",
  }),
  elect_missionary: K({
    unit: "elect_missionary", religionId: "manichaeism", abilityName: "Gospel of Light",
    passives: { pressureAura: 6, goldGarrisoned: 1 },
    desc: "The fastest converter alive: presses 6 pressure per turn into cities within 2 tiles, and trades letters for gold while garrisoned.",
  }),
  eagle_priest: K({
    unit: "eagle_priest", religionId: "aztec", abilityName: "Flower War",
    passives: { faithOnKillSelf: 10, enemyMoraleAura: 5 },
    desc: "Takes captives for the sun: kills yield 10 faith, and adjacent enemies lose 5 morale per turn to sheer terror.",
  }),
  daykeeper: K({
    unit: "daykeeper", religionId: "maya", abilityName: "Count of Days",
    passives: { xpAura: 2 },
    tier4Active: "eclipse_prophecy",
    desc: "The calendar orders the camp: adjacent allies earn +2 XP per turn. At tier 4 the Eclipse Prophecy darkens the sky over his enemies.",
  }),
  sun_priest: K({
    unit: "sun_priest", religionId: "inca", abilityName: "Warmth of Inti",
    passives: { healAura: 4, moraleAura: 3, goldGarrisoned: 2 },
    desc: "Inti's warmth mends (+4 HP/turn) and heartens (+3 morale) adjacent allies, and gilds his garrison city (+2 gold/turn).",
  }),
  babalawo: K({
    unit: "babalawo", religionId: "yoruba", abilityName: "Ifá Divination",
    passives: { moraleAura: 4 },
    desc: "Reads what is hidden (reveals concealed units) and steadies hearts with the talking drum (+4 morale/turn). Orisha's Favor blesses one ally.",
  }),
};

/** The signature kit of a religion unique unit, if `type` is one. */
export function religionUnitKit(type: UnitTypeId): ReligionUnitKit | undefined {
  return RELIGION_UNIT_KITS[type];
}

/** Whether a unit type is a religion unique unit. */
export function isReligionUnit(type: UnitTypeId): boolean {
  return !!UNIT_DEFS[type].religionUnit;
}

/** The religion def id (@roc/data) a founded religion instance corresponds to. */
export function religionDefIdOf(religion: Religion | undefined): string | undefined {
  return religion ? getReligionByName(religion.name)?.id : undefined;
}

/** The founded religion instance matching a religion def id, if any. */
export function religionInstanceForDefId(state: GameState, defId: string | undefined): Religion | undefined {
  if (!defId) return undefined;
  return state.religions.find((r) => religionDefIdOf(r) === defId);
}

/** The live tier of the faith a religion unit belongs to (1 if not founded). */
export function religionTierForUnit(state: GameState, unit: Unit): number {
  const defId = UNIT_DEFS[unit.type].religionUnit;
  return religionInstanceForDefId(state, defId)?.tier ?? 1;
}

/** Aura/harvest magnitudes grow +25% per tier above 1 (2× at tier 5). */
export function religionTierScale(tier: number): number {
  return 1 + 0.25 * (Math.max(1, tier) - 1);
}

/** A base magnitude scaled to the faith's tier, rounded. */
export function scaledPassive(base: number, tier: number): number {
  return Math.round(base * religionTierScale(tier));
}

/** Flat strength bonus a religion unit itself gains from its faith's tier. */
export function religionUnitStrengthBonus(tier: number): number {
  return 2 * (Math.max(1, tier) - 1);
}

/** Aura multiplier for a kit-carrying unit: forest-affine units double up in woods. */
export function kitAuraMultiplier(state: GameState, unit: Unit, kit: ReligionUnitKit): number {
  if (!kit.passives.forestAffinity) return 1;
  const tile = getTile(state.map, unit.col, unit.row);
  return tile && isForestTerrain(tile.terrain) ? 2 : 1;
}

/** A scaled passive magnitude for a specific unit on the board (tier + forest). */
export function unitPassive(state: GameState, unit: Unit, kit: ReligionUnitKit, base: number | undefined): number {
  if (!base) return 0;
  return scaledPassive(base, religionTierForUnit(state, unit)) * kitAuraMultiplier(state, unit, kit);
}

/**
 * Combat-strength contribution of the religion-unit system for any unit:
 * a religion unit's own tier bonus (+2 per tier above 1) and homeland fervor,
 * plus inspiring auras from adjacent friendly religion units, minus dread auras
 * from adjacent enemy ones. Called from combat's attack/defense strength.
 */
export function religionUnitCombatBonus(state: GameState, unit: Unit): number {
  let s = 0;
  const ownKit = religionUnitKit(unit.type);
  if (ownKit) {
    s += religionUnitStrengthBonus(religionTierForUnit(state, unit));
    if (ownKit.passives.homelandCombat) {
      const tile = getTile(state.map, unit.col, unit.row);
      const homeCity = tile?.ownerCityId !== undefined ? state.cities.get(tile.ownerCityId) : undefined;
      if (homeCity?.ownerId === unit.ownerId) {
        s += unitPassive(state, unit, ownKit, ownKit.passives.homelandCombat);
      }
    }
  }
  const me = playerById(state, unit.ownerId);
  const a = offsetToAxial(unit);
  for (const other of state.units.values()) {
    if (other.id === unit.id) continue;
    const kit = religionUnitKit(other.type);
    if (!kit || (!kit.passives.allyCombatAura && !kit.passives.enemyCombatAura)) continue;
    if (axialDistance(a, offsetToAxial(other)) !== 1) continue;
    const otherOwner = playerById(state, other.ownerId);
    if (other.ownerId === unit.ownerId) {
      s += unitPassive(state, other, kit, kit.passives.allyCombatAura);
    } else if (me && otherOwner && areEnemies(me, otherOwner)) {
      s -= unitPassive(state, other, kit, kit.passives.enemyCombatAura);
    }
  }
  return s;
}

// ---- local majority-faith helper (kept here to stay dependency-light) ------

/** The faith holding a strict majority of a city's religious pressure, if any.
 *  Mirrors religion.ts majorityReligion (kept in sync). */
export function cityMajorityFaith(city: City): string | undefined {
  const p = city.religionPressure;
  if (!p) return undefined;
  let total = 0;
  let best: string | undefined;
  let bestP = 0;
  for (const [rel, amt] of Object.entries(p)) {
    total += amt;
    if (amt > bestP) {
      bestP = amt;
      best = rel;
    }
  }
  return total > 0 && bestP / total > 0.5 ? best : undefined;
}

/** True when `city` follows the faith that fields `type` (majority pressure). */
export function cityFollowsUnitFaith(state: GameState, city: City, type: UnitTypeId): boolean {
  const defId = UNIT_DEFS[type].religionUnit;
  if (!defId) return false;
  const instance = religionInstanceForDefId(state, defId);
  return !!instance && cityMajorityFaith(city) === instance.id;
}

/** Training gate: a city trains a religion unit only with a Temple and the faith. */
export function canTrainReligionUnit(state: GameState, city: City, type: UnitTypeId): { ok: boolean; error?: string } {
  if (!UNIT_DEFS[type].religionUnit) return { ok: false, error: "not a religion unit" };
  if (!city.buildings.includes("temple")) return { ok: false, error: "needs a Temple" };
  if (!cityFollowsUnitFaith(state, city, type)) {
    const kit = getReligionKit(UNIT_DEFS[type].religionUnit);
    return { ok: false, error: `city does not follow ${kit ? kitReligionName(kit.religionId) : "the faith"}` };
  }
  return { ok: true };
}

function kitReligionName(defId: string): string {
  return getReligionKit(defId) ? defId.charAt(0).toUpperCase() + defId.slice(1) : defId;
}

/** Every religion unit type the city can currently train (temple + faith gate). */
export function trainableReligionUnits(state: GameState, city: City): UnitTypeId[] {
  const out: UnitTypeId[] = [];
  for (const type of Object.keys(RELIGION_UNIT_KITS) as UnitTypeId[]) {
    if (canTrainReligionUnit(state, city, type).ok) out.push(type);
  }
  return out;
}
