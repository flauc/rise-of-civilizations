/// <reference types="vite/client" />
// In-game encyclopedia / wiki. Gradually expanded reference for civilizations,
// units, terrain, systems and victory conditions.

import {
  CIVILIZATIONS,
  UNIT_DEFS,
  UNIQUE_UNITS,
  TERRAIN_NAMES,
  TERRAIN_YIELDS,
  isWaterTerrain,
  isRough,
  terrainDefense,
  moveCost,
  isPassableLand,
  MILITARY_CLASSES,
  SPECIALIST_DEFS,
  SPECIALIST_IDS,
  BRIBE_TURNS,
  BARBARIAN_BRIBE_BASE,
  barbarianRecruitCost,
  greatPersonThreshold,
  legendCost,
  legendBaseName,
} from "@roc/sim";
import {
  WONDER_DEFS,
  MASTER_CRAFTSMEN,
  getCiv,
  GREAT_PEOPLE,
  GREAT_PERSON_CLASSES,
  GREAT_PERSON_CLASS_INFO,
  LEGENDS,
  type GreatPersonClass,
  type LegendType,
} from "@roc/data";
import type { TerrainType, Unit } from "@roc/sim";

export type WikiCategory =
  | "civilizations"
  | "units"
  | "gameplay"
  | "terrain"
  | "specialists"
  | "combat"
  | "morale"
  | "great_people"
  | "legends"
  | "cities"
  | "religion"
  | "victory";

interface CategoryDef {
  id: WikiCategory;
  name: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: "civilizations", name: "Civilizations" },
  { id: "units", name: "Units" },
  { id: "gameplay", name: "Gameplay" },
  { id: "terrain", name: "Terrain" },
  { id: "specialists", name: "Specialists & Works" },
  { id: "combat", name: "Combat" },
  { id: "morale", name: "Morale" },
  { id: "great_people", name: "Great People" },
  { id: "legends", name: "Legends" },
  { id: "cities", name: "Cities" },
  { id: "religion", name: "Religion" },
  { id: "victory", name: "Victory" },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function section(title: string, body: string): string {
  return `<div class="wiki-section"><div class="wiki-section-title">${escapeHtml(title)}</div>${body}</div>`;
}

function renderCivilizations(): string {
  const list = CIVILIZATIONS.map(
    (c) =>
      `<div class="wiki-card" id="wiki-civ-${c.id}">` +
      `<div class="wiki-card-title">${escapeHtml(c.name)}</div>` +
      `<div class="wiki-card-sub">Leader: <b>${escapeHtml(c.leader)}</b></div>` +
      `<div class="wiki-card-quote">${escapeHtml(c.leaderQuote || "")}</div>` +
      `<div class="wiki-card-body"><b>${escapeHtml(c.abilityName)}</b> — ${escapeHtml(c.abilityDesc)}</div>` +
      `<div class="wiki-card-meta">Unique Unit: <b>${escapeHtml(c.uniqueUnit)}</b> · Unique Infrastructure: <b>${escapeHtml(c.uniqueInfra)}</b></div>` +
      `</div>`,
  ).join("");
  return section("Civilizations", `<div class="wiki-grid">${list}</div>`);
}

const CLASS_ORDER = ["melee", "ranged", "cavalry", "siege", "naval_melee", "naval_ranged", "recon", "settler", "trader"] as const;

/** Display titles for each unit class section in the wiki. */
const CLASS_TITLES: Record<string, string> = {
  melee: "Melee",
  ranged: "Ranged",
  cavalry: "Cavalry",
  siege: "Siege",
  naval_melee: "Naval — Warships",
  naval_ranged: "Naval — Ranged",
  recon: "Recon",
  settler: "Civilian",
  trader: "Trade",
};

const WIKI_UNIT_STYLE = `<style>
.wiki-unit-classtitle{font-size:16px;font-weight:700;color:#ffd967;margin:18px 0 6px;text-transform:capitalize}
.wiki-unit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin:8px 0 22px}
.wiki-unit-card{margin:0;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 10px;text-align:center}
.wiki-unit-img{height:160px;display:flex;align-items:center;justify-content:center;margin-bottom:8px}
.wiki-unit-img img{max-width:100%;max-height:160px;width:auto;height:auto;filter:drop-shadow(0 4px 10px rgba(0,0,0,.45))}
.wiki-unit-name{font-weight:700;font-size:14px;color:#e6d2b8}
.wiki-unit-stats{font-size:12px;color:#9fb0c0;margin-top:3px}
.wiki-unit-meta{font-size:11px;color:#8a93a0;margin-top:3px}
@media(max-width:700px){
.wiki-unit-classtitle{font-size:15px;margin:14px 0 4px}
.wiki-unit-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin:6px 0 18px}
.wiki-unit-img{height:120px}
.wiki-unit-img img{max-height:120px}
}
</style>`;

/** A big-image unit card. Uses a crisp ~320px image (units-big), falling back to the token.
 *  The untouched full-resolution art lives in units-full for hi-res use. */
function unitCard(id: string, title: string, statsLine: string, metaLine: string): string {
  const big = `${import.meta.env.BASE_URL}units-big/${id}.png`;
  const token = `${import.meta.env.BASE_URL}units/${id}.png`;
  return (
    `<figure class="wiki-unit-card">` +
    `<div class="wiki-unit-img"><img src="${big}" loading="lazy" alt="${escapeHtml(title)}" ` +
    `onerror="this.onerror=null;this.src='${token}'"></div>` +
    `<figcaption><div class="wiki-unit-name">${escapeHtml(title)}</div>` +
    (statsLine ? `<div class="wiki-unit-stats">${escapeHtml(statsLine)}</div>` : "") +
    (metaLine ? `<div class="wiki-unit-meta">${metaLine}</div>` : "") +
    `</figcaption></figure>`
  );
}

