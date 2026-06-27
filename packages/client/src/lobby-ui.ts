// Pre-game menu: a proper start screen with navigable sub-screens for
// single-player setup, multiplayer lobby, and loading saved games.

import { ASSET_BASE_URL } from "./asset-base";
import { LocalSession, OnlineSession, MAP_DIMENSIONS, type MapSize, type Session } from "./session";
import { createWiki } from "./wiki";
import { createRoadmap } from "./roadmap";
import { createCredits } from "./credits";
import { createChangelog, CURRENT_VERSION } from "./changelog";
import {
  CIVILIZATIONS,
  PLAYER_COLORS,
  UNIT_DEFS,
  type GameSummary,
  type LobbyRoom,
  type MapType,
  type SerializedState,
  type ServerMessage,
  type UnitTypeId,
} from "@roc/sim";
import { startingUnitsFor, capitalPopulationBonusFor } from "@roc/data";
import { uniqueUnitFor, uniqueUnitBlockHtml, leaderAbilityBlockHtml, uniqueInfraBlockHtml, wireUuImages, wireUuDetail } from "./unique-unit";
import { deleteSave, exportSave, importSave, listSaves, loadSave, type SaveRecord } from "./save-db";
import { loadLeaderAtlas, isImageReady } from "./leader-assets";
import type { GameSetup } from "./analytics";

const DEFAULT_WS_SCHEME = location.protocol === "https:" ? "wss" : "ws";
const DEFAULT_WS =
  import.meta.env.VITE_WS_URL?.trim() || `${DEFAULT_WS_SCHEME}://${location.hostname || "localhost"}:3001/ws`;

/** Civilizations sorted alphabetically by display name for the setup UI. */
const CIVS_BY_NAME = [...CIVILIZATIONS].sort((a, b) => a.name.localeCompare(b.name));

/** Base population every city is founded with (the capital may start larger). */
const BASE_FOUNDING_POP = 2;

/** Human-readable summary of a civ's starting army (e.g. "2× Warrior, 1× Scout"). */
function startingUnitsSummary(civId: string): string {
  const counts = new Map<string, number>();
  for (const u of startingUnitsFor(civId)) counts.set(u, (counts.get(u) ?? 0) + 1);
  return [...counts]
    .map(([id, n]) => `${n}× ${UNIT_DEFS[id as UnitTypeId]?.name ?? id}`)
    .join(", ");
}

/** Population the civ's capital is founded at (base + capital bonus). */
function capitalStartPop(civId: string): number {
  return BASE_FOUNDING_POP + capitalPopulationBonusFor(civId);
}

/** One-line starting conditions for a civ: capital population + free starting units. */
function startingConditionsLine(civId: string): string {
  return `🏙️ Capital starts at population ${capitalStartPop(civId)} · ⚔️ ${startingUnitsSummary(civId)}`;
}

type Screen = "start" | "sp" | "mp" | "load";

type BarbLevel = "none" | "minimal" | "low" | "normal" | "high";
type StartingGold = "tight" | "balanced" | "generous";

/** Map layout presets, in menu order, each with a short explanation. */
const MAP_TYPE_OPTIONS: { value: MapType; label: string; desc: string }[] = [
  { value: "continents", label: "Continents", desc: "A balanced spread of landmasses separated by sea — the classic default." },
  { value: "pangaea", label: "One Big Continent", desc: "A single supercontinent: everyone shares one landmass with little ocean between." },
  { value: "two_continents", label: "Two Continents", desc: "Two major landmasses divided by open ocean." },
  { value: "three_continents", label: "Three Continents", desc: "Three landmasses scattered across the sea." },
  { value: "archipelago", label: "Archipelago", desc: "Many medium islands — exploration and naval play matter more." },
  { value: "inland_sea", label: "Inland Sea", desc: "A ring of land wrapped around a central sea." },
  { value: "islands", label: "Islands", desc: "Lots of small, scattered islands across a wide ocean." },
  { value: "realworld", label: "Real World (Earth)", desc: "The continents of Earth, baked from real-world geodata." },
];

/** Starting-treasury presets, shown as chips with explanatory tooltips. */
const GOLD_OPTIONS: { value: StartingGold; label: string; desc: string }[] = [
  { value: "tight", label: "Tight", desc: "A smaller buffer — be careful about extra units early." },
  { value: "balanced", label: "Balanced", desc: "Enough to cover a modest army while your first economy comes online." },
  { value: "generous", label: "Generous", desc: "A comfortable cushion for several units or early barbarian bribes." },
];

/** Turn-limit presets for the score victory. `0` = unlimited (no turn cap). */
const TURN_LIMIT_OPTIONS: { value: number; label: string }[] = [
  { value: 120, label: "120 turns" },
  { value: 150, label: "150 turns" },
  { value: 200, label: "200 turns" },
  { value: 250, label: "250 turns" },
  { value: 300, label: "300 turns" },
  { value: 0, label: "Unlimited" },
];

const DEFAULT_TURN_LIMIT = 120;

/** "random" = let the sim assign a random unique civ when the game starts. */
const RANDOM_CIV = "random";

/** One AI opponent's configuration in the setup roster. */
interface AiConfig {
  civId: string | typeof RANDOM_CIV;
  color: string;
}

const MAX_AI = 12;

interface MenuState {
  screen: Screen;
  sp: {
    civId: string;
    color: string;
    mapSize: MapSize;
    mapType: MapType;
    ais: AiConfig[];
    barbarians: BarbLevel;
    naturalWonders: boolean;
    legends: boolean;
    startingGold: StartingGold;
    turnLimit: number;
  };
  mp: {
    url: string;
    handle: string;
    password: string;
    capacity: number;
    mapType: MapType;
    /** Color per human slot (length tracks capacity). */
    humanColors: string[];
    ais: AiConfig[];
    userId: string;
    naturalWonders: boolean;
    startingGold: StartingGold;
  };
}

/** First palette color not already taken (falls back to gray if exhausted). */
function firstFreeColor(used: Set<string>): string {
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? "#aaaaaa";
}

/**
 * Civ <option> list, optionally led by a "Random" entry for AI slots. Civs in
 * `taken` (chosen by another player) are disabled so no two players can share one;
 * the slot's own current selection is always selectable.
 */
function civOptions(selected: string, includeRandom: boolean, taken: Set<string>): string {
  const opts = includeRandom
    ? [`<option value="${RANDOM_CIV}"${selected === RANDOM_CIV ? " selected" : ""}>🎲 Random civilization</option>`]
    : [];
  for (const c of CIVS_BY_NAME) {
    const isTaken = taken.has(c.id) && c.id !== selected;
    opts.push(
      `<option value="${c.id}"${c.id === selected ? " selected" : ""}${isTaken ? " disabled" : ""}>${escapeHtml(c.name)} — ${escapeHtml(c.leader)}${isTaken ? " (taken)" : ""}</option>`,
    );
  }
  return opts.join("");
}

/** A compact color dropdown; colors used by other players are disabled. The
 * control itself is tinted to the chosen color so the pick is visible at a glance. */
function colorSelect(current: string, takenByOthers: Set<string>): string {
  const opts = PLAYER_COLORS.map((c, i) => {
    const taken = takenByOthers.has(c) && c !== current;
    return `<option value="${c}"${c === current ? " selected" : ""}${taken ? " disabled" : ""} style="background:${c};color:#0f0e0b">Color ${i + 1}${taken ? " (taken)" : ""}</option>`;
  }).join("");
  return `<select class="menu-in cp-sel" style="background:${current};color:#0f0e0b;font-weight:700" title="Player color">${opts}</select>`;
}

function mapSelect(id: string, value: MapSize): string {
  const sizes: { value: MapSize; label: string }[] = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
    { value: "huge", label: "Huge" },
    { value: "giant", label: "Giant" },
  ];
  return `<select id="${id}" class="menu-in">${sizes
    .map((s) => `<option value="${s.value}"${s.value === value ? " selected" : ""}>${s.label}</option>`)
    .join("")}</select>`;
}

function barbarianSelect(id: string, value: string): string {
  const opts = [
    { value: "none", label: "None" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
  ];
  return `<select id="${id}" class="menu-in">${opts
    .map((o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${o.label}</option>`)
    .join("")}</select>`;
}

/** Turn-limit dropdown for the score victory (Unlimited = no cap). */
function turnLimitSelect(id: string, value: number): string {
  return `<select id="${id}" class="menu-in">${TURN_LIMIT_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
  ).join("")}</select>`;
}

/** Human-readable turn-limit label for read-only displays. */
function turnLimitLabel(value: number): string {
  return TURN_LIMIT_OPTIONS.find((o) => o.value === value)?.label ?? `${value} turns`;
}

/** A simple On/Off dropdown for a boolean game option. */
function onOffSelect(id: string, value: boolean): string {
  const opts = [
    { value: "off", label: "Off" },
    { value: "on", label: "On" },
  ];
  const current = value ? "on" : "off";
  return `<select id="${id}" class="menu-in">${opts
    .map((o) => `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`)
    .join("")}</select>`;
}

function mapTypeSelect(id: string, value: MapType): string {
  return `<select id="${id}" class="menu-in">${MAP_TYPE_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
  ).join("")}</select>`;
}

/** Starting-treasury chips: a compact, aligned row of options with tooltips. */
function goldChips(id: string, value: StartingGold): string {
  return `<div class="chips" id="${id}">${GOLD_OPTIONS.map(
    (o) =>
      `<button type="button" class="chip${o.value === value ? " sel" : ""}" data-gold="${o.value}" title="${escapeHtml(o.desc)}">${escapeHtml(o.label)}</button>`,
  ).join("")}</div>`;
}

function capacitySelect(id: string, value: number): string {
  return `<select id="${id}" class="menu-in">${Array.from({ length: 12 }, (_, n) => n + 1)
    .map((n) => `<option value="${n}"${n === value ? " selected" : ""}>${n}</option>`)
    .join("")}</select>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The unique-unit block + detail dialog live in ./unique-unit so the lobby and
// the in-game wiki Civilizations page render the exact same thing.

