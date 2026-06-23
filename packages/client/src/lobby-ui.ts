// Pre-game menu: a proper start screen with navigable sub-screens for
// single-player setup, multiplayer lobby, and loading saved games.

import { ASSET_BASE_URL } from "./asset-base";
import { LocalSession, OnlineSession, MAP_DIMENSIONS, type MapSize, type Session } from "./session";
import { createWiki } from "./wiki";
import { createRoadmap } from "./roadmap";
import { createCredits } from "./credits";
import {
  CIVILIZATIONS,
  PLAYER_COLORS,
  type GameSummary,
  type LobbyRoom,
  type MapType,
  type SerializedState,
} from "@roc/sim";
import { uniqueUnitFor, uniqueUnitBlockHtml, leaderAbilityBlockHtml, uniqueInfraBlockHtml, wireUuImages, wireUuDetail } from "./unique-unit";
import { deleteSave, exportSave, importSave, listSaves, loadSave, type SaveRecord } from "./save-db";
import { loadLeaderAtlas, isImageReady } from "./leader-assets";
import type { GameSetup } from "./analytics";

const DEFAULT_WS_SCHEME = location.protocol === "https:" ? "wss" : "ws";
const DEFAULT_WS =
  import.meta.env.VITE_WS_URL?.trim() || `${DEFAULT_WS_SCHEME}://${location.hostname || "localhost"}:3001/ws`;