function renderUnits(): string {
  const byClass = new Map<string, typeof UNIT_DEFS[keyof typeof UNIT_DEFS][]>();
  for (const u of Object.values(UNIT_DEFS)) {
    const arr = byClass.get(u.cls) ?? [];
    arr.push(u);
    byClass.set(u.cls, arr);
  }

  let html = WIKI_UNIT_STYLE;
  for (const cls of CLASS_ORDER) {
    const units = byClass.get(cls);
    if (!units || units.length === 0) continue;
    const cards = units
      .map((u) => {
        const stats = [`${u.cost}⚙`, `Move ${u.movement}`];
        if (MILITARY_CLASSES.has(u.cls)) {
          stats.push(`Str ${u.strength}`);
          if (u.rangedStrength) stats.push(`Rng ${u.rangedStrength}`);
        }
        const tags: string[] = [];
        if (u.reqTech) tags.push(escapeHtml(u.reqTech));
        if (u.founder) tags.push("founds cities");
        if (u.trader) tags.push("trade routes");
        return unitCard(u.id, u.name, stats.join(" · "), tags.join(" · "));
      })
      .join("");
    html +=
      `<div class="wiki-unit-classtitle">${escapeHtml(CLASS_TITLES[cls] ?? cls[0]!.toUpperCase() + cls.slice(1))}</div>` +
      `<div class="wiki-unit-grid">${cards}</div>`;
  }

  // Unique units — every civilization's signature unit, big image + who fields it.
  const defs = UNIT_DEFS as Record<string, { name: string }>;
  const uuCards = UNIQUE_UNITS.map((u) => {
    const civ = getCiv(u.civId);
    const baseName = defs[u.replaces]?.name ?? u.replaces;
    const civName = escapeHtml(civ?.name ?? u.civId);
    // Skip the redundant "replaces X" when the unique unit shares the base unit's name.
    const meta = u.name.toLowerCase() === baseName.toLowerCase()
      ? civName
      : `${civName} · replaces ${escapeHtml(baseName)}`;
    return unitCard(u.id, u.name, `+${u.bonus} strength`, meta);
  }).join("");
  html +=
    `<div class="wiki-unit-classtitle">Unique Units (${UNIQUE_UNITS.length})</div>` +
    `<div class="wiki-unit-grid">${uuCards}</div>`;

  return section("Units", html);
}

function renderGameplay(): string {
  return (
    section(
      "Turns",
      `<p>Each turn represents a span of history. During your turn you move units, manage cities, choose research and civics, and engage in diplomacy or war. End your turn with the <b>End Turn</b> button in the bottom-right corner.</p>`,
    ) +
    section(
      "Yields",
      `<p>Civilization runs on six yields:</p>` +
        `<ul>` +
        `<li><b>Food</b> — grows city populations.</li>` +
        `<li><b>Production</b> — builds units, buildings and wonders.</li>` +
        `<li><b>Gold</b> — purchases units/buildings and maintains armies.</li>` +
        `<li><b>Science</b> — researches technologies.</li>` +
        `<li><b>Culture</b> — develops civics and expands borders.</li>` +
        `<li><b>Faith</b> — founds and spreads religions.</li>` +
        `</ul>`,
    ) +
    section(
      "Exploration",
      `<p>Send Scouts and Warriors to reveal the map. Ancient villages reward the first player to enter them, while barbarian camps spawn raiders until cleared.</p>`,
    ) +
    section(
      "Upkeep & Treasury",
      `<p>Every military unit costs a small amount of <b>gold per turn</b> in upkeep. Civilian units are cheap or free: Settlers cost nothing (they are consumed to found a city), while Traders cost <b>1🪙/turn</b>. Basic warriors and scouts cost <b>1🪙/turn</b>; more advanced bronze, iron, and naval units cost <b>2–4🪙/turn</b>. Some civilization abilities modify these costs.</p>` +
        `<p>When you create a game, choose a <b>Starting Treasury</b> preset that sets how much gold every major civilization begins with:</p>` +
        `<ul>` +
        `<li><b>Tight start</b> — <b>25🪙</b>. A smaller buffer; players must be careful about extra units early and will feel gold pressure quickly. Good if you want upkeep to bite.</li>` +
        `<li><b>Balanced start</b> — <b>75🪙</b>. Enough to cover a modest army for ~15–25 turns while the first economy (trade route / Market / Harbor) comes online. Keeps early expansion viable without removing tension.</li>` +
        `<li><b>Generous start</b> — <b>150🪙</b>. A comfortable cushion; players can support several units or bribe barbarians early without immediate gold anxiety. Reduces early economic tension.</li>` +
        `</ul>` +
        `<p>If your treasury drops below zero after paying upkeep, you will see a warning in the turn log. Try to grow your economy through trade routes, coastal/lake tiles, Markets, and Harbors before your starting gold runs out.</p>`,
    ) +
    section(
      "Barbarians & Parley",
      `<p>Barbarian camps spawn raiders that attack everyone. You can fight them — clearing a camp with a military unit pays a gold reward — but once you research <b>Parley</b> (a very early technology, branching off Foraging) you gain two diplomatic options whenever one of your units stands <b>adjacent</b> to a barbarian.</p>` +
        `<ul>` +
        `<li><b>Bribe the war-band</b> — buy a <b>${BRIBE_TURNS}-turn truce</b>. Every barbarian from that camp (the whole war-band, including raiders it spawns later) stops attacking <i>you</i> for the duration. Your first bribe costs <b>${BARBARIAN_BRIBE_BASE}🪙</b>, and <b>each subsequent bribe doubles in price</b> (${BARBARIAN_BRIBE_BASE} → ${BARBARIAN_BRIBE_BASE * 2} → ${BARBARIAN_BRIBE_BASE * 4} → …), so peace gets expensive fast.</li>` +
        `<li><b>Recruit the unit</b> — pay a larger, one-off fee to take the barbarian into your own army. The price scales with the unit's type and level: about <b>5× its build cost</b>, plus 40% per level. For example, a Warrior costs <b>${barbarianRecruitCost({ type: "warrior", level: 1 } as Unit)}🪙</b> and a Slinger <b>${barbarianRecruitCost({ type: "slinger", level: 1 } as Unit)}🪙</b>; a veteran (level 2) Warrior costs <b>${barbarianRecruitCost({ type: "warrior", level: 2 } as Unit)}🪙</b>.</li>` +
        `</ul>` +
        `<p>A bribe is a cheap, temporary shield against a horde you can't yet beat; recruiting is a pricier way to turn a raider into a soldier of your own. Truces are per-player — bribing a war-band does not stop it raiding your rivals.</p>`,
    )
  );
}

