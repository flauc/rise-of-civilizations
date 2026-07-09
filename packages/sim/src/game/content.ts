// Game content. The tech tree is intentionally NOT a Civilization clone — it's
// organised around real materials & techniques (knapping, smelting, alloying,
// carburizing, torsion, equestrianism…) rather than abstract "eras of science".
// Units are numerous and role-rich: many are available from the start, others
// are unlocked by specific technologies.

import { UNIQUE_INFRA_BUILDINGS, WONDER_DEFS } from "@roc/data";

export type UnitTypeId =
  // civilian
  | "settler" | "trader"
  // religious (faith-purchased; see religion.ts)
  | "missionary" | "apostle" | "inquisitor"
  // recon
  | "scout"
  // dawn melee/ranged (no tech)
  | "clubman" | "warrior" | "slinger" | "javelineer" | "hunter"
  // early tech
  | "firehard_spear" | "war_dog" | "archer"
  // bronze
  | "axeman" | "maceman" | "spearman" | "hoplite"
  | "light_chariot" | "war_chariot" | "rider" | "horse_archer"
  // iron / classical
  | "swordsman" | "longswordsman" | "pikeman" | "cataphract"
  | "crossbowman" | "legionary" | "war_elephant"
  // siege
  | "battering_ram" | "catapult" | "ballista"
  // early gunpowder
  | "hand_cannon" | "matchlock" | "bombard"
  // naval melee
  | "galley" | "bireme" | "trireme" | "quinquereme" | "longship" | "caravel"
  // naval ranged
  | "dromon" | "war_junk" | "galleass" | "galleon"
  // religion unique units (one per faith; trained in temple cities — see religion-units.ts)
  | "evangelist" | "templar_knight" | "hesychast_monk" | "ghazi_warrior"
  | "maccabee_zealot" | "sadhu" | "bodhisattva" | "flame_magus"
  | "ahimsa_ascetic" | "nihang_warrior" | "sage_of_the_way" | "imperial_scholar"
  | "miko_priestess" | "sky_shaman" | "gothi_warpriest" | "oracle_of_delphi"
  | "mortuary_priest" | "ziggurat_astrologer" | "archdruid" | "elect_missionary"
  | "eagle_priest" | "daykeeper" | "sun_priest" | "babalawo";

export type UnitClass = "settler" | "trader" | "religious" | "recon" | "melee" | "ranged" | "cavalry" | "siege" | "naval_melee" | "naval_ranged";
export type UnitAbility = "bonus_vs_cavalry" | "bonus_vs_city";

/**
 * Player-triggered active abilities (see docs/UNIT-ABILITIES.md §3). These are
 * distinct from the always-on `UnitAbility` modifiers and the XP-earned
 * promotions: using one is a deliberate action that spends the unit's turn.
 * Civ-unique (§8) and hero (§9) abilities are added when those unit types exist.
 */
export type ActiveAbilityId =
  | "brace"
  | "shield_wall"
  | "testudo"
  | "emplace"
  | "charge"
  | "shock_charge"
  | "trample"
  | "fire_and_retreat"
  | "skirmish"
  | "sunder"
  | "pierce"
  | "harry"
  | "reconnoiter"
  | "hide"
  // naval
  | "ram"
  | "boarding_party"
  | "greek_fire"
  | "coastal_bombardment"
  // civ-unique / enhanced (docs/UNIT-ABILITIES.md §8)
  | "war_cart_charge"
  | "parthian_shot"
  | "feigned_retreat"
  | "hussar_charge"
  | "othismos"
  | "last_stand"
  | "repeating_fire"
  | "pavise"
  | "arrow_storm"
  | "furor"
  | "siege_assault"
  | "fire_lance"
  | "plunder"
  // bespoke civ-unique abilities (Egypt & Africa wave)
  | "aimed_shot"
  | "terrorize"
  | "overrun"
  | "war_drums"
  | "poisoned_arrows"
  | "stone_bulwark"
  | "fresh_mounts"
  | "drilled_charge"
  | "zareba"
  | "monsoon_run"
  // bespoke civ-unique abilities (Mediterranean & Europe wave)
  | "pilum"
  | "strandhogg"
  | "hellburner"
  | "broadside"
  | "zweihander"
  | "hammer_and_anvil"
  | "wedge_charge"
  | "heroic_challenge"
  | "mounted_volley"
  // bespoke civ-unique abilities (Mesopotamia & Persia revisit)
  | "king_of_battle"
  | "siege_volley"
  | "kadesh_charge"
  | "zagros_shot"
  | "ride_down"
  | "endless_ranks"
  | "iron_wall"
  // bespoke civ-unique abilities (European expansion wave)
  | "wagenburg"
  | "halberd_hook"
  | "schiltron"
  | "sparth_cleave"
  | "couched_lance"
  | "mountain_ambush"
  | "desperta_ferro"
  | "falx_reap"
  | "winter_war"
  | "shear_oars"
  | "swift_oars"
  // bespoke civ-unique abilities (Asia wave)
  | "howdah_volley"
  | "double_ballista"
  | "duel_of_kings"
  | "elephant_wall"
  | "gate_breaker"
  | "turtle_shell"
  | "highland_charge"
  | "qamargah"
  // bespoke civ-unique abilities (Steppe & Near East wave)
  | "whistling_arrows"
  | "nerge"
  | "steady_volley"
  | "wolf_pack"
  | "naphtha_shot"
  | "camel_panic"
  // bespoke civ-unique abilities (Americas & Oceania wave)
  | "flower_war"
  | "haka"
  | "bolas"
  | "hornet_bomb"
  | "stone_hail"
  | "beach_assault"
  | "mourning_war"
  | "atlatl_volley"
  | "obsidian_reap"
  | "leiomano"
  // legend (hero) signature abilities (docs/UNIT-ABILITIES.md §9)
  | "slay_the_beast"
  | "uprising"
  | "sacred_banner"
  | "pyramid_of_skulls"
  | "basilica_bombard"
  // religion unique-unit signature abilities (see religion-units.ts)
  | "benediction"
  | "darshan"
  | "orisha_favor"
  | "purifying_flame"
  | "storm_call"
  | "chakkar"
  | "doom_prophecy"
  | "omen_of_ishtar"
  | "eclipse_prophecy"
  | "kagura"
  | "metta"
  | "takbir"
  | "deus_vult";

/** A persistent stance a unit enters by forfeiting its movement for the turn. */
export type StanceId = "brace" | "shield_wall" | "testudo" | "emplace" | "othismos" | "last_stand" | "pavise" | "stone_bulwark" | "zareba" | "iron_wall" | "wagenburg" | "schiltron" | "elephant_wall" | "turtle_shell";

/**
 * How an ability is invoked:
 * - `stance`   — toggled on; ends the turn; modifies combat until it clears.
 * - `targeted` — needs a target tile (an adjacent/in-range enemy); resolves now.
 * - `self`     — affects only the user; resolves now and ends the turn.
 */
export type AbilityKind = "stance" | "targeted" | "self";

export interface ActiveAbilityDef {
  id: ActiveAbilityId;
  /** In-game display name. */
  name: string;
  /** Short verb shown on the action button tooltip. */
  verb: string;
  /** Emoji/glyph fallback when no icon image is present. */
  glyph: string;
  kind: AbilityKind;
  /** Extra turns the unit must wait between uses (0 = usable again next turn). */
  cooldown: number;
  desc: string;
}

const A = (d: ActiveAbilityDef): ActiveAbilityDef => d;