export function createLobby(onStart: (session: Session, setup?: GameSetup) => void): void {
  const state: MenuState = {
    screen: "start",
    sp: {
      civId: CIVS_BY_NAME[0]!.id,
      color: PLAYER_COLORS[0]!,
      mapSize: "medium",
      mapType: "continents",
      ais: [{ civId: RANDOM_CIV, color: PLAYER_COLORS[1]! }],
      barbarians: "normal",
      naturalWonders: true,
      legends: true,
      startingGold: "balanced",
      turnLimit: DEFAULT_TURN_LIMIT,
    },
    mp: {
      url: DEFAULT_WS,
      handle: "",
      password: "",
      capacity: 2,
      mapType: "continents",
      humanColors: [PLAYER_COLORS[0]!, PLAYER_COLORS[1]!],
      ais: [],
      userId: "",
      naturalWonders: true,
      startingGold: "balanced",
    },
  };

  const leaderAtlas = loadLeaderAtlas();

  const wiki = createWiki();
  const roadmap = createRoadmap();
  const credits = createCredits();
  const changelog = createChangelog();

  const root = document.createElement("div");
  root.id = "lobby";
  root.innerHTML = `
    <div class="lobby-layout" id="lobby-layout">
      <div class="lobby-left" id="lobby-left"></div>
      <div class="lobby-right" id="lobby-right"></div>
    </div>
    <div class="mp-screen hidden" id="mp-screen"></div>`;

  const style = document.createElement("style");
  style.textContent = `
    #lobby{position:fixed;inset:0;z-index:50;background:#0f0e0b}
    .lobby-layout{display:flex;height:100%;width:100%}
    .lobby-left{width:380px;max-width:92vw;flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#1f1c14 0%,#15120c 100%);border-right:1px solid var(--edge);padding:28px;overflow:auto;box-shadow:4px 0 24px rgba(0,0,0,.55)}
    .lobby-right{flex:1;position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:48px 56px;background:radial-gradient(circle at 70% 30%,rgba(201,162,39,0.14) 0%,#0f0e0b 60%);overflow:hidden}
    .lobby-right::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,14,11,0) 0%,rgba(15,14,11,.78) 100%);pointer-events:none}
    .lobby-title{font-family:'Cinzel',Georgia,serif;font-size:28px;font-weight:800;color:#e8dcc5;letter-spacing:.5px;margin-bottom:4px}
    .lobby-subtitle{color:#b8aa8d;font-size:13px;margin-bottom:24px}
    .lobby-version{margin-top:auto;color:#b8aa8d;font:inherit;font-size:12px;text-align:center;padding:18px 0 0;background:none;border:none;cursor:pointer;transition:color .12s}
    .lobby-version:hover{color:#f0d878}
    .menu-actions{display:flex;flex-direction:column;gap:10px;margin-top:8px}
    .menu-btn{width:100%;padding:12px 14px;font:inherit;font-size:15px;font-weight:700;color:#e8dcc5;background:rgba(201,162,39,0.08);border:1px solid var(--edge);border-radius:999px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:background .12s,border-color .12s,color .12s,box-shadow .12s}
    .menu-btn:hover{background:rgba(201,162,39,0.18);border-color:#c9a227;color:#f0d878;box-shadow:0 0 16px rgba(201,162,39,.2)}
    .menu-btn.primary{background:linear-gradient(135deg,#c9a227,#a6821f);border-color:transparent;color:#15120c}
    .menu-btn.primary:hover{background:linear-gradient(135deg,#f0d878,#c9a227);color:#0f0e0b}
    .menu-btn.secondary{background:transparent;border-color:rgba(201,162,39,.35);color:#b8aa8d}
    .menu-btn.secondary:hover{background:rgba(201,162,39,.08);border-color:#c9a227;color:#f0d878}
    .menu-btn .icon{width:22px;text-align:center;opacity:.9}
    .menu-section{margin-top:18px}
    .menu-section-title{font-family:'Cinzel',Georgia,serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#c9a227;margin-bottom:8px}
    .menu-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px}
    .menu-row>span{white-space:nowrap;color:#e8dcc5}
    .menu-row>.menu-in{flex:1;max-width:200px}
    .menu-in{font:inherit;font-size:13px;color:#e8dcc5;background:#1f1c14;border:1px solid var(--edge);border-radius:8px;padding:8px 10px;width:100%}
    .menu-in:focus{outline:none;border-color:#c9a227}
    .menu-hint{color:#b8aa8d;font-size:12px;margin-top:6px;line-height:1.4}
    .menu-field{display:flex;flex-direction:column;gap:8px;margin-top:8px}
    .menu-field>span{color:#e8dcc5}
    .chips{display:flex;gap:6px;flex-wrap:wrap}
    .chip{font:inherit;font-size:12px;color:#b8aa8d;background:#1f1c14;border:1px solid var(--edge);border-radius:999px;padding:6px 12px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,color .12s}
    .chip:hover{border-color:#c9a227;color:#f0d878}
    .chip.sel{background:linear-gradient(135deg,#c9a227,#a6821f);border-color:transparent;color:#15120c;font-weight:700}
    .menu-status{color:#f0d878;margin-top:10px;min-height:20px;font-size:13px}
    .menu-back-row{display:flex;gap:10px;margin-top:18px}
    .menu-back-row .menu-btn{width:auto;flex:1}
    .roster-row{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--edge);border-radius:10px;background:#1f1c14;margin-top:8px}
    .roster-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .roster-head .roster-civ{flex:1;min-width:0}
    .roster-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#b8aa8d;background:rgba(201,162,39,.08);border-radius:6px;padding:3px 7px;white-space:nowrap}
    .roster-tag.you{color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f)}
    .roster-note{font-size:12px;color:#b8aa8d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .roster-remove{flex-shrink:0;width:28px;height:28px;border-radius:8px;border:1px solid var(--edge);background:transparent;color:#e0907d;cursor:pointer;font-size:13px;line-height:1}
    .roster-remove:hover{background:rgba(138,44,44,.18);border-color:rgba(138,44,44,.4);color:#e0a69a}
    .roster-add{margin-top:10px}
    .cp-sel{flex:0 0 auto;width:96px}
    .save-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .save-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;border:1px solid var(--edge);border-radius:10px;background:#1f1c14;cursor:pointer;transition:background .12s,border-color .12s}
    .save-row:hover{background:#29251b;border-color:#c9a227}
    .save-row .info{min-width:0}
    .save-row .name{font-weight:600;color:#e8dcc5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .save-row .meta{color:#b8aa8d;font-size:11.5px;margin-top:2px}
    .save-row .actions{display:flex;gap:6px;flex-shrink:0}
    .save-menu{position:relative;width:32px;height:32px;border-radius:8px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:15px;line-height:1;pointer-events:auto;flex-shrink:0;transition:background .12s,border-color .12s}
    .save-menu:hover{background:rgba(201,162,39,.12);border-color:#c9a227}
    .save-dropdown{display:none;position:absolute;top:calc(100% + 4px);right:0;min-width:140px;background:#1f1c14;border:1px solid var(--edge);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.55);z-index:10;overflow:hidden}
    .save-dropdown.open{display:block}
    .save-dropdown-item{width:100%;padding:9px 12px;text-align:left;font:inherit;font-size:13px;color:#e8dcc5;background:transparent;border:none;cursor:pointer;white-space:nowrap}
    .save-dropdown-item:hover{background:rgba(201,162,39,.12);color:#f0d878}
    .save-dropdown-item.delete{color:#e0907d}
    .save-dropdown-item.delete:hover{background:rgba(138,44,44,.18);color:#e0a69a}
    .hidden{display:none !important}
    .showcase{position:relative;z-index:1;max-width:720px}
    .showcase-label{font-family:'Cinzel',Georgia,serif;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c9a227;margin-bottom:10px;opacity:.85}
    .showcase-civ{font-family:'Cinzel',Georgia,serif;font-size:52px;font-weight:900;color:#e8dcc5;line-height:1.05;text-shadow:0 4px 24px rgba(0,0,0,.55)}
    .showcase-leader{font-family:'Cinzel',Georgia,serif;font-size:22px;color:#f0d878;margin-top:8px;font-weight:600}
    .showcase-quote{font-size:20px;color:#e8dcc5;line-height:1.5;margin-top:22px;font-style:italic;max-width:640px;text-shadow:0 2px 12px rgba(0,0,0,.5)}
    .showcase-quote::before{content:"“";margin-right:4px;opacity:.7}
    .showcase-quote::after{content:"”";margin-left:4px;opacity:.7}
    .showcase-ability{margin-top:26px;background:rgba(31,28,20,.78);border:1px solid rgba(201,162,39,.25);border-radius:12px;padding:16px 18px;backdrop-filter:blur(10px)}
    .showcase-ability-name{font-family:'Cinzel',Georgia,serif;font-size:15px;font-weight:700;color:#f0d878;margin-bottom:4px}
    .showcase-ability-desc{font-size:13px;color:#e8dcc5;line-height:1.4}
    .showcase-uniques{margin-top:10px;font-size:12px;color:#b8aa8d}
    .showcase-art-wrapper{position:absolute;top:48px;right:56px;width:260px;height:320px;border-radius:16px;overflow:hidden;z-index:1;box-shadow:0 8px 32px rgba(0,0,0,.55);border:1px solid rgba(201,162,39,.25)}
    .showcase-art{width:100%;height:100%;object-fit:cover;display:block;border-radius:16px}
    .showcase-art-placeholder{position:absolute;inset:0;border:2px dashed rgba(201,162,39,.2);border-radius:16px;display:flex;align-items:center;justify-content:center;color:#b8aa8d;font-size:13px;text-align:center;background:rgba(201,162,39,.05)}
    .showcase-reroll{position:absolute;top:48px;right:56px;z-index:2;margin-top:338px;width:260px}
    /* Unique-unit block — shared by the showcase and the civ picker. Clickable
       (a button) to open the expanded ability detail; no ability text inline. */
    .uu-block{display:block;width:100%;margin-top:12px;padding:10px 12px;background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.2);border-radius:10px;text-align:left;font:inherit;color:inherit}
    .uu-clickable{cursor:pointer;transition:background .12s,border-color .12s}
    .uu-clickable:hover{background:rgba(201,162,39,.12);border-color:#c9a227}
    .uu-clickable:focus-visible{outline:2px solid #c9a227;outline-offset:2px}
    .uu-top{display:flex;align-items:center;gap:12px}
    .uu-icon{flex:0 0 auto;width:44px;height:44px;border-radius:8px;background:rgba(0,0,0,.25);border:1px solid var(--edge);display:flex;align-items:center;justify-content:center;overflow:hidden}
    .uu-icon img{width:100%;height:100%;object-fit:contain}
    .uu-info{min-width:0;flex:1}
    .uu-name{font-family:'Cinzel',Georgia,serif;font-size:14px;font-weight:700;color:#f0d878}
    .uu-meta{font-size:12px;color:#b8aa8d;margin-top:2px}
    .uu-caret{flex:0 0 auto;color:#c9a227;font-size:20px;line-height:1}
    .uu-hint{font-size:11px;color:#c9a227;margin-top:7px;text-transform:uppercase;letter-spacing:.04em}
    /* Leader-ability block — the civ's active, cooldown-gated power (shared by the
       lobby showcase, civ picker, and the in-game wiki). */
    .la-block{margin-top:12px;padding:10px 12px;background:rgba(110,86,201,.08);border:1px solid rgba(150,128,224,.28);border-radius:10px}
    .la-top{display:flex;align-items:center;gap:10px}
    .la-glyph{flex:0 0 auto;width:30px;height:30px;border-radius:8px;background:rgba(150,128,224,.16);border:1px solid rgba(150,128,224,.3);display:flex;align-items:center;justify-content:center;color:#c9b8f0;font-size:15px}
    .la-info{min-width:0;flex:1}
    .la-name{font-family:'Cinzel',Georgia,serif;font-size:14px;font-weight:700;color:#cbbcf2}
    .la-tag{font-size:11px;color:#9a8fb8;text-transform:uppercase;letter-spacing:.04em;margin-top:1px}
    .la-desc{font-size:12.5px;color:#e8dcc5;line-height:1.45;margin-top:8px}
    .la-foot{font-size:11px;color:#9a8fb8;margin-top:7px}
    .la-foot b{color:#cbbcf2}
    /* Expanded unique-unit detail dialog */
    .uud-overlay{position:fixed;inset:0;z-index:80;background:rgba(8,7,5,.8);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
    .uud-modal{position:relative;width:min(560px,100%);max-height:88%;overflow:auto;background:linear-gradient(180deg,#1f1c14,#15120c);border:1px solid var(--edge);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.6);padding:22px}
    .uud-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:8px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:15px;z-index:1}
    .uud-close:hover{background:rgba(201,162,39,.12);border-color:#c9a227}
    .uud-head{display:flex;gap:16px;align-items:flex-start}
    .uud-img{flex:0 0 auto;width:120px;height:120px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);border:1px solid var(--edge);border-radius:12px;overflow:hidden}
    .uud-img img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.45))}
    .uud-headinfo{min-width:0;flex:1}
    .uud-title{font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:800;color:#e8dcc5;padding-right:36px}
    .uud-subtitle{color:#b8aa8d;font-size:12.5px;margin-top:3px}
    .uud-stats{display:flex;flex-wrap:wrap;gap:6px 8px;margin-top:12px}
    .uud-stat{display:flex;align-items:center;gap:6px;font-size:12px;color:#b8aa8d;background:rgba(201,162,39,.08);border:1px solid var(--edge);border-radius:8px;padding:5px 9px}
    .uud-stat b{color:#e8dcc5}
    .uud-plus{color:#7fd08a;font-weight:700}
    .uud-section{margin-top:18px}
    .uud-section-title{font-family:'Cinzel',Georgia,serif;font-size:13px;font-weight:700;color:#f0d878;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;border-bottom:1px solid var(--edge);padding-bottom:6px}
    .uud-compare{margin:0;padding-left:20px;color:#e8dcc5;line-height:1.6;font-size:13px}
    .uud-compare li{margin:3px 0}
    .uud-ability{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .uud-ability:last-child{border-bottom:none}
    .uud-ability-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .uud-ability-glyph{font-size:15px}
    .uud-ability-head b{color:#e6d2b8;font-size:14px}
    .uud-ability-kind{font-size:11px;color:#b8aa8d;text-transform:uppercase;letter-spacing:.03em}
    .uud-badge{font-size:10px;font-weight:700;color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f);border-radius:999px;padding:2px 7px;text-transform:uppercase;letter-spacing:.04em}
    .uud-ability-desc{color:#cdbfa6;font-size:12.5px;line-height:1.5;margin-top:4px}
    /* Roster civ-picker trigger button (replaces the human civ <select>) */
    .civ-pick-btn{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;cursor:pointer;background:#1f1c14}
    .civ-pick-btn:hover{border-color:#c9a227}
    .civ-pick-btn .cpb-text{display:flex;flex-direction:column;min-width:0;flex:1}
    .civ-pick-btn .cpb-name{font-weight:700;color:#e8dcc5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .civ-pick-btn .cpb-leader{font-size:11.5px;color:#b8aa8d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .civ-pick-btn .cpb-caret{flex:0 0 auto;color:#c9a227;font-size:18px;line-height:1}
    .roster-uu{font-size:12px;color:#b8aa8d;margin-top:2px}
    .roster-uu b{color:#e8dcc5}
    /* Civilization picker dialog */
    .civ-picker-overlay{position:fixed;inset:0;z-index:70;background:rgba(8,7,5,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
    .civ-picker{display:flex;flex-direction:column;width:min(920px,100%);height:min(660px,100%);background:linear-gradient(180deg,#1f1c14,#15120c);border:1px solid var(--edge);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.6);overflow:hidden}
    .cp-header{flex:none;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--edge)}
    .cp-title{font-family:'Cinzel',Georgia,serif;font-size:20px;font-weight:800;color:#e8dcc5}
    .cp-close{width:34px;height:34px;border-radius:8px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:15px}
    .cp-close:hover{background:rgba(201,162,39,.12);border-color:#c9a227}
    .cp-body{flex:1;display:flex;min-height:0}
    .cp-list{width:300px;flex:none;overflow-y:auto;border-right:1px solid var(--edge);padding:10px;display:flex;flex-direction:column;gap:4px}
    .cp-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:9px 12px;border:1px solid transparent;border-radius:10px;background:transparent;color:#e8dcc5;cursor:pointer;font:inherit}
    .cp-item:hover{background:rgba(201,162,39,.08)}
    .cp-item.sel{background:rgba(201,162,39,.16);border-color:#c9a227}
    .cp-item:disabled{opacity:.4;cursor:not-allowed}
    .cp-item-name{font-weight:700;font-size:14px}
    .cp-item-leader{font-size:12px;color:#b8aa8d}
    .cp-detail{flex:1;overflow-y:auto;padding:22px 24px}
    .cp-detail-top{display:flex;gap:18px}
    .cp-portrait{position:relative;flex:0 0 auto;width:170px;height:212px;border-radius:14px;overflow:hidden;border:1px solid var(--edge);background:var(--bg-card)}
    .cp-portrait-img{width:100%;height:100%;object-fit:cover;display:block}
    .cp-portrait-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#b8aa8d;font-size:12px;border:2px dashed rgba(201,162,39,.2);border-radius:14px}
    .cp-headings{min-width:0;flex:1}
    .cp-civ{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:900;color:#e8dcc5;line-height:1.1}
    .cp-leader{font-family:'Cinzel',Georgia,serif;font-size:17px;color:#f0d878;margin-top:6px;font-weight:600}
    .cp-quote{font-size:14px;color:#e8dcc5;line-height:1.5;margin-top:12px;font-style:italic}
    .cp-quote::before{content:"“";opacity:.7}.cp-quote::after{content:"”";opacity:.7}
    .cp-ability{margin-top:18px;background:rgba(31,28,20,.6);border:1px solid rgba(201,162,39,.25);border-radius:12px;padding:14px 16px}
    .cp-ability-name{font-family:'Cinzel',Georgia,serif;font-size:14px;font-weight:700;color:#f0d878;margin-bottom:4px}
    .cp-ability-desc{font-size:13px;color:#e8dcc5;line-height:1.45}
    .cp-infra{margin-top:12px;font-size:13px;color:#b8aa8d}.cp-infra b{color:#e8dcc5}
    .cp-footer{flex:none;display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--edge)}
    @media(max-width:860px){
      .civ-picker-overlay{padding:0}
      .civ-picker{width:100%;height:100%;max-width:none;border-radius:0;border:none}
      .cp-body{flex-direction:column}
      .cp-detail{flex:none;order:-1;max-height:48vh;border-bottom:1px solid var(--edge)}
      .cp-list{width:100%;flex:1;border-right:none}
      .cp-portrait{width:110px;height:138px}
      .cp-civ{font-size:24px}
      .cp-quote{display:none}
      .uud-overlay{padding:0}
      .uud-modal{width:100%;height:100%;max-height:100%;border-radius:0;border:none;
        padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
      .uud-img{width:96px;height:96px}
      .uud-title{font-size:19px}
    }
    @media(max-width:860px){
      #lobby{overflow-x:hidden;overflow-y:auto}
      .lobby-layout{flex-direction:column;height:auto;min-height:100%;width:100%;max-width:100%}
      .lobby-left{width:100%;max-width:100%;border-right:none;padding:max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));overflow:visible}
      .lobby-right{position:relative;flex:none;width:100%;max-width:100%;padding:24px max(20px, env(safe-area-inset-right)) 24px max(20px, env(safe-area-inset-left));justify-content:flex-start;overflow:visible;background:radial-gradient(circle at 50% 0%,rgba(201,162,39,0.12) 0%,#0f0e0b 70%)}
      .showcase{max-width:none}
      .showcase-art-wrapper{position:static;width:100%;max-width:260px;height:auto;margin:0 auto 16px;border-radius:14px}
      .showcase-art{height:auto;border-radius:14px}
      .showcase-civ{font-size:34px}
      .showcase-leader{font-size:20px}
      .showcase-quote{font-size:16px;margin-top:14px}
      .showcase-ability{margin-top:18px;padding:14px}
      .showcase-reroll{display:none}
      #sp-civ-desc{display:none}
      .menu-btn{padding:14px 16px}
      .menu-in{padding:10px 12px}
      /* Start screen: menu front-and-center, flavour showcase tucked below it */
      #lobby[data-screen="start"] .lobby-layout{min-height:100dvh;justify-content:center}
      #lobby[data-screen="start"] .lobby-left{align-items:center;text-align:center}
      #lobby[data-screen="start"] .lobby-title,#lobby[data-screen="start"] .lobby-subtitle{width:100%}
      #lobby[data-screen="start"] .menu-actions{width:100%;max-width:360px}
      #lobby[data-screen="start"] .lobby-right{order:2;padding-top:8px}
      /* Single player: the civ picker covers leader previews, so the featured-civ
         panel is dead weight on a phone — hide it and let the form fill the view. */
      #lobby[data-screen="sp"] .lobby-right{display:none}
    }
    /* ---- Multiplayer: a full-screen, multi-stage flow (no sidebar) ---- */
    .mp-screen{position:absolute;inset:0;overflow:auto;background:linear-gradient(180deg,#15120c 0%,#0f0e0b 100%)}
    .mp-screen::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 75% 12%,rgba(201,162,39,0.14) 0%,rgba(15,14,11,0) 55%);pointer-events:none}
    .mp-shell{position:relative;z-index:1;width:100%;max-width:1100px;margin:0 auto;padding:28px 28px 56px;box-sizing:border-box}
    .mp-topbar{display:flex;align-items:center;gap:16px;margin-bottom:26px;flex-wrap:wrap}
    .mp-brand{font-family:'Cinzel',Georgia,serif;font-size:24px;font-weight:800;color:#e8dcc5;letter-spacing:.5px}
    .mp-brand small{display:block;font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#b8aa8d;margin-top:3px}
    .mp-who{margin-left:auto;display:flex;align-items:center;gap:10px;color:#b8aa8d;font-size:13px}
    .mp-who b{color:#e8dcc5}
    .mp-steps{display:flex;align-items:center;gap:10px;margin:0 0 24px}
    .mp-step{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6f6450}
    .mp-step .dot{width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;border:1px solid var(--edge);background:#1f1c14;font-size:11px}
    .mp-step.active{color:#f0d878}
    .mp-step.active .dot{border-color:#c9a227;background:linear-gradient(135deg,#c9a227,#a6821f);color:#15120c}
    .mp-step.done{color:#9bbf86}
    .mp-step.done .dot{border-color:#7fa86a;color:#9bbf86}
    .mp-step-sep{flex:0 0 28px;height:1px;background:var(--edge)}
    .mp-panel{background:linear-gradient(180deg,rgba(31,28,20,.9),rgba(21,18,12,.9));border:1px solid var(--edge);border-radius:16px;padding:22px 24px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
    .mp-panel+.mp-panel{margin-top:18px}
    .mp-panel-title{font-family:'Cinzel',Georgia,serif;font-size:14px;font-weight:700;color:#f0d878;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;display:flex;align-items:center;gap:9px}
    .mp-panel-title .count{margin-left:auto;font-size:12px;color:#b8aa8d;letter-spacing:.04em}
    /* Auth */
    .mp-auth-wrap{display:flex;justify-content:center;padding-top:10px}
    .mp-auth-card{width:min(440px,100%)}
    .mp-auth-heading{font-family:'Cinzel',Georgia,serif;font-size:20px;font-weight:800;color:#e8dcc5;text-align:center;margin-bottom:4px}
    .mp-auth-actions{display:flex;justify-content:center;gap:12px;margin-top:20px}
    .mp-auth-actions .menu-btn{width:auto;min-width:140px}
    .mp-auth-switch{text-align:center;margin-top:14px;color:#b8aa8d;font-size:13px}
    .mp-link{background:none;border:none;color:#f0d878;font:inherit;font-weight:700;cursor:pointer;padding:0;text-decoration:underline}
    .mp-link:hover{color:#fbe9a8}
    .mp-field{margin-top:14px}
    .mp-field>label{display:block;font-size:12px;color:#b8aa8d;margin-bottom:6px}
    .mp-advanced{margin-top:16px;border-top:1px solid var(--edge);padding-top:12px}
    .mp-advanced summary{cursor:pointer;color:#b8aa8d;font-size:12px;list-style:none}
    .mp-advanced summary::-webkit-details-marker{display:none}
    .mp-advanced summary::before{content:"▸ ";color:#c9a227}
    .mp-advanced[open] summary::before{content:"▾ "}
    /* Browse / create */
    .mp-browse-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:22px;align-items:start}
    .mp-opt-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}
    .mp-opt{display:flex;flex-direction:column;gap:6px}
    .mp-opt.wide{grid-column:1/-1}
    .mp-opt>span{font-size:12px;color:#b8aa8d}
    .mp-create-foot{display:flex;justify-content:flex-end;margin-top:18px}
    .mp-empty{color:#b8aa8d;font-size:13px;text-align:center;padding:24px 8px}
    /* Room */
    .mp-player-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:14px}
    .mp-pcard{position:relative;background:#1f1c14;border:1px solid var(--edge);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;min-height:96px}
    .mp-pcard.mine{border-color:#c9a227;box-shadow:0 0 0 1px rgba(201,162,39,.3)}
    .mp-pcard.empty{opacity:.55;border-style:dashed}
    .mp-pcard-head{display:flex;align-items:center;gap:9px}
    .mp-swatch{width:14px;height:14px;border-radius:4px;flex:0 0 auto;border:1px solid rgba(0,0,0,.45)}
    .mp-pcard-who{font-weight:700;color:#e8dcc5;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mp-pcard-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f);border-radius:6px;padding:2px 7px;margin-left:auto;white-space:nowrap}
    .mp-pcard-tag.open{background:transparent;border:1px solid var(--edge);color:#b8aa8d}
    .mp-pcard-tag.ai{background:rgba(150,128,224,.25);color:#cbbcf2}
    .mp-pcard-civ{font-size:13px;color:#b8aa8d}
    .mp-pcard-civ b{color:#e8dcc5}
    .mp-pcard .civ-pick-btn{margin-top:auto}
    .mp-pcard-random{position:absolute;top:10px;right:10px}
    .mp-room-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:22px;flex-wrap:wrap}
    .mp-room-foot .grow{flex:1}
    /* Host settings editor inside the lobby room */
    .mp-settings{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px;padding:14px 16px;margin-bottom:18px;background:rgba(0,0,0,.18);border:1px solid var(--edge);border-radius:12px}
    .mp-settings .mp-opt.wide{grid-column:1/-1}
    .mp-settings-readonly{display:flex;flex-wrap:wrap;gap:8px 18px;padding:12px 14px;margin-bottom:18px;background:rgba(0,0,0,.18);border:1px solid var(--edge);border-radius:12px;color:#b8aa8d;font-size:13px}
    .mp-settings-readonly b{color:#e8dcc5}
    .mp-roster-title{font-family:'Cinzel',Georgia,serif;font-size:13px;font-weight:700;color:#c9a227;text-transform:uppercase;letter-spacing:.08em;margin:4px 0 10px}
    .mp-pcard-manage{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px}
    .mp-pcard-manage .cp-sel{width:88px}
    .mp-kind{display:inline-flex;border:1px solid var(--edge);border-radius:8px;overflow:hidden}
    .mp-kind-btn{font:inherit;font-size:12px;font-weight:700;color:#b8aa8d;background:#15120c;border:none;padding:6px 11px;cursor:pointer}
    .mp-kind-btn.sel{background:linear-gradient(135deg,#c9a227,#a6821f);color:#15120c}
    .mp-mini{padding:6px 10px;font-size:12px}
    .mp-add-row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
    @media(max-width:820px){
      .mp-browse-grid{grid-template-columns:1fr}
      .mp-shell{padding:max(18px,env(safe-area-inset-top)) 18px 40px}
    }
    @media(max-width:560px){.mp-opt-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const left = root.querySelector<HTMLDivElement>("#lobby-left")!;
  const right = root.querySelector<HTMLDivElement>("#lobby-right")!;
  const $ = <T extends HTMLElement>(sel: string) => left.querySelector<T>(sel)!;
  const $input = (sel: string) => $<HTMLInputElement>(sel);
  const $select = (sel: string) => $<HTMLSelectElement>(sel);
  const $btn = (sel: string) => $<HTMLButtonElement>(sel);
  const close = () => {
    root.remove();
    style.remove();
  };

  function pickRandomCiv(): typeof CIVILIZATIONS[number] {
    return CIVILIZATIONS[Math.floor(Math.random() * CIVILIZATIONS.length)]!;
  }

  function renderShowcase(civId?: string, allowReroll = true): void {
    const civ = (civId ? CIVILIZATIONS.find((c) => c.id === civId) : undefined) ?? pickRandomCiv();
    const src = leaderAtlas.images[civ.id]?.src ?? `${ASSET_BASE_URL}leaders/${civ.id}.png`;
    const rerollBtn = allowReroll
      ? `<button class="menu-btn secondary showcase-reroll" id="showcase-reroll">Show another civilization</button>`
      : "";
    right.innerHTML = `
      <div class="showcase-art-wrapper">
        <img id="showcase-art" class="showcase-art hidden" src="${src}" alt="" />
        <div id="showcase-art-placeholder" class="showcase-art-placeholder">Leader art<br/>coming soon</div>
      </div>
      ${rerollBtn}
      <div class="showcase">
        <div class="showcase-label">Featured Civilization</div>
        <div class="showcase-civ">${escapeHtml(civ.name)}</div>
        <div class="showcase-leader">${escapeHtml(civ.leader)}</div>
        <div class="showcase-quote">${escapeHtml(civ.leaderQuote || "")}</div>
        <div class="showcase-ability">
          <div class="showcase-ability-name">${escapeHtml(civ.abilityName)}</div>
          <div class="showcase-ability-desc">${escapeHtml(civ.abilityDesc)}</div>
          ${leaderAbilityBlockHtml(civ.id)}
          ${uniqueUnitBlockHtml(civ.id)}
          ${uniqueInfraBlockHtml(civ.id)}
        </div>
        <div class="showcase-ability">
          <div class="showcase-ability-name">Starting Conditions</div>
          <div class="showcase-ability-desc">${escapeHtml(startingConditionsLine(civ.id))}</div>
        </div>
      </div>`;
    const img = right.querySelector<HTMLImageElement>("#showcase-art");
    const placeholder = right.querySelector<HTMLDivElement>("#showcase-art-placeholder");
    if (img && placeholder) {
      const reveal = (): void => {
        if (isImageReady(img)) {
          img.classList.remove("hidden");
          placeholder.classList.add("hidden");
        }
      };
      img.onload = reveal;
      img.onerror = () => {
        // Keep the placeholder visible when the portrait is missing.
      };
      reveal();
    }
    wireUuImages(right);
    wireUuDetail(right);
    right.querySelector<HTMLButtonElement>("#showcase-reroll")?.addEventListener("click", () => renderShowcase());
  }

  /**
   * A full-screen civilization picker: a scrollable list of civs paired with a
   * rich detail pane (leader portrait, quote, ability, unique unit, unique
   * infrastructure). On mobile the detail sits on top so a tap reveals it
   * without scrolling. `takenByOthers` civs (claimed by AI slots) are disabled.
   */
  function openCivPicker(
    currentCivId: string,
    takenByOthers: Set<string>,
    onPick: (civId: string) => void,
  ): void {
    let selected = currentCivId;
    const overlay = document.createElement("div");
    overlay.className = "civ-picker-overlay";
    overlay.innerHTML = `
      <div class="civ-picker" role="dialog" aria-modal="true" aria-label="Choose your civilization">
        <div class="cp-header">
          <div class="cp-title">Choose your civilization</div>
          <button class="cp-close" id="cp-close" aria-label="Close">✕</button>
        </div>
        <div class="cp-body">
          <div class="cp-list" id="cp-list"></div>
          <div class="cp-detail" id="cp-detail"></div>
        </div>
        <div class="cp-footer">
          <button class="menu-btn secondary" id="cp-cancel" style="width:auto">Cancel</button>
          <button class="menu-btn primary" id="cp-confirm" style="width:auto">Choose <span id="cp-confirm-name"></span></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector<HTMLDivElement>("#cp-list")!;
    const detailEl = overlay.querySelector<HTMLDivElement>("#cp-detail")!;
    const confirmName = overlay.querySelector<HTMLSpanElement>("#cp-confirm-name")!;

    const close = (): void => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    listEl.innerHTML = CIVS_BY_NAME.map((c) => {
      const taken = takenByOthers.has(c.id) && c.id !== currentCivId;
      return `<button type="button" class="cp-item${c.id === selected ? " sel" : ""}" data-civ="${c.id}"${taken ? " disabled" : ""}>
        <span class="cp-item-name">${escapeHtml(c.name)}</span>
        <span class="cp-item-leader">${escapeHtml(c.leader)}${taken ? " · taken" : ""}</span>
      </button>`;
    }).join("");

    const renderDetail = (): void => {
      const civ = CIVILIZATIONS.find((c) => c.id === selected)!;
      const src = leaderAtlas.images[civ.id]?.src ?? `${ASSET_BASE_URL}leaders/${civ.id}.png`;
      detailEl.innerHTML = `
        <div class="cp-detail-top">
          <div class="cp-portrait">
            <img id="cp-portrait-img" class="cp-portrait-img hidden" src="${src}" alt="" />
            <div id="cp-portrait-ph" class="cp-portrait-ph">Leader art<br/>coming soon</div>
          </div>
          <div class="cp-headings">
            <div class="cp-civ">${escapeHtml(civ.name)}</div>
            <div class="cp-leader">${escapeHtml(civ.leader)}</div>
            ${civ.leaderQuote ? `<div class="cp-quote">${escapeHtml(civ.leaderQuote)}</div>` : ""}
          </div>
        </div>
        <div class="cp-ability">
          <div class="cp-ability-name">${escapeHtml(civ.abilityName)}</div>
          <div class="cp-ability-desc">${escapeHtml(civ.abilityDesc)}</div>
        </div>
        <div class="cp-ability">
          <div class="cp-ability-name">Starting Conditions</div>
          <div class="cp-ability-desc">${escapeHtml(startingConditionsLine(civ.id))}</div>
        </div>
        ${leaderAbilityBlockHtml(civ.id)}
        ${uniqueUnitBlockHtml(civ.id)}
        ${uniqueInfraBlockHtml(civ.id)}`;
      confirmName.textContent = civ.name;
      const img = detailEl.querySelector<HTMLImageElement>("#cp-portrait-img");
      const ph = detailEl.querySelector<HTMLDivElement>("#cp-portrait-ph");
      if (img && ph) {
        const reveal = (): void => {
          if (isImageReady(img)) {
            img.classList.remove("hidden");
            ph.classList.add("hidden");
          }
        };
        img.onload = reveal;
        reveal();
      }
      wireUuImages(detailEl);
      wireUuDetail(detailEl);
    };

    listEl.querySelectorAll<HTMLButtonElement>(".cp-item").forEach((btn) =>
      btn.addEventListener("click", () => {
        selected = btn.dataset.civ!;
        listEl.querySelectorAll(".cp-item").forEach((b) => b.classList.toggle("sel", b === btn));
        renderDetail();
        detailEl.scrollTop = 0;
      }),
    );

    overlay.querySelector<HTMLButtonElement>("#cp-close")!.addEventListener("click", close);
    overlay.querySelector<HTMLButtonElement>("#cp-cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector<HTMLButtonElement>("#cp-confirm")!.addEventListener("click", () => {
      onPick(selected);
      close();
    });

    renderDetail();
    // Bring the selected entry into view on open.
    listEl.querySelector<HTMLButtonElement>(".cp-item.sel")?.scrollIntoView({ block: "center" });
  }

  function showScreen(screen: Screen): void {
    state.screen = screen;
    root.dataset.screen = screen;
    // Multiplayer breaks out of the sidebar layout into its own full-screen flow.
    const layoutEl = root.querySelector<HTMLDivElement>("#lobby-layout")!;
    const mpScreenEl = root.querySelector<HTMLDivElement>("#mp-screen")!;
    layoutEl.classList.toggle("hidden", screen === "mp");
    mpScreenEl.classList.toggle("hidden", screen !== "mp");
    switch (screen) {
      case "start":
        renderStartScreen();
        break;
      case "sp":
        renderSinglePlayer();
        break;
      case "mp":
        renderMultiplayer();
        break;
      case "load":
        void renderLoadGame();
        break;
    }
  }

  function renderStartScreen(): void {
    left.innerHTML = `
      <div class="lobby-title">Rise of Civilizations</div>
      <div class="lobby-subtitle">Ancient Era → Age of Exploration</div>
      <div class="menu-actions">
        <button class="menu-btn primary" data-screen="sp">Single Player</button>
        <button class="menu-btn" data-screen="mp">Multiplayer</button>
        <button class="menu-btn" data-screen="load">Load Game</button>
        <button class="menu-btn" id="lobby-wiki">Wiki</button>
        <button class="menu-btn" id="lobby-roadmap">Roadmap</button>
        <button class="menu-btn" id="lobby-changelog">Changelog</button>
        <button class="menu-btn" id="lobby-credits">Credits</button>
      </div>
      <button class="lobby-version" id="lobby-version" type="button">v${CURRENT_VERSION} · What's new</button>`;
    left.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((el) =>
      el.addEventListener("click", () => showScreen(el.dataset.screen as Screen)),
    );
    left.querySelector<HTMLButtonElement>("#lobby-wiki")?.addEventListener("click", () => wiki.open());
    left.querySelector<HTMLButtonElement>("#lobby-roadmap")?.addEventListener("click", () => roadmap.open());
    left.querySelector<HTMLButtonElement>("#lobby-changelog")?.addEventListener("click", () => changelog.open());
    left.querySelector<HTMLButtonElement>("#lobby-credits")?.addEventListener("click", () => credits.open());
    left.querySelector<HTMLButtonElement>("#lobby-version")?.addEventListener("click", () => changelog.open());
  }

  function renderSinglePlayer(): void {
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Players & Opponents</div>
        <div id="sp-roster"></div>
        <div id="sp-civ-desc" class="menu-hint"></div>
      </div>
      <div class="menu-section">
        <div class="menu-section-title">Game Options</div>
        <div class="menu-row"><span>Map type</span>${mapTypeSelect("sp-maptype", state.sp.mapType)}</div>
        <div class="menu-hint" id="sp-maptype-desc"></div>
        <div class="menu-row"><span>Map size</span>${mapSelect("sp-map", state.sp.mapSize)}</div>
        <div class="menu-row"><span>Turn limit</span>${turnLimitSelect("sp-turnlimit", state.sp.turnLimit)}</div>
        <div class="menu-hint">Highest score wins when the turn limit is reached. "Unlimited" plays until a decisive victory.</div>
        <div class="menu-row"><span>Barbarians</span>${barbarianSelect("sp-barb", state.sp.barbarians)}</div>
        <div class="menu-row"><span>Natural wonders</span>${onOffSelect("sp-wonders", state.sp.naturalWonders)}</div>
        <div class="menu-row"><span>Legends (heroes)</span>${onOffSelect("sp-legends", state.sp.legends)}</div>
        <div class="menu-field">
          <span>Starting treasury</span>
          ${goldChips("sp-gold", state.sp.startingGold)}
        </div>
        <div class="menu-hint" id="sp-gold-desc"></div>
      </div>
      <div class="menu-back-row">
        <button class="menu-btn secondary" id="back2">Back</button>
        <button class="menu-btn primary" id="sp-start">Start Game</button>
      </div>`;

    const updateCivDesc = () => {
      const c = CIVILIZATIONS.find((x) => x.id === state.sp.civId);
      $("#sp-civ-desc").innerHTML = c
        ? `<b>${c.abilityName}:</b> ${c.abilityDesc}<br/>UU: ${c.uniqueUnit} · ${c.uniqueInfra}<br/>${escapeHtml(startingConditionsLine(c.id))}`
        : "";
    };

    const renderRoster = (): void => {
      const used = new Set<string>([state.sp.color, ...state.sp.ais.map((a) => a.color)]);
      // Concretely-chosen civs (ignoring "random") — used to disable duplicates.
      const takenCivs = new Set<string>([
        state.sp.civId,
        ...state.sp.ais.map((a) => a.civId).filter((c) => c !== RANDOM_CIV),
      ]);
      const humanCiv = CIVILIZATIONS.find((c) => c.id === state.sp.civId);
      const humanUu = humanCiv ? uniqueUnitFor(humanCiv.id)?.name ?? humanCiv.uniqueUnit : "";
      const human = `
        <div class="roster-row" data-row="human">
          <div class="roster-head">
            <span class="roster-tag you">You</span>
            <button type="button" class="menu-in civ-pick-btn" data-civ-pick>
              <span class="cpb-text">
                <span class="cpb-name">${escapeHtml(humanCiv?.name ?? "Select civilization")}</span>
                <span class="cpb-leader">${escapeHtml(humanCiv?.leader ?? "")}</span>
              </span>
              <span class="cpb-caret">&rsaquo;</span>
            </button>
            ${colorSelect(state.sp.color, used)}
          </div>
          ${humanUu ? `<div class="roster-uu">⚔ Unique unit: <b>${escapeHtml(humanUu)}</b></div>` : ""}
        </div>`;
      const ais = state.sp.ais
        .map(
          (ai, i) => `
        <div class="roster-row" data-row="ai-${i}">
          <div class="roster-head">
            <span class="roster-tag">AI ${i + 1}</span>
            <select class="menu-in roster-civ" data-civ="ai-${i}">${civOptions(ai.civId, true, takenCivs)}</select>
            ${colorSelect(ai.color, used)}
            <button type="button" class="roster-remove" data-remove="${i}" title="Remove opponent">✕</button>
          </div>
        </div>`,
        )
        .join("");
      const add =
        state.sp.ais.length < MAX_AI
          ? `<button type="button" class="menu-btn roster-add" id="sp-add-ai">+ Add AI opponent</button>`
          : `<div class="menu-hint">Maximum of ${MAX_AI} AI opponents reached.</div>`;
      $("#sp-roster").innerHTML = human + ais + add;
      wireRoster();
    };

    const wireRoster = (): void => {
      const root = $("#sp-roster");
      root.querySelector<HTMLButtonElement>("[data-civ-pick]")?.addEventListener("click", () => {
        const takenByOthers = new Set<string>(
          state.sp.ais.map((a) => a.civId).filter((c) => c !== RANDOM_CIV),
        );
        openCivPicker(state.sp.civId, takenByOthers, (civId) => {
          state.sp.civId = civId;
          updateCivDesc();
          renderShowcase(state.sp.civId, false);
          renderRoster(); // refresh "taken" civ states across AI dropdowns
        });
      });
      root.querySelectorAll<HTMLSelectElement>(".roster-civ").forEach((sel) =>
        sel.addEventListener("change", () => {
          state.sp.ais[Number(sel.dataset.civ!.slice(3))]!.civId = sel.value;
          renderRoster(); // refresh "taken" civ states across all dropdowns
        }),
      );
      root.querySelectorAll<HTMLSelectElement>(".cp-sel").forEach((sel) =>
        sel.addEventListener("change", () => {
          const rowKey = (sel.closest("[data-row]") as HTMLElement).dataset.row!;
          if (rowKey === "human") state.sp.color = sel.value;
          else state.sp.ais[Number(rowKey.slice(3))]!.color = sel.value;
          renderRoster();
        }),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) =>
        btn.addEventListener("click", () => {
          state.sp.ais.splice(Number(btn.dataset.remove), 1);
          renderRoster();
        }),
      );
      root.querySelector<HTMLButtonElement>("#sp-add-ai")?.addEventListener("click", () => {
        const used = new Set<string>([state.sp.color, ...state.sp.ais.map((a) => a.color)]);
        state.sp.ais.push({ civId: RANDOM_CIV, color: firstFreeColor(used) });
        renderRoster();
      });
    };

    updateCivDesc();
    renderRoster();
    renderShowcase(state.sp.civId, false);

    // Map type: keep a live description below the dropdown.
    const mapTypeSel = $select("#sp-maptype");
    const updateMapTypeDesc = () => {
      $("#sp-maptype-desc").textContent =
        MAP_TYPE_OPTIONS.find((o) => o.value === state.sp.mapType)?.desc ?? "";
    };
    mapTypeSel.addEventListener("change", () => {
      state.sp.mapType = mapTypeSel.value as MapType;
      updateMapTypeDesc();
    });
    updateMapTypeDesc();

    // Starting treasury: chips with tooltips, mirrored into a description line.
    const updateGoldDesc = () => {
      $("#sp-gold-desc").textContent =
        GOLD_OPTIONS.find((o) => o.value === state.sp.startingGold)?.desc ?? "";
    };
    $("#sp-gold")
      .querySelectorAll<HTMLButtonElement>(".chip")
      .forEach((chip) =>
        chip.addEventListener("click", () => {
          state.sp.startingGold = chip.dataset.gold as StartingGold;
          $("#sp-gold")
            .querySelectorAll(".chip")
            .forEach((c) => c.classList.toggle("sel", c === chip));
          updateGoldDesc();
        }),
      );
    updateGoldDesc();

    $("#back").addEventListener("click", () => showScreen("start"));
    $("#back2").addEventListener("click", () => showScreen("start"));
    $("#sp-start").addEventListener("click", () => {
      close();
      const spMapSize = $select("#sp-map").value as MapSize;
      const spBarb = $select("#sp-barb").value as BarbLevel;
      const spWonders = $select("#sp-wonders").value === "on";
      const spLegends = $select("#sp-legends").value === "on";
      const spTurnLimit = Number($select("#sp-turnlimit").value);
      const spAiCivIds = state.sp.ais.map((a) => (a.civId === RANDOM_CIV ? null : a.civId));
      onStart(
        new LocalSession({
          civId: state.sp.civId,
          mapSize: spMapSize,
          mapType: state.sp.mapType,
          aiCivIds: spAiCivIds,
          colors: [state.sp.color, ...state.sp.ais.map((a) => a.color)],
          barbarians: spBarb,
          naturalWonders: spWonders,
          legends: spLegends,
          startingGold: state.sp.startingGold,
          turnLimit: spTurnLimit,
          seed: "rise-" + Math.random().toString(36).slice(2, 8),
        }),
        {
          mapType: state.sp.mapType,
          mapSize: spMapSize,
          startingGold: state.sp.startingGold,
          naturalWonders: spWonders,
          barbarianLevel: spBarb,
          aiCivIds: spAiCivIds,
          legends: spLegends,
          turnLimit: spTurnLimit,
        },
      );
    });
  }

  let mpSession: OnlineSession | null = null;
  let joinedGameId: string | null = null;
  // The live lobby roster for the game we're seated in (null when not in one).
  let mpRoom: LobbyRoom | null = null;
  // The host's chosen setup, captured at create time and attached to analytics
  // when the game starts. Stays undefined for a joiner (they didn't configure it).
  let mpSetup: GameSetup | undefined;
  // Which stage of the full-screen multiplayer flow is on screen.
  type MpStage = "auth" | "browse" | "room";
  let mpStage: MpStage = "auth";
  // Last game list received, so re-rendering the browse stage can repopulate it.
  let mpGames: GameSummary[] = [];
  // Stable indirection so the (once-attached) socket handler always calls the
  // latest render closures, even after the screen is re-entered.
  let mpDispatch: (m: ServerMessage) => void = () => {};

  // The full-screen multiplayer flow: sign in → find/create a game → lobby room.
  // Renders into #mp-screen (outside the sidebar layout) and walks three stages.
  function renderMultiplayer(): void {
    const screen = root.querySelector<HTMLDivElement>("#mp-screen")!;
    // Which auth view is showing — login and signup are separate forms.
    let authView: "login" | "signup" = "login";

    const authed = !!(mpSession && state.mp.userId);
    if (!authed) mpStage = "auth";
    else if (joinedGameId && mpRoom && mpRoom.gameId === joinedGameId) mpStage = "room";
    else mpStage = "browse";

    const setStatus = (t: string): void => {
      const el = screen.querySelector<HTMLElement>("#mp-status");
      if (el) el.textContent = t;
    };

    // Three-step progress indicator shared across stages.
    const steps = (active: MpStage): string => {
      const order: MpStage[] = ["auth", "browse", "room"];
      const labels: Record<MpStage, string> = { auth: "Sign in", browse: "Find a game", room: "Lobby" };
      const ai = order.indexOf(active);
      return `<div class="mp-steps">${order
        .map((s, i) => {
          const cls = i < ai ? "done" : i === ai ? "active" : "";
          const dot = i < ai ? "✓" : String(i + 1);
          return `${i ? `<span class="mp-step-sep"></span>` : ""}<span class="mp-step ${cls}"><span class="dot">${dot}</span>${labels[s]}</span>`;
        })
        .join("")}</div>`;
    };

    const topbar = (right: string): string => `
      <div class="mp-topbar">
        <button class="menu-btn secondary" id="mp-back" style="width:auto;padding:8px 14px;font-size:13px"><span class="icon">←</span> Menu</button>
        <div class="mp-brand">Multiplayer<small>Play online with friends</small></div>
        ${right}
      </div>`;
    const whoChip = (): string => `<div class="mp-who">Signed in as <b>${escapeHtml(state.mp.handle || "Player")}</b></div>`;

    // ===== Stage 1: authentication (login and signup are separate views) =====
    const renderAuth = (): void => {
      const isSignup = authView === "signup";
      const heading = isSignup ? "Create your account" : "Log in";
      const blurb = isSignup
        ? "Pick a handle and password to play online."
        : "Welcome back, commander.";
      const confirmField = isSignup
        ? `<div class="mp-field"><label>Repeat password</label><input id="mp-pw2" class="menu-in" type="password" placeholder="Repeat password" autocomplete="new-password" /></div>`
        : "";
      const primary = isSignup
        ? `<button class="menu-btn primary" id="mp-signup">Sign up</button>`
        : `<button class="menu-btn primary" id="mp-login">Log in</button>`;
      const switcher = isSignup
        ? `Already have an account? <button class="mp-link" id="mp-go-login">Log in</button>`
        : `Need an account? <button class="mp-link" id="mp-go-signup">Sign up</button>`;
      screen.innerHTML = `
        <div class="mp-shell">
          ${topbar("")}
          ${steps("auth")}
          <div class="mp-auth-wrap">
            <div class="mp-panel mp-auth-card">
              <div class="mp-auth-heading">${heading}</div>
              <div class="menu-hint" style="text-align:center;margin-bottom:18px">${blurb}</div>
              <div class="mp-field"><label>Handle</label><input id="mp-handle" class="menu-in" value="${escapeHtml(state.mp.handle)}" placeholder="Your name" autocomplete="username" /></div>
              <div class="mp-field"><label>Password</label><input id="mp-pw" class="menu-in" type="password" value="${escapeHtml(state.mp.password)}" placeholder="Password" autocomplete="${isSignup ? "new-password" : "current-password"}" /></div>
              ${confirmField}
              <div class="mp-auth-actions">${primary}</div>
              <div id="mp-status" class="menu-status" style="text-align:center"></div>
              <div class="mp-auth-switch">${switcher}</div>
              <details class="mp-advanced">
                <summary>Advanced — server address</summary>
                <div class="mp-field" style="margin-top:10px"><input id="mp-url" class="menu-in" value="${escapeHtml(state.mp.url)}" placeholder="ws://host:port/ws" /></div>
              </details>
            </div>
          </div>
        </div>`;
      screen.querySelector<HTMLButtonElement>("#mp-back")!.addEventListener("click", () => showScreen("start"));
      const handleEl = screen.querySelector<HTMLInputElement>("#mp-handle")!;
      const pwEl = screen.querySelector<HTMLInputElement>("#mp-pw")!;
      const urlEl = screen.querySelector<HTMLInputElement>("#mp-url")!;
      handleEl.addEventListener("input", () => (state.mp.handle = handleEl.value));
      pwEl.addEventListener("input", () => (state.mp.password = pwEl.value));
      urlEl.addEventListener("change", () => (state.mp.url = urlEl.value));

      const switchTo = (v: "login" | "signup"): void => {
        authView = v;
        renderAuth();
      };
      screen.querySelector<HTMLButtonElement>("#mp-go-signup")?.addEventListener("click", () => switchTo("signup"));
      screen.querySelector<HTMLButtonElement>("#mp-go-login")?.addEventListener("click", () => switchTo("login"));

      const submit = (): void => {
        if (isSignup) {
          const pw2 = screen.querySelector<HTMLInputElement>("#mp-pw2")!.value;
          if (state.mp.password !== pw2) return setStatus("Passwords don't match.");
          void connectAndAuth("register");
        } else {
          void connectAndAuth("login");
        }
      };
      screen.querySelector<HTMLButtonElement>(isSignup ? "#mp-signup" : "#mp-login")!.addEventListener("click", submit);
      // Enter on the last field submits the current form.
      screen.querySelector<HTMLInputElement>(isSignup ? "#mp-pw2" : "#mp-pw")!.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
    };

    // ===== Stage 2: browse + create =====
    // ===== Stage 2: find / create a game =====
    // Game options now live on the host's lobby card — creating a game drops you
    // straight into the lobby, where the host configures the map, players, etc.
    const renderGames = (): void => {
      const list = screen.querySelector<HTMLDivElement>("#mp-game-list");
      if (!list) return;
      list.innerHTML =
        mpGames.length === 0
          ? `<div class="mp-empty">No open games yet.<br/>Create one to get started.</div>`
          : mpGames
              .map((g) => {
                const isHost = g.hostUserId === state.mp.userId;
                const meta = `${g.players}/${g.capacity} players · ${g.status}${g.hasPassword ? " · private" : ""}`;
                const pwField = g.hasPassword
                  ? `<input type="password" class="menu-in mp-join-pw" data-pw="${g.id}" placeholder="Password" style="width:118px" />`
                  : "";
                let buttons = `${pwField}<button class="menu-btn" data-join="${g.id}" style="width:auto">Join</button>`;
                if (isHost) buttons += ` <button class="menu-btn secondary" data-delete="${g.id}" style="width:auto">Delete</button>`;
                return `<div class="save-row"><span class="info"><span class="name">${escapeHtml(g.name)}</span><span class="meta">${meta}</span></span><span style="display:flex;gap:6px;align-items:center">${buttons}</span></div>`;
              })
              .join("");
      list.querySelectorAll<HTMLButtonElement>("[data-join]").forEach((el) =>
        el.addEventListener("click", () => {
          const id = el.dataset.join!;
          const pw = list.querySelector<HTMLInputElement>(`.mp-join-pw[data-pw="${id}"]`)?.value;
          mpSession?.send({ t: "joinGame", gameId: id, password: pw || undefined });
        }),
      );
      list.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((el) =>
        el.addEventListener("click", () => {
          if (confirm("Delete this game? This cannot be undone.")) {
            mpSession?.send({ t: "deleteGame", gameId: el.dataset.delete! });
          }
        }),
      );
    };

    const doCreate = (): void => {
      const nameEl = screen.querySelector<HTMLInputElement>("#mp-name");
      const name = (nameEl?.value.trim() || `${state.mp.handle || "Player"}'s game`).slice(0, 60);
      const dims = MAP_DIMENSIONS["medium"];
      // Sensible defaults; the host tweaks everything in the lobby afterward.
      mpSetup = {
        mapType: "continents",
        mapSize: "medium",
        startingGold: "balanced",
        naturalWonders: true,
        barbarianLevel: "normal",
        aiCivIds: [],
        turnLimit: DEFAULT_TURN_LIMIT,
      };
      mpSession?.send({
        t: "createGame",
        name,
        cols: dims.cols,
        rows: dims.rows,
        mapSize: "medium",
        mapType: "continents",
        capacity: 2,
        barbarians: "normal",
        naturalWonders: true,
        startingGold: "balanced",
        turnLimit: DEFAULT_TURN_LIMIT,
      });
    };

    const renderBrowse = (): void => {
      screen.innerHTML = `
        <div class="mp-shell">
          ${topbar(whoChip())}
          ${steps("browse")}
          <div class="mp-browse-grid">
            <div class="mp-panel">
              <div class="mp-panel-title">Create a game</div>
              <div class="menu-hint" style="margin-bottom:14px">Name your game, then set the map, players and an optional password in the lobby.</div>
              <div class="mp-field"><label>Game name</label><input id="mp-name" class="menu-in" placeholder="${escapeHtml((state.mp.handle || "Player") + "'s game")}" /></div>
              <div class="mp-create-foot"><button class="menu-btn primary" id="mp-create" style="width:auto">Create game</button></div>
            </div>
            <div class="mp-panel">
              <div class="mp-panel-title">Open games <button class="menu-btn secondary" id="mp-refresh" style="margin-left:auto;width:auto;padding:6px 12px;font-size:12px">Refresh</button></div>
              <div id="mp-game-list"></div>
              <div id="mp-status" class="menu-status"></div>
            </div>
          </div>
        </div>`;
      screen.querySelector<HTMLButtonElement>("#mp-back")!.addEventListener("click", () => showScreen("start"));
      screen.querySelector<HTMLButtonElement>("#mp-refresh")!.addEventListener("click", () => mpSession?.send({ t: "listGames" }));
      screen.querySelector<HTMLButtonElement>("#mp-create")!.addEventListener("click", doCreate);
      screen.querySelector<HTMLInputElement>("#mp-name")!.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doCreate();
      });
      renderGames();
      mpSession?.send({ t: "listGames" });
    };

    // ===== Stage 3: lobby room =====
    const configure = (patch: Record<string, unknown>): void => {
      if (mpRoom) mpSession?.send({ t: "configureGame", gameId: mpRoom.gameId, ...patch });
    };

    const renderRoomBody = (): void => {
      const body = screen.querySelector<HTMLDivElement>("#mp-room-body");
      if (!body) return;
      const room = mpRoom;
      if (!room) {
        body.innerHTML = `<div class="mp-empty">Loading lobby…</div>`;
        return;
      }
      const meHost = room.hostUserId === state.mp.userId;
      const mySlot = room.slots.find((s) => s.userId === state.mp.userId);
      const humanSlots = room.slots.filter((s) => s.kind === "human");
      const filled = humanSlots.filter((s) => s.userId).length;
      const titleEl = screen.querySelector<HTMLElement>("#mp-room-title");
      if (titleEl)
        titleEl.innerHTML = `${escapeHtml(room.name)} <span class="count">${filled}/${humanSlots.length} players${room.hasPassword ? " · private" : ""}</span>`;

      // Concrete civs / colors already claimed, for disabling in pickers.
      const takenCivs = new Set<string>(room.slots.map((s) => s.civId).filter((c): c is string => !!c));
      const usedColors = new Set<string>(room.slots.map((s) => s.color).filter((c): c is string => !!c));

      // Host-only game settings editor.
      const settings = meHost
        ? `
          <div class="mp-settings">
            <div class="mp-opt"><span>Game name</span><input id="rm-name" class="menu-in" value="${escapeHtml(room.name)}" maxlength="60" /></div>
            <div class="mp-opt"><span>Password (optional)</span><input id="rm-pw" class="menu-in" type="text" placeholder="${room.hasPassword ? "Password set — type to change" : "No password"}" /></div>
            <div class="mp-opt"><span>Map type</span>${mapTypeSelect("rm-maptype", room.mapType)}</div>
            <div class="mp-opt"><span>Map size</span>${mapSelect("rm-map", (room.mapSize as MapSize) || "medium")}</div>
            <div class="mp-opt"><span>Turn limit</span>${turnLimitSelect("rm-turnlimit", room.turnLimit ?? DEFAULT_TURN_LIMIT)}</div>
            <div class="mp-opt"><span>Barbarians</span>${barbarianSelect("rm-barb", room.barbarians)}</div>
            <div class="mp-opt"><span>Natural wonders</span>${onOffSelect("rm-wonders", room.naturalWonders)}</div>
            <div class="mp-opt"><span>Starting treasury</span>${goldChips("rm-gold", room.startingGold)}</div>
          </div>`
        : `
          <div class="mp-settings-readonly">
            <span><b>Map:</b> ${escapeHtml(MAP_TYPE_OPTIONS.find((o) => o.value === room.mapType)?.label ?? room.mapType)} · ${escapeHtml(room.mapSize || "medium")}</span>
            <span><b>Turn limit:</b> ${escapeHtml(turnLimitLabel(room.turnLimit ?? DEFAULT_TURN_LIMIT))}</span>
            <span><b>Barbarians:</b> ${escapeHtml(room.barbarians)}</span>
            <span><b>Natural wonders:</b> ${room.naturalWonders ? "On" : "Off"}</span>
            <span><b>Treasury:</b> ${escapeHtml(room.startingGold)}</span>
          </div>`;

      const slotCard = (s: typeof room.slots[number]): string => {
        const mine = s.userId === state.mp.userId;
        const isHostSeat = s.userId === room.hostUserId;
        const civ = s.civId ? CIVILIZATIONS.find((c) => c.id === s.civId) : undefined;
        const occupied = !!s.userId;
        const swatch = s.color ?? "#9aa0a6";
        const who =
          s.kind === "ai" ? "AI opponent" : occupied ? escapeHtml(s.handle ?? "Player") : "Open seat";
        const tag = mine ? "You" : s.kind === "ai" ? "AI" : isHostSeat ? "Host" : occupied ? "Player" : "Open";
        const tagCls = s.kind === "ai" ? " ai" : occupied ? "" : " open";

        // Civ line: the seat owner (or host for AI) can choose; everyone else sees it.
        const canPickCiv = mine || (meHost && s.kind === "ai");
        let civLine: string;
        if (canPickCiv) {
          civLine = `<div class="mp-pcard-pick">
              <button type="button" class="menu-in civ-pick-btn" data-pick-slot="${s.id}">
                <span class="cpb-text">
                  <span class="cpb-name">${civ ? escapeHtml(civ.name) : "Random civilization"}</span>
                  <span class="cpb-leader">${civ ? escapeHtml(civ.leader) : "Tap to choose"}</span>
                </span>
                <span class="cpb-caret">&rsaquo;</span>
              </button>
              ${civ ? `<button type="button" class="roster-remove" data-random-slot="${s.id}" title="Use a random civ">↺</button>` : ""}
            </div>`;
        } else {
          civLine = `<div class="mp-pcard-civ">${civ ? `<b>${escapeHtml(civ.name)}</b> · ${escapeHtml(civ.leader)}` : "Random civilization"}</div>`;
        }

        // Host controls: kind toggle, color, kick / remove.
        const kindToggle =
          meHost && !isHostSeat
            ? `<div class="mp-kind" data-slot="${s.id}">
                 <button type="button" class="mp-kind-btn${s.kind === "human" ? " sel" : ""}" data-kind="human">Human</button>
                 <button type="button" class="mp-kind-btn${s.kind === "ai" ? " sel" : ""}" data-kind="ai">AI</button>
               </div>`
            : "";
        const colorCtl = meHost
          ? colorSelect(swatch, new Set([...usedColors].filter((c) => c !== s.color)))
          : "";
        const manage =
          meHost && !isHostSeat
            ? `<div class="mp-pcard-manage">
                 ${kindToggle}
                 ${colorCtl}
                 ${occupied && s.kind === "human" ? `<button type="button" class="menu-btn secondary mp-mini" data-kick="${s.id}">Kick</button>` : ""}
                 <button type="button" class="roster-remove" data-remove-slot="${s.id}" title="Remove this slot">×</button>
               </div>`
            : meHost && isHostSeat
              ? `<div class="mp-pcard-manage">${colorCtl}</div>`
              : "";

        return `
          <div class="mp-pcard${mine ? " mine" : ""}${occupied || s.kind === "ai" ? "" : " empty"}">
            <div class="mp-pcard-head">
              <span class="mp-swatch" style="background:${swatch}"></span>
              <span class="mp-pcard-who">${who}</span>
              <span class="mp-pcard-tag${tagCls}">${tag}</span>
            </div>
            ${civLine}
            ${manage}
          </div>`;
      };

      const cards = room.slots.map(slotCard).join("");
      const addRow = meHost
        ? `<div class="mp-add-row">
             <button type="button" class="menu-btn secondary" id="mp-add-human" style="width:auto">+ Add human seat</button>
             <button type="button" class="menu-btn secondary" id="mp-add-ai" style="width:auto">+ Add AI</button>
           </div>`
        : "";

      const foot = meHost
        ? `<button class="menu-btn secondary" id="mp-room-delete" style="width:auto">Delete game</button><span class="grow"></span><button class="menu-btn primary" id="mp-room-start" style="width:auto">Start game</button>`
        : `<button class="menu-btn secondary" id="mp-room-leave" style="width:auto">Back to games</button><span class="grow"></span><span class="menu-hint" style="margin:0">Waiting for the host to start…</span>`;

      body.innerHTML = `
        ${settings}
        <div class="mp-roster-title">Players</div>
        <div class="mp-player-grid">${cards}</div>
        ${addRow}
        <div class="mp-room-foot">${foot}</div>`;

      // --- wire host settings ---
      if (meHost) {
        body.querySelector<HTMLInputElement>("#rm-name")?.addEventListener("change", (e) =>
          configure({ name: (e.target as HTMLInputElement).value }),
        );
        body.querySelector<HTMLInputElement>("#rm-pw")?.addEventListener("change", (e) =>
          configure({ password: (e.target as HTMLInputElement).value }),
        );
        body.querySelector<HTMLSelectElement>("#rm-maptype")?.addEventListener("change", (e) =>
          configure({ mapType: (e.target as HTMLSelectElement).value }),
        );
        body.querySelector<HTMLSelectElement>("#rm-map")?.addEventListener("change", (e) => {
          const size = (e.target as HTMLSelectElement).value as MapSize;
          const dims = MAP_DIMENSIONS[size];
          configure({ mapSize: size, cols: dims.cols, rows: dims.rows });
        });
        body.querySelector<HTMLSelectElement>("#rm-turnlimit")?.addEventListener("change", (e) =>
          configure({ turnLimit: Number((e.target as HTMLSelectElement).value) }),
        );
        body.querySelector<HTMLSelectElement>("#rm-barb")?.addEventListener("change", (e) =>
          configure({ barbarians: (e.target as HTMLSelectElement).value }),
        );
        body.querySelector<HTMLSelectElement>("#rm-wonders")?.addEventListener("change", (e) =>
          configure({ naturalWonders: (e.target as HTMLSelectElement).value === "on" }),
        );
        body.querySelectorAll<HTMLButtonElement>("#rm-gold .chip").forEach((chip) =>
          chip.addEventListener("click", () => configure({ startingGold: chip.dataset.gold })),
        );
        body.querySelector<HTMLButtonElement>("#mp-add-human")?.addEventListener("click", () =>
          mpSession?.send({ t: "addSlot", gameId: room.gameId, kind: "human" }),
        );
        body.querySelector<HTMLButtonElement>("#mp-add-ai")?.addEventListener("click", () =>
          mpSession?.send({ t: "addSlot", gameId: room.gameId, kind: "ai" }),
        );
        body.querySelectorAll<HTMLButtonElement>(".mp-kind-btn").forEach((btn) =>
          btn.addEventListener("click", () => {
            const slotId = Number((btn.closest(".mp-kind") as HTMLElement).dataset.slot);
            mpSession?.send({ t: "updateSlot", gameId: room.gameId, slotId, kind: btn.dataset.kind as "human" | "ai" });
          }),
        );
        body.querySelectorAll<HTMLButtonElement>("[data-kick]").forEach((btn) =>
          btn.addEventListener("click", () =>
            mpSession?.send({ t: "kickSlot", gameId: room.gameId, slotId: Number(btn.dataset.kick) }),
          ),
        );
        body.querySelectorAll<HTMLButtonElement>("[data-remove-slot]").forEach((btn) =>
          btn.addEventListener("click", () =>
            mpSession?.send({ t: "removeSlot", gameId: room.gameId, slotId: Number(btn.dataset.removeSlot) }),
          ),
        );
      }

      // --- color selects (host) — bound to their card's slot ---
      if (meHost) {
        body.querySelectorAll<HTMLElement>(".mp-pcard").forEach((card) => {
          const sel = card.querySelector<HTMLSelectElement>(".cp-sel");
          if (!sel) return;
          const idAttr =
            card.querySelector<HTMLElement>("[data-pick-slot]")?.getAttribute("data-pick-slot") ??
            card.querySelector<HTMLElement>("[data-remove-slot]")?.getAttribute("data-remove-slot") ??
            card.querySelector<HTMLElement>(".mp-kind")?.getAttribute("data-slot");
          if (idAttr == null) return;
          sel.addEventListener("change", () =>
            mpSession?.send({ t: "updateSlot", gameId: room.gameId, slotId: Number(idAttr), color: sel.value }),
          );
        });
      }

      // --- civ pickers (own seat, or host picking an AI civ) ---
      body.querySelectorAll<HTMLButtonElement>("[data-pick-slot]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const slotId = Number(btn.dataset.pickSlot);
          const slot = room.slots.find((s) => s.id === slotId);
          if (!slot) return;
          const takenByOthers = new Set(takenCivs);
          if (slot.civId) takenByOthers.delete(slot.civId);
          const initial =
            slot.civId && CIVILIZATIONS.some((c) => c.id === slot.civId)
              ? slot.civId
              : (CIVS_BY_NAME.find((c) => !takenByOthers.has(c.id)) ?? CIVS_BY_NAME[0]!).id;
          openCivPicker(initial, takenByOthers, (civId) => {
            if (slot.userId === state.mp.userId) mpSession?.send({ t: "pickCiv", gameId: room.gameId, civId });
            else mpSession?.send({ t: "updateSlot", gameId: room.gameId, slotId, civId });
          });
        }),
      );
      body.querySelectorAll<HTMLButtonElement>("[data-random-slot]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const slotId = Number(btn.dataset.randomSlot);
          const slot = room.slots.find((s) => s.id === slotId);
          if (slot?.userId === state.mp.userId) mpSession?.send({ t: "pickCiv", gameId: room.gameId, civId: null });
          else mpSession?.send({ t: "updateSlot", gameId: room.gameId, slotId, civId: null });
        }),
      );

      // --- footer ---
      body.querySelector<HTMLButtonElement>("#mp-room-start")?.addEventListener("click", () =>
        mpSession?.send({ t: "startGame", gameId: room.gameId }),
      );
      body.querySelector<HTMLButtonElement>("#mp-room-delete")?.addEventListener("click", () => {
        if (confirm("Delete this game? This cannot be undone.")) {
          mpSession?.send({ t: "deleteGame", gameId: room.gameId });
        }
      });
      body.querySelector<HTMLButtonElement>("#mp-room-leave")?.addEventListener("click", () => goStage("browse"));
    };

    const renderRoom = (): void => {
      screen.innerHTML = `
        <div class="mp-shell">
          ${topbar(whoChip())}
          ${steps("room")}
          <div class="mp-panel">
            <div class="mp-panel-title" id="mp-room-title">Lobby</div>
            <div class="menu-hint" style="margin-bottom:16px">Set up the game, then choose your civilization. Civs already taken are disabled.</div>
            <div id="mp-room-body"></div>
            <div id="mp-status" class="menu-status"></div>
          </div>
        </div>`;
      screen.querySelector<HTMLButtonElement>("#mp-back")!.addEventListener("click", () => showScreen("start"));
      renderRoomBody();
    };

    const goStage = (s: MpStage): void => {
      mpStage = s;
      if (s === "auth") renderAuth();
      else if (s === "browse") renderBrowse();
      else renderRoom();
    };

    // Latest-closure socket dispatch (the .on handler is attached once per session).
    mpDispatch = (m: ServerMessage): void => {
      if (m.t === "error") {
        // Make the common auth failures actionable rather than cryptic.
        const friendly =
          m.message === "handle taken"
            ? "That handle is already registered — try logging in instead."
            : m.message === "invalid credentials"
              ? "Wrong handle or password. New here? Sign up instead."
              : m.message;
        setStatus(friendly);
      } else if (m.t === "authOk") {
        state.mp.userId = m.userId;
        goStage("browse");
      } else if (m.t === "games") {
        mpGames = m.games;
        if (mpStage === "browse") renderGames();
      } else if (m.t === "lobby") {
        mpRoom = m.room;
        if (mpStage === "room" && joinedGameId === m.room.gameId) renderRoomBody();
      } else if (m.t === "joined") {
        joinedGameId = m.gameId;
        goStage("room");
        mpSession!.send({ t: "listGames" });
      } else if (m.t === "deleted") {
        if (joinedGameId === m.gameId) {
          joinedGameId = null;
          mpRoom = null;
          goStage("browse");
          setStatus("Game deleted by host.");
        }
        mpSession!.send({ t: "listGames" });
      } else if (m.t === "kicked") {
        if (joinedGameId === m.gameId) {
          joinedGameId = null;
          mpRoom = null;
          goStage("browse");
          setStatus("The host removed you from the game.");
        }
        mpSession!.send({ t: "listGames" });
      } else if (m.t === "started") {
        close();
        mpSession!.gameId = joinedGameId ?? undefined;
        onStart(mpSession!, mpSetup);
      }
    };

    const connectAndAuth = async (kind: "register" | "login"): Promise<void> => {
      const handle = state.mp.handle.trim();
      const password = state.mp.password;
      if (!handle || !password) return setStatus("Enter a handle and password.");
      if (!mpSession) {
        mpSession = new OnlineSession(state.mp.url.trim());
        mpSession.on((m) => mpDispatch(m));
        try {
          await mpSession.connect();
        } catch {
          mpSession = null;
          return setStatus("Could not connect to server.");
        }
      }
      mpSession.send({ t: kind, handle, password });
    };

    goStage(mpStage);
  }

  function downloadSave(record: SaveRecord): void {
    const blob = new Blob([exportSave(record)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = record.name.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim() || "save";
    a.download = `${safeName}.rocsave`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function renderLoadGame(): Promise<void> {
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Load Saved Game</div>
        <div id="load-error" class="menu-status"></div>
        <button class="menu-btn secondary" id="load-import" style="margin-top:10px"><span class="icon">📂</span> Import save file</button>
        <input type="file" id="load-import-file" accept=".rocsave,.json" style="display:none" />
        <div id="load-empty" class="menu-hint">No saved games found.</div>
        <div id="load-list" class="save-list"></div>
      </div>`;

    $("#back").addEventListener("click", () => showScreen("start"));
    const errorEl = $("#load-error");
    const emptyEl = $("#load-empty");
    const listEl = $("#load-list");
    const importBtn = $("#load-import") as HTMLButtonElement;
    const importFile = $("#load-import-file") as HTMLInputElement;

    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files?.[0];
      importFile.value = "";
      if (!file) return;
      errorEl.textContent = "";
      try {
        const text = await file.text();
        const stored = await importSave(text);
        errorEl.textContent = `Imported “${stored.name}”.`;
        await renderLoadGame();
      } catch (err) {
        errorEl.textContent = String(err);
      }
    });

    let saves: SaveRecord[] = [];
    try {
      saves = await listSaves();
    } catch {
      errorEl.textContent = "Could not open saved games.";
      emptyEl.classList.add("hidden");
      return;
    }

    if (saves.length === 0) {
      emptyEl.classList.remove("hidden");
      listEl.innerHTML = "";
      return;
    }
    emptyEl.classList.add("hidden");

    listEl.innerHTML = saves
      .map(
        (s) =>
          `<div class="save-row" data-load="${s.id}" role="button" tabindex="0">` +
          `<span class="info">` +
          `<span class="name">${escapeHtml(s.name)}</span>` +
          `<span class="meta">${s.mode === "sp" ? "Single Player" : "Multiplayer"} · Turn ${s.turn} · ${new Date(s.createdAt).toLocaleString()}${s.gameId ? ` · ${s.gameId}` : ""}</span>` +
          `</span>` +
          `<span class="actions">` +
          `<button type="button" class="save-menu" data-menu="${s.id}" aria-label="Save options" aria-haspopup="true">⋯</button>` +
          `<div class="save-dropdown" data-dropdown="${s.id}">` +
          `<button type="button" class="save-dropdown-item" data-export="${s.id}">Export to file</button>` +
          `<button type="button" class="save-dropdown-item delete" data-delete="${s.id}">Delete</button>` +
          `</div>` +
          `</span>` +
          `</div>`,
      )
      .join("");

    let dropdownCloser: (() => void) | null = null;
    const closeAllDropdowns = () => {
      listEl.querySelectorAll<HTMLDivElement>(".save-dropdown.open").forEach((d) => d.classList.remove("open"));
      if (dropdownCloser) {
        document.removeEventListener("click", dropdownCloser);
        dropdownCloser = null;
      }
    };

    listEl.querySelectorAll<HTMLDivElement>(".save-row").forEach((el) => {
      const load = async () => {
        const id = el.dataset.load!;
        const record = await loadSave(id);
        if (!record) return;
        if (record.mode === "mp") {
          errorEl.textContent = "MP saves can only be loaded by the host from the in-game menu.";
          return;
        }
        close();
        onStart(new LocalSession({ savedState: JSON.parse(record.blob) as SerializedState }));
      };
      el.addEventListener("click", load);
      el.addEventListener("keydown", (e) => {
        if (e.target !== el) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void load();
        }
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>(".save-menu").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const dropdown = listEl.querySelector<HTMLDivElement>(`[data-dropdown="${el.dataset.menu}"]`);
        const isOpen = dropdown?.classList.contains("open") ?? false;
        closeAllDropdowns();
        if (dropdown && !isOpen) {
          dropdown.classList.add("open");
          dropdownCloser = () => closeAllDropdowns();
          document.addEventListener("click", dropdownCloser);
        }
      }),
    );

    listEl.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((el) =>
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = el.dataset.export!;
        const record = await loadSave(id);
        if (!record) return;
        downloadSave(record);
        closeAllDropdowns();
      }),
    );
    listEl.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((el) =>
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("Delete this save? This cannot be undone.")) {
          await deleteSave(el.dataset.delete!);
          await renderLoadGame();
        }
        closeAllDropdowns();
      }),
    );

  }

  renderShowcase();
  showScreen("start");
}