function renderTerrain(): string {
  const rows = (Object.keys(TERRAIN_NAMES) as TerrainType[])
    .map((t) => {
      const y = TERRAIN_YIELDS[t];
      const yieldText = [y.food ? `+${y.food} food` : "", y.production ? `+${y.production} prod` : "", y.gold ? `+${y.gold} gold` : "", y.science ? `+${y.science} sci` : ""]
        .filter(Boolean)
        .join(" · ") || "No yields";
      const notes: string[] = [];
      if (isWaterTerrain(t)) notes.push("Water — naval only");
      else if (!isPassableLand(t)) notes.push("Impassable");
      else notes.push(moveCost(t) > 1 ? `Rough · ${moveCost(t)} moves` : "Open · 1 move");
      const def = terrainDefense(t);
      if (def) notes.push(`+${def} defense`);
      return (
        `<tr>` +
        `<td><b>${escapeHtml(TERRAIN_NAMES[t])}</b></td>` +
        `<td>${yieldText}</td>` +
        `<td>${notes.join(" · ")}</td>` +
        `</tr>`
      );
    })
    .join("");
  return (
    section(
      "Terrain",
      `<p>Tiles provide yields when worked and modify movement and combat. Forests, woods, jungle, taiga, hills, mesas and the soggy wetlands and bogs are all rough ground that slows attackers; tree cover and high ground also aid defenders (open marsh does not).</p>` +
        `<p><b>Woods vs. Forest:</b> both are tree-covered and rough, but a true <b>Forest</b> is the denser, knowledge-rich woodland and yields an extra <b>+1 science</b> over open <b>Woods</b>.</p>` +
        `<p><b>Cold &amp; tropical biomes:</b> the poles spread from barren <b>Snow</b> (no yield) through frozen <b>Tundra</b> steppe (food + science) to snowy <b>Taiga</b> pine forest (production); the tropics range from dense <b>Jungle</b> through fertile <b>Wetlands</b> (food) to poor <b>Bog</b> (a trickle of faith).</p>` +
        `<p><b>Water bodies:</b> <b>Lakes</b> are calm inland fresh water, <b>Coasts</b> are the shallow seas that ring the land, and <b>Oceans</b> are the deep open sea (crossable only once Astronomy is researched).</p>` +
        `<div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>Terrain</th><th>Yields</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    ) +
    section(
      "Rivers &amp; Fresh Water",
      `<p>Rivers thread across the land as an overlay on top of whatever terrain they cross. Any tile a river runs through gains <b>+1 food</b>, and a <b>river lake</b> (where a river springs or pools) adds a further <b>+1 science</b>.</p>` +
        `<ul>` +
        `<li><b>Defense:</b> a unit attacking across a river fights at <b>-25%</b> strength.</li>` +
        `<li><b>Movement:</b> crossing a river costs <b>+1 movement</b>, just like entering rough terrain.</li>` +
        `<li><b>Farms:</b> a river tile can only be farmed once <b>Irrigation</b> has been researched.</li>` +
        `<li><b>Trade:</b> after <b>Sailing</b>, your rivers become navigable trade arteries — caravans follow them in preference to roads and a river-connected route earns the same gold bonus as the best grade of road.</li>` +
        `</ul>`,
    ) +
    section(
      "Improvements",
      `<p>Tiles are developed by city <b>specialists</b> rather than by roaming workers — see the <b>Specialists &amp; Works</b> section. Every improvement has three tiers, each a separate project that must be contracted to craftsmen.</p>`,
    )
  );
}

function renderCombat(): string {
  return (
    section(
      "Basics",
      `<p>Combat strength determines damage. The attacker uses its strength against the defender's strength, modified by terrain, promotions, flanking and unit abilities. Health is reduced by the result; a unit reduced to 0 HP is destroyed.</p>`,
    ) +
    section(
      "Rough & Open Terrain",
      `<p>Defenders on Hills, Forest, Woods, Jungle, Taiga or Mesa gain a combat bonus, and all rough ground (those plus Wetlands and Bog) costs extra movement to enter. Open terrain — including the soggy marshes, which give no cover — is no help to a defender. Attacking across a river costs the attacker 25% of its strength and an extra movement point to ford.</p>`,
    ) +
    section(
      "Ranged Units",
      `<p>Archers, Slingers and later ranged units can attack from a distance without taking return damage. Siege units are especially effective against cities.</p>`,
    ) +
    section(
      "Promotions",
      `<p>Military units earn experience from combat. When they level up they can choose promotions that boost strength, movement, sight, range, healing or special tactics. Higher-tier promotions require higher levels.</p>`,
    ) +
    section(
      "Cities",
      `<p>Cities have their own combat strength based on population and buildings. Enemy units must attack from adjacent tiles; cities cannot be entered until captured.</p>`,
    )
  );
}

