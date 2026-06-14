// Full technology tree view: a DAG laid out in columns by "tier" (longest path
// from a root), with SVG edges from each prerequisite to its dependents, and a
// summary of what each tech unlocks (units, buildings, and the Civics/Religion
// systems). Available techs are clickable to start researching.

import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  CIVICS_REQUIRED_TECH,
  RELIGION_REQUIRED_TECH,
  type GameState,
  type TechId,
} from "@roc/sim";

const NODE_W = 184;
const NODE_H = 92;
const COL_GAP = 64;
const ROW_GAP = 18;
const PAD = 24;
const COL_W = NODE_W + COL_GAP;
const ROW_H = NODE_H + ROW_GAP;

type Status = "done" | "researching" | "available" | "locked";

function unlocksOf(techId: TechId): { units: string[]; buildings: string[]; systems: string[] } {
  const units = Object.values(UNIT_DEFS).filter((d) => d.reqTech === techId).map((d) => d.name);
  const buildings = Object.values(BUILDING_DEFS).filter((d) => d.reqTech === techId).map((d) => d.name);
  const systems: string[] = [];
  if (techId === CIVICS_REQUIRED_TECH) systems.push("Civics");
  if (techId === RELIGION_REQUIRED_TECH) systems.push("Religion");
  return { units, buildings, systems };
}

/** Compute each tech's column tier = longest prerequisite chain length. */
function computeTiers(): Map<TechId, number> {
  const tiers = new Map<TechId, number>();
  const visit = (id: TechId): number => {
    const cached = tiers.get(id);
    if (cached !== undefined) return cached;
    const prereqs = TECH_DEFS[id].prereqs;
    const tier = prereqs.length === 0 ? 0 : Math.max(...prereqs.map((p) => visit(p as TechId))) + 1;
    tiers.set(id, tier);
    return tier;
  };
  for (const id of Object.keys(TECH_DEFS) as TechId[]) visit(id);
  return tiers;
}

/** Render the tech tree into `el` for the given player; clicking a researchable
 *  tech calls `onPick`. */
export function renderTechTreeInto(
  el: HTMLElement,
  state: GameState,
  viewerId: number,
  onPick: (techId: TechId) => void,
): void {
  const player = state.players.find((p) => p.id === viewerId);
  const researched = player?.researched ?? new Set<TechId>();
  const researching = player?.researching ?? null;

  const statusOf = (id: TechId): Status => {
    if (researched.has(id)) return "done";
    if (researching === id) return "researching";
    if (TECH_DEFS[id].prereqs.every((p) => researched.has(p as TechId))) return "available";
    return "locked";
  };

  const tiers = computeTiers();
  const columns: TechId[][] = [];
  for (const id of Object.keys(TECH_DEFS) as TechId[]) {
    const t = tiers.get(id)!;
    (columns[t] ??= []).push(id);
  }
  for (const col of columns) col.sort((a, b) => TECH_DEFS[a].name.localeCompare(TECH_DEFS[b].name));

  // Position every node.
  const pos = new Map<TechId, { x: number; y: number }>();
  let maxRows = 0;
  columns.forEach((col, tier) => {
    maxRows = Math.max(maxRows, col.length);
    col.forEach((id, row) => {
      pos.set(id, { x: PAD + tier * COL_W, y: PAD + row * ROW_H });
    });
  });
  const width = PAD * 2 + columns.length * COL_W - COL_GAP;
  const height = PAD * 2 + maxRows * ROW_H - ROW_GAP;

  // Edges: prerequisite right-center -> tech left-center (cubic bezier).
  let edges = "";
  for (const id of Object.keys(TECH_DEFS) as TechId[]) {
    const to = pos.get(id)!;
    for (const pre of TECH_DEFS[id].prereqs as TechId[]) {
      const from = pos.get(pre)!;
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const mx = (x1 + x2) / 2;
      const done = researched.has(pre);
      edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${done ? "#5fcf61" : "#3a5269"}" stroke-width="2" opacity="${done ? 0.85 : 0.5}"/>`;
    }
  }

  // Nodes.
  let nodes = "";
  for (const id of Object.keys(TECH_DEFS) as TechId[]) {
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
      (def.cost > 0 ? `<div class="tt-cost">🔬 ${def.cost}</div>` : `<div class="tt-cost">start</div>`) +
      unlockLine +
      `</div>`;
  }

  el.innerHTML =
    `<div class="tt-scroll" style="position:relative;width:${width}px;height:${height}px">` +
    `<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none">${edges}</svg>` +
    nodes +
    `</div>`;

  el.querySelectorAll<HTMLDivElement>(".tt-node.tt-available").forEach((node) =>
    node.addEventListener("click", () => onPick(node.dataset.tech as TechId)),
  );
}
