// Full technology tree view: a DAG laid out in columns by "tier" (longest path
// from a root). Node order within each tier is optimised with barycenter sweeps
// to reduce edge crossings. Hovering/clicking a tech highlights its full
// prerequisite chain (nodes + edges) and dims the rest.

import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  CIVICS_REQUIRED_TECH,
  RELIGION_REQUIRED_TECH,
  BARBARIAN_DIPLOMACY_TECH,
  type GameState,
  type TechId,
} from "@roc/sim";

const NODE_W = 184;
const NODE_H = 92;
const COL_GAP = 70;
const ROW_GAP = 20;
const PAD = 24;
const COL_W = NODE_W + COL_GAP;
const ROW_H = NODE_H + ROW_GAP;

type Status = "done" | "researching" | "queued" | "available" | "locked";

const ALL_TECHS = Object.keys(TECH_DEFS) as TechId[];

function unlocksOf(techId: TechId): { units: string[]; buildings: string[]; systems: string[] } {
  const units = Object.values(UNIT_DEFS).filter((d) => d.reqTech === techId).map((d) => d.name);
  const buildings = Object.values(BUILDING_DEFS).filter((d) => d.reqTech === techId).map((d) => d.name);
  const systems: string[] = [];
  if (techId === CIVICS_REQUIRED_TECH) systems.push("Civics");
  if (techId === RELIGION_REQUIRED_TECH) systems.push("Religion");
  if (techId === BARBARIAN_DIPLOMACY_TECH) systems.push("Bribe & Recruit Barbarians");
  return { units, buildings, systems };
}

/** Transitive prerequisite closure (the tech plus everything it requires). */
const closureCache = new Map<TechId, Set<TechId>>();
function prereqClosure(id: TechId): Set<TechId> {
  const cached = closureCache.get(id);
  if (cached) return cached;
  const set = new Set<TechId>([id]);
  for (const p of TECH_DEFS[id].prereqs as TechId[]) for (const a of prereqClosure(p)) set.add(a);
  closureCache.set(id, set);
  return set;
}

function computeTiers(): Map<TechId, number> {
  const tiers = new Map<TechId, number>();
  const visit = (id: TechId): number => {
    const cached = tiers.get(id);
    if (cached !== undefined) return cached;
    const prereqs = TECH_DEFS[id].prereqs as TechId[];
    const tier = prereqs.length === 0 ? 0 : Math.max(...prereqs.map(visit)) + 1;
    tiers.set(id, tier);
    return tier;
  };
  for (const id of ALL_TECHS) visit(id);
  return tiers;
}

/** Order each tier to minimise edge crossings (barycenter sweeps). */
function orderColumns(columns: TechId[][]): void {
  const dependents = new Map<TechId, TechId[]>();
  for (const id of ALL_TECHS) {
    for (const p of TECH_DEFS[id].prereqs as TechId[]) {
      (dependents.get(p) ?? dependents.set(p, []).get(p)!).push(id);
    }
  }
  const row = new Map<TechId, number>();
  const reindex = () => columns.forEach((col) => col.forEach((id, i) => row.set(id, i)));
  reindex();

  const bary = (id: TechId, down: boolean): number => {
    const neigh = down ? (TECH_DEFS[id].prereqs as TechId[]) : (dependents.get(id) ?? []);
    if (neigh.length === 0) return row.get(id)!;
    return neigh.reduce((s, n) => s + row.get(n)!, 0) / neigh.length;
  };

  for (let iter = 0; iter < 8; iter++) {
    const down = iter % 2 === 0;
    const tiers = down ? [...columns.keys()] : [...columns.keys()].reverse();
    for (const tier of tiers) {
      const col = columns[tier]!;
      const b = new Map(col.map((id) => [id, bary(id, down)]));
      col.sort((a, c) => b.get(a)! - b.get(c)!);
      reindex();
    }
  }
}