function renderMorale(): string {
  return (
    section(
      "Two Kinds of Morale",
      `<p>Every army runs on <b>morale</b>, tracked at two levels:</p>` +
        `<ul>` +
        `<li><b>Global morale</b> — your empire's overall spirit, from <b>0 to 200</b>, starting at a base of <b>50</b>. It sets the floor that new units are mustered at and shifts with the fortunes of war.</li>` +
        `<li><b>Unit morale</b> — each individual unit's nerve, from <b>0 to 200</b>, where <b>100 is neutral</b> (no effect). It buffs or debuffs that unit's fighting and decides whether it holds the line or breaks and runs.</li>` +
        `</ul>`,
    ) +
    section(
      "New Units",
      `<p>A freshly created unit starts at <b>50 + half your global morale</b>. So at the base global morale of 50 a recruit musters at <b>75</b>; raise your empire to global morale 100 and recruits arrive at a full <b>100</b>.</p>` +
        `<p><b>Barracks</b> instil discipline: a city with a Barracks musters its units with <b>+25</b> starting morale.</p>`,
    ) +
    section(
      "Morale in Battle",
      `<p>Morale acts as a buff above neutral and a debuff below it, scaling smoothly with how far from 100 a unit sits:</p>` +
        `<ul>` +
        `<li><b>At 0 morale</b> a unit attacks <b>20% weaker</b> and defends <b>10% weaker</b>.</li>` +
        `<li><b>At 100 (neutral)</b> there is no effect.</li>` +
        `<li><b>At 200 morale</b> a unit attacks <b>20% stronger</b> and defends <b>10% stronger</b>.</li>` +
        `</ul>`,
    ) +
    section(
      "Winning & Losing",
      `<p>Morale is earned and lost on the battlefield:</p>` +
        `<ul>` +
        `<li><b>Defeat an enemy</b> — the victorious unit's morale jumps, adjacent friendly units gain a smaller boost, and your global morale rises by <b>10%</b> of the victor's gain.</li>` +
        `<li><b>Lose one of your units</b> — every adjacent friendly unit's morale drops, and global morale falls by 10% of that loss. Repeated defeats are the <i>only</i> thing that can drag global morale below its base of 50.</li>` +
        `<li><b>Promote a unit</b> — the promotion heartens that unit and its neighbours, and lifts global morale.</li>` +
        `<li><b>Beating barbarians counts for less</b> — defeating a barbarian gives only about <b>half</b> the morale of beating a rival civilization's soldier. Glory is won against real foes.</li>` +
        `</ul>`,
    ) +
    section(
      "Decay",
      `<p>Glory fades if it isn't renewed. Global morale above the base of 50 slowly <b>decays</b> when you stop earning it:</p>` +
        `<ul>` +
        `<li>Decay only begins <b>3 turns after</b> the last time morale was earned (a kill, promotion, or a spirited war declaration).</li>` +
        `<li>It then <b>ramps up</b>: roughly <b>1% per turn</b> at first, accelerating up to <b>10% per turn</b> the longer your armies sit idle.</li>` +
        `<li>Decay <b>never drops global morale below 50</b> — only losing battles can do that.</li>` +
        `</ul>` +
        `<p>The lesson: a confident empire must keep winning to stay confident.</p>`,
    ) +
    section(
      "Declaring War",
      `<p>The decision to go to war tests an army's nerve — and the effect cuts both ways, applied to <b>both your global morale and each of your units</b>:</p>` +
        `<ul>` +
        `<li>If morale is <b>high</b> (at or above neutral 100) when you declare war, it <b>rises</b> — a confident people welcomes the fight.</li>` +
        `<li>If morale is <b>low</b> (below 100), it <b>falls further</b> — a weary people dreads another war.</li>` +
        `</ul>` +
        `<p>Pick your moment: declaring war from a position of strength compounds your advantage, while doing so when shaken only deepens the malaise.</p>`,
    ) +
    section(
      "Routing",
      `<p>A unit whose nerve fails may <b>rout</b>: it breaks off, <b>flees 1–2 tiles</b> away from the nearest enemy, and <b>loses its next turn</b> entirely (no movement, no actions).</p>` +
        `<ul>` +
        `<li>There is always a small chance to rout, but it climbs sharply as morale falls and is highest near 0.</li>` +
        `<li>At <b>150+ morale</b> a unit essentially <b>never routs</b> — confident troops stand firm.</li>` +
        `<li><b>Route resistance:</b> disciplined and heavy units hold their ground far better. Spearmen, Pikemen, Hoplites, Cataphracts, War Elephants and especially Legionaries are much harder to break at any given morale.</li>` +
        `</ul>`,
    )
  );
}

const WIKI_PORTRAIT_STYLE = `<style>
.wiki-portrait-cat{font-size:16px;font-weight:700;color:#ffd967;margin:18px 0 6px;text-transform:capitalize}
.wiki-portrait-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin:8px 0 22px}
.wiki-portrait-card{margin:0;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;text-align:left;display:flex;gap:10px}
.wiki-portrait-img{flex:0 0 64px}
.wiki-portrait-img img{width:64px;height:80px;object-fit:cover;border-radius:8px;border:1px solid rgba(201,162,39,.3)}
.wiki-portrait-name{font-weight:700;font-size:14px;color:#e6d2b8}
.wiki-portrait-sub{font-size:11px;color:#9fb0c0;margin-top:2px}
.wiki-portrait-body{font-size:11.5px;color:#b8aa8d;margin-top:5px;line-height:1.35}
@media(max-width:700px){
.wiki-portrait-grid{grid-template-columns:1fr;gap:10px}
}
</style>`;

