// Maps units and combat log lines to extracted weapon SFX under public/audio/.

import { UNIT_DEFS, type UnitTypeId } from "@roc/sim";

type WeaponProfile = "dog" | "swish" | "spear" | "axe" | "dagger" | "sword" | "siege";

const SWORD_CLIPS = Array.from({ length: 10 }, (_, i) => `audio/sword - StarNinjas/sword.${i + 1}.ogg`);
const SWISH_CLIPS = Array.from({ length: 13 }, (_, i) => `audio/swishes/swish-${i + 1}.wav`);
const DOG_CLIPS = ["audio/dog/dog-growl.wav", "audio/dog/dog-grumble.wav", "audio/dog/dog-snarl.wav"];
const AXE_CLIPS = [
  "audio/spear, mice, pike, axe/Seax Axe Blade on Blade.wav",
  "audio/spear, mice, pike, axe/Seax Axe Blade on Haft.wav",
];
const SPEAR_CLIPS = [
  "audio/spear, mice, pike, axe/Spear Spear Blade on Blade.wav",
  "audio/spear, mice, pike, axe/Spear Spear Blade on Haft.wav",
  "audio/spear, mice, pike, axe/Spear Spear Haft on Haft.wav",
  "audio/spear, mice, pike, axe/Seax Spear Blade on Blade.wav",
  "audio/spear, mice, pike, axe/Seax Spear Blade on Haft.wav",
  "audio/spear, mice, pike, axe/Spear Norse Sword Blade on Blade.wav",
  "audio/spear, mice, pike, axe/Spear Norse Sword Haft on Blade.wav",
];
const DAGGER_CLIPS = [
  "audio/spear, mice, pike, axe/Seax Dagger Blade on Blade.wav",
  "audio/spear, mice, pike, axe/Seax Katana Blade on Blade.wav",
];
const SIEGE_CLIPS = [
  "audio/spear, mice, pike, axe/Spear Sabre Haft on Blade.wav",
  "audio/spear, mice, pike, axe/Sabre Norse Sword Hilt on Blade.wav",
  "audio/swishes/swish-7.wav",
  "audio/swishes/swish-10.wav",
];

const CLIPS: Record<WeaponProfile, readonly string[]> = {
  dog: DOG_CLIPS,
  swish: SWISH_CLIPS,
  spear: SPEAR_CLIPS,
  axe: AXE_CLIPS,
  dagger: DAGGER_CLIPS,
  sword: SWORD_CLIPS,
  siege: SIEGE_CLIPS,
};

const SPEAR_UNITS = new Set<UnitTypeId>(["firehard_spear", "spearman", "hoplite", "pikeman"]);

function profileForUnit(unitType: string): WeaponProfile {
  if (unitType === "war_dog") return "dog";
  if (unitType === "axeman" || unitType === "maceman") return "axe";
  if (SPEAR_UNITS.has(unitType as UnitTypeId)) return "spear";
  if (unitType === "clubman" || unitType === "warrior" || unitType === "slinger") return "dagger";

  const def = UNIT_DEFS[unitType as UnitTypeId];
  if (!def) return "sword";

  switch (def.cls) {
    case "ranged":
      return "swish";
    case "siege":
      return "siege";
    case "naval_ranged":
      return "swish";
    case "naval_melee":
      return "sword";
    case "cavalry":
      return "sword";
    default:
      return "sword";
  }
}

function profileForLog(message: string): WeaponProfile {
  if (/\bbombarded\b/i.test(message)) return "siege";
  if (/\bevaded the attack\b/i.test(message)) return "swish";
  if (/\bstormed a fortification\b/i.test(message)) return "siege";
  if (/\bwalked into an ambush\b/i.test(message)) return "swish";
  if (/\bwas destroyed\b/i.test(message)) return "sword";
  return "sword";
}

function pickFrom(profile: WeaponProfile): string {
  const pool = CLIPS[profile];
  return pool[Math.floor(Math.random() * pool.length)] ?? SWORD_CLIPS[0]!;
}

/** Pick a combat SFX clip for a player-ordered strike. */
export function pickCombatClipForUnit(unitType?: string): string {
  if (!unitType) return pickFrom("sword");
  return pickFrom(profileForUnit(unitType));
}

/** Pick a combat SFX clip when only the combat log line is known (AI / city fire). */
export function pickCombatClipForLog(message: string): string {
  return pickFrom(profileForLog(message));
}

/** City or tower bombardment. */
export function pickBombardClip(): string {
  return pickFrom("siege");
}