/** Civilizations sorted alphabetically by display name for the setup UI. */
const CIVS_BY_NAME = [...CIVILIZATIONS].sort((a, b) => a.name.localeCompare(b.name));

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
      naturalWonders: false,
      legends: true,
      startingGold: "balanced",
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
      naturalWonders: false,
      startingGold: "balanced",
    },
  };

  const leaderAtlas = loadLeaderAtlas();

  const wiki = createWiki();
  const roadmap = createRoadmap();
  const credits = createCredits();

  const root = document.createElement("div");
  root.id = "lobby";
  root.innerHTML = `
    <div class="lobby-layout">
      <div class="lobby-left" id="lobby-left"></div>
      <div class="lobby-right" id="lobby-right"></div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #lobby{position:fixed;inset:0;z-index:50;background:#0f0e0b}
    .lobby-layout{display:flex;height:100%;width:100%}
    .lobby-left{width:380px;max-width:92vw;flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#1f1c14 0%,#15120c 100%);border-right:1px solid var(--edge);padding:28px;overflow:auto;box-shadow:4px 0 24px rgba(0,0,0,.55)}
    .lobby-right{flex:1;position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:48px 56px;background:radial-gradient(circle at 70% 30%,rgba(201,162,39,0.14) 0%,#0f0e0b 60%);overflow:hidden}
    .lobby-right::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,14,11,0) 0%,rgba(15,14,11,.78) 100%);pointer-events:none}
    .lobby-title{font-family:'Cinzel',Georgia,serif;font-size:28px;font-weight:800;color:#e8dcc5;letter-spacing:.5px;margin-bottom:4px}
    .lobby-subtitle{color:#b8aa8d;font-size:13px;margin-bottom:24px}
    .lobby-version{margin-top:auto;color:#b8aa8d;font-size:12px;text-align:center;padding-top:18px}
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
    }`;
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
        <button class="menu-btn" id="lobby-credits">Credits</button>
      </div>`;
    left.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((el) =>
      el.addEventListener("click", () => showScreen(el.dataset.screen as Screen)),
    );
    left.querySelector<HTMLButtonElement>("#lobby-wiki")?.addEventListener("click", () => wiki.open());
    left.querySelector<HTMLButtonElement>("#lobby-roadmap")?.addEventListener("click", () => roadmap.open());
    left.querySelector<HTMLButtonElement>("#lobby-credits")?.addEventListener("click", () => credits.open());
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
        ? `<b>${c.abilityName}:</b> ${c.abilityDesc}<br/>UU: ${c.uniqueUnit} · ${c.uniqueInfra}`
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

  function renderMultiplayer(): void {
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Server</div>
        <input id="url" class="menu-in" value="${escapeHtml(state.mp.url)}" placeholder="ws://host:port/ws" />
      </div>
      <div class="menu-section">
        <div class="menu-section-title">Account</div>
        <div class="menu-row"><span>Handle</span><input id="handle" class="menu-in" value="${escapeHtml(state.mp.handle)}" placeholder="handle" style="max-width:200px" /></div>
        <div class="menu-row"><span>Password</span><input id="pw" class="menu-in" type="password" value="${escapeHtml(state.mp.password)}" placeholder="password" style="max-width:200px" /></div>
        <div class="menu-back-row" style="margin-top:12px">
          <button class="menu-btn" id="register">Register</button>
          <button class="menu-btn primary" id="login">Login</button>
        </div>
        <div id="status" class="menu-status"></div>
      </div>
      <div id="games" class="hidden menu-section">
        <div id="mp-setup">
        <div class="menu-section-title">Lobby</div>
        <div class="menu-row"><span>Map type</span>${mapTypeSelect("mp-maptype", state.mp.mapType)}</div>
        <div class="menu-hint" id="mp-maptype-desc"></div>
        <div class="menu-row"><span>Map size</span>${mapSelect("mp-map", "medium")}</div>
        <div class="menu-row"><span>Human players</span>${capacitySelect("mp-capacity", state.mp.capacity)}</div>
        <div class="menu-row"><span>Barbarians</span>${barbarianSelect("mp-barb", "normal")}</div>
        <div class="menu-row"><span>Natural wonders</span>${onOffSelect("mp-wonders", state.mp.naturalWonders)}</div>
        <div class="menu-field">
          <span>Starting treasury</span>
          ${goldChips("mp-gold", state.mp.startingGold)}
        </div>
        <div class="menu-hint" id="mp-gold-desc"></div>
        <div class="menu-section-title" style="margin-top:14px">Players & Opponents</div>
        <div id="mp-roster"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
          <b>Games</b>
          <span style="display:flex;gap:6px">
            <button class="menu-btn" id="refresh" style="width:auto">Refresh</button>
            <button class="menu-btn primary" id="create" style="width:auto">Create</button>
          </span>
        </div>
        <div id="game-list" style="margin-top:8px"></div>
        </div>
        <div id="mp-room" class="hidden"></div>
      </div>`;

    const status = (t: string) => ($("#status").textContent = t);
    const urlEl = $input("#url");
    const handleEl = $input("#handle");
    const pwEl = $input("#pw");

    urlEl.addEventListener("change", () => (state.mp.url = urlEl.value));
    handleEl.addEventListener("input", () => (state.mp.handle = handleEl.value));
    pwEl.addEventListener("input", () => (state.mp.password = pwEl.value));

    // Keep human-slot and AI colors unique, sizing the human list to capacity.
    const reconcileColors = (): void => {
      const used = new Set<string>();
      const humans: string[] = [];
      for (let i = 0; i < state.mp.capacity; i++) {
        let c = state.mp.humanColors[i];
        if (!c || used.has(c)) c = firstFreeColor(used);
        used.add(c);
        humans.push(c);
      }
      state.mp.humanColors = humans;
      for (const ai of state.mp.ais) {
        if (!ai.color || used.has(ai.color)) ai.color = firstFreeColor(used);
        used.add(ai.color);
      }
    };

    const renderRoster = (): void => {
      reconcileColors();
      const used = new Set<string>([...state.mp.humanColors, ...state.mp.ais.map((a) => a.color)]);
      const humans = state.mp.humanColors
        .map(
          (color, i) => `
        <div class="roster-row" data-row="human-${i}">
          <div class="roster-head">
            <span class="roster-tag you">Player ${i + 1}</span>
            <span class="roster-note">${i === 0 ? "Host" : "Open slot"} · picks civ in lobby</span>
            ${colorSelect(color, used)}
          </div>
        </div>`,
        )
        .join("");
      const takenCivs = new Set<string>(
        state.mp.ais.map((a) => a.civId).filter((c) => c !== RANDOM_CIV),
      );
      const ais = state.mp.ais
        .map(
          (ai, i) => `
        <div class="roster-row" data-row="ai-${i}">
          <div class="roster-head">
            <span class="roster-tag">AI ${i + 1}</span>
            <select class="menu-in roster-civ" data-civ="${i}">${civOptions(ai.civId, true, takenCivs)}</select>
            ${colorSelect(ai.color, used)}
            <button type="button" class="roster-remove" data-remove="${i}" title="Remove opponent">✕</button>
          </div>
        </div>`,
        )
        .join("");
      const add =
        state.mp.ais.length < MAX_AI
          ? `<button type="button" class="menu-btn roster-add" id="mp-add-ai">+ Add AI opponent</button>`
          : `<div class="menu-hint">Maximum of ${MAX_AI} AI opponents reached.</div>`;
      const root = $("#mp-roster");
      root.innerHTML = humans + ais + add;

      root.querySelectorAll<HTMLSelectElement>(".roster-civ").forEach((sel) =>
        sel.addEventListener("change", () => {
          state.mp.ais[Number(sel.dataset.civ)]!.civId = sel.value;
          renderRoster(); // refresh "taken" civ states across all dropdowns
        }),
      );
      root.querySelectorAll<HTMLSelectElement>(".cp-sel").forEach((sel) =>
        sel.addEventListener("change", () => {
          const rowKey = (sel.closest("[data-row]") as HTMLElement).dataset.row!;
          if (rowKey.startsWith("human-")) state.mp.humanColors[Number(rowKey.slice(6))] = sel.value;
          else state.mp.ais[Number(rowKey.slice(3))]!.color = sel.value;
          renderRoster();
        }),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) =>
        btn.addEventListener("click", () => {
          state.mp.ais.splice(Number(btn.dataset.remove), 1);
          renderRoster();
        }),
      );
      root.querySelector<HTMLButtonElement>("#mp-add-ai")?.addEventListener("click", () => {
        const used2 = new Set<string>([...state.mp.humanColors, ...state.mp.ais.map((a) => a.color)]);
        state.mp.ais.push({ civId: RANDOM_CIV, color: firstFreeColor(used2) });
        renderRoster();
      });
    };

    $select("#mp-capacity").addEventListener("change", () => {
      state.mp.capacity = Math.max(1, Math.min(12, Number($select("#mp-capacity").value)));
      renderRoster();
    });
    renderRoster();

    // Map type + starting-treasury chips (same controls as single player).
    const mpMapTypeSel = $select("#mp-maptype");
    const updateMpMapTypeDesc = () => {
      $("#mp-maptype-desc").textContent =
        MAP_TYPE_OPTIONS.find((o) => o.value === state.mp.mapType)?.desc ?? "";
    };
    mpMapTypeSel.addEventListener("change", () => {
      state.mp.mapType = mpMapTypeSel.value as MapType;
      updateMpMapTypeDesc();
    });
    updateMpMapTypeDesc();

    const updateMpGoldDesc = () => {
      $("#mp-gold-desc").textContent =
        GOLD_OPTIONS.find((o) => o.value === state.mp.startingGold)?.desc ?? "";
    };
    $("#mp-gold")
      .querySelectorAll<HTMLButtonElement>(".chip")
      .forEach((chip) =>
        chip.addEventListener("click", () => {
          state.mp.startingGold = chip.dataset.gold as StartingGold;
          $("#mp-gold")
            .querySelectorAll(".chip")
            .forEach((c) => c.classList.toggle("sel", c === chip));
          updateMpGoldDesc();
        }),
      );
    updateMpGoldDesc();

    const renderGames = (games: GameSummary[]) => {
      const list = $("#game-list");
      list.innerHTML =
        games.length === 0
          ? `<div class="menu-hint">No games yet — create one.</div>`
          : games
              .map(
                (g) => {
                  const isHost = g.hostUserId === state.mp.userId;
                  // Starting/leaving happens from the lobby room; the list only joins.
                  let buttons = `<button class="menu-btn" data-join="${g.id}" style="width:auto">Join</button>`;
                  if (isHost) {
                    buttons += ` <button class="menu-btn" data-delete="${g.id}" style="width:auto">Delete</button>`;
                  }
                  return `<div class="save-row"><span class="info"><span class="name">${escapeHtml(g.name)}</span><span class="meta">${g.players}/${g.capacity} players · ${g.status}</span></span><span style="display:flex;gap:6px">${buttons}</span></div>`;
                },
              )
              .join("");
      list.querySelectorAll<HTMLButtonElement>("[data-join]").forEach((el) =>
        el.addEventListener("click", () => mpSession?.send({ t: "joinGame", gameId: el.dataset.join! })),
      );
      list.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((el) =>
        el.addEventListener("click", () => {
          if (confirm("Delete this game? This cannot be undone.")) {
            mpSession?.send({ t: "deleteGame", gameId: el.dataset.delete! });
          }
        }),
      );
    };

    // The pre-game room: a live roster of seated players, each able to pick a
    // civilization. Replaces the create/join setup once you're seated in a game.
    const renderRoom = (): void => {
      const setupEl = left.querySelector<HTMLElement>("#mp-setup");
      const roomEl = left.querySelector<HTMLElement>("#mp-room");
      if (!setupEl || !roomEl) return; // not on the multiplayer screen right now
      const room = mpRoom;
      if (!room || joinedGameId !== room.gameId) {
        setupEl.classList.remove("hidden");
        roomEl.classList.add("hidden");
        return;
      }
      setupEl.classList.add("hidden");
      roomEl.classList.remove("hidden");

      const meHost = room.hostUserId === state.mp.userId;
      const mySlot = room.slots.find((s) => s.userId === state.mp.userId);
      // Concrete civs already claimed by any human slot or AI — for disabling.
      const takenAll = new Set<string>([
        ...room.slots.map((s) => s.civId).filter((c): c is string => !!c),
        ...room.aiCivIds.filter((c): c is string => !!c),
      ]);

      const humanRows = room.slots
        .map((s) => {
          const mine = s.userId === state.mp.userId;
          const civ = s.civId ? CIVILIZATIONS.find((c) => c.id === s.civId) : undefined;
          const tag = s.slot === 0 ? "Host" : `Player ${s.playerId + 1}`;
          const who = s.userId ? escapeHtml(s.handle ?? "Player") : "<i>Open slot</i>";
          const civCell = mine
            ? `<button type="button" class="menu-in civ-pick-btn" data-room-pick>
                 <span class="cpb-text">
                   <span class="cpb-name">${civ ? escapeHtml(civ.name) : "Random civilization"}</span>
                   <span class="cpb-leader">${civ ? escapeHtml(civ.leader) : "Tap to choose"}</span>
                 </span>
                 <span class="cpb-caret">&rsaquo;</span>
               </button>`
            : `<span class="roster-note" style="flex:1">${civ ? `${escapeHtml(civ.name)} — ${escapeHtml(civ.leader)}` : "🎲 Random civ"}</span>`;
          const randomBtn =
            mine && civ
              ? `<button type="button" class="roster-remove" data-room-random title="Use a random civ">🎲</button>`
              : "";
          return `
            <div class="roster-row">
              <div class="roster-head">
                <span class="roster-tag${mine ? " you" : ""}">${tag}</span>
                <span class="roster-note" style="flex:0 0 auto">${who}</span>
                ${civCell}
                ${randomBtn}
              </div>
            </div>`;
        })
        .join("");

      const aiRows = room.aiCivIds
        .map((cid, i) => {
          const civ = cid ? CIVILIZATIONS.find((c) => c.id === cid) : undefined;
          return `
            <div class="roster-row">
              <div class="roster-head">
                <span class="roster-tag">AI ${i + 1}</span>
                <span class="roster-note">${civ ? `${escapeHtml(civ.name)} — ${escapeHtml(civ.leader)}` : "🎲 Random civ"}</span>
              </div>
            </div>`;
        })
        .join("");

      const filled = room.slots.filter((s) => s.userId).length;
      const actions = meHost
        ? `<div class="menu-back-row">
             <button class="menu-btn secondary" id="room-delete">Delete game</button>
             <button class="menu-btn primary" id="room-start">Start Game</button>
           </div>`
        : `<div class="menu-hint" style="margin-top:14px">Waiting for the host to start the game…</div>`;

      roomEl.innerHTML = `
        <div class="menu-section-title">Lobby — ${filled}/${room.capacity} players</div>
        <div class="menu-hint">Choose your civilization below. Civs already taken are disabled.</div>
        ${humanRows}
        ${aiRows ? `<div class="menu-section-title" style="margin-top:12px">AI opponents</div>${aiRows}` : ""}
        ${actions}`;

      roomEl.querySelector<HTMLButtonElement>("[data-room-pick]")?.addEventListener("click", () => {
        const takenByOthers = new Set(takenAll);
        if (mySlot?.civId) takenByOthers.delete(mySlot.civId);
        const initial =
          mySlot?.civId && CIVILIZATIONS.some((c) => c.id === mySlot.civId)
            ? mySlot.civId
            : (CIVS_BY_NAME.find((c) => !takenByOthers.has(c.id)) ?? CIVS_BY_NAME[0]!).id;
        openCivPicker(initial, takenByOthers, (civId) =>
          mpSession?.send({ t: "pickCiv", gameId: room.gameId, civId }),
        );
      });
      roomEl.querySelector<HTMLButtonElement>("[data-room-random]")?.addEventListener("click", () =>
        mpSession?.send({ t: "pickCiv", gameId: room.gameId, civId: null }),
      );
      roomEl.querySelector<HTMLButtonElement>("#room-start")?.addEventListener("click", () =>
        mpSession?.send({ t: "startGame", gameId: room.gameId }),
      );
      roomEl.querySelector<HTMLButtonElement>("#room-delete")?.addEventListener("click", () => {
        if (confirm("Delete this game? This cannot be undone.")) {
          mpSession?.send({ t: "deleteGame", gameId: room.gameId });
        }
      });
    };

    const connectAndAuth = async (kind: "register" | "login") => {
      const url = urlEl.value.trim();
      const handle = handleEl.value.trim();
      const password = pwEl.value;
      if (!handle || !password) return status("Enter a handle and password.");
      if (!mpSession) {
        mpSession = new OnlineSession(url);
        mpSession.on((m) => {
          if (m.t === "error") status(m.message);
          else if (m.t === "authOk") {
            state.mp.userId = m.userId;
            status(`Signed in as ${m.handle}`);
            $("#games").classList.remove("hidden");
            mpSession!.send({ t: "listGames" });
          } else if (m.t === "games") renderGames(m.games);
          else if (m.t === "lobby") {
            mpRoom = m.room;
            renderRoom();
          } else if (m.t === "deleted") {
            if (joinedGameId === m.gameId) {
              joinedGameId = null;
              mpRoom = null;
              status("Game deleted by host.");
              renderRoom();
            }
            mpSession!.send({ t: "listGames" });
          }
          else if (m.t === "joined") {
            joinedGameId = m.gameId;
            status(`Joined game — you are player ${m.playerId + 1}`);
            mpSession!.send({ t: "listGames" });
          } else if (m.t === "started") {
            close();
            mpSession!.gameId = joinedGameId ?? undefined;
            onStart(mpSession!, mpSetup);
          }
        });
        try {
          await mpSession.connect();
        } catch {
          mpSession = null;
          return status("Could not connect to server.");
        }
      }
      mpSession.send({ t: kind, handle, password });
    };

    $("#back").addEventListener("click", () => showScreen("start"));
    $("#register").addEventListener("click", () => void connectAndAuth("register"));
    $("#login").addEventListener("click", () => void connectAndAuth("login"));
    $("#refresh").addEventListener("click", () => mpSession?.send({ t: "listGames" }));
    $("#create").addEventListener("click", () => {
      const mpMapSize = ($select("#mp-map").value as MapSize) ?? "medium";
      const dims = MAP_DIMENSIONS[mpMapSize];
      const mpBarb = $select("#mp-barb").value as BarbLevel;
      const mpWonders = $select("#mp-wonders").value === "on";
      const mpAiCivIds = state.mp.ais.map((a) => (a.civId === RANDOM_CIV ? null : a.civId));
      reconcileColors();
      // Remember the host's setup so it can ride along with analytics on start.
      mpSetup = {
        mapType: state.mp.mapType,
        mapSize: mpMapSize,
        startingGold: state.mp.startingGold,
        naturalWonders: mpWonders,
        barbarianLevel: mpBarb,
        aiCivIds: mpAiCivIds,
      };
      mpSession?.send({
        t: "createGame",
        name: `${handleEl.value || "Player"}'s game`,
        cols: dims.cols,
        rows: dims.rows,
        mapType: state.mp.mapType,
        capacity: state.mp.capacity,
        aiCivIds: mpAiCivIds,
        colors: [...state.mp.humanColors, ...state.mp.ais.map((a) => a.color)],
        barbarians: mpBarb,
        naturalWonders: mpWonders,
        startingGold: state.mp.startingGold,
      });
    });
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