/** A portrait card: image on the left, name + meta + body on the right. */
function portraitCard(imgBase: string, id: string, title: string, sub: string, body: string): string {
  const src = `${import.meta.env.BASE_URL}${imgBase}/${id}.png`;
  return (
    `<figure class="wiki-portrait-card">` +
    `<div class="wiki-portrait-img"><img src="${src}" loading="lazy" alt="${escapeHtml(title)}" onerror="this.style.visibility='hidden'"></div>` +
    `<figcaption><div class="wiki-portrait-name">${escapeHtml(title)}</div>` +
    `<div class="wiki-portrait-sub">${sub}</div>` +
    `<div class="wiki-portrait-body">${escapeHtml(body)}</div></figcaption></figure>`
  );
}

/** Plain-English description of each great-person class's instant activation. */
const GP_EFFECT_TEXT: Record<GreatPersonClass, string> = {
  general: "Drills your land army — every land military unit earns a free promotion — and lifts empire morale.",
  admiral: "Heals your fleet and army to full and lifts empire morale.",
  scientist: "A burst of science (a eureka) that speeds your current research.",
  engineer: "A surge of production in your best city, hurrying its current build.",
  merchant: "A windfall of gold straight to your treasury.",
  prophet: "A burst of faith toward founding or spreading a religion.",
  artist: "A burst of culture that inspires your empire.",
  statesman: "A burst of culture that speeds your civic reforms.",
};

/** Buildings (and the capital) that feed each class's point pool. */
const GP_SOURCE_TEXT: Record<GreatPersonClass, string> = {
  general: "Barracks, Stables",
  admiral: "Harbors, Lighthouses",
  scientist: "Archives (Library), Academies",
  engineer: "Workshops, Forges",
  merchant: "Markets, Harbors",
  prophet: "Shrines, Temples",
  artist: "Monuments, Amphitheaters",
  statesman: "your capital (seat of government)",
};

function renderGreatPeople(): string {
  let gallery = WIKI_PORTRAIT_STYLE;
  for (const cls of GREAT_PERSON_CLASSES) {
    const info = GREAT_PERSON_CLASS_INFO[cls];
    const figures = GREAT_PEOPLE.filter((g) => g.cls === cls);
    if (figures.length === 0) continue;
    const cards = figures
      .map((g) => portraitCard("great-people", g.id, g.name, `${g.era} era`, g.desc))
      .join("");
    gallery +=
      `<div class="wiki-portrait-cat">${info.glyph} ${escapeHtml(info.name)}s — earned from ${escapeHtml(GP_SOURCE_TEXT[cls])}</div>` +
      `<div class="wiki-portrait-body" style="margin:0 0 6px">${escapeHtml(GP_EFFECT_TEXT[cls])}</div>` +
      `<div class="wiki-portrait-grid">${cards}</div>`;
  }

  return (
    section(
      "What They Are",
      `<p><b>Great People</b> are finite, named historical figures — scientists, generals, prophets, artists and more — earned by running the right kind of empire. They are not generic units; each is a one-time recruit you <b>activate</b> for a powerful instant effect.</p>`,
    ) +
    section(
      "Earning Class Points",
      `<p>Each class has its own <b>point pool</b> that fills a little every turn from matching buildings (and, for Statesmen, your capital's seat of government):</p>` +
        `<ul>` +
        GREAT_PERSON_CLASSES.map(
          (cls) =>
            `<li>${GREAT_PERSON_CLASS_INFO[cls].glyph} <b>${escapeHtml(GREAT_PERSON_CLASS_INFO[cls].name)}</b> — ${escapeHtml(GP_SOURCE_TEXT[cls])}</li>`,
        ).join("") +
        `</ul>` +
        `<p>Build Archives and Academies to court Scientists, Markets and Harbors for Merchants, Barracks for Generals, Shrines and Temples for Prophets, and so on. Open the <b>🎖️ Great People</b> panel to watch each pool fill.</p>`,
    ) +
    section(
      "Recruiting",
      `<p>When a pool reaches its threshold you <b>recruit the next available figure</b> of that class, in roughly era order. Each figure is <b>globally unique</b> — once any civilization recruits them, they are gone for the rest of that game, so there is real competition for the best ones.</p>` +
        `<p>Your first figure of a class costs <b>${greatPersonThreshold(0)}</b> points; each later one of that class costs <b>${greatPersonThreshold(1) - greatPersonThreshold(0)}</b> more (${greatPersonThreshold(0)} → ${greatPersonThreshold(1)} → ${greatPersonThreshold(2)} → …).</p>`,
    ) +
    section(
      "Activation",
      `<p>A recruited figure waits in your <b>🎖️ Great People</b> panel until you <b>activate</b> them — a one-time effect themed to their class:</p>` +
        `<ul>` +
        GREAT_PERSON_CLASSES.map(
          (cls) =>
            `<li>${GREAT_PERSON_CLASS_INFO[cls].glyph} <b>${escapeHtml(GREAT_PERSON_CLASS_INFO[cls].name)}</b> — ${escapeHtml(GP_EFFECT_TEXT[cls])}</li>`,
        ).join("") +
        `</ul>`,
    ) +
    section(`The Figures (${GREAT_PEOPLE.length})`, gallery)
  );
}

const LEGEND_TYPE_TITLE: Record<LegendType, string> = {
  land: "Land Heroes",
  naval: "Naval Heroes",
  support: "Support Heroes",
};