export function renderTechTreeInto(
  el: HTMLElement,
  state: GameState,
  viewerId: number,
  onPick: (techId: TechId) => void,
  onPickTarget?: (techId: TechId) => void,
): void {
  const player = state.players.find((p) => p.id === viewerId);
  const researched = player?.researched ?? new Set<TechId>();
  const researching = player?.researching ?? null;
  const queued = new Set<TechId>(player?.researchQueue ?? []);

  const statusOf = (id: TechId): Status => {
    if (researched.has(id)) return "done";
    if (researching === id) return "researching";
    if (queued.has(id)) return "queued";
    if (TECH_DEFS[id].prereqs.every((p) => researched.has(p as TechId))) return "available";
    return "locked";
  };

  const tiers = computeTiers();
  const columns: TechId[][] = [];
  for (const id of ALL_TECHS) {
    const t = tiers.get(id)!;
    (columns[t] ??= []).push(id);
  }
  for (const col of columns) col.sort((a, b) => TECH_DEFS[a].name.localeCompare(TECH_DEFS[b].name));
  orderColumns(columns);

  const pos = new Map<TechId, { x: number; y: number }>();
  let maxRows = 0;
  columns.forEach((col, tier) => {
    maxRows = Math.max(maxRows, col.length);
    col.forEach((id, r) => pos.set(id, { x: PAD + tier * COL_W, y: PAD + r * ROW_H }));
  });
  const width = PAD * 2 + columns.length * COL_W - COL_GAP;
  const height = PAD * 2 + maxRows * ROW_H - ROW_GAP;

  let edges = "";
  for (const id of ALL_TECHS) {
    const to = pos.get(id)!;
    for (const pre of TECH_DEFS[id].prereqs as TechId[]) {
      const from = pos.get(pre)!;
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const mx = (x1 + x2) / 2;
      const done = researched.has(pre);
      edges +=
        `<path class="tt-edge${done ? " tt-edge-done" : ""}" data-from="${pre}" data-to="${id}" ` +
        `d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke-width="2"/>`;
    }
  }

  let nodes = "";
  for (const id of ALL_TECHS) {
    const p = pos.get(id)!;
    const def = TECH_DEFS[id];
    const st = statusOf(id);
    const u = unlocksOf(id);
    const parts: string[] = [];
    for (const n of u.units) parts.push(`⚔ ${n}`);
    for (const n of u.buildings) parts.push(`🏛 ${n}`);
    for (const n of u.systems) parts.push(`★ ${n}`);
    const unlockLine = parts.length ? `<div class="tt-unlocks">${parts.join(" · ")}</div>` : "";
    nodes +=
      `<div class="tt-node tt-${st}" data-tech="${id}" style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px">` +
      `<div class="tt-name">${def.name}</div>` +
      `<div class="tt-cost">${def.cost > 0 ? `🔬 ${def.cost}` : "start"}</div>` +
      unlockLine +
      `</div>`;
  }

  el.innerHTML =
    `<div class="tt-scroll" style="position:relative;width:${width}px;height:${height}px">` +
    `<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none">${edges}</svg>` +
    nodes +
    `</div>`;

  // ---- prerequisite highlighting (hover + click-to-pin) ----
  const nodeEls = [...el.querySelectorAll<HTMLDivElement>(".tt-node")];
  const pathEls = [...el.querySelectorAll<SVGPathElement>(".tt-edge")];
  let pinned: TechId | null = null;

  const applyHighlight = (id: TechId | null): void => {
    const hl = id ? prereqClosure(id) : null;
    for (const node of nodeEls) {
      const t = node.dataset.tech as TechId;
      node.classList.toggle("tt-hl", !!hl && hl.has(t));
      node.classList.toggle("tt-dim", !!hl && !hl.has(t));
    }
    for (const path of pathEls) {
      const on = !!hl && hl.has(path.dataset.from as TechId) && hl.has(path.dataset.to as TechId);
      path.classList.toggle("tt-edge-hl", on);
      path.classList.toggle("tt-edge-dim", !!hl && !on);
    }
  };

  for (const node of nodeEls) {
    const id = node.dataset.tech as TechId;
    node.addEventListener("mouseenter", () => applyHighlight(id));
    node.addEventListener("mouseleave", () => applyHighlight(pinned));
    node.addEventListener("click", () => {
      if (node.classList.contains("tt-available")) {
        onPick(id);
      } else if (onPickTarget && (node.classList.contains("tt-locked") || node.classList.contains("tt-queued"))) {
        onPickTarget(id);
      } else {
        pinned = pinned === id ? null : id; // pin/unpin the chain for study
        applyHighlight(pinned);
      }
    });
  }
}