export const ACTIVE_ABILITY_DEFS: Record<ActiveAbilityId, ActiveAbilityDef> = {
  brace: A({ id: "brace", name: "Set Spears", verb: "Guard", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Brace: +25% defense (+40% vs cavalry) until your next turn. Forfeits movement." }),
  shield_wall: A({ id: "shield_wall", name: "Shield Wall", verb: "Form Wall", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Brace that grows with adjacent friendly infantry (up to +45% defense). Forfeits movement." }),
  testudo: A({ id: "testudo", name: "Testudo", verb: "Form Testudo", glyph: "🐢", kind: "stance", cooldown: 0, desc: "+50% defense vs ranged, −10% vs melee, until your next turn. Forfeits movement." }),
  emplace: A({ id: "emplace", name: "Emplace", verb: "Set Up", glyph: "🎯", kind: "stance", cooldown: 0, desc: "Deploy: +50% ranged strength and +1 range while set, but −25% defense and 0 movement. Moving packs up." }),
  charge: A({ id: "charge", name: "Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "Strike an adjacent enemy and ride through to the tile behind it (+4 attack). Blunted by braced spears." }),
  shock_charge: A({ id: "shock_charge", name: "Shock Charge", verb: "Shock Charge", glyph: "🐎", kind: "targeted", cooldown: 1, desc: "Heavy charge: +6 attack and knocks the defender back a tile. Takes full retaliation." }),
  trample: A({ id: "trample", name: "Trample", verb: "Trample", glyph: "🐘", kind: "targeted", cooldown: 1, desc: "Charge that splashes ½ damage to other adjacent enemies. A wounded beast risks rampaging." }),
  fire_and_retreat: A({ id: "fire_and_retreat", name: "Fire & Retreat", verb: "Fire & Retreat", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Shoot a target, then step one tile away from it (Parthian shot)." }),
  skirmish: A({ id: "skirmish", name: "Skirmish", verb: "Skirmish", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Shoot a target, then fall back one tile — if you didn't move first and aren't pinned." }),
  sunder: A({ id: "sunder", name: "Sunder", verb: "Sunder", glyph: "🔨", kind: "targeted", cooldown: 0, desc: "A crushing blow: lighter damage but the target loses 25% defense until its next turn." }),
  pierce: A({ id: "pierce", name: "Pierce", verb: "Pierce", glyph: "🎯", kind: "targeted", cooldown: 0, desc: "Armor-piercing bolt: ignores 6 points of the target's defense. Reduced range this shot." }),
  harry: A({ id: "harry", name: "Harry", verb: "Harry", glyph: "🪤", kind: "targeted", cooldown: 0, desc: "Low-damage strike that pins the target — it cannot move on its next turn." }),
  reconnoiter: A({ id: "reconnoiter", name: "Reconnoiter", verb: "Scout Ahead", glyph: "🔭", kind: "self", cooldown: 0, desc: "Forfeit the turn for a vision pulse: +2 sight until your next turn, and reveal hidden enemy units in sight." }),
  hide: A({ id: "hide", name: "Hide", verb: "Hide", glyph: "🌲 ", kind: "self", cooldown: 0, desc: "Conceal in cover (needs ≥1 movement, forfeits the rest). Invisible to enemies until you act or are discovered. An enemy stepping onto you is ambushed; breaking cover near foes grants an ambush attack bonus." }),
  // civ-unique / enhanced (docs/UNIT-ABILITIES.md §8)
  war_cart_charge: A({ id: "war_cart_charge", name: "War-Cart Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "An early, lighter charge (+2 attack) that rides through the target — but not over rough terrain." }),
  parthian_shot: A({ id: "parthian_shot", name: "Parthian Shot", verb: "Parthian Shot", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Fire on the gallop: shoot even after moving, then fall back a tile for free." }),
  feigned_retreat: A({ id: "feigned_retreat", name: "Feigned Retreat", verb: "Feign / Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "Dual-mode horse tactic: kite a distant foe (fire & retreat) or close and ride through an adjacent one (charge)." }),
  hussar_charge: A({ id: "hussar_charge", name: "Winged Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "A lance charge that punches through braced spears, ignoring the Set Spears/Shield Wall penalty." }),
  othismos: A({ id: "othismos", name: "Othismos", verb: "Form Phalanx", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Shield Wall that also lends adjacent friendly melee +2 attack (the phalanx push). Forfeits movement." }),
  last_stand: A({ id: "last_stand", name: "Last Stand", verb: "Last Stand", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Brace whose bonus grows as HP falls (up to +60% near death). Forfeits movement." }),
  repeating_fire: A({ id: "repeating_fire", name: "Repeating Fire", verb: "Repeating Fire", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Loose two volleys in one turn; the second shot is weaker." }),
  pavise: A({ id: "pavise", name: "Pavise", verb: "Set Pavise", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Plant a pavise shield: +50% defense vs ranged until your next turn. Forfeits movement." }),
  arrow_storm: A({ id: "arrow_storm", name: "Arrow Storm", verb: "Arrow Storm", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "A long volley (+1 range) that also lightly wounds a second enemy beside the target." }),
  furor: A({ id: "furor", name: "Furor", verb: "Furor", glyph: "⚔️", kind: "targeted", cooldown: 0, desc: "A fanatic charge: +6 attack this strike, but −4 defense until your next turn." }),
  siege_assault: A({ id: "siege_assault", name: "Assault Tower", verb: "Assault", glyph: "🪜", kind: "targeted", cooldown: 0, desc: "Storm a city wall: a melee assault that ignores wall defense and shelters its crew." }),
  fire_lance: A({ id: "fire_lance", name: "Fire Lance", verb: "Fire Lance", glyph: "🔥", kind: "targeted", cooldown: 2, desc: "Loose a gunpowder lance at a target up to 2 tiles away — slightly stronger than a melee thrust and drawing no retaliation. Needs two turns to reload." }),
  plunder: A({ id: "plunder", name: "Plunder", verb: "Plunder", glyph: "💰", kind: "targeted", cooldown: 0, desc: "A raiding strike (+2 attack). If it kills the target, seize gold scaled to the spoils." }),
  // bespoke civ-unique abilities (Egypt & Africa wave)
  aimed_shot: A({ id: "aimed_shot", name: "Aimed Shot", verb: "Aim", glyph: "👁️", kind: "targeted", cooldown: 1, desc: "A marksman's shot that ignores 4 defense; a survivor is maimed, attacking −25% until its next turn." }),
  terrorize: A({ id: "terrorize", name: "Terrorize", verb: "Terrorize", glyph: "🐘", kind: "targeted", cooldown: 1, desc: "A thunderous assault (+3 attack) that shakes the survivor's morale — it must pass a rout check or break and flee." }),
  overrun: A({ id: "overrun", name: "Overrun", verb: "Overrun", glyph: "🐎", kind: "targeted", cooldown: 1, desc: "A momentum strike (+2 attack). If it kills the target, the rider surges on and may act again this turn." }),
  war_drums: A({ id: "war_drums", name: "War Drums", verb: "Beat the Drums", glyph: "🥁", kind: "self", cooldown: 2, desc: "Thunder the great drums: this unit and adjacent allies gain +15 morale; adjacent enemies lose 10. Ends the turn." }),
  poisoned_arrows: A({ id: "poisoned_arrows", name: "Poisoned Arrows", verb: "Envenom", glyph: "🌿", kind: "targeted", cooldown: 1, desc: "A lighter shot tipped with venom: the survivor bleeds 8 HP at the start of each of its next two turns." }),
  stone_bulwark: A({ id: "stone_bulwark", name: "Stone Bulwark", verb: "Form Bulwark", glyph: "🧱", kind: "stance", cooldown: 0, desc: "Anchor a living wall: +25% defense, and adjacent friendly units gain +15% defense while it holds. Forfeits movement." }),
  fresh_mounts: A({ id: "fresh_mounts", name: "Fresh Mounts", verb: "Remount", glyph: "🐎", kind: "self", cooldown: 2, desc: "Switch to fresh horses: movement is fully restored, and the unit may still act this turn." }),
  drilled_charge: A({ id: "drilled_charge", name: "Drilled Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 1, desc: "A parade-ground-perfect charge (+4 attack) executed so cleanly the target gets no retaliation." }),
  zareba: A({ id: "zareba", name: "Zareba", verb: "Raise Zareba", glyph: "🌵", kind: "stance", cooldown: 0, desc: "Ring the position with thorn fencing: +25% defense (+45% vs cavalry), and melee attackers bleed 6 HP on the thorns. Forfeits movement." }),
  monsoon_run: A({ id: "monsoon_run", name: "Monsoon Run", verb: "Catch the Wind", glyph: "🌬️", kind: "self", cooldown: 2, desc: "Catch the monsoon: +2 movement now, and the ship may still act this turn." }),
  // bespoke civ-unique abilities (Mediterranean & Europe wave)
  pilum: A({ id: "pilum", name: "Pilum Volley", verb: "Throw Pila", glyph: "🎯", kind: "targeted", cooldown: 1, desc: "Hurl the heavy javelins, then close with the sword: a softening ranged volley followed by a full melee strike." }),
  strandhogg: A({ id: "strandhogg", name: "Strandhögg", verb: "Raid", glyph: "⚔️", kind: "targeted", cooldown: 0, desc: "A lightning coastal raid (+2 attack). If it kills the target, carry off gold scaled to the spoils." }),
  hellburner: A({ id: "hellburner", name: "Hellburner", verb: "Ignite", glyph: "💥", kind: "targeted", cooldown: 0, desc: "Pack the hull with powder and steer it in: massive damage to the target and half to adjacent enemy ships — but the vessel is consumed." }),
  broadside: A({ id: "broadside", name: "Broadside", verb: "Fire Broadside", glyph: "💣", kind: "targeted", cooldown: 1, desc: "A crashing gun broadside fired at range (no retaliation) that also wrecks the survivor's rigging: −25% defense until its next turn." }),
  zweihander: A({ id: "zweihander", name: "Zweihänder", verb: "Break the Pikes", glyph: "⚔️", kind: "targeted", cooldown: 0, desc: "The great two-handed sword hacks through the enemy's pike hedge (+2 attack) and breaks their stance." }),
  hammer_and_anvil: A({ id: "hammer_and_anvil", name: "Hammer & Anvil", verb: "Coordinate", glyph: "🔨", kind: "targeted", cooldown: 1, desc: "A coordinated strike (+4 attack) on an enemy already engaged by another of your units — the anvil holds, the hammer falls." }),
  wedge_charge: A({ id: "wedge_charge", name: "Wedge Charge", verb: "Form Wedge", glyph: "🐎", kind: "targeted", cooldown: 1, desc: "A cataphract wedge (+4 attack) that punches through: half damage splashes onto one enemy beside the target." }),
  heroic_challenge: A({ id: "heroic_challenge", name: "Heroic Challenge", verb: "Challenge", glyph: "🏇", kind: "targeted", cooldown: 2, desc: "Ride out and strike a champion's blow (+3 attack). If it kills the foe, every friendly unit within 2 tiles takes heart (+10 morale)." }),
  mounted_volley: A({ id: "mounted_volley", name: "Mounted Volley", verb: "Volley & Charge", glyph: "🏹", kind: "targeted", cooldown: 1, desc: "Loose a mounted crossbow volley to soften the target, then charge home with the lance in the same breath." }),
  // bespoke civ-unique abilities (Mesopotamia & Persia revisit)
  king_of_battle: A({ id: "king_of_battle", name: "King of Battle", verb: "Strike as One", glyph: "👑", kind: "targeted", cooldown: 0, desc: "The professional army fights as one: +1 attack for every friendly military unit adjacent to this one (up to +4)." }),
  siege_volley: A({ id: "siege_volley", name: "Siege Volley", verb: "Volley the Walls", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "An arcing volley against the defenders of walls: +5 ranged strength against a unit garrisoning a city or holding a fort." }),
  kadesh_charge: A({ id: "kadesh_charge", name: "Three-Man Chariot", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 1, desc: "The heavy three-crew chariot charges (+4) and rides through to the far side; the shield-bearer halves any retaliation." }),
  zagros_shot: A({ id: "zagros_shot", name: "Zagros Shot", verb: "Loose & Climb", glyph: "🏹", kind: "targeted", cooldown: 1, desc: "A heavy highland shaft that ignores 4 defense — then the archer slips a tile back toward the high ground." }),
  ride_down: A({ id: "ride_down", name: "Ride Down", verb: "Ride Down", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "Run down a faltering enemy: +6 attack against targets below half strength (+1 otherwise)." }),
  endless_ranks: A({ id: "endless_ranks", name: "Endless Ranks", verb: "Reinforce", glyph: "♾️", kind: "self", cooldown: 2, desc: "Every fallen man is instantly replaced: heal 30 HP. Ends the turn." }),
  iron_wall: A({ id: "iron_wall", name: "Iron Wall", verb: "Stand as Iron", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Mailed riders on mailed horses stand as a wall: +35% defense until your next turn. Forfeits movement." }),
  // bespoke civ-unique abilities (European expansion wave)
  wagenburg: A({ id: "wagenburg", name: "Wagenburg", verb: "Circle the Wagons", glyph: "🛞", kind: "stance", cooldown: 0, desc: "Chain the war wagons into a fortress: +40% defense, and it PERSISTS until the wagon moves — fire from behind the walls each turn." }),
  halberd_hook: A({ id: "halberd_hook", name: "Halberd Hook", verb: "Hook", glyph: "🪝", kind: "targeted", cooldown: 0, desc: "The halberd's hook drags riders from the saddle: +6 attack against cavalry (+2 against others)." }),
  schiltron: A({ id: "schiltron", name: "Schiltron", verb: "Form Schiltron", glyph: "🦔", kind: "stance", cooldown: 0, desc: "An all-round hedgehog of spears: +30% defense (+50% vs cavalry), and cavalry that attack it bleed 5 HP on the spear points. Forfeits movement." }),
  sparth_cleave: A({ id: "sparth_cleave", name: "Sparth Cleave", verb: "Cleave", glyph: "🪓", kind: "targeted", cooldown: 1, desc: "The great sparth axe sweeps in an arc: a full strike on the target, and a second enemy beside the axeman takes a glancing wound." }),
  couched_lance: A({ id: "couched_lance", name: "Couched Lance", verb: "Couch Lance", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "A running lance charge that feeds on momentum: +2 attack, plus +1 for every tile moved this turn (up to +6 total)." }),
  mountain_ambush: A({ id: "mountain_ambush", name: "Mountain Ambush", verb: "Ambush", glyph: "⛰️", kind: "targeted", cooldown: 1, desc: "Loose from the high passes: +4 ranged strength when firing from rough terrain (hills, forest or mountains)." }),
  desperta_ferro: A({ id: "desperta_ferro", name: "Desperta Ferro!", verb: "Awaken Iron", glyph: "⚡", kind: "self", cooldown: 2, desc: "Strike sparks from the blades and scream the war-cry: adjacent enemies lose 10 morale, this unit gains 15 — and may still act this turn." }),
  falx_reap: A({ id: "falx_reap", name: "Falx Reap", verb: "Reap", glyph: "🌙", kind: "targeted", cooldown: 0, desc: "The two-handed falx reaches over shield and past armor: +1 attack, ignoring 6 of the defender's defense." }),
  winter_war: A({ id: "winter_war", name: "Winter War", verb: "Strike in Snow", glyph: "❄️", kind: "targeted", cooldown: 0, desc: "On skis in the white silence: +4 ranged strength when firing from tundra, taiga or snow." }),
  shear_oars: A({ id: "shear_oars", name: "Shear Oars", verb: "Shear Oars", glyph: "🚣", kind: "targeted", cooldown: 1, desc: "Rake down the enemy's oar-bank (+2 attack): a survivor is crippled in the water and cannot move on its next turn." }),
  swift_oars: A({ id: "swift_oars", name: "Swift Oars", verb: "Row Hard", glyph: "💨", kind: "self", cooldown: 2, desc: "The pirate galley leaps forward: +2 movement now, and the ship may still act this turn." }),
  // bespoke civ-unique abilities (Asia wave)
  howdah_volley: A({ id: "howdah_volley", name: "Howdah Volley", verb: "Loose from the Howdah", glyph: "🏹", kind: "targeted", cooldown: 1, desc: "The archers atop the beast loose a volley over the melee: a ranged strike that draws no retaliation." }),
  double_ballista: A({ id: "double_ballista", name: "Double Ballista", verb: "Fire Ballista", glyph: "🎯", kind: "targeted", cooldown: 1, desc: "The twin crossbow mounted on the elephant's back fires a heavy bolt up to 2 tiles, drawing no retaliation." }),
  duel_of_kings: A({ id: "duel_of_kings", name: "Duel of Kings", verb: "Offer the Duel", glyph: "⚔️", kind: "targeted", cooldown: 1, desc: "Single combat from the howdah: +6 attack against mounted foes and rival elephants (+2 against others)." }),
  elephant_wall: A({ id: "elephant_wall", name: "Elephant Wall", verb: "Form the Wall", glyph: "🐘", kind: "stance", cooldown: 0, desc: "The great beasts stand as a living rampart: +25% defense, and adjacent friendly units gain +15% while the wall holds. Forfeits movement." }),
  gate_breaker: A({ id: "gate_breaker", name: "Gate Breaker", verb: "Break the Gate", glyph: "🚪", kind: "targeted", cooldown: 1, desc: "Drive the armored beast at the defenses: +5 attack against a unit garrisoning a city or holding a fort (+1 otherwise)." }),
  turtle_shell: A({ id: "turtle_shell", name: "Turtle Shell", verb: "Seal the Shell", glyph: "🐢", kind: "stance", cooldown: 0, desc: "Seal the spiked iron roof: +30% defense, and melee attackers bleed 8 HP on the spikes. Forfeits movement." }),
  highland_charge: A({ id: "highland_charge", name: "Highland Charge", verb: "Charge Downhill", glyph: "🏔️", kind: "targeted", cooldown: 0, desc: "A charge launched from the high ground: +4 attack when attacking from rough terrain (+1 otherwise)." }),
  qamargah: A({ id: "qamargah", name: "Qamargah", verb: "Close the Circle", glyph: "🎯", kind: "targeted", cooldown: 1, desc: "The hunt-circle closes: +5 attack against a target already weakened — sundered, pinned, maimed, poisoned or routed (+1 otherwise)." }),
  // bespoke civ-unique abilities (Steppe & Near East wave)
  whistling_arrows: A({ id: "whistling_arrows", name: "Whistling Arrows", verb: "Loose the Shriek", glyph: "🎶", kind: "targeted", cooldown: 1, desc: "A volley of shrieking arrowheads: a full ranged strike whose survivor loses 12 morale and must pass a rout check or break." }),
  nerge: A({ id: "nerge", name: "Nerge", verb: "Close the Ring", glyph: "⭕", kind: "targeted", cooldown: 1, desc: "The great hunt's ring closes: +5 attack when two or more of your units stand adjacent to the target (+1 otherwise)." }),
  steady_volley: A({ id: "steady_volley", name: "Steady Volley", verb: "Hold and Fire", glyph: "🎯", kind: "targeted", cooldown: 0, desc: "Fire discipline: +4 ranged strength if this unit has not moved this turn." }),
  wolf_pack: A({ id: "wolf_pack", name: "Wolf Pack", verb: "Hunt as the Pack", glyph: "🐺", kind: "targeted", cooldown: 0, desc: "The böri hunt together: +3 attack when a friendly cavalry unit stands beside the target." }),
  naphtha_shot: A({ id: "naphtha_shot", name: "Naphtha Shot", verb: "Loose Fire", glyph: "🔥", kind: "targeted", cooldown: 1, desc: "A burning naphtha pot arcs onto the target and bursts: full damage, and enemies beside it are splashed with fire." }),
  camel_panic: A({ id: "camel_panic", name: "Camel Panic", verb: "Drive the Camels", glyph: "🐪", kind: "targeted", cooldown: 0, desc: "Horses cannot abide the smell of camels: +4 ranged strength against cavalry, and a surviving mounted target loses 10 morale." }),
  // bespoke civ-unique abilities (Americas & Oceania wave)
  flower_war: A({ id: "flower_war", name: "Flower War", verb: "Take Captives", glyph: "🌺", kind: "targeted", cooldown: 0, desc: "Fight for the altar (+2 attack): if the strike kills, captives are taken and the empire gains 20 faith." }),
  haka: A({ id: "haka", name: "Haka", verb: "Perform the Haka", glyph: "👣", kind: "self", cooldown: 2, desc: "The war challenge thunders out: this unit and adjacent allies gain +10 morale, adjacent enemies lose 10 — and the unit may still act this turn." }),
  bolas: A({ id: "bolas", name: "Bolas", verb: "Throw Bolas", glyph: "🪢", kind: "targeted", cooldown: 1, desc: "Whirling cords entangle the target: a lighter strike, but the survivor cannot move on its next turn." }),
  hornet_bomb: A({ id: "hornet_bomb", name: "Hornet Bomb", verb: "Hurl the Nest", glyph: "🐝", kind: "targeted", cooldown: 1, desc: "A sealed gourd of furious wasps bursts over the enemy: light damage, but the survivor is pinned in the swarm and loses 10 morale." }),
  stone_hail: A({ id: "stone_hail", name: "Stone Hail", verb: "Loose Stone Hail", glyph: "🪨", kind: "targeted", cooldown: 1, desc: "Sling-stones crack shields and dent helmets: a full ranged strike whose survivor defends −25% until its next turn." }),
  beach_assault: A({ id: "beach_assault", name: "Beach Assault", verb: "Storm Ashore", glyph: "🌊", kind: "targeted", cooldown: 1, desc: "Storm out of the surf: +5 attack while this unit is embarked — the landing strike of the canoe fleets." }),
  mourning_war: A({ id: "mourning_war", name: "Mourning War", verb: "Raid for the Lost", glyph: "🍂", kind: "targeted", cooldown: 1, desc: "A raid to replace the fallen (+2 attack): if the strike kills, the warband restores itself, healing 20 HP." }),
  atlatl_volley: A({ id: "atlatl_volley", name: "Atlatl Volley", verb: "Cast Darts", glyph: "🎯", kind: "targeted", cooldown: 1, desc: "A volley of spear-thrower darts softens the target, then the obsidian spears close in — a ranged strike and a melee strike in one." }),
  obsidian_reap: A({ id: "obsidian_reap", name: "Obsidian Reap", verb: "Reap", glyph: "🖤", kind: "targeted", cooldown: 0, desc: "Blades of volcanic glass sharper than steel: +1 attack, ignoring 6 of the defender's defense." }),
  leiomano: A({ id: "leiomano", name: "Leiomano", verb: "Strike with Shark's Teeth", glyph: "🦈", kind: "targeted", cooldown: 1, desc: "The shark-tooth club tears rather than cuts (+2 attack): the survivor bleeds 8 HP at the start of each of its next two turns." }),
  // legend (hero) signature abilities (docs/UNIT-ABILITIES.md §9)
  slay_the_beast: A({ id: "slay_the_beast", name: "Slay the Beast", verb: "Slay the Beast", glyph: "🦁", kind: "targeted", cooldown: 1, desc: "A hero's blow out of the Epic: +6 attack against barbarians (+1 against others). If the foe falls, this hero and adjacent allies gain +10 morale." }),
  uprising: A({ id: "uprising", name: "Uprising", verb: "Raise in Revolt", glyph: "🔥", kind: "targeted", cooldown: 3, desc: "Rouse an adjacent barbarian war-band to the cause: the unit joins your side. Ends the turn." }),
  sacred_banner: A({ id: "sacred_banner", name: "Sacred Banner", verb: "Raise the Banner", glyph: "🚩", kind: "self", cooldown: 2, desc: "Raise the banner of Orléans: this hero and adjacent allies heal 10 HP and gain +15 morale. Ends the turn." }),
  pyramid_of_skulls: A({ id: "pyramid_of_skulls", name: "Pyramid of Skulls", verb: "Make an Example", glyph: "💀", kind: "targeted", cooldown: 2, desc: "A conqueror's blow (+4 attack) struck to be seen: if the target falls, every enemy unit within 2 tiles loses 15 morale." }),
  basilica_bombard: A({ id: "basilica_bombard", name: "The Basilica", verb: "Fire the Great Bombard", glyph: "💣", kind: "targeted", cooldown: 2, desc: "The great bombard hurls a stone ball at +1 range: +6 ranged strength against units holding walls or forts (+2 otherwise). Two turns to reload." }),
  // religion unique-unit signature abilities (see religion-units.ts; magnitudes scale with religion tier)
  benediction: A({ id: "benediction", name: "Benediction", verb: "Bless", glyph: "✝", kind: "targeted", cooldown: 1, desc: "Lay hands on an adjacent friendly unit: it heals 15 HP and gains +10 morale. Scales with the faith's tier." }),
  darshan: A({ id: "darshan", name: "Darshan", verb: "Grant Darshan", glyph: "🕉", kind: "targeted", cooldown: 1, desc: "Bestow an auspicious sight on an adjacent friendly unit: it heals 15 HP and gains +10 morale. Scales with the faith's tier." }),
  orisha_favor: A({ id: "orisha_favor", name: "Orisha's Favor", verb: "Call the Orisha", glyph: "🪘", kind: "targeted", cooldown: 1, desc: "Cast the opele for an adjacent friendly unit: it heals 15 HP and gains +10 morale. Scales with the faith's tier." }),
  purifying_flame: A({ id: "purifying_flame", name: "Purifying Flame", verb: "Purify", glyph: "🔥", kind: "self", cooldown: 2, desc: "Holy fire scours every adjacent enemy: 8 damage and −10 morale. Scales with the faith's tier. Ends the turn." }),
  storm_call: A({ id: "storm_call", name: "Storm Call", verb: "Call the Storm", glyph: "🌩", kind: "self", cooldown: 2, desc: "Tengri's storm lashes every adjacent enemy: 8 damage and −10 morale. Scales with the faith's tier. Ends the turn." }),
  chakkar: A({ id: "chakkar", name: "Chakkar", verb: "Whirl the Chakram", glyph: "⭕", kind: "self", cooldown: 2, desc: "The steel quoit whirls: strike EVERY adjacent enemy at 60% strength, drawing no retaliation. Ends the turn." }),
  doom_prophecy: A({ id: "doom_prophecy", name: "Doom Prophecy", verb: "Prophesy Doom", glyph: "🔮", kind: "self", cooldown: 2, desc: "Name the doom of enemies within 2 tiles: −3 combat until your next turn and −10 morale. Scales with the faith's tier. Ends the turn." }),
  omen_of_ishtar: A({ id: "omen_of_ishtar", name: "Omen of Ishtar", verb: "Read the Omen", glyph: "✶", kind: "self", cooldown: 2, desc: "A baleful star confounds enemies within 2 tiles: −3 combat until your next turn and −10 morale. Scales with the faith's tier. Ends the turn." }),
  eclipse_prophecy: A({ id: "eclipse_prophecy", name: "Eclipse Prophecy", verb: "Darken the Sun", glyph: "🌑", kind: "self", cooldown: 2, desc: "The foretold eclipse dismays enemies within 2 tiles: −3 combat until your next turn and −10 morale. Scales with the faith's tier. Ends the turn." }),
  kagura: A({ id: "kagura", name: "Kagura", verb: "Dance the Kagura", glyph: "⛩", kind: "self", cooldown: 2, desc: "The sacred dance restores friendly units within 2 tiles: heal 10 HP and +15 morale. Scales with the faith's tier. Ends the turn." }),
  metta: A({ id: "metta", name: "Mettā", verb: "Radiate Mettā", glyph: "☸", kind: "self", cooldown: 2, desc: "Loving-kindness suffuses friendly units within 2 tiles: heal 10 HP and +15 morale. Scales with the faith's tier. Ends the turn." }),
  takbir: A({ id: "takbir", name: "Takbīr", verb: "Raise the Cry", glyph: "☪", kind: "self", cooldown: 2, desc: "The battle-cry rings out: friendly units within 2 tiles gain +15 morale, adjacent enemies lose 10. Ends the turn." }),
  deus_vult: A({ id: "deus_vult", name: "Deus Vult", verb: "Charge", glyph: "✠", kind: "targeted", cooldown: 1, desc: "A crusader's charge (+5 attack, +8 against cities) against an adjacent enemy." }),
  // naval
  ram: A({ id: "ram", name: "Ram", verb: "Ram", glyph: "⚓", kind: "targeted", cooldown: 0, desc: "Drive the ship into an adjacent enemy vessel (+4 attack)." }),
  boarding_party: A({ id: "boarding_party", name: "Boarding Party", verb: "Board", glyph: "⚔️", kind: "targeted", cooldown: 1, desc: "Grapple and storm an adjacent ship (+5 attack, heal on kill)." }),
  greek_fire: A({ id: "greek_fire", name: "Greek Fire", verb: "Burn", glyph: "🔥", kind: "targeted", cooldown: 1, desc: "Flame projectile that sunders the target and splashes half damage to adjacent enemy ships." }),
  coastal_bombardment: A({ id: "coastal_bombardment", name: "Coastal Bombardment", verb: "Bombard", glyph: "💣", kind: "targeted", cooldown: 0, desc: "Ranged ship focuses fire on a coastal city or unit (+4 ranged strength)." }),
};

export type BuildingId =
  | "granary" | "workshop" | "forge" | "walls"
  | "market" | "bank" | "library" | "academy" | "aqueduct" | "harbor" | "lighthouse" | "monument" | "amphitheater"
  | "museum" | "shrine" | "temple"
  // Buildings Expansion — military production, the fortification chain, growth & support.
  | "drill_yard" | "armoury" | "arsenal"
  | "castle" | "ballista_towers" | "bombard_tower"
  | "storehouse" | "infirmary" | "triumphal_arch" | "beacon_tower";

/**
 * Dedicated unit-training building families. Each trains units of one or more unit
 * classes (see TRAINING_CLASS_OF) and has 5 tiers that improve training speed,
 * starting morale/XP, and the number of units trainable at once. Tiers are raised
 * through normal city construction (see ProductionItem `trainingBuilding`); they are
 * NOT stored in `city.buildings` but in `city.training` (see state.ts).
 */
export type TrainingClass = "barracks" | "archery_range" | "stable" | "siege_workshop" | "shipyard";

export type TechId =
  // Dawn
  | "knapping" | "foraging" | "fire_hardening" | "hide_working" | "animal_taming"
  | "cultivation" | "ritual_burial" | "pottery_kiln" | "parley"
  // Copper / Bronze
  | "native_copper" | "smelting" | "bronze_alloying" | "the_wheel" | "equestrian"
  | "masonry" | "weaving" | "composite_bow" | "writing" | "irrigation"
  | "sailcloth" | "chariotry" | "phalanx" | "maritime_foraging"
  // Naval / Maritime
  | "sailing" | "shipbuilding" | "naval_architecture" | "optics" | "astronomy" | "cartography"
  // Iron / Classical
  | "iron_bloomery" | "carburizing" | "siegecraft" | "torsion_engines"
  | "mathematics" | "engineering" | "coinage" | "philosophy"
  | "cavalry_doctrine" | "horse_archery" | "crossbow"
  | "monumental_architecture" | "elephantry" | "bridge_building"
  // Intellectual / cultural / religious institutions — unlock labour-conversion projects
  | "scholasticism" | "aesthetics" | "theology"
  // Early gunpowder
  | "gunpowder" | "firearms";

export const UNIT_MAX_HP = 100;

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  glyph: string;
  cls: UnitClass;
  movement: number;
  sight: number;
  cost: number;
  /** Gold upkeep per turn. Civilian/consumed units are usually 0. */
  upkeep: number;
  strength: number;
  rangedStrength?: number;
  range?: number;
  reqTech?: TechId;
  /** Strategic resource required to train this unit. */
  reqResource?: { resource: string; count: number };
  founder?: boolean;
  builder?: boolean;
  /** Consumed to establish a trade route between two of your cities. */
  trader?: boolean;
  /** Faith-purchased religious unit (missionary/apostle/inquisitor). Not trained. */
  religious?: boolean;
  /** Charges a religious unit carries (spread/purge actions); spent then removed. */
  religiousCharges?: number;
  /** Faith price to buy a religious unit (base; rises with how many you've bought). */
  faithCost?: number;
  /** Religion def id (@roc/data RELIGIONS) whose unique unit this is. Trainable
   *  only in temple cities whose majority faith matches (see religion-units.ts). */
  religionUnit?: string;
  abilities?: UnitAbility[];
  /** Player-triggered active abilities (see ACTIVE_ABILITY_DEFS). */
  activeAbilities?: ActiveAbilityId[];
  /** True if the unit can embark land units or itself cross deep ocean. */
  transport?: boolean;
  /** True if the unit can enter ocean tiles before Astronomy. */
  oceanGoing?: boolean;
  /** Fraction (0–1) by which this unit's chance to rout is reduced — disciplined
   *  elites and heavy units stand their ground (see morale.ts). */
  routeResistance?: number;
  /** Gunpowder weapon: very strong, but its ranged shot must be reloaded — it
   *  fires every other turn (loads one turn, fires the next). New units start
   *  with a charge already loaded (see combat.ts / state.ts `loaded`). */
  gunpowder?: boolean;
  /** Passively reveals concealed enemy units within this many tiles each turn
   *  (e.g. war dogs sniff out hidden ambushers; see stealth.ts). */
  detectHiddenRadius?: number;
}

const U = (d: UnitDef): UnitDef => d;

export const UNIT_DEFS: Record<UnitTypeId, UnitDef> = {
  settler: U({ id: "settler", name: "Settler", glyph: "S", cls: "settler", movement: 2, sight: 2, cost: 24, upkeep: 0, strength: 0, founder: true }),
  trader: U({ id: "trader", name: "Trader", glyph: "$", cls: "trader", movement: 3, sight: 2, cost: 30, upkeep: 1, strength: 0, reqTech: "the_wheel", trader: true }),
  // Religious units — bought with faith (not trained), gated by Ritual & Burial.
  missionary: U({ id: "missionary", name: "Missionary", glyph: "✝", cls: "religious", movement: 4, sight: 2, cost: 0, upkeep: 0, strength: 0, reqTech: "ritual_burial", religious: true, religiousCharges: 3, faithCost: 120 }),
  apostle: U({ id: "apostle", name: "Apostle", glyph: "✚", cls: "religious", movement: 4, sight: 2, cost: 0, upkeep: 0, strength: 6, reqTech: "ritual_burial", religious: true, religiousCharges: 4, faithCost: 200 }),
  inquisitor: U({ id: "inquisitor", name: "Inquisitor", glyph: "☩", cls: "religious", movement: 3, sight: 2, cost: 0, upkeep: 0, strength: 0, reqTech: "ritual_burial", religious: true, religiousCharges: 3, faithCost: 160 }),

  // ---- religion unique units (one per faith; production-trained in any city that
  // follows the faith and has a Temple; stats/abilities scale with religion tier —
  // see religion-units.ts for each unit's signature kit) ----
  evangelist: U({ id: "evangelist", name: "Evangelist", glyph: "✝", cls: "religious", movement: 4, sight: 2, cost: 45, upkeep: 0, strength: 6, reqTech: "writing", religionUnit: "christianity", activeAbilities: ["benediction"] }),
  templar_knight: U({ id: "templar_knight", name: "Templar Knight", glyph: "✠", cls: "cavalry", movement: 4, sight: 2, cost: 70, upkeep: 1, strength: 16, reqTech: "writing", religionUnit: "catholicism" }),
  hesychast_monk: U({ id: "hesychast_monk", name: "Hesychast Monk", glyph: "📿", cls: "religious", movement: 3, sight: 2, cost: 40, upkeep: 0, strength: 5, reqTech: "writing", religionUnit: "orthodoxy" }),
  ghazi_warrior: U({ id: "ghazi_warrior", name: "Ghazi", glyph: "☪", cls: "melee", movement: 3, sight: 2, cost: 65, upkeep: 1, strength: 15, reqTech: "writing", religionUnit: "islam" }),
  maccabee_zealot: U({ id: "maccabee_zealot", name: "Maccabee Zealot", glyph: "✡", cls: "melee", movement: 3, sight: 2, cost: 60, upkeep: 1, strength: 14, reqTech: "writing", religionUnit: "judaism" }),
  sadhu: U({ id: "sadhu", name: "Sadhu", glyph: "🕉", cls: "religious", movement: 4, sight: 2, cost: 40, upkeep: 0, strength: 4, reqTech: "writing", religionUnit: "hinduism", activeAbilities: ["darshan"] }),
  bodhisattva: U({ id: "bodhisattva", name: "Bodhisattva", glyph: "☸", cls: "religious", movement: 4, sight: 2, cost: 45, upkeep: 0, strength: 4, reqTech: "writing", religionUnit: "buddhism" }),
  flame_magus: U({ id: "flame_magus", name: "Magus of the Flame", glyph: "🔥", cls: "religious", movement: 3, sight: 2, cost: 55, upkeep: 0, strength: 8, reqTech: "writing", religionUnit: "zoroastrianism", activeAbilities: ["purifying_flame"] }),
  ahimsa_ascetic: U({ id: "ahimsa_ascetic", name: "Ahimsa Ascetic", glyph: "🤲", cls: "religious", movement: 4, sight: 2, cost: 40, upkeep: 0, strength: 3, reqTech: "writing", religionUnit: "jainism" }),
  nihang_warrior: U({ id: "nihang_warrior", name: "Nihang", glyph: "⚔", cls: "melee", movement: 3, sight: 2, cost: 70, upkeep: 1, strength: 16, reqTech: "writing", religionUnit: "sikhism" }),
  sage_of_the_way: U({ id: "sage_of_the_way", name: "Sage of the Way", glyph: "☯", cls: "religious", movement: 4, sight: 2, cost: 40, upkeep: 0, strength: 4, reqTech: "writing", religionUnit: "taoism" }),
  imperial_scholar: U({ id: "imperial_scholar", name: "Imperial Scholar", glyph: "📜", cls: "religious", movement: 3, sight: 2, cost: 45, upkeep: 0, strength: 3, reqTech: "writing", religionUnit: "confucianism" }),
  miko_priestess: U({ id: "miko_priestess", name: "Miko", glyph: "⛩", cls: "religious", movement: 3, sight: 4, cost: 45, upkeep: 0, strength: 4, reqTech: "writing", religionUnit: "shinto", detectHiddenRadius: 2, activeAbilities: ["kagura"] }),
  sky_shaman: U({ id: "sky_shaman", name: "Sky Shaman", glyph: "🥁", cls: "cavalry", movement: 5, sight: 3, cost: 55, upkeep: 1, strength: 8, reqTech: "writing", religionUnit: "tengrism" }),
  gothi_warpriest: U({ id: "gothi_warpriest", name: "Gothi War-Priest", glyph: "ᛟ", cls: "melee", movement: 3, sight: 2, cost: 65, upkeep: 1, strength: 15, reqTech: "writing", religionUnit: "norse" }),
  oracle_of_delphi: U({ id: "oracle_of_delphi", name: "Oracle", glyph: "🔮", cls: "religious", movement: 3, sight: 5, cost: 50, upkeep: 0, strength: 3, reqTech: "writing", religionUnit: "hellenism", detectHiddenRadius: 2, activeAbilities: ["doom_prophecy"] }),
  mortuary_priest: U({ id: "mortuary_priest", name: "Mortuary Priest", glyph: "☥", cls: "religious", movement: 3, sight: 2, cost: 50, upkeep: 0, strength: 5, reqTech: "writing", religionUnit: "egyptian" }),
  ziggurat_astrologer: U({ id: "ziggurat_astrologer", name: "Ziggurat Astrologer", glyph: "✶", cls: "religious", movement: 3, sight: 4, cost: 45, upkeep: 0, strength: 4, reqTech: "writing", religionUnit: "mesopotamian" }),
  archdruid: U({ id: "archdruid", name: "Archdruid", glyph: "🌿", cls: "religious", movement: 3, sight: 2, cost: 55, upkeep: 0, strength: 7, reqTech: "writing", religionUnit: "druidism", activeAbilities: ["hide"] }),
  elect_missionary: U({ id: "elect_missionary", name: "Elect", glyph: "☀", cls: "religious", movement: 4, sight: 2, cost: 40, upkeep: 0, strength: 3, reqTech: "writing", religionUnit: "manichaeism" }),
  eagle_priest: U({ id: "eagle_priest", name: "Eagle Priest", glyph: "🦅", cls: "melee", movement: 3, sight: 2, cost: 65, upkeep: 1, strength: 15, reqTech: "writing", religionUnit: "aztec" }),
  daykeeper: U({ id: "daykeeper", name: "Daykeeper", glyph: "𝍎", cls: "religious", movement: 3, sight: 4, cost: 45, upkeep: 0, strength: 4, reqTech: "writing", religionUnit: "maya" }),
  sun_priest: U({ id: "sun_priest", name: "Sun Priest of Inti", glyph: "☀", cls: "religious", movement: 3, sight: 2, cost: 50, upkeep: 0, strength: 5, reqTech: "writing", religionUnit: "inca" }),
  babalawo: U({ id: "babalawo", name: "Babalawo", glyph: "🪘", cls: "religious", movement: 3, sight: 2, cost: 50, upkeep: 0, strength: 5, reqTech: "writing", religionUnit: "yoruba", detectHiddenRadius: 2, activeAbilities: ["orisha_favor"] }),

  scout: U({ id: "scout", name: "Scout", glyph: "C", cls: "recon", movement: 3, sight: 3, cost: 10, upkeep: 1, strength: 4 }),

  clubman: U({ id: "clubman", name: "Clubman", glyph: "c", cls: "melee", movement: 2, sight: 2, cost: 10, upkeep: 1, strength: 6 }),
  warrior: U({ id: "warrior", name: "Warrior", glyph: "W", cls: "melee", movement: 2, sight: 2, cost: 15, upkeep: 1, strength: 8 }),
  slinger: U({ id: "slinger", name: "Slinger", glyph: "L", cls: "ranged", movement: 2, sight: 2, cost: 12, upkeep: 1, strength: 4, rangedStrength: 7, range: 1 }),
  javelineer: U({ id: "javelineer", name: "Javelineer", glyph: "J", cls: "ranged", movement: 2, sight: 2, cost: 14, upkeep: 1, strength: 6, rangedStrength: 8, range: 1 }),
  hunter: U({ id: "hunter", name: "Hunter", glyph: "H", cls: "ranged", movement: 2, sight: 3, cost: 13, upkeep: 1, strength: 5, rangedStrength: 7, range: 1 }),

  firehard_spear: U({ id: "firehard_spear", name: "Fire-Hardened Spearman", glyph: "F", cls: "melee", movement: 2, sight: 2, cost: 15, upkeep: 1, strength: 9, reqTech: "fire_hardening", abilities: ["bonus_vs_cavalry"] }),
  war_dog: U({ id: "war_dog", name: "War Dogs", glyph: "D", cls: "melee", movement: 3, sight: 2, cost: 12, upkeep: 1, strength: 6, reqTech: "animal_taming", detectHiddenRadius: 2 }),
  archer: U({ id: "archer", name: "Archer", glyph: "A", cls: "ranged", movement: 2, sight: 2, cost: 18, upkeep: 1, strength: 6, rangedStrength: 11, range: 2, reqTech: "composite_bow" }),

  axeman: U({ id: "axeman", name: "Bronze Axeman", glyph: "X", cls: "melee", movement: 2, sight: 2, cost: 19, upkeep: 2, strength: 13, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 } }),
  maceman: U({ id: "maceman", name: "Maceman", glyph: "M", cls: "melee", movement: 2, sight: 2, cost: 18, upkeep: 2, strength: 11, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_city"] }),
  spearman: U({ id: "spearman", name: "Spearman", glyph: "P", cls: "melee", movement: 2, sight: 2, cost: 18, upkeep: 2, strength: 11, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_cavalry"], routeResistance: 0.3 }),
  hoplite: U({ id: "hoplite", name: "Heavy Spearman", glyph: "O", cls: "melee", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 13, reqTech: "phalanx", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_cavalry"], routeResistance: 0.5 }),

  light_chariot: U({ id: "light_chariot", name: "Light Chariot", glyph: "y", cls: "cavalry", movement: 4, sight: 2, cost: 18, upkeep: 2, strength: 9, reqTech: "the_wheel", reqResource: { resource: "horses", count: 1 } }),
  war_chariot: U({ id: "war_chariot", name: "War Chariot", glyph: "Y", cls: "cavalry", movement: 4, sight: 2, cost: 24, upkeep: 2, strength: 13, reqTech: "chariotry", reqResource: { resource: "horses", count: 1 } }),
  rider: U({ id: "rider", name: "Rider", glyph: "R", cls: "cavalry", movement: 4, sight: 2, cost: 18, upkeep: 2, strength: 10, reqTech: "equestrian", reqResource: { resource: "horses", count: 1 } }),
  horse_archer: U({ id: "horse_archer", name: "Horse Archer", glyph: "Q", cls: "cavalry", movement: 4, sight: 2, cost: 22, upkeep: 2, strength: 7, rangedStrength: 9, range: 1, reqTech: "horse_archery", reqResource: { resource: "horses", count: 1 } }),

  swordsman: U({ id: "swordsman", name: "Swordsman", glyph: "Z", cls: "melee", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 15, reqTech: "iron_bloomery", reqResource: { resource: "iron", count: 1 } }),
  longswordsman: U({ id: "longswordsman", name: "Longswordsman", glyph: "G", cls: "melee", movement: 2, sight: 2, cost: 26, upkeep: 3, strength: 18, reqTech: "carburizing", reqResource: { resource: "iron", count: 1 } }),
  pikeman: U({ id: "pikeman", name: "Pikeman", glyph: "K", cls: "melee", movement: 2, sight: 2, cost: 20, upkeep: 2, strength: 14, reqTech: "iron_bloomery", reqResource: { resource: "iron", count: 1 }, abilities: ["bonus_vs_cavalry"], routeResistance: 0.4 }),
  cataphract: U({ id: "cataphract", name: "Cataphract", glyph: "T", cls: "cavalry", movement: 3, sight: 2, cost: 28, upkeep: 3, strength: 17, reqTech: "cavalry_doctrine", reqResource: { resource: "horses", count: 1 }, routeResistance: 0.5 }),
  crossbowman: U({ id: "crossbowman", name: "Crossbowman", glyph: "V", cls: "ranged", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 8, rangedStrength: 14, range: 2, reqTech: "crossbow" }),
  legionary: U({ id: "legionary", name: "Heavy Infantry", glyph: "E", cls: "melee", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 15, reqTech: "engineering", routeResistance: 0.6 }),
  war_elephant: U({ id: "war_elephant", name: "War Elephant", glyph: "N", cls: "cavalry", movement: 3, sight: 2, cost: 30, upkeep: 3, strength: 16, reqTech: "elephantry", reqResource: { resource: "elephants", count: 1 }, abilities: ["bonus_vs_city"], routeResistance: 0.4 }),

  battering_ram: U({ id: "battering_ram", name: "Battering Ram", glyph: "U", cls: "siege", movement: 2, sight: 2, cost: 16, upkeep: 2, strength: 6, rangedStrength: 10, range: 1, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  catapult: U({ id: "catapult", name: "Catapult", glyph: "I", cls: "siege", movement: 2, sight: 2, cost: 25, upkeep: 2, strength: 6, rangedStrength: 14, range: 2, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  ballista: U({ id: "ballista", name: "Ballista", glyph: "b", cls: "siege", movement: 2, sight: 2, cost: 30, upkeep: 3, strength: 7, rangedStrength: 16, range: 2, reqTech: "torsion_engines", abilities: ["bonus_vs_city"] }),

  // ---- early gunpowder -----------------------------------------------------
  // Devastating firepower offset by a reload: each fires only every other turn
  // (see the `gunpowder` flag + combat.ts reload logic). New units start loaded.
  hand_cannon: U({ id: "hand_cannon", name: "Hand Cannon", glyph: "n", cls: "ranged", movement: 2, sight: 2, cost: 30, upkeep: 2, strength: 9, rangedStrength: 26, range: 1, reqTech: "gunpowder", gunpowder: true }),
  matchlock: U({ id: "matchlock", name: "Matchlock Infantry", glyph: "k", cls: "ranged", movement: 2, sight: 2, cost: 38, upkeep: 3, strength: 12, rangedStrength: 32, range: 1, reqTech: "firearms", gunpowder: true }),
  bombard: U({ id: "bombard", name: "Bombard", glyph: "ß", cls: "siege", movement: 1, sight: 2, cost: 44, upkeep: 3, strength: 8, rangedStrength: 30, range: 2, reqTech: "gunpowder", gunpowder: true, abilities: ["bonus_vs_city"] }),

  // ---- naval melee ---------------------------------------------------------
  galley: U({ id: "galley", name: "Galley", glyph: "g", cls: "naval_melee", movement: 3, sight: 2, cost: 20, upkeep: 2, strength: 10, reqTech: "sailing" }),
  bireme: U({ id: "bireme", name: "Bireme", glyph: "B", cls: "naval_melee", movement: 3, sight: 2, cost: 28, upkeep: 2, strength: 14, reqTech: "shipbuilding" }),
  trireme: U({ id: "trireme", name: "Trireme", glyph: "T", cls: "naval_melee", movement: 3, sight: 2, cost: 32, upkeep: 3, strength: 16, reqTech: "shipbuilding" }),
  quinquereme: U({ id: "quinquereme", name: "Quinquereme", glyph: "Q", cls: "naval_melee", movement: 3, sight: 2, cost: 38, upkeep: 3, strength: 20, reqTech: "naval_architecture" }),
  longship: U({ id: "longship", name: "Longship", glyph: "L", cls: "naval_melee", movement: 4, sight: 2, cost: 26, upkeep: 2, strength: 12, reqTech: "sailcloth" }),
  caravel: U({ id: "caravel", name: "Caravel", glyph: "V", cls: "naval_melee", movement: 5, sight: 3, cost: 40, upkeep: 3, strength: 14, reqTech: "astronomy", oceanGoing: true }),

  // ---- naval ranged --------------------------------------------------------
  dromon: U({ id: "dromon", name: "Dromon", glyph: "D", cls: "naval_ranged", movement: 4, sight: 2, cost: 34, upkeep: 3, strength: 8, rangedStrength: 14, range: 2, reqTech: "engineering" }),
  war_junk: U({ id: "war_junk", name: "War Junk", glyph: "J", cls: "naval_ranged", movement: 4, sight: 2, cost: 34, upkeep: 3, strength: 10, rangedStrength: 16, range: 2, reqTech: "engineering" }),
  galleass: U({ id: "galleass", name: "Galleass", glyph: "G", cls: "naval_ranged", movement: 3, sight: 2, cost: 40, upkeep: 3, strength: 10, rangedStrength: 18, range: 2, reqTech: "naval_architecture" }),
  galleon: U({ id: "galleon", name: "Galleon", glyph: "O", cls: "naval_ranged", movement: 5, sight: 3, cost: 48, upkeep: 4, strength: 12, rangedStrength: 20, range: 2, reqTech: "cartography", oceanGoing: true }),
};

// Assign each unit's player-triggered active abilities (docs/UNIT-ABILITIES.md §4).
// Done as a post-pass so the UNIT_DEFS literals stay readable.
const UNIT_ACTIVE_ABILITIES: Partial<Record<UnitTypeId, ActiveAbilityId[]>> = {
  scout: ["reconnoiter"],
  hunter: ["reconnoiter"],
  slinger: ["skirmish"],
  javelineer: ["skirmish"],
  firehard_spear: ["brace"],
  war_dog: ["harry"],
  axeman: ["sunder"],
  maceman: ["sunder"],
  spearman: ["brace"],
  hoplite: ["shield_wall"],
  light_chariot: ["charge"],
  war_chariot: ["charge"],
  rider: ["charge"],
  horse_archer: ["fire_and_retreat"],
  longswordsman: ["sunder"],
  pikeman: ["brace"],
  cataphract: ["shock_charge"],
  crossbowman: ["pierce"],
  legionary: ["testudo"],
  war_elephant: ["trample"],
  catapult: ["emplace"],
  ballista: ["emplace"],
  bombard: ["emplace"],
  // naval
  galley: ["ram"],
  bireme: ["ram"],
  trireme: ["ram"],
  quinquereme: ["ram"],
  longship: ["ram"],
  caravel: ["boarding_party"],
  dromon: ["greek_fire"],
  war_junk: ["greek_fire"],
  galleass: ["coastal_bombardment"],
  galleon: ["coastal_bombardment"],
};
for (const [id, abilities] of Object.entries(UNIT_ACTIVE_ABILITIES)) {
  UNIT_DEFS[id as UnitTypeId].activeAbilities = abilities;
}

// Hide is available "across the board" to all foot infantry (land melee/ranged)
// and to scouts — they can conceal themselves in cover (see stealth.ts). Cavalry,
// siege and naval units cannot hide unless a unique unit grants it (UNIQUE_ABILITY_OVERRIDES).
for (const id of Object.keys(UNIT_DEFS) as UnitTypeId[]) {
  const d = UNIT_DEFS[id];
  if (d.cls === "melee" || d.cls === "ranged" || id === "scout") {
    d.activeAbilities = [...(d.activeAbilities ?? []), "hide"];
  }
}

/**
 * Civ unique units that REPLACE their base unit's active-ability list with a
 * bespoke/enhanced set (docs/UNIT-ABILITIES.md §8). Keyed by unique-unit id
 * (see UNIQUE_UNITS in @roc/data); resolved per unit by its owner civ in
 * abilities.ts. Uniques not listed here simply inherit their base unit's
 * abilities (the civ's flat combat bonus already differentiates them).
 */
export const UNIQUE_ABILITY_OVERRIDES: Record<string, ActiveAbilityId[]> = {
  sumer_war_cart: ["war_cart_charge", "hide"],
  parthia_parthian_horse_archer: ["parthian_shot"],
  scythians_scythian_horse_archer: ["parthian_shot", "hide"], // Herodotus' originals of the backward shot
  mongols_keshig: ["feigned_retreat", "nerge"], // lure them out, then close the ring at the kill ground
  greece_hoplite: ["othismos", "hide"],
  sparta_spartan_hoplite: ["last_stand", "hide"],
  celts_gauls_gaesatae: ["furor", "hide"],
  poland_lithuania_winged_hussar: ["hussar_charge"],
  han_china_cho_ko_nu: ["repeating_fire", "hide"],
  // Tang/Song fire lancers carried an early gunpowder lance — a ranged volley on
  // top of the pikeman's brace (see combat.ts fire_lance handling).
  china_tang_song_fire_lancer: ["fire_lance", "brace", "hide"],
  genoa_genoese_crossbowman: ["pierce", "pavise", "hide"],
  anglo_saxon_england_longbowman: ["arrow_storm", "hide"],
  assyria_siege_tower: ["siege_assault"],
  // ---- Mesopotamia & Near East ----
  akkad_sargonic_guard: ["king_of_battle", "hide"], // Sargon's salaried regulars fought as one army
  babylon_bowman: ["siege_volley", "hide"], // Nebuchadnezzar's archers arced fire over every wall
  hittites_hittite_chariot: ["kadesh_charge"], // the heavy three-crew chariot of Kadesh
  elam_susian_archer: ["zagros_shot", "hide"], // highland shafts, then back up the slope
  phoenicia_bireme: ["ram", "boarding_party"], // ram as the everyday blow; board when the grapples are ready
  lydia_heavy_cavalry: ["shock_charge", "plunder"], // the alpha strike vs the loot-finisher — pick by target
  // ---- Persia & Iran ----
  median_empire_median_lancer: ["shock_charge", "ride_down"], // break the strong, run down the faltering
  persia_immortal: ["endless_ranks", "shield_wall", "hide"], // the ranks refill; the spara wall holds
  sassanid_persia_savaran_cataphract: ["shock_charge", "iron_wall"], // charge, or stand as a mailed wall
  greco_bactria_bactrian_cataphract: ["hammer_and_anvil", "charge"], // Alexander's heirs kept his playbook
  sogdia_sogdian_cavalry: ["charge", "harry"], // kill raiders — or pin the ones that flee the caravan
  khwarazm_khwarazmian_lancer: ["shock_charge", "plunder"], // the rich shahs' raiding lancers
  // ---- Egypt & Africa ----
  kush_nubia_nubian_archer: ["aimed_shot", "skirmish", "hide"], // Herodotus' "eye-shooters" — famed marksmen
  carthage_war_elephant: ["trample", "terrorize"], // Hannibal's beasts broke lines by sheer dread
  aksum_aksumite_spearman: ["shield_wall", "hide"], // the sarawit regiments of the negus
  ethiopia_zagwe_oromo_cavalry: ["overrun", "charge"], // highland riders surging through a broken foe
  mali_mandekalu_cavalry: ["shock_charge", "plunder"], // the mansa's gold-armored nobles
  ghana_empire_soninke_warrior: ["sunder", "brace", "hide"], // Wagadu's iron-armed levy held the line
  songhai_songhai_cavalry: ["charge", "fresh_mounts"], // Sonni Ali's couriers rode relays of horses
  great_zimbabwe_zimbabwe_spearman: ["stone_bulwark", "hide"], // the living wall of the stone enclosures
  kanem_bornu_kanembu_guard: ["zareba", "hide"], // the mai's guard camped behind thorn fences
  fatimids_fatimid_ghulam: ["drilled_charge", "harry"], // drilled slave-cavalry, parade-ground precise
  ayyubids_ayyubid_faris: ["feigned_retreat", "harry"], // Hattin — lure, exhaust, destroy
  mamluks_mamluk: ["shock_charge", "fire_and_retreat"], // furusiyya masters of lance AND bow
  almoravids_lamtuna_spearman: ["war_drums", "last_stand", "hide"], // drums that terrified Iberia; the Lamtuna never fled
  swahili_swahili_dhow: ["ram", "boarding_party", "monsoon_run"], // corsair dhows riding the trade winds
  benin_ogboni_guard: ["sunder", "hide"], // the Oba's enforcers with crushing ada swords
  kongo_kongo_archer: ["poisoned_arrows", "skirmish", "hide"], // forest bowmen with envenomed shafts
  // ---- Mediterranean & Europe ----
  rome_legionary: ["pilum", "testudo", "hide"], // pila thrown, then the gladius — and the tortoise under fire
  minoans_minoan_bireme: ["ram", "harry"], // the first navy corralled pirates and pinned blockade-runners
  macedon_hypaspist: ["hammer_and_anvil", "hide"], // Alexander's shield-bearers struck where the anvil held
  byzantium_cataphract: ["wedge_charge"], // the kataphraktoi wedge of the Praecepta Militaria
  norse_longship: ["ram", "strandhogg"], // the lightning ship-borne raid that named an age
  franks_frankish_paladin: ["heroic_challenge", "shock_charge"], // the champions of the chansons de geste
  goths_gothic_rider: ["shock_charge", "overrun"], // Adrianople — the charge that rode Rome down
  france_garde_ecossaise: ["shock_charge", "last_stand"], // the king's guard died to a man at Verneuil
  castile_spain_conquistador: ["shock_charge", "terrorize"], // horses unknown in the New World spread panic
  portugal_nau: ["broadside", "boarding_party"], // standoff gunnery perfected at Diu
  venice_venetian_galleass: ["broadside", "coastal_bombardment"], // the gun-galleasses that opened Lepanto
  dutch_republic_sea_beggar: ["boarding_party", "hellburner"], // the hellburners of Antwerp, 1585
  holy_roman_empire_landsknecht: ["zweihander", "brace", "hide"], // Doppelsöldner hacked lanes through pike hedges
  kievan_rus_druzhina: ["shock_charge", "shield_wall"], // Varangian-rooted retainers charged mounted or dismounted to the wall
  hungary_black_army: ["mounted_volley", "shock_charge"], // Corvinus' professionals mixed crossbow and lance
  // ---- European expansion ----
  bulgaria_bulgar_horse_archer: ["mountain_ambush", "fire_and_retreat"], // Krum destroyed an emperor in the Balkan passes
  serbia_pronoia_knight: ["wedge_charge"], // pronoia is a Byzantine grant — they fought in the Byzantine style
  bohemia_hussite_war_wagon: ["wagenburg", "pierce", "hide"], // Žižka's rolling fortress
  swiss_swiss_halberdier: ["halberd_hook", "brace", "hide"], // the hook that dragged Charles the Bold's knights down
  aragon_almogaver: ["desperta_ferro", "skirmish", "hide"], // the war-cry of the Catalan Company
  scotland_highland_schiltron: ["schiltron", "hide"], // Bannockburn's hedgehog of spears
  gaelic_ireland_gallowglass: ["sparth_cleave", "hide"], // the sweeping sparth axe of the chief's retainers
  normans_norman_knight: ["couched_lance"], // the running couched charge born at Hastings
  visigoths_visigothic_noble: ["shock_charge", "plunder"], // the men who sacked Rome in 410
  novgorod_ushkuinik: ["ram", "strandhogg"], // Varangian-founded river pirates kept the strandhögg alive
  illyrians_liburnian: ["ram", "swift_oars"], // the fast pirate galley Rome copied
  arevaci_celtiberian_warrior: ["last_stand", "hide"], // Numantia chose death over surrender
  thracians_thracian_peltast: ["skirmish", "harry", "hide"], // shoot, fall back, and never let the hoplite rest
  dacians_falxman: ["falx_reap", "hide"], // the blade that forced Rome to reinforce its helmets
  sami_ski_raider: ["winter_war", "reconnoiter", "hide"], // masters of the white silence
  corinth_corinthian_trireme: ["shear_oars", "ram"], // the city that invented the trireme knew how to cripple one
  // ---- Central, South & East Asia ----
  maurya_war_elephant: ["terrorize", "trample"], // the corps that made Alexander's army mutiny at the Hyphasis
  gupta_india_gupta_elephant_archer: ["howdah_volley", "trample"], // archers shooting over the melee from the beast's back
  khmer_domrey: ["double_ballista", "trample"], // the twin crossbows carved on the Bayon reliefs
  pagan_burma_burmese_war_elephant: ["war_drums", "trample"], // the king's gong-and-drum corps rode to war with the beasts
  ayutthaya_siam_siamese_war_elephant: ["duel_of_kings", "trample"], // Naresuan's royal duel on elephant-back
  delhi_sultanate_delhi_war_elephant: ["elephant_wall", "trample"], // the living rampart that met the Mongols
  vijayanagara_vijayanagara_war_elephant: ["gate_breaker", "trample"], // the beasts that broke Raichur's defenses
  sinhala_sinhala_war_elephant: ["gate_breaker", "trample"], // Kandula, who breached the gate of Vijitanagara
  dai_viet_vietnam_voi_chien: ["trample", "hide"], // Le Loi's jungle ambushes — elephants rising out of the green
  china_ming_war_junk: ["broadside", "boarding_party"], // cannon junks of the treasure fleet
  korea_turtle_ship: ["turtle_shell", "greek_fire"], // the spiked iron roof and the smoke-breathing dragon head
  chola_chola_warship: ["ram", "boarding_party", "monsoon_run"], // the fleet that rode the monsoon to Srivijaya
  srivijaya_jong: ["boarding_party", "swift_oars"], // the strait-lords' fast boarders
  majapahit_majapahit_jong: ["broadside", "ram"], // cetbang swivel-guns — Southeast Asia's first gunpowder navy
  champa_cham_raider: ["swift_oars", "strandhogg"], // the river raid that sacked Angkor in 1177
  tibet_tibetan_cavalry: ["highland_charge", "charge"], // lamellar riders striking downhill from the plateau
  khitan_ordo_cavalry: ["shock_charge", "fresh_mounts"], // every Khitan rider marched with three remounts
  jurchen_iron_pagoda: ["wedge_charge", "iron_wall"], // the guaisimazi — armored files that charged or stood like towers
  mughals_mughal_sowar: ["qamargah", "shock_charge"], // Akbar's hunt-circle, closed on a weakened foe
  zhou_china_zhou_chariot: ["kadesh_charge"], // the Chinese chariot trio: driver, archer, dagger-axe
  // Unique cavalry/skirmishers that gain Hide (some can hide in the open, see stealth.ts).
  numidia_numidian_cavalry: ["fire_and_retreat", "hide"],
  lusitani_falcata_warrior: ["sunder", "hide"],
  maya_holkan: ["hornet_bomb", "skirmish", "hide"], // wasp-nest bombs of the Popol Vuh, then the javelins
  // Spread to more iconic uniques (reusing existing ability mechanics, class-fit).
  japan_samurai: ["sunder", "last_stand", "hide"], // Bushido — fights on while wounded
  ottomans_janissary: ["steady_volley", "pavise", "hide"], // the corps' fire discipline behind prepared cover
  crete_cretan_archer: ["arrow_storm", "hide"], // famed mercenary archers
  thebes_sacred_band: ["othismos", "hide"], // Theban phalanx
  mycenaean_greece_mycenaean_spearman: ["othismos", "hide"],
  huns_hunnic_horde: ["feigned_retreat"], // the false rout Roman observers described again and again
  xiongnu_xiongnu_horse_archer: ["whistling_arrows", "hide"], // Modu's shrieking arrowheads — terror and signal in one
  golden_horde_tatar_horse_archer: ["feigned_retreat", "harry"], // lure the pursuit, pin the tribute-dodgers
  // ---- Steppe & Near East (expansion & revisit) ----
  gokturks_turkic_lancer: ["wolf_pack", "charge"], // the böri — the qaghan's wolf-banner guard hunted as a pack
  seljuks_ghulam: ["feigned_retreat", "hide"], // Manzikert — the false flight into the hidden wings
  timurids_timurid_siege_train: ["naphtha_shot", "emplace"], // Timur's naphtha teams burned what walls withstood
  arabia_camel_archer: ["camel_panic", "fire_and_retreat"], // camels routed horse from Thymbra to the crusades
  israelites_gibborim: ["heroic_challenge", "hide"], // David's mighty men — champions of single combat
  nabataeans_desert_raider: ["charge", "hide"], // raiders who vanished to hidden desert cisterns
  saba_sabaean_spearman: ["brace", "harry", "hide"], // caravan guards who held the incense road and pinned its raiders
  mitanni_maryannu_chariot: ["charge", "fresh_mounts"], // Kikkuli's interval-trained teams never blew their wind
  urartu_urartian_charioteer: ["kadesh_charge"], // heavy Anatolian-style chariots of the Assyrian frontier
  khazars_khazar_lancer: ["shock_charge", "plunder"], // the toll-lords of the Volga took their cut by force too
  avars_avar_lancer: ["couched_lance"], // the stirrup came to Europe on Avar saddles
  // ---- Americas & Oceania ----
  inca_warak_aq: ["bolas", "skirmish", "hide"], // entangle the quarry, or shoot and slip away
  olmec_olmec_spearman: ["terrorize", "hide"], // jaguar-masked shock troops of the mother culture
  zapotec_zapotec_warrior: ["highland_charge", "hide"], // striking down from Monte Albán's terraces
  teotihuacan_pyramid_guard: ["atlatl_volley", "brace", "hide"], // darts first, then the obsidian spears
  toltec_toltec_warrior: ["obsidian_reap", "hide"], // volcanic glass sharper than steel
  muisca_guecha_warrior: ["plunder", "hide"], // the warriors of El Dorado fought for gold and trophies
  haudenosaunee_mohawk_warrior: ["mourning_war", "hide"], // raids to replace the fallen — the League's way of war
  tarascans_copper_macehead: ["shield_wall", "sunder", "hide"], // the fortified frontier that stopped the Aztecs cold
  chimu_chimu_slinger: ["stone_hail", "hide"], // Andean sling-stones cracked shields at a hundred paces
  moche_moche_warrior: ["heroic_challenge", "hide"], // the ritual duel painted on every Moche pot
  tiwanaku_tiwanaku_spearman: ["stone_bulwark", "hide"], // the monolith-builders stood like their stones
  pueblo_pueblo_skirmisher: ["mountain_ambush", "skirmish", "hide"], // fire from the mesa rim
  polynesia_koa_warrior: ["war_drums", "hide"], // the pahu drums sounded before the spears
  hawaii_hawaiian_koa: ["leiomano", "hide"], // the shark-tooth club leaves wounds that keep bleeding
  tonga_tongan_toa: ["beach_assault", "hide"], // the canoe-borne empire struck from the surf
  aztec_eagle_warrior: ["flower_war", "furor", "hide"], // captives for the altar — or the wild charge
  maori_toa: ["haka", "furor", "hide"], // the challenge first, then the fury
};

/**
 * Legends (heroes) that REPLACE their base unit's active-ability list with a
 * signature kit (docs/UNIT-ABILITIES.md §9). Keyed by legend id (see LEGENDS in
 * @roc/data); resolved per unit by its `legendId` in abilities.ts. Legends not
 * listed inherit their base unit's abilities (their signature power is a passive
 * — see legends.ts). Each kit is chosen for the hero's actual historical way of
 * war; the wiki's Legends pages carry the full historical context.
 */
export const LEGEND_ABILITY_OVERRIDES: Record<string, ActiveAbilityId[]> = {
  gilgamesh: ["slay_the_beast", "sunder", "hide"], // the beast-slayer of the Epic, with the axeman's crushing blow
  hannibal: ["trample", "hide"], // Trebia and Trasimene — the only elephant army that hides in ambush
  leonidas: ["last_stand", "hide"], // Thermopylae itself
  alexander: ["hammer_and_anvil", "shock_charge"], // the Companion charge where the phalanx holds
  ashoka: [], // after Kalinga the emperor renounced the charge — he rides unarmed
  boudica: ["uprising", "charge"], // the tribes rise where her chariot passes
  julius_caesar_legend: ["pilum", "plunder", "hide"], // the legion's volley, and Gaul's gold
  attila: ["terrorize", "fire_and_retreat"], // the Scourge of God on a steppe pony
  charlemagne: ["heroic_challenge", "sunder", "hide"], // the emperor of the chansons de geste
  saladin: ["feigned_retreat", "harry"], // Hattin — lure, exhaust, deny water, destroy
  genghis_khan: ["nerge", "fire_and_retreat"], // the great hunt's ring, closed on men
  subutai: ["parthian_shot", "feigned_retreat"], // Kalka's nine-day false flight
  joan_of_arc_legend: ["sacred_banner", "sunder", "hide"], // the banner she bore instead of a sword
  tomoe_gozen: ["heroic_challenge", "fire_and_retreat"], // single combat and mounted archery
  tamerlane: ["pyramid_of_skulls", "shock_charge"], // the towers of skulls at Isfahan and Delhi
  mehmed_ii: ["basilica_bombard", "emplace"], // Orban's bombard before the Theodosian walls
  harald_hardrada: ["ram", "strandhogg"], // the last great Viking, raiding as he ever did
  zheng_he_legend: ["ram", "monsoon_run"], // the treasure fleet rode the monsoon
  yi_sun_sin_legend: ["broadside", "turtle_shell"], // standoff cannon, spiked iron roof
};

/**
 * The active abilities a legend fields, for static display (wiki, legends panel).
 * Honors the legend kit override; falls back to the base unit's abilities.
 */
export function legendActiveAbilityIds(legendId: string, baseType: UnitTypeId): ActiveAbilityId[] {
  return LEGEND_ABILITY_OVERRIDES[legendId] ?? UNIT_DEFS[baseType].activeAbilities ?? [];
}

/**
 * The active abilities a unit type fields, for static display (wiki, lobby) where
 * no game state exists. Honors a unique unit's override (UNIQUE_ABILITY_OVERRIDES);
 * pass `uniqueUnitId` to resolve a civ's unique variant, otherwise the base unit's
 * abilities are returned. Mirrors `effectiveAbilities` (civs.ts) without a Unit.
 */
export function unitActiveAbilityIds(type: UnitTypeId, uniqueUnitId?: string): ActiveAbilityId[] {
  if (uniqueUnitId) {
    const override = UNIQUE_ABILITY_OVERRIDES[uniqueUnitId];
    if (override) return override;
  }
  return UNIT_DEFS[type].activeAbilities ?? [];
}

export const MILITARY_CLASSES: ReadonlySet<UnitClass> = new Set(["melee", "ranged", "cavalry", "siege", "naval_melee", "naval_ranged"]);

export function isMilitary(type: UnitTypeId): boolean {
  return MILITARY_CLASSES.has(UNIT_DEFS[type].cls);
}

export function isRanged(def: UnitDef): boolean {
  return (def.range ?? 0) >= 1 && (def.rangedStrength ?? 0) > 0;
}

export function isNaval(def: UnitDef): boolean {
  return def.cls === "naval_melee" || def.cls === "naval_ranged";
}

/**
 * Structured, stackable building effects (Buildings Expansion). Kept as a separate
 * block rather than widening the legacy `effect` union so combat/economy/training can
 * read each mechanic directly. Sum-type fields (defense, HP, XP, morale, bombard,
 * carryover) accumulate across a city's buildings; the aura fields take the strongest.
 * See `sumBuildingEffects`.
 */
export interface BuildingEffects {
  /** Percent change to training time in this city (−15 = trains 15% faster). */
  trainTimePercent?: number;
  /** Extra starting XP for units trained in this city (Armoury). */
  trainedUnitXp?: number;
  /** Extra starting morale for units trained in this city (Arsenal). */
  trainedUnitMorale?: number;
  /** Flat city-defense bonus (Castle). */
  cityDefense?: number;
  /** Flat city max-HP bonus (Castle). */
  cityMaxHp?: number;
  /** Percent bonus to the city's bombard damage (Ballista Towers). */
  bombardPercent?: number;
  /** Extra city bombards allowed per turn (Bombard Tower). */
  extraBombards?: number;
  /** Fraction (0–1) of the next citizen pre-filled on growth (Storehouse). */
  growthCarryover?: number;
  /** Heal friendly units within `radius` tiles by `amount` HP/turn (Infirmary). */
  healAura?: { radius: number; amount: number };
  /** Grant nearby friendly units morale when an enemy dies near the city (Triumphal Arch). */
  victoryMorale?: { radius: number; amount: number };
  /** Grant friendly cities within `radius` flat city-defense (Beacon Tower). */
  cityDefenseAura?: { radius: number; amount: number };
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  reqTech?: TechId;
  /** Strategic resource required to build this building. */
  reqResource?: { resource: string; count: number };
  yields: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  effect?: "walls" | "barracks" | "harbor" | "lighthouse";
  /** Another building that must already exist in the city to construct this one
   *  (the fortification chain: Castle needs Walls; Bombard Tower needs Castle). */
  reqBuilding?: BuildingId;
  /** Structured mechanical effects (Buildings Expansion). */
  effects?: BuildingEffects;
  /** Building can only be constructed in a city adjacent to a water tile (harbors, lighthouses). */
  requiresCoastal?: boolean;
}

const B = (d: BuildingDef): BuildingDef => d;

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  granary: B({ id: "granary", name: "Granary", cost: 20, reqTech: "pottery_kiln", yields: { food: 3 } }),
  workshop: B({ id: "workshop", name: "Workshop", cost: 18, reqTech: "native_copper", yields: { production: 1 } }),
  forge: B({ id: "forge", name: "Forge", cost: 26, reqTech: "smelting", yields: { production: 2 } }),
  walls: B({ id: "walls", name: "Walls", cost: 24, reqTech: "masonry", yields: {}, effect: "walls" }),
  market: B({ id: "market", name: "Market", cost: 24, reqTech: "coinage", yields: { gold: 3 } }),
  bank: B({ id: "bank", name: "Bank", cost: 34, reqTech: "mathematics", yields: { gold: 5 } }),
  library: B({ id: "library", name: "Archive", cost: 26, reqTech: "writing", yields: { science: 2 } }),
  academy: B({ id: "academy", name: "Academy", cost: 34, reqTech: "philosophy", yields: { science: 3 } }),
  aqueduct: B({ id: "aqueduct", name: "Aqueduct", cost: 30, reqTech: "engineering", yields: { food: 2 } }),
  harbor: B({ id: "harbor", name: "Harbor", cost: 24, reqTech: "sailcloth", yields: { gold: 2 }, effect: "harbor", requiresCoastal: true }),
  lighthouse: B({ id: "lighthouse", name: "Lighthouse", cost: 30, reqTech: "optics", yields: { gold: 1, science: 1 }, effect: "lighthouse", requiresCoastal: true }),
  monument: B({ id: "monument", name: "Monument", cost: 22, reqTech: "monumental_architecture", yields: { culture: 2 } }),
  amphitheater: B({ id: "amphitheater", name: "Amphitheater", cost: 26, reqTech: "writing", yields: { culture: 3 } }),
  museum: B({ id: "museum", name: "Museum", cost: 34, reqTech: "philosophy", yields: { culture: 4 } }),
  shrine: B({ id: "shrine", name: "Shrine", cost: 18, reqTech: "ritual_burial", yields: { faith: 2 } }),
  temple: B({ id: "temple", name: "Temple", cost: 28, reqTech: "writing", yields: { faith: 2, culture: 1 } }),

  // ---- Buildings Expansion --------------------------------------------------
  // Military production — support the training system (train.ts folds these in).
  drill_yard: B({ id: "drill_yard", name: "Drill Yard", cost: 28, reqTech: "phalanx", yields: {}, effects: { trainTimePercent: -15 } }),
  armoury: B({ id: "armoury", name: "Armoury", cost: 30, reqTech: "iron_bloomery", yields: {}, effects: { trainedUnitXp: 10 } }),
  arsenal: B({ id: "arsenal", name: "Arsenal", cost: 44, reqTech: "gunpowder", yields: {}, effects: { trainTimePercent: -15, trainedUnitMorale: 10 } }),
  // City defense — the walls chain (combat.ts folds these in).
  castle: B({ id: "castle", name: "Castle", cost: 42, reqTech: "engineering", reqBuilding: "walls", yields: {}, effects: { cityDefense: 8, cityMaxHp: 60 } }),
  ballista_towers: B({ id: "ballista_towers", name: "Ballista Towers", cost: 34, reqTech: "torsion_engines", reqBuilding: "walls", yields: {}, effects: { bombardPercent: 50 } }),
  bombard_tower: B({ id: "bombard_tower", name: "Bombard Tower", cost: 46, reqTech: "firearms", reqBuilding: "castle", yields: {}, effects: { extraBombards: 1 } }),
  // Growth & support.
  storehouse: B({ id: "storehouse", name: "Storehouse", cost: 22, reqTech: "irrigation", yields: {}, effects: { growthCarryover: 0.3 } }),
  infirmary: B({ id: "infirmary", name: "Infirmary", cost: 30, reqTech: "theology", yields: {}, effects: { healAura: { radius: 2, amount: 5 } } }),
  triumphal_arch: B({ id: "triumphal_arch", name: "Triumphal Arch", cost: 36, reqTech: "monumental_architecture", yields: { culture: 1 }, effects: { victoryMorale: { radius: 3, amount: 5 } } }),
  beacon_tower: B({ id: "beacon_tower", name: "Beacon Tower", cost: 26, reqTech: "optics", yields: {}, effects: { cityDefenseAura: { radius: 6, amount: 2 } } }),
};

// ---- Training buildings (unit-class production families) ------------------
// A city trains units of a given class only if it owns the matching training
// building, and each unit costs a citizen (population). Tiers (1–5), raised via
// construction and gated by tech, improve training speed, starting morale/XP, and
// the number of units trainable at once. See training.ts for the runtime logic.

export interface TrainingTierDef {
  /** Tier number (1–5). */
  tier: number;
  /** Construction cost to raise the building TO this tier (from the previous one). */
  cost: number;
  /** Tech required to build/upgrade to this tier (tier 1 may be ungated). */
  reqTech?: TechId;
  /** Units of this family trainable simultaneously at this tier. */
  slots: number;
  /** Bonus added to a trained unit's starting morale. */
  moraleBonus: number;
  /** A trained unit's starting XP. */
  xp: number;
  /** Train-time multiplier (lower = faster); 1.0 at tier 1 down to ~0.4 at tier 5. */
  speedPct: number;
  /** Flat per-turn yields the building grants its city (e.g. Stable +production). */
  yields?: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  /** City-defense contribution (Barracks), folded into combat.cityDefenseStrength. */
  defense?: number;
}

export interface TrainingBuildingDef {
  id: TrainingClass;
  name: string;
  glyph: string;
  /** Unit classes trained at this building. */
  classes: UnitClass[];
  /** Exactly 5 tier definitions, tier 1 first. */
  tiers: TrainingTierDef[];
}

/** Standard 5-step tier curve for slots / morale / xp / speed, shared by all families. */
const TIER_CURVE: Omit<TrainingTierDef, "tier" | "cost" | "reqTech">[] = [
  { slots: 1, moraleBonus: 0, xp: 0, speedPct: 1.0 },
  { slots: 1, moraleBonus: 10, xp: 10, speedPct: 0.85 },
  { slots: 2, moraleBonus: 20, xp: 20, speedPct: 0.7 },
  { slots: 2, moraleBonus: 30, xp: 30, speedPct: 0.55 },
  { slots: 3, moraleBonus: 40, xp: 40, speedPct: 0.4 },
];

const TIER_COSTS = [22, 30, 40, 52, 66];

/** Build a family's 5 tiers from the shared curve + per-family tech gates and extras. */
function makeTiers(
  gates: (TechId | undefined)[],
  extra?: (i: number) => Partial<TrainingTierDef>,
): TrainingTierDef[] {
  return TIER_CURVE.map((c, i) => ({
    tier: i + 1,
    cost: TIER_COSTS[i]!,
    reqTech: gates[i],
    ...c,
    ...(extra ? extra(i) : {}),
  }));
}

export const TRAINING_BUILDING_DEFS: Record<TrainingClass, TrainingBuildingDef> = {
  barracks: {
    id: "barracks", name: "Barracks", glyph: "🛡️", classes: ["melee"],
    // Melee discipline scales with metallurgy; also fortifies the city.
    tiers: makeTiers(
      [undefined, "bronze_alloying", "iron_bloomery", "carburizing", "gunpowder"],
      (i) => ({ defense: 2 + i }),
    ),
  },
  archery_range: {
    id: "archery_range", name: "Archery Range", glyph: "🏹", classes: ["ranged"],
    tiers: makeTiers([undefined, "composite_bow", "crossbow", "carburizing", "firearms"]),
  },
  stable: {
    id: "stable", name: "Stable", glyph: "🐎", classes: ["cavalry"],
    // Stables also lend the city a little production (as the old Stable building did).
    tiers: makeTiers(
      ["the_wheel", "equestrian", "cavalry_doctrine", "carburizing", "gunpowder"],
      () => ({ yields: { production: 1 } }),
    ),
  },
  siege_workshop: {
    id: "siege_workshop", name: "Siege Workshop", glyph: "⚙️", classes: ["siege"],
    tiers: makeTiers(["siegecraft", "mathematics", "torsion_engines", "engineering", "gunpowder"]),
  },
  shipyard: {
    id: "shipyard", name: "Shipyard", glyph: "⚓", classes: ["naval_melee", "naval_ranged"],
    tiers: makeTiers(["sailing", "shipbuilding", "naval_architecture", "optics", "cartography"]),
  },
};

export const TRAINING_CLASSES = Object.keys(TRAINING_BUILDING_DEFS) as TrainingClass[];

/** Which training family (if any) a unit type is trained at. Civilians (settler/
 *  trader) and recon (scout) return null — they are trained from the city center. */
export function trainingClassFor(type: UnitTypeId): TrainingClass | null {
  const cls = UNIT_DEFS[type].cls;
  for (const fam of TRAINING_CLASSES) {
    if (TRAINING_BUILDING_DEFS[fam].classes.includes(cls)) return fam;
  }
  return null;
}

/** Resolve a single tier def for a family (tier clamped to 1–5). */
export function trainingTier(family: TrainingClass, tier: number): TrainingTierDef {
  const tiers = TRAINING_BUILDING_DEFS[family].tiers;
  return tiers[Math.max(1, Math.min(tiers.length, tier)) - 1]!;
}

/** Base training time (turns) for a unit before any building-tier speed-up, derived
 *  from its legacy production cost. */
export function baseTrainTime(type: UnitTypeId): number {
  return Math.max(2, Math.round(UNIT_DEFS[type].cost / 6));
}

/** Training time (turns) for a unit given a building-tier speed multiplier. Civilians
 *  trained from the city center pass speedPct = 1. Always at least 1 turn. */
export function trainTimeFor(type: UnitTypeId, speedPct = 1): number {
  return Math.max(1, Math.round(baseTrainTime(type) * speedPct));
}

export interface TechDef {
  id: TechId;
  name: string;
  cost: number;
  prereqs: TechId[];
}

const T = (id: TechId, name: string, cost: number, prereqs: TechId[]): TechDef => ({ id, name, cost, prereqs });

export const TECH_DEFS: Record<TechId, TechDef> = {
  // Dawn — free roots + first developments
  knapping: T("knapping", "Stone Knapping", 0, []),
  foraging: T("foraging", "Foraging", 0, []),
  fire_hardening: T("fire_hardening", "Fire-Hardening", 15, ["knapping"]),
  hide_working: T("hide_working", "Hide-Working", 18, ["knapping"]),
  animal_taming: T("animal_taming", "Animal Taming", 20, ["foraging"]),
  cultivation: T("cultivation", "Plant Cultivation", 18, ["foraging"]),
  ritual_burial: T("ritual_burial", "Ritual & Burial", 16, ["foraging"]),
  parley: T("parley", "Parley", 16, ["foraging"]),
  pottery_kiln: T("pottery_kiln", "Pottery & Kilns", 24, ["cultivation"]),

  // Copper / Bronze
  native_copper: T("native_copper", "Native Copper", 28, ["pottery_kiln"]),
  smelting: T("smelting", "Smelting", 34, ["native_copper"]),
  bronze_alloying: T("bronze_alloying", "Bronze Alloying", 42, ["smelting"]),
  the_wheel: T("the_wheel", "The Wheel", 30, ["animal_taming"]),
  equestrian: T("equestrian", "Equestrianism", 34, ["animal_taming"]),
  masonry: T("masonry", "Masonry", 35, ["pottery_kiln"]),
  weaving: T("weaving", "Weaving", 26, ["hide_working"]),
  composite_bow: T("composite_bow", "Composite Bow", 38, ["hide_working", "bronze_alloying"]),
  writing: T("writing", "Writing", 36, ["pottery_kiln"]),
  irrigation: T("irrigation", "Irrigation", 30, ["cultivation"]),
  maritime_foraging: T("maritime_foraging", "Maritime Foraging", 30, ["pottery_kiln"]),
  sailcloth: T("sailcloth", "Sailcloth", 32, ["weaving"]),
  chariotry: T("chariotry", "Chariotry", 46, ["the_wheel", "bronze_alloying"]),
  phalanx: T("phalanx", "Phalanx Doctrine", 46, ["bronze_alloying"]),

  // Naval / Maritime
  sailing: T("sailing", "Sailing", 30, ["sailcloth", "weaving"]),
  shipbuilding: T("shipbuilding", "Shipbuilding", 46, ["sailing", "bronze_alloying"]),
  naval_architecture: T("naval_architecture", "Naval Architecture", 70, ["shipbuilding", "mathematics"]),
  optics: T("optics", "Optics", 55, ["mathematics", "shipbuilding"]),
  astronomy: T("astronomy", "Astronomy", 80, ["optics", "philosophy"]),
  cartography: T("cartography", "Cartography", 90, ["astronomy", "naval_architecture"]),

  // Iron / Classical
  iron_bloomery: T("iron_bloomery", "Iron Bloomery", 55, ["smelting"]),
  carburizing: T("carburizing", "Carburizing (Steel)", 72, ["iron_bloomery"]),
  siegecraft: T("siegecraft", "Siegecraft", 58, ["masonry", "the_wheel"]),
  bridge_building: T("bridge_building", "Bridge Building", 44, ["masonry", "the_wheel"]),
  mathematics: T("mathematics", "Mathematics", 60, ["writing"]),
  torsion_engines: T("torsion_engines", "Torsion Engines", 82, ["siegecraft", "mathematics"]),
  engineering: T("engineering", "Engineering", 66, ["mathematics", "masonry"]),
  coinage: T("coinage", "Coinage", 50, ["writing"]),
  philosophy: T("philosophy", "Philosophy", 56, ["writing"]),
  cavalry_doctrine: T("cavalry_doctrine", "Cavalry Doctrine", 62, ["equestrian", "bronze_alloying"]),
  horse_archery: T("horse_archery", "Horse Archery", 58, ["equestrian", "composite_bow"]),
  crossbow: T("crossbow", "Crossbow", 65, ["carburizing"]),
  monumental_architecture: T("monumental_architecture", "Monumental Architecture", 70, ["masonry", "writing"]),
  elephantry: T("elephantry", "Elephantry", 64, ["animal_taming", "bronze_alloying"]),

  // Intellectual / cultural / religious institutions. Each lets a city pour its
  // labour into a corresponding empire output (see PROJECT_DEFS).
  scholasticism: T("scholasticism", "Scholasticism", 68, ["philosophy"]),
  aesthetics: T("aesthetics", "Aesthetics", 64, ["philosophy"]),
  theology: T("theology", "Theology", 66, ["philosophy", "ritual_burial"]),

  // Early gunpowder — the close of the era (caps at hand cannons, matchlocks, bombards).
  gunpowder: T("gunpowder", "Gunpowder", 95, ["carburizing", "engineering"]),
  firearms: T("firearms", "Firearms", 110, ["gunpowder"]),
};

export const ALL_TECHS: TechId[] = Object.keys(TECH_DEFS) as TechId[];

// ---- Conversion projects --------------------------------------------------
// A city with nothing it wants to build can instead set its labourers to a
// standing "project" that converts the city's production each turn into an
// empire resource. Coinage (gold) is always available — historically the act of
// minting surplus into coin; the others are unlocked by an institutional tech.

export type ProjectId = "coinage" | "scholarship" | "patronage" | "tithe";

/** Which empire pool a project's converted production flows into. */
export type ProjectOutput = "gold" | "science" | "culture" | "faith";

export interface ProjectDef {
  id: ProjectId;
  name: string;
  glyph: string;
  output: ProjectOutput;
  /** Units of output produced per 1 production invested. */
  ratio: number;
  /** Tech that unlocks the project (Coinage is ungated). */
  reqTech?: TechId;
  desc: string;
}

const P = (d: ProjectDef): ProjectDef => d;

export const PROJECT_DEFS: Record<ProjectId, ProjectDef> = {
  coinage: P({
    id: "coinage",
    name: "Coinage",
    glyph: "🪙",
    output: "gold",
    ratio: 1,
    desc: "Set the city's artisans to minting: its production is converted into gold for the treasury each turn.",
  }),
  scholarship: P({
    id: "scholarship",
    name: "Scholarship",
    glyph: "🔬",
    output: "science",
    ratio: 0.5,
    reqTech: "scholasticism",
    desc: "Direct the city's labour toward learning: half its production is converted into science each turn.",
  }),
  patronage: P({
    id: "patronage",
    name: "Patronage",
    glyph: "🎭",
    output: "culture",
    ratio: 0.5,
    reqTech: "aesthetics",
    desc: "Patronise the arts: half the city's production is converted into culture each turn.",
  }),
  tithe: P({
    id: "tithe",
    name: "Tithe",
    glyph: "☮️",
    output: "faith",
    ratio: 0.5,
    reqTech: "theology",
    desc: "Tithe the city's labour to the faithful: half its production is converted into faith each turn.",
  }),
};

export const ALL_PROJECTS: ProjectId[] = Object.keys(PROJECT_DEFS) as ProjectId[];

export function getProjectDef(id: string): ProjectDef | undefined {
  return PROJECT_DEFS[id as ProjectId];
}

/** Techs every civ begins the game already knowing. */
export const STARTING_TECHS: TechId[] = ["knapping", "foraging"];

/** Systems gated behind a specific technology (not available from the start). */
export const CIVICS_REQUIRED_TECH: TechId = "writing";
export const RELIGION_REQUIRED_TECH: TechId = "ritual_burial";
/** Unlocks bribing and recruiting barbarian war-bands (see bribery.ts). */
export const BARBARIAN_DIPLOMACY_TECH: TechId = "parley";

export function techUnlocked(researched: ReadonlySet<TechId>, tech: TechId): boolean {
  return TECH_DEFS[tech].prereqs.every((p) => researched.has(p));
}

/** Tier = longest path from a root tech. Used to order prerequisites. */
function techTier(id: TechId, memo = new Map<TechId, number>()): number {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const prereqs = TECH_DEFS[id].prereqs;
  const tier = prereqs.length === 0 ? 0 : Math.max(...prereqs.map((p) => techTier(p, memo))) + 1;
  memo.set(id, tier);
  return tier;
}

/** All techs required to reach `target`, not already researched, in a valid research order. */
export function computeResearchPath(researched: ReadonlySet<TechId>, target: TechId): TechId[] {
  if (researched.has(target)) return [];
  const missing = new Set<TechId>();
  const collect = (id: TechId): void => {
    if (researched.has(id) || missing.has(id)) return;
    missing.add(id);
    for (const p of TECH_DEFS[id].prereqs) collect(p);
  };
  collect(target);
  const memo = new Map<TechId, number>();
  return [...missing].sort((a, b) => {
    const ta = techTier(a, memo);
    const tb = techTier(b, memo);
    if (ta !== tb) return ta - tb;
    return TECH_DEFS[a].name.localeCompare(TECH_DEFS[b].name);
  });
}

/** After finishing a tech, pick the next queued tech whose prerequisites are met. */
export function advanceResearchQueue(player: {
  researched: Set<TechId>;
  researching: TechId | null;
  researchQueue: TechId[];
}): void {
  while (player.researchQueue.length > 0) {
    const next = player.researchQueue[0]!;
    if (player.researched.has(next)) {
      player.researchQueue.shift();
      continue;
    }
    if (techUnlocked(player.researched, next)) {
      player.researching = next;
      player.researchQueue.shift();
      return;
    }
    break;
  }
  player.researching = null;
}

// ---- human-readable descriptions (for the UI) ----------------------------

const ROLE: Record<UnitClass, string> = {
  melee: "Melee infantry",
  ranged: "Ranged",
  cavalry: "Cavalry",
  siege: "Siege engine",
  recon: "Recon / scout",
  settler: "Founds a new city",
  trader: "Establishes trade routes",
  religious: "Religious — spreads faith",
  naval_melee: "Naval melee",
  naval_ranged: "Naval ranged",
};

export interface UnitInfo {
  role: string;
  stats: string;
  note: string;
}

export function unitInfo(type: UnitTypeId): UnitInfo {
  const d = UNIT_DEFS[type];
  const stats: string[] = [];
  if (d.strength > 0) stats.push(`⚔ ${d.strength}`);
  if ((d.rangedStrength ?? 0) > 0) stats.push(`🏹 ${d.rangedStrength} (range ${d.range})`);
  stats.push(`🥾 ${d.movement}`);
  const notes: string[] = [];
  if (d.abilities?.includes("bonus_vs_cavalry")) notes.push("bonus vs cavalry");
  if (d.abilities?.includes("bonus_vs_city")) notes.push("bonus vs cities");
  if (d.gunpowder) notes.push("gunpowder: fires every other turn (reloads after firing)");
  if (d.detectHiddenRadius) notes.push(`reveals hidden units within ${d.detectHiddenRadius} tiles`);
  if (d.builder) notes.push("3 build charges");
  if (d.founder) notes.push("consumed to found a city");
  if (d.trader) notes.push("consumed to set up a trade route");
  if (d.reqResource) notes.push(`requires ${d.reqResource.count} ${d.reqResource.resource}`);
  if (d.upkeep > 0) notes.push(`${d.upkeep}🪙/turn upkeep`);
  if (isNaval(d)) notes.push("naval");
  if (d.oceanGoing) notes.push("ocean-going");
  return { role: ROLE[d.cls], stats: stats.join(" · "), note: notes.join(" · ") };
}

/**
 * Synthesized building defs for civ-unique buildings (see UNIQUE_INFRA in
 * @roc/data). They behave like normal buildings — flat host-city yields and a
 * production cost — but are only offered to the owning civ (see availableProduction)
 * and additionally carry empire-wide CivEffects merged in playerEffects.
 */
const UNIQUE_BUILDING_DEFS: Record<string, BuildingDef> = {};
for (const u of UNIQUE_INFRA_BUILDINGS) {
  UNIQUE_BUILDING_DEFS[u.id] = {
    id: u.id as BuildingId,
    name: u.name,
    cost: u.cost,
    reqTech: u.reqTech as TechId,
    yields: u.yields,
  };
}

/** Resolve a building id to its def, honoring civ-unique buildings. */
export function getBuildingDef(id: string): BuildingDef | undefined {
  return BUILDING_DEFS[id as BuildingId] ?? UNIQUE_BUILDING_DEFS[id];
}

/** Maximum stacked city-defense from Beacon Towers (three towers), so beacon-spam
 *  cannot trivialize a frontier's defense. */
export const BEACON_DEFENSE_CAP = 6;

/** Aggregated numeric building effects for a city's built buildings. Sum-type fields
 *  accumulate; the aura fields are surfaced as the strongest single source (auras are
 *  resolved spatially in combat/economy, not summed per-city). */
export interface AggregatedBuildingEffects {
  trainTimePercent: number;
  trainedUnitXp: number;
  trainedUnitMorale: number;
  cityDefense: number;
  cityMaxHp: number;
  bombardPercent: number;
  extraBombards: number;
  growthCarryover: number;
  healAura: number; // strongest heal amount from any Infirmary here (0 = none)
  healAuraRadius: number;
}

/** Sum the structured effects of every building a city owns (see BuildingEffects). */
export function sumBuildingEffects(buildings: readonly string[]): AggregatedBuildingEffects {
  const out: AggregatedBuildingEffects = {
    trainTimePercent: 0, trainedUnitXp: 0, trainedUnitMorale: 0,
    cityDefense: 0, cityMaxHp: 0, bombardPercent: 0, extraBombards: 0,
    growthCarryover: 0, healAura: 0, healAuraRadius: 0,
  };
  for (const id of buildings) {
    const e = getBuildingDef(id)?.effects;
    if (!e) continue;
    out.trainTimePercent += e.trainTimePercent ?? 0;
    out.trainedUnitXp += e.trainedUnitXp ?? 0;
    out.trainedUnitMorale += e.trainedUnitMorale ?? 0;
    out.cityDefense += e.cityDefense ?? 0;
    out.cityMaxHp += e.cityMaxHp ?? 0;
    out.bombardPercent += e.bombardPercent ?? 0;
    out.extraBombards += e.extraBombards ?? 0;
    out.growthCarryover = Math.max(out.growthCarryover, e.growthCarryover ?? 0);
    if (e.healAura && e.healAura.amount > out.healAura) {
      out.healAura = e.healAura.amount;
      out.healAuraRadius = e.healAura.radius;
    }
  }
  return out;
}

/** Human-readable one-liner for a Buildings-Expansion building's special effect
 *  (used by buildingInfo, the production tooltips, and the generated wiki roster). */
export function buildingEffectText(id: string): string | null {
  const e = getBuildingDef(id)?.effects;
  if (!e) return null;
  const parts: string[] = [];
  if (e.trainTimePercent) parts.push(`units train ${Math.abs(e.trainTimePercent)}% ${e.trainTimePercent < 0 ? "faster" : "slower"}`);
  if (e.trainedUnitXp) parts.push(`trained units start with +${e.trainedUnitXp} XP`);
  if (e.trainedUnitMorale) parts.push(`trained units start with +${e.trainedUnitMorale} morale`);
  if (e.cityDefense) parts.push(`+${e.cityDefense} city defense`);
  if (e.cityMaxHp) parts.push(`+${e.cityMaxHp} city HP`);
  if (e.bombardPercent) parts.push(`city bombard damage +${e.bombardPercent}%`);
  if (e.extraBombards) parts.push(`city can bombard ${e.extraBombards + 1}× per turn`);
  if (e.growthCarryover) parts.push(`on growth, the next citizen starts ${Math.round(e.growthCarryover * 100)}% complete`);
  if (e.healAura) parts.push(`friendly units within ${e.healAura.radius} tiles heal +${e.healAura.amount} HP/turn`);
  if (e.victoryMorale) parts.push(`when an enemy dies within ${e.victoryMorale.radius} tiles, your nearby units gain +${e.victoryMorale.amount} morale`);
  if (e.cityDefenseAura) parts.push(`+${e.cityDefenseAura.amount} city defense to friendly cities within ${e.cityDefenseAura.radius} tiles (stacks to +${BEACON_DEFENSE_CAP})`);
  return parts.join("; ") || null;
}

export function buildingInfo(id: string): string {
  const d = getBuildingDef(id);
  if (!d) return "—";
  const y = d.yields;
  const parts: string[] = [];
  if (y.food) parts.push(`+${y.food} 🍞`);
  if (y.production) parts.push(`+${y.production} ⚒️`);
  if (y.gold) parts.push(`+${y.gold} 🪙`);
  if (y.science) parts.push(`+${y.science} 🔬`);
  if (y.culture) parts.push(`+${y.culture} 🎭`);
  if (y.faith) parts.push(`+${y.faith} ☮️`);
  if (d.effect === "walls") parts.push("city walls (+HP & defense)");
  if (d.effect === "barracks") parts.push("+city defense; new units gain XP");
  if (d.effect === "harbor") parts.push("heals adjacent naval units; +trade gold");
  if (d.effect === "lighthouse") parts.push("+1 sight for naval units in this city");
  const fx = buildingEffectText(id);
  if (fx) parts.push(fx);
  if (d.reqBuilding) parts.push(`requires ${getBuildingDef(d.reqBuilding)?.name ?? d.reqBuilding}`);
  return parts.join(", ") || "—";
}

/**
 * Map/mechanic/system unlocks whose payoff is neither a unit nor a building, so
 * they cannot be derived from UNIT_DEFS / BUILDING_DEFS. These are otherwise
 * invisible in the research picker and tech tree, so they are curated here as a
 * single source of truth for both surfaces. Keep in sync with the gates that
 * actually enforce them (works.ts, trade.ts, movement.ts, specialists.ts, etc.).
 */
export const TECH_SYSTEM_UNLOCKS: Partial<Record<TechId, string[]>> = {
  // Systems gated behind a tech (see CIVICS/RELIGION/BARBARIAN_DIPLOMACY constants).
  [CIVICS_REQUIRED_TECH]: ["Civics"],
  [RELIGION_REQUIRED_TECH]: ["Religion"],
  [BARBARIAN_DIPLOMACY_TECH]: ["Bribe & recruit barbarians"],
  // Tile-improvement & map mechanics.
  irrigation: ["Farms on river tiles"],
  maritime_foraging: ["Fishery & Saltern improvements"],
  bridge_building: ["Bridges over rivers"],
  sailing: ["Sea trade routes"],
  astronomy: ["Ocean travel for ships"],
  // New specialist types (see specialists.ts).
  the_wheel: ["Agrimensor specialist"],
  masonry: ["Mason & Architect specialists"],
  engineering: ["Military Engineer specialist"],
  // Labour-conversion projects (see PROJECT_DEFS).
  scholasticism: ["Scholarship project (labour → science)"],
  aesthetics: ["Patronage project (labour → culture)"],
  theology: ["Tithe project (labour → faith)"],
};

/** Map/mechanic/system unlocks for a tech (not units or buildings). */
export function techSystemUnlocks(techId: TechId): string[] {
  return TECH_SYSTEM_UNLOCKS[techId] ?? [];
}

/** Names of everything a tech unlocks — units, buildings, and mechanics (for the research picker). */
export function techUnlocks(techId: TechId): string[] {
  const out: string[] = [];
  // Holy units share one tech and would flood the list with dozens of names no
  // single civ ever fields — the Religion system entry stands in for them.
  for (const d of Object.values(UNIT_DEFS)) if (d.reqTech === techId && !d.religionUnit) out.push(d.name);
  for (const d of Object.values(BUILDING_DEFS)) if (d.reqTech === techId) out.push(d.name);
  for (const w of WONDER_DEFS) if (w.reqTech === techId) out.push(w.name);
  // Training-building tiers gated by this tech.
  for (const fam of TRAINING_CLASSES) {
    for (const t of TRAINING_BUILDING_DEFS[fam].tiers) {
      if (t.reqTech === techId) out.push(`${TRAINING_BUILDING_DEFS[fam].name} Tier ${t.tier}`);
    }
  }
  out.push(...techSystemUnlocks(techId));
  return out;
}

// ---- Promotions -----------------------------------------------------------

export type PromotionId =
  // shared combat
  | "shock"
  | "drill"
  | "cover"
  | "medic"
  // melee
  | "blitz"
  | "commando"
  | "amphibious"
  | "woodland_warrior"
  | "charge"
  | "toughness"
  | "discipline"
  | "formation"
  | "city_assault"
  | "brawler"
  | "veteran"
  | "eagle_eye"
  | "forager"
  | "stalwart"
  | "besieger"
  | "pathfinder"
  // cavalry
  | "flanking"
  | "mobility"
  | "cavalry_charge"
  | "trample"
  | "mounted_archer"
  | "outrider"
  | "raider"
  | "swift_healer"
  | "breakthrough"
  | "harrier"
  | "nomad"
  | "lancer"
  | "skirmisher"
  | "pursuit"
  | "bloodlust"
  | "intimidation"
  // ranged
  | "accuracy"
  | "barrage"
  | "extended_range"
  | "volley"
  | "sniper"
  | "logistics"
  | "scouting"
  | "camouflage"
  | "field_medic"
  | "suppression"
  | "sharpshooter"
  | "elevation"
  | "poison_arrows"
  | "rapid_reload"
  | "trailblazer"
  | "hunter"
  | "veteran_marksman"
  | "night_owl"
  // siege
  | "siege"
  | "city_breacher"
  | "heavy_caliber"
  | "entrenchment"
  | "counter_battery"
  | "rapid_deployment"
  | "survey"
  | "demolition"
  // recon
  | "tracking"
  | "guerrilla"
  | "survivalist"
  | "spy"
  | "ambush"
  | "ranger"
  | "eagle_eye_recon"
  | "evasion"
  | "slip_away"
  | "vanish"
  // naval melee
  | "boarding"
  | "ramming"
  | "marines"
  | "reinforced_hull"
  | "fleet_discipline"
  | "pursuit_at_sea"
  // naval ranged
  | "coastal_bombardment"
  | "extended_range_naval"
  | "chain_shot"
  | "spotter"
  | "repair_crew"
  | "broadside"
  // civilian
  | "pioneer"
  | "colonist"
  | "explorer";

export interface PromotionDef {
  id: PromotionId;
  name: string;
  desc: string;
  tier: 1 | 2 | 3;
  /**
   * Another promotion that must already be held before this one can be taken.
   * Used for tiered chains where a higher tier is a strict upgrade of a lower
   * one (e.g. the Escape line evasion → slip_away → vanish). Independent
   * promotions leave this undefined.
   */
  prereq?: PromotionId;
}

export const PROMOTION_DEFS: Record<PromotionId, PromotionDef> = {
  // shared
  shock: { id: "shock", name: "Shock", desc: "+3 strength attacking on open ground" , tier: 1 },
  drill: { id: "drill", name: "Drill", desc: "+3 strength attacking in rough terrain" , tier: 1 },
  cover: { id: "cover", name: "Cover", desc: "+4 defense vs ranged attacks" , tier: 1 },
  medic: { id: "medic", name: "Medic", desc: "Heals self +10 and adjacent allies +10 each turn" , tier: 1 },

  // melee
  blitz: { id: "blitz", name: "Blitz", desc: "+2 strength" , tier: 2 },
  commando: { id: "commando", name: "Commando", desc: "+1 movement; roads cost no movement" , tier: 2 },
  amphibious: { id: "amphibious", name: "Amphibious", desc: "+3 strength near water tiles" , tier: 2 },
  woodland_warrior: { id: "woodland_warrior", name: "Woodland Warrior", desc: "+3 strength in forest/jungle; forests cost 1 less movement" , tier: 2 },
  charge: { id: "charge", name: "Charge", desc: "+4 strength on the first attack each turn" , tier: 2 },
  toughness: { id: "toughness", name: "Toughness", desc: "+15 max HP" , tier: 2 },
  discipline: { id: "discipline", name: "Discipline", desc: "+2 strength per friendly unit within 2 tiles (max +8)" , tier: 2 },
  formation: { id: "formation", name: "Formation", desc: "+4 defense vs cavalry attacks" , tier: 2 },
  city_assault: { id: "city_assault", name: "City Assault", desc: "+4 strength vs cities" , tier: 3 },
  brawler: { id: "brawler", name: "Brawler", desc: "+3 strength when defending" , tier: 2 },
  veteran: { id: "veteran", name: "Veteran", desc: "+25% XP gain" , tier: 3 },
  eagle_eye: { id: "eagle_eye", name: "Eagle Eye", desc: "+1 sight" , tier: 2 },
  forager: { id: "forager", name: "Forager", desc: "Heals +8 HP after killing a unit or clearing a camp" , tier: 3 },
  stalwart: { id: "stalwart", name: "Stalwart", desc: "-4 damage taken from the first attack against it each turn" , tier: 2 },
  besieger: { id: "besieger", name: "Besieger", desc: "+3 defense when adjacent to an enemy city" , tier: 2 },
  pathfinder: { id: "pathfinder", name: "Pathfinder", desc: "Roads cost no movement; hills cost 1 less movement" , tier: 2 },

  // cavalry
  flanking: { id: "flanking", name: "Flanking", desc: "+2 strength per friendly unit within 2 tiles (max +8)" , tier: 2 },
  mobility: { id: "mobility", name: "Mobility", desc: "+1 movement" , tier: 2 },
  cavalry_charge: { id: "cavalry_charge", name: "Cavalry Charge", desc: "+4 strength on the first attack each turn" , tier: 2 },
  trample: { id: "trample", name: "Trample", desc: "+4 strength vs wounded units" , tier: 2 },
  mounted_archer: { id: "mounted_archer", name: "Mounted Archer", desc: "+1 movement; ranged cavalry gains +2 ranged strength" , tier: 2 },
  outrider: { id: "outrider", name: "Outrider", desc: "+1 sight" , tier: 2 },
  raider: { id: "raider", name: "Raider", desc: "+25 gold when clearing barbarian camps; +10 gold from pillaging" , tier: 3 },
  swift_healer: { id: "swift_healer", name: "Swift Healer", desc: "Heals +5 HP each turn" , tier: 2 },
  breakthrough: { id: "breakthrough", name: "Breakthrough", desc: "+1 movement after killing a unit" , tier: 3 },
  harrier: { id: "harrier", name: "Harrier", desc: "+3 strength vs ranged units" , tier: 2 },
  nomad: { id: "nomad", name: "Nomad", desc: "Plains and desert cost 1 movement; +1 sight on open ground" , tier: 3 },
  lancer: { id: "lancer", name: "Lancer", desc: "+3 strength vs melee units" , tier: 2 },
  skirmisher: { id: "skirmisher", name: "Skirmisher", desc: "+3 defense when not adjacent to an enemy" , tier: 2 },
  pursuit: { id: "pursuit", name: "Pursuit", desc: "+3 strength when attacking a damaged unit" , tier: 2 },
  bloodlust: { id: "bloodlust", name: "Bloodlust", desc: "Heals +12 HP on kill" , tier: 3 },
  intimidation: { id: "intimidation", name: "Intimidation", desc: "Enemy units adjacent have -2 strength" , tier: 3 },

  // ranged
  accuracy: { id: "accuracy", name: "Accuracy", desc: "+3 ranged strength vs targets on open ground" , tier: 1 },
  barrage: { id: "barrage", name: "Barrage", desc: "+3 ranged strength vs targets in rough terrain" , tier: 1 },
  extended_range: { id: "extended_range", name: "Extended Range", desc: "+1 range" , tier: 2 },
  volley: { id: "volley", name: "Volley", desc: "+2 ranged strength" , tier: 2 },
  sniper: { id: "sniper", name: "Sniper", desc: "+4 ranged strength vs wounded units" , tier: 2 },
  logistics: { id: "logistics", name: "Logistics", desc: "+1 movement" , tier: 2 },
  scouting: { id: "scouting", name: "Scouting", desc: "+1 sight" , tier: 1 },
  camouflage: { id: "camouflage", name: "Camouflage", desc: "+3 defense in rough terrain" , tier: 2 },
  field_medic: { id: "field_medic", name: "Field Medic", desc: "Adjacent allied units heal +5 extra each turn" , tier: 2 },
  suppression: { id: "suppression", name: "Suppression", desc: "Targets deal -3 damage when retaliating" , tier: 2 },
  sharpshooter: { id: "sharpshooter", name: "Sharpshooter", desc: "+3 ranged strength vs melee units" , tier: 2 },
  elevation: { id: "elevation", name: "Elevation", desc: "+2 ranged strength when on a hill" , tier: 2 },
  poison_arrows: { id: "poison_arrows", name: "Poison Arrows", desc: "Targets heal -5 HP next turn" , tier: 3 },
  rapid_reload: { id: "rapid_reload", name: "Rapid Reload", desc: "+1 movement after attacking" , tier: 3 },
  trailblazer: { id: "trailblazer", name: "Trailblazer", desc: "Forest/jungle movement cost reduced by 1" , tier: 2 },
  hunter: { id: "hunter", name: "Hunter", desc: "+3 ranged strength vs cavalry" , tier: 2 },
  veteran_marksman: { id: "veteran_marksman", name: "Veteran Marksman", desc: "+25% XP gain" , tier: 3 },
  night_owl: { id: "night_owl", name: "Night Owl", desc: "+1 sight" , tier: 2 },

  // siege
  siege: { id: "siege", name: "Siege", desc: "+50% strength vs cities" , tier: 1 },
  city_breacher: { id: "city_breacher", name: "City Breacher", desc: "+4 additional strength vs cities" , tier: 2 },
  heavy_caliber: { id: "heavy_caliber", name: "Heavy Caliber", desc: "+3 ranged strength vs units" , tier: 2 },
  entrenchment: { id: "entrenchment", name: "Entrenchment", desc: "+4 defense if the unit did not move this turn" , tier: 2 },
  counter_battery: { id: "counter_battery", name: "Counter Battery", desc: "+4 ranged strength vs ranged/siege units" , tier: 2 },
  rapid_deployment: { id: "rapid_deployment", name: "Rapid Deployment", desc: "+1 movement" , tier: 2 },
  survey: { id: "survey", name: "Survey", desc: "+1 sight" , tier: 2 },
  demolition: { id: "demolition", name: "Demolition", desc: "+3 strength vs units in cities or forts" , tier: 2 },

  // recon
  tracking: { id: "tracking", name: "Tracking", desc: "+1 movement" , tier: 1 },
  guerrilla: { id: "guerrilla", name: "Guerrilla", desc: "+3 strength in rough terrain; ignores rough terrain penalties" , tier: 2 },
  survivalist: { id: "survivalist", name: "Survivalist", desc: "Heals +8 HP each turn" , tier: 2 },
  spy: { id: "spy", name: "Spy", desc: "+1 sight" , tier: 2 },
  ambush: { id: "ambush", name: "Ambush", desc: "+4 strength on the first attack each turn" , tier: 2 },
  ranger: { id: "ranger", name: "Ranger", desc: "+2 strength; +1 sight" , tier: 2 },
  eagle_eye_recon: { id: "eagle_eye_recon", name: "Eagle Eye", desc: "+2 sight" , tier: 3 },
  evasion: { id: "evasion", name: "Evasion", desc: "50% chance to dodge an attack and slip back one tile — once per turn" , tier: 1 },
  slip_away: { id: "slip_away", name: "Slip Away", desc: "75% chance to dodge an attack and slip back one tile — once per turn" , tier: 2, prereq: "evasion" },
  vanish: { id: "vanish", name: "Vanish", desc: "95% chance to dodge an attack and slip back one tile — once per turn" , tier: 3, prereq: "slip_away" },

  // naval melee
  boarding: { id: "boarding", name: "Boarding", desc: "+4 strength vs naval melee units" , tier: 2 },
  ramming: { id: "ramming", name: "Ramming", desc: "+4 strength on the first naval attack each turn" , tier: 2 },
  marines: { id: "marines", name: "Marines", desc: "Can pillage adjacent coastal tiles" , tier: 3 },
  reinforced_hull: { id: "reinforced_hull", name: "Reinforced Hull", desc: "+15 max HP" , tier: 2 },
  fleet_discipline: { id: "fleet_discipline", name: "Fleet Discipline", desc: "+2 strength when adjacent to a friendly naval unit" , tier: 2 },
  pursuit_at_sea: { id: "pursuit_at_sea", name: "Pursuit at Sea", desc: "+3 strength when attacking a damaged ship" , tier: 2 },

  // naval ranged
  coastal_bombardment: { id: "coastal_bombardment", name: "Coastal Bombardment", desc: "+4 ranged strength vs cities" , tier: 2 },
  extended_range_naval: { id: "extended_range_naval", name: "Extended Range", desc: "+1 range" , tier: 2 },
  chain_shot: { id: "chain_shot", name: "Chain Shot", desc: "+4 ranged strength vs naval units" , tier: 2 },
  spotter: { id: "spotter", name: "Spotter", desc: "+1 sight" , tier: 2 },
  repair_crew: { id: "repair_crew", name: "Repair Crew", desc: "Heals +5 HP each turn at sea" , tier: 2 },
  broadside: { id: "broadside", name: "Broadside", desc: "+2 ranged strength" , tier: 2 },

  // civilian
  pioneer: { id: "pioneer", name: "Pioneer", desc: "+1 sight; +1 movement" , tier: 1 },
  colonist: { id: "colonist", name: "Colonist", desc: "+20 HP" , tier: 1 },
  explorer: { id: "explorer", name: "Explorer", desc: "+2 sight" , tier: 1 },
};

export const PROMOTION_POOL: Record<UnitClass, PromotionId[]> = {
  melee: [
    "shock",
    "drill",
    "cover",
    "medic",
    "blitz",
    "commando",
    "amphibious",
    "woodland_warrior",
    "charge",
    "toughness",
    "discipline",
    "formation",
    "city_assault",
    "brawler",
    "veteran",
    "eagle_eye",
    "forager",
    "stalwart",
    "besieger",
    "pathfinder",
  ],
  cavalry: [
    "shock",
    "drill",
    "cover",
    "medic",
    "flanking",
    "mobility",
    "cavalry_charge",
    "trample",
    "mounted_archer",
    "outrider",
    "raider",
    "swift_healer",
    "breakthrough",
    "harrier",
    "nomad",
    "lancer",
    "skirmisher",
    "pursuit",
    "bloodlust",
    "intimidation",
  ],
  // Scouts are reconnaissance units, not fighters: the only combat perks offered
  // are defensive (cover/stalwart). The rest are vision, mobility, survival, and
  // the tiered Escape line (evasion → slip_away → vanish).
  recon: [
    "cover",
    "medic",
    "scouting",
    "tracking",
    "survivalist",
    "spy",
    "pathfinder",
    "stalwart",
    "eagle_eye_recon",
    "evasion",
    "slip_away",
    "vanish",
  ],
  ranged: [
    "accuracy",
    "barrage",
    "cover",
    "medic",
    "extended_range",
    "volley",
    "sniper",
    "logistics",
    "scouting",
    "camouflage",
    "field_medic",
    "suppression",
    "sharpshooter",
    "elevation",
    "poison_arrows",
    "rapid_reload",
    "trailblazer",
    "hunter",
    "veteran_marksman",
    "night_owl",
  ],
  siege: [
    "siege",
    "accuracy",
    "medic",
    "extended_range",
    "volley",
    "city_breacher",
    "heavy_caliber",
    "entrenchment",
    "counter_battery",
    "rapid_deployment",
    "survey",
    "demolition",
  ],
  settler: ["pioneer", "colonist", "explorer"],
  trader: [],
  religious: [],
  naval_melee: [
    "boarding",
    "ramming",
    "medic",
    "fleet_discipline",
    "pursuit_at_sea",
    "reinforced_hull",
    "marines",
  ],
  naval_ranged: [
    "coastal_bombardment",
    "extended_range_naval",
    "chain_shot",
    "spotter",
    "repair_crew",
    "broadside",
    "medic",
  ],
};