function renderLegends(): string {
  let gallery = WIKI_PORTRAIT_STYLE;
  for (const type of ["land", "naval", "support"] as LegendType[]) {
    const heroes = LEGENDS.filter((l) => l.type === type);
    if (heroes.length === 0) continue;
    const cards = heroes
      .map((l) =>
        portraitCard(
          "legends",
          l.id,
          l.name,
          `${l.era} · ${legendBaseName(l)} · via ${l.recruitVia}`,
          `${l.abilityDesc} Aura: ${l.auraDesc} (+${l.auraBonus} to adjacent allies). Lifespan ${l.lifespan} turns${l.rechargeable ? ", recharges" : ""}.`,
        ),
      )
      .join("");
    gallery +=
      `<div class="wiki-portrait-cat">${escapeHtml(LEGEND_TYPE_TITLE[type])}</div>` +
      `<div class="wiki-portrait-grid">${cards}</div>`;
  }

  return (
    section(
      "Heroes of Legend",
      `<p><b>Legends</b> are the great heroes of history — powerful, one-of-a-kind units who fight at the head of your armies. They are a core feature, on by default, and can be switched off when you create a game.</p>` +
        `<p>Each legend reskins a strong base unit but stands far above it: a hero carries its own combat bonus, <b>heartens nearby allies</b>, and is marked on the map by a glowing gold ring, a crown, and its own name.</p>`,
    ) +
    section(
      "Recruiting a Hero",
      `<p>Legends are summoned with <b>faith</b>. Open the <b>⭐ Legends</b> panel, spend faith, and the hero appears at one of your cities (naval heroes on the adjacent water). Your first hero costs <b>${legendCost(0)} faith</b>; each later one costs <b>${legendCost(1) - legendCost(0)}</b> more (${legendCost(0)} → ${legendCost(1)} → ${legendCost(2)} → …).</p>` +
        `<p>Every legend is <b>globally unique</b> while alive — only one civilization can field a given hero at a time.</p>`,
    ) +
    section(
      "Lifespan",
      `<p>Heroes are precious and do not last forever. After their <b>lifespan</b> (about 30 turns) elapses, a hero <b>passes into legend</b> and leaves the field. A few <b>rechargeable</b> heroes (such as Joan of Arc) return to the pool when they retire and may be recruited again.</p>`,
    ) +
    section(
      "In Battle",
      `<p>A legend is a battlefield anchor:</p>` +
        `<ul>` +
        `<li><b>Hero strength</b> — the legend itself fights with a large combat bonus on top of its base unit.</li>` +
        `<li><b>Inspiring aura</b> — adjacent friendly <i>military</i> units gain a flat combat bonus while they stand beside the hero (auras from multiple heroes do not stack — the strongest applies).</li>` +
        `<li><b>Steadfast</b> — heroes muster with very high morale, so they rarely waver or rout.</li>` +
        `</ul>`,
    ) +
    section(`The Heroes (${LEGENDS.length})`, gallery)
  );
}

function renderCities(): string {
  return (
    section(
      "Founding",
      `<p>Train or move a Settler to a desirable tile and use the Found City action. Cities claim surrounding territory and can work tiles within three rings.</p>`,
    ) +
    section(
      "Growth",
      `<p>Excess food fills the growth bucket. When it fills, the city gains a Citizen, who can be assigned to work a tile for its yields.</p>`,
    ) +
    section(
      "Production",
      `<p>Production is spent on units, buildings and infrastructure. Each city can build one item at a time; gold can rush some purchases.</p>`,
    ) +
    section(
      "Buildings",
      `<p>Buildings provide permanent bonuses: Granaries boost food, Monuments boost culture, Barracks train stronger troops, and Markets generate gold.</p>`,
    ) +
    section(
      "Territory",
      `<p>Culture expands borders over time. Controlling strategic resources and choke points is key to both economy and defense.</p>`,
    )
  );
}

function renderReligion(): string {
  return (
    section(
      "Faith",
      `<p>Faith is generated by certain buildings, beliefs and wonders. Accumulate enough faith to found a pantheon and later a full religion.</p>`,
    ) +
    section(
      "Pantheons",
      `<p>Your first faith milestone unlocks a pantheon belief, granting empire-wide bonuses such as extra food from resources or production from forests.</p>`,
    ) +
    section(
      "Founding a Religion",
      `<p>Once the required civic is available and you have enough faith, a Prophet can found a religion in one of your cities. Choose a founder belief and follower beliefs that shape your empire.</p>`,
    ) +
    section(
      "Religious Pressure",
      `<p>Religious cities exert pressure on nearby cities, converting citizens over time. Missionaries and Inquisitors can spread or defend your faith.</p>`,
    )
  );
}

