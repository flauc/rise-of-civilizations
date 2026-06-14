// In-game encyclopedia / wiki. Gradually expanded reference for civilizations,
// units, terrain, systems and victory conditions.

import {
  CIVILIZATIONS,
  UNIT_DEFS,
  TERRAIN_NAMES,
  TERRAIN_YIELDS,
  isWaterTerrain,
  isRough,
  terrainDefense,
  moveCost,
  isPassableLand,
  MILITARY_CLASSES,
} from "@roc/sim";
import type { TerrainType } from "@roc/sim";

export type WikiCategory =
  | "civilizations"
  | "units"
  | "gameplay"
  | "terrain"
  | "combat"
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
  { id: "combat", name: "Combat" },
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

const CLASS_ORDER = ["melee", "ranged", "cavalry", "siege", "recon", "settler", "trader"] as const;

function renderUnits(): string {
  const byClass = new Map<string, typeof UNIT_DEFS[keyof typeof UNIT_DEFS][]>();
  for (const u of Object.values(UNIT_DEFS)) {
    const arr = byClass.get(u.cls) ?? [];
    arr.push(u);
    byClass.set(u.cls, arr);
  }

  let html = "";
  for (const cls of CLASS_ORDER) {
    const units = byClass.get(cls);
    if (!units || units.length === 0) continue;
    const rows = units
      .map((u) => {
        const stats = [`Move ${u.movement}`, `Sight ${u.sight}`];
        if (MILITARY_CLASSES.has(u.cls)) {
          stats.push(`Strength ${u.strength}`);
          if (u.rangedStrength) stats.push(`Ranged ${u.rangedStrength}`);
          if (u.range) stats.push(`Range ${u.range}`);
        }
        const notes: string[] = [];
        if (u.founder) notes.push("Founds cities");
        if (u.trader) notes.push("Establishes trade routes");
        if (u.reqTech) notes.push(`Requires ${u.reqTech}`);
        if (u.abilities?.length) notes.push(u.abilities.join(", "));
        return (
          `<tr>` +
          `<td><b>${escapeHtml(u.name)}</b></td>` +
          `<td>${u.cost} prod</td>` +
          `<td>${stats.join(" · ")}</td>` +
          `<td>${notes.join(" · ")}</td>` +
          `</tr>`
        );
      })
      .join("");
    html +=
      `<div class="wiki-table-wrap">` +
      `<div class="wiki-table-title">${escapeHtml(cls[0]!.toUpperCase() + cls.slice(1))}</div>` +
      `<table class="wiki-table"><thead><tr><th>Unit</th><th>Cost</th><th>Stats</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>` +
      `</div>`;
  }
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
      `<p>Tiles provide yields when worked and modify movement and combat. Forests, jungles and hills are rough ground that slows attackers and aids defenders.</p>` +
        `<div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>Terrain</th><th>Yields</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    ) +
    section(
      "Improvements",
      `<p>Workers can build Farms (+1 food) and Mines (+1 production) on eligible tiles to boost a city's output.</p>`,
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
      `<p>Defenders on Hills, Forest or Jungle gain a combat bonus and cost extra movement to enter. Open terrain is faster to cross but offers no defensive bonus.</p>`,
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
  combat: renderCombat,
  cities: renderCities,
  religion: renderReligion,
  victory: renderVictory,
};

export function createWiki(): { open(): void; close(): void; toggle(): void } {
  let open = false;
  let category: WikiCategory = "gameplay";

  const root = document.createElement("div");
  root.id = "wiki";
  root.className = "hidden";
  root.innerHTML = `
    <div class="wiki-layout">
      <div class="wiki-sidebar">
        <div class="wiki-title">Encyclopedia</div>
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
    #wiki{position:fixed;inset:0;z-index:60;background:rgba(8,16,24,.92);backdrop-filter:blur(4px);display:flex}
    #wiki.hidden{display:none !important}
    .wiki-layout{display:flex;width:100%;height:100%}
    .wiki-sidebar{width:260px;flex-shrink:0;background:#0d1b27;border-right:1px solid var(--edge);padding:20px;overflow:auto}
    .wiki-title{font-size:20px;font-weight:800;color:#fff;margin-bottom:18px}
    .wiki-categories{display:flex;flex-direction:column;gap:6px}
    .wiki-cat{padding:10px 12px;border-radius:8px;cursor:pointer;color:#b8d4ec;background:transparent;border:1px solid transparent;font:inherit;font-size:14px;text-align:left;transition:background .12s,border-color .12s}
    .wiki-cat:hover{background:rgba(255,255,255,.06)}
    .wiki-cat.active{background:#213a52;border-color:var(--edge);color:#fff;font-weight:700}
    .wiki-main{flex:1;display:flex;flex-direction:column;min-width:0}
    .wiki-header{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--edge);background:#0d1b27}
    .wiki-header-title{font-size:18px;font-weight:700;color:#fff}
    .wiki-content{flex:1;padding:24px;overflow:auto}
    .wiki-section{margin-bottom:28px;max-width:900px}
    .wiki-section-title{font-size:22px;font-weight:700;color:#ffd967;margin-bottom:10px}
    .wiki-section p{color:#cfe3f7;line-height:1.6;margin:8px 0}
    .wiki-section ul{color:#cfe3f7;line-height:1.6;margin:8px 0;padding-left:22px}
    .wiki-section li{margin:4px 0}
    .wiki-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .wiki-card{background:#14283b;border:1px solid var(--edge);border-radius:12px;padding:14px}
    .wiki-card-title{font-size:16px;font-weight:700;color:#fff}
    .wiki-card-sub{color:#9fc0dc;font-size:13px;margin-top:2px}
    .wiki-card-quote{font-style:italic;color:#e8f4ff;margin-top:8px;padding-left:12px;border-left:3px solid #5a8ab8}
    .wiki-card-body{color:#cfe3f7;font-size:13px;line-height:1.45;margin-top:10px}
    .wiki-card-meta{color:#9fc0dc;font-size:12px;margin-top:8px}
    .wiki-table-wrap{margin-bottom:18px;max-width:900px}
    .wiki-table-title{font-size:15px;font-weight:700;color:#fff;margin-bottom:6px;text-transform:capitalize}
    .wiki-table{width:100%;border-collapse:collapse;font-size:13px;color:#cfe3f7;background:#14283b;border:1px solid var(--edge);border-radius:10px;overflow:hidden}
    .wiki-table th,.wiki-table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--edge)}
    .wiki-table th{background:#1a3a52;color:#fff;font-weight:600}
    .wiki-table tr:last-child td{border-bottom:none}
    @media(max-width:700px){
      .wiki-sidebar{width:180px}
      .wiki-grid{grid-template-columns:1fr}
      .wiki-table{font-size:12px}
      .wiki-table th,.wiki-table td{padding:8px}
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
  }

  root.querySelector<HTMLButtonElement>("#wiki-close")!.addEventListener("click", () => {
    open = false;
    root.classList.add("hidden");
  });

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
  };
}