function renderSpecialists(): string {
  const specRows = SPECIALIST_IDS.map((id) => {
    const d = SPECIALIST_DEFS[id];
    const unlock = d.reqTech ? escapeHtml(String(d.reqTech)) : "From start";
    return (
      `<tr>` +
      `<td><b>${escapeHtml(d.name)}</b></td>` +
      `<td><i>${escapeHtml(d.latin)}</i></td>` +
      `<td>${escapeHtml(d.discipline)}</td>` +
      `<td>${unlock}</td>` +
      `<td>${escapeHtml(d.desc)}</td>` +
      `</tr>`
    );
  }).join("");

  const wonderRows = WONDER_DEFS.map((w) => {
    const needs = Object.entries(w.requirement)
      .map(([disc, n]) => `${escapeHtml(disc)} ${n}`)
      .join(" · ");
    return (
      `<tr>` +
      `<td><b>${escapeHtml(w.name)}</b></td>` +
      `<td>${needs}</td>` +
      `<td>${escapeHtml(w.desc)}</td>` +
      `</tr>`
    );
  }).join("");

  return (
    section(
      "Craftsmen, not Workers",
      `<p>There is no Worker unit. Instead each city trains <b>specialists</b> — craftsmen — out of its own population. A citizen is either <b>working a tile</b> for its yields <i>or</i> apprenticed as a craftsman, never both, so every specialist carries a real opportunity cost.</p>` +
        `<p>Specialists <b>learn on the job</b>: each turn they contribute labour to a project they earn experience, and as they level up they build faster (a veteran works up to three times as quickly as a fresh apprentice).</p>` +
        `<div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>Specialist</th><th>Basis</th><th>Discipline</th><th>Unlock</th><th>Role</th></tr></thead><tbody>${specRows}</tbody></table></div>`,
    ) +
    section(
      "Public Works",
      `<p>Specialists execute <b>Works</b> — projects on any tile inside your territory. Economic improvements (farms, mines, quarries, lumber camps, roads, pastures, plantations and more) each come in <b>three tiers</b>; building tier 1 and upgrading to tiers 2 and 3 are separate projects, each contracting craftsmen again.</p>` +
        `<p>The labour a Work needs scales with its tier <b>and with distance from the building city</b>: developing your heartland is cheap, while pushing roads and farms out to the frontier is a serious investment. A city's craftsmen work through its project queue in order — finish one, start the next. Open the <b>🏛️ Empire</b> screen to train craftsmen and manage every city's works.</p>`,
    ) +
    section(
      "Walls, Towers & Forts",
      `<p>A <b>Mason</b> and a <b>Military Engineer</b> together raise defensive structures on a tile. <b>Walls</b> (Palisade → Stone Wall → Great Wall) block enemy movement: an enemy must destroy the wall — attacking it like a unit — before the tile can be crossed. <b>Towers</b> (Watchtower → Fort → Citadel) block movement <i>and</i> bombard an adjacent enemy each turn. Both shelter a friendly defender standing on the tile, and regenerate health while not under attack.</p>`,
    ) +
    section(
      "Wonders",
      `<p>Wonders are the grandest Works: world-unique projects needing several disciplines at once, so a host city must field a mixed crew of craftsmen — and several cities can pool their specialists to finish faster. Each grants a powerful, permanent bonus.</p>` +
        `<div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>Wonder</th><th>Requires</th><th>Effect</th></tr></thead><tbody>${wonderRows}</tbody></table></div>`,
    ) +
    renderMasterCraftsmen()
  );
}

const CRAFT_ORDER: { discipline: string; title: string }[] = [
  { discipline: "architecture", title: "Architects" },
  { discipline: "engineering", title: "Military Engineers" },
  { discipline: "masonry", title: "Masons" },
  { discipline: "survey", title: "Surveyors" },
  { discipline: "carpentry", title: "Carpenters" },
];

function renderMasterCraftsmen(): string {
  let body =
    `<p>Your craftsmen are named, where history allows, after a real master of their craft and people; where no record survives, after a master of another land or from an authentic pool of period names. The figures below are real.</p>`;
  for (const { discipline, title } of CRAFT_ORDER) {
    const people = MASTER_CRAFTSMEN.filter((m) => m.discipline === discipline);
    if (people.length === 0) continue;
    const rows = people
      .map((m) => {
        const civ = m.civId ? getCiv(m.civId)?.name ?? "" : "";
        return (
          `<tr><td><b>${escapeHtml(m.name)}</b></td>` +
          `<td>${escapeHtml(civ)}</td>` +
          `<td>${escapeHtml(m.note)}</td></tr>`
        );
      })
      .join("");
    body +=
      `<div class="wiki-table-wrap"><div class="wiki-table-title">${escapeHtml(title)}</div>` +
      `<table class="wiki-table"><thead><tr><th>Name</th><th>People</th><th>Historical note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return section("Master Craftsmen", body);
}

function renderVictory(): string {
  return (
    section(
      "Domination",
      `<p>Destroy or absorb all other human players, or control every original capital city on the map.</p>`,
    ) +
    section(
      "Score",
      `<p>If the turn limit is reached, the civilization with the highest score — based on population, cities, wonders, technology and culture — wins.</p>`,
    ) +
    section(
      "Coming Soon",
      `<p>Science, Culture, Religious and Economic victories are planned for future milestones as those systems deepen.</p>`,
    )
  );
}

const RENDERERS: Record<WikiCategory, () => string> = {
  civilizations: renderCivilizations,
  units: renderUnits,
  gameplay: renderGameplay,
  terrain: renderTerrain,
  specialists: renderSpecialists,
  combat: renderCombat,
  morale: renderMorale,
  great_people: renderGreatPeople,
  legends: renderLegends,
  cities: renderCities,
  religion: renderReligion,
  victory: renderVictory,
};

export function createWiki(): { open(): void; close(): void; toggle(): void; isOpen(): boolean } {
  let open = false;
  let category: WikiCategory = "gameplay";

  const root = document.createElement("div");
  root.id = "wiki";
  root.className = "hidden";
  root.innerHTML = `
    <div class="wiki-layout">
      <div class="wiki-sidebar">
        <div class="wiki-sidebar-top">
          <div class="wiki-title">Encyclopedia</div>
          <button class="btn wiki-close-mobile" id="wiki-close-mobile" aria-label="Close">✕</button>
        </div>
        <div class="wiki-categories" id="wiki-categories"></div>
      </div>
      <div class="wiki-main">
        <div class="wiki-header">
          <span class="wiki-header-title" id="wiki-header-title"></span>
          <button class="btn" id="wiki-close">Close</button>
        </div>
        <div class="wiki-content" id="wiki-content"></div>
      </div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #wiki{position:fixed;inset:0;z-index:60;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex}
    #wiki.hidden{display:none !important}
    .wiki-layout{display:flex;width:100%;height:100%}
    .wiki-sidebar{width:260px;flex-shrink:0;background:#15120c;border-right:1px solid var(--edge);padding:20px;overflow:auto}
    .wiki-sidebar-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .wiki-title{font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:800;color:#e8dcc5;margin-bottom:18px}
    .wiki-close-mobile{display:none}
    .wiki-categories{display:flex;flex-direction:column;gap:6px}
    .wiki-cat{padding:10px 12px;border-radius:8px;cursor:pointer;color:#b8aa8d;background:transparent;border:1px solid transparent;font:inherit;font-size:14px;text-align:left;transition:background .12s,border-color .12s,color .12s}
    .wiki-cat:hover{background:rgba(201,162,39,.08);color:#f0d878}
    .wiki-cat.active{background:rgba(201,162,39,.12);border-color:var(--edge);color:#f0d878;font-weight:700}
    .wiki-main{flex:1;display:flex;flex-direction:column;min-width:0}
    .wiki-header{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--edge);background:#15120c}
    .wiki-header-title{font-family:'Cinzel',Georgia,serif;font-size:18px;font-weight:700;color:#e8dcc5}
    .wiki-content{flex:1;padding:24px;overflow:auto}
    .wiki-section{margin-bottom:28px;max-width:900px}
    .wiki-section-title{font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:700;color:#f0d878;margin-bottom:10px}
    .wiki-section p{color:#e8dcc5;line-height:1.6;margin:8px 0}
    .wiki-section ul{color:#e8dcc5;line-height:1.6;margin:8px 0;padding-left:22px}
    .wiki-section li{margin:4px 0}
    .wiki-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .wiki-card{background:#1f1c14;border:1px solid var(--edge);border-radius:12px;padding:14px}
    .wiki-card-title{font-family:'Cinzel',Georgia,serif;font-size:16px;font-weight:700;color:#e8dcc5}
    .wiki-card-sub{color:#b8aa8d;font-size:13px;margin-top:2px}
    .wiki-card-quote{font-style:italic;color:#e8dcc5;margin-top:8px;padding-left:12px;border-left:3px solid #c9a227}
    .wiki-card-body{color:#e8dcc5;font-size:13px;line-height:1.45;margin-top:10px}
    .wiki-card-meta{color:#b8aa8d;font-size:12px;margin-top:8px}
    .wiki-table-wrap{margin-bottom:18px;max-width:900px}
    .wiki-table-title{font-family:'Cinzel',Georgia,serif;font-size:15px;font-weight:700;color:#e8dcc5;margin-bottom:6px;text-transform:capitalize}
    .wiki-table{width:100%;border-collapse:collapse;font-size:13px;color:#e8dcc5;background:#1f1c14;border:1px solid var(--edge);border-radius:10px;overflow:hidden}
    .wiki-table th,.wiki-table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--edge)}
    .wiki-table th{background:rgba(201,162,39,.12);color:#f0d878;font-weight:600}
    .wiki-table tr:last-child td{border-bottom:none}
    .wiki-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
    @media(max-width:700px){
      /* Stack into a single column: a sticky top bar with the title, a Close
         button and a horizontally-scrolling category strip, then full-width
         content. The whole overlay scrolls (the sidebar pins at the top via
         position:sticky); the desktop header (duplicate title + Close) is
         hidden. We scroll the overlay itself rather than the content pane so the
         flex column doesn't trap the content at an unconstrained height. */
      #wiki{display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}
      .wiki-layout{flex-direction:column;height:auto;min-height:100%}
      .wiki-main{flex:none;min-height:0}
      .wiki-content{flex:none;overflow:visible}
      .wiki-sidebar{width:100%;flex-shrink:0;border-right:none;border-bottom:1px solid var(--edge);
        padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));
        overflow:visible;position:sticky;top:0;z-index:2}
      .wiki-sidebar-top{margin-bottom:10px}
      .wiki-title{font-size:18px;margin-bottom:0}
      .wiki-close-mobile{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:34px;height:34px;padding:0;font-size:15px;line-height:1}
      .wiki-categories{flex-direction:row;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;scrollbar-width:none}
      .wiki-categories::-webkit-scrollbar{display:none}
      .wiki-cat{flex:0 0 auto;white-space:nowrap;padding:8px 14px;font-size:13px}
      .wiki-header{display:none}
      .wiki-content{padding:16px max(16px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
      .wiki-section-title{font-size:19px}
      .wiki-grid{grid-template-columns:1fr}
      .wiki-table{font-size:12px}
      .wiki-table th,.wiki-table td{padding:8px;white-space:nowrap}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const categoriesEl = root.querySelector<HTMLDivElement>("#wiki-categories")!;
  const titleEl = root.querySelector<HTMLSpanElement>("#wiki-header-title")!;
  const contentEl = root.querySelector<HTMLDivElement>("#wiki-content")!;

  function renderCategories(): void {
    categoriesEl.innerHTML = CATEGORIES.map(
      (c) => `<button class="wiki-cat ${c.id === category ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`,
    ).join("");
    categoriesEl.querySelectorAll<HTMLButtonElement>("[data-cat]").forEach((el) =>
      el.addEventListener("click", () => {
        category = el.dataset.cat as WikiCategory;
        render();
      }),
    );
  }

  function render(): void {
    titleEl.textContent = CATEGORIES.find((c) => c.id === category)?.name ?? "";
    contentEl.innerHTML = RENDERERS[category]();
    renderCategories();
    // Jump back to the top when switching pages. The scroll container is the
    // content pane on desktop and the whole overlay on mobile, so reset both.
    contentEl.scrollTop = 0;
    root.scrollTop = 0;
  }

  const doClose = (): void => {
    open = false;
    root.classList.add("hidden");
  };
  root.querySelector<HTMLButtonElement>("#wiki-close")!.addEventListener("click", doClose);
  root.querySelector<HTMLButtonElement>("#wiki-close-mobile")!.addEventListener("click", doClose);

  return {
    open() {
      open = true;
      root.classList.remove("hidden");
      render();
    },
    close() {
      open = false;
      root.classList.add("hidden");
    },
    toggle() {
      open = !open;
      root.classList.toggle("hidden", !open);
      if (open) render();
    },
    isOpen: () => open,
  };
}
