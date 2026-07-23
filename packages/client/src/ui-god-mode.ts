// God Mode cheat panel — lazy-loaded from ui.ts (single-player only).

import {
  isNaval,
  isPassableLand,
  isWaterTerrain,
  TERRAIN_NAMES,
  UNIT_DEFS,
  workName,
  type GameState,
  type Unit,
  type UnitTypeId,
} from "@roc/sim";
import type { Tile } from "@roc/shared";
import { WONDER_DEFS } from "@roc/data";
import { CHEAT_WORK_KINDS, type CheatAction } from "./god-mode";
import { bindDialogClose, dialogHeader } from "./dialog-close";
import { withPreservedScroll } from "./panel-scroll";

export interface GodModeHandlers {
  onCheat(action: CheatAction): void;
  onToggleLiftFog(enabled: boolean): void;
}

export interface GodModeView {
  state: GameState;
  viewerId: number;
  selectedUnit: Unit | null;
  selectedTile?: Tile | null;
  liftFog?: boolean;
}

export interface GodModePanel {
  render(view: GodModeView): void;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function signature(view: GodModeView): string {
  const tile = view.selectedTile;
  const tileKey = tile ? `${tile.col},${tile.row},${tile.terrain}` : "none";
  const unitKey = view.selectedUnit ? `${view.selectedUnit.id},${view.selectedUnit.col},${view.selectedUnit.row}` : "none";
  const wonders = [...view.state.completedWonders].sort().join(",");
  return `${view.liftFog ? 1 : 0}|${tileKey}|${unitKey}|${wonders}`;
}

function unitOptions(tile: Tile | undefined): string {
  const waterTile = !!tile && isWaterTerrain(tile.terrain);
  return Object.entries(UNIT_DEFS)
    .filter(([, d]) => (waterTile ? isNaval(d) : !isNaval(d)))
    .map(([id, d]) => `<option value="${id}">${escapeHtml(d.name)}</option>`)
    .join("");
}

export function mountGodModePanel(godPanel: HTMLElement, handlers: GodModeHandlers): GodModePanel {
  let open = false;
  let renderSig = "";

  godPanel.innerHTML =
    dialogHeader("God Mode", "god-close") +
    `<div class="panel-dialog-body" id="god-panel-body"></div>`;
  const godBody = godPanel.querySelector<HTMLDivElement>("#god-panel-body")!;

  const closePanel = (): void => {
    open = false;
    godPanel.classList.add("hidden");
    renderSig = "";
  };
  bindDialogClose(godPanel.querySelector<HTMLButtonElement>("#god-close")!, closePanel);

  const render = (view: GodModeView): void => {
    godPanel.classList.toggle("hidden", !open);
    if (!open) {
      renderSig = "";
      return;
    }
    const sig = signature(view);
    if (sig === renderSig) return;

    const tile = view.selectedTile;
    const tileOk = !!tile && isPassableLand(tile.terrain);
    const waterTile = !!tile && isWaterTerrain(tile.terrain);
    const spawnTileOk = tileOk || waterTile;
    const teleportUnit =
      view.selectedUnit && view.selectedUnit.ownerId === view.viewerId ? view.selectedUnit : null;
    const options = unitOptions(tile ?? undefined);
    const builtWonders = new Set(view.state.completedWonders);
    const wonderOptions = WONDER_DEFS.filter((w) => !builtWonders.has(w.id))
      .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
      .join("");

    let html = `<div style="display:flex;flex-direction:column;gap:8px">` +
      `<button class="btn" data-cheat="unlockTechs">Unlock All Techs</button>` +
      `<button class="btn" data-cheat="completeWorks">Complete All Works</button>` +
      `<button class="btn" data-cheat="healUnits">Heal All Units</button>` +
      `<button class="btn" data-cheat="revealMap">Reveal Map</button>` +
      `<button class="btn" id="god-liftfog"${view.liftFog ? ` style="background:#2f5a2f;border-color:#4a8a4a"` : ""}>` +
      `Lift Fog of War: ${view.liftFog ? "On" : "Off"}</button>` +
      `<button class="btn" data-cheat="addGold" data-amount="100">+100 Gold</button>` +
      `<button class="btn" data-cheat="addPopulation">Add Population</button>` +
      `<button class="btn" data-cheat="addResource" data-resource="copper" data-amount="5">+5 Copper</button>` +
      `<button class="btn" data-cheat="addResource" data-resource="iron" data-amount="5">+5 Iron</button>` +
      `<button class="btn" data-cheat="addResource" data-resource="horses" data-amount="5">+5 Horses</button>`;

    if (tileOk) {
      html +=
        `<div class="csub">Selected Tile (${escapeHtml(TERRAIN_NAMES[tile.terrain])})</div>` +
        `<button class="btn" data-cheat="buildRoad" data-level="1">Build Dirt Road</button>` +
        `<button class="btn" data-cheat="buildRoad" data-level="2">Build Paved Road</button>` +
        `<button class="btn" data-cheat="buildRoad" data-level="3">Build Imperial Road</button>` +
        `<button class="btn" data-cheat="foundCity">Found City</button>` +
        `<div class="csub">Construction Works</div>` +
        `<div class="row" style="flex-wrap:wrap;gap:6px">` +
        CHEAT_WORK_KINDS.map((k) => `<button class="btn" data-cheat="buildWork" data-kind="${k}">${workName(k, 3)}</button>`).join("") +
        `</div>` +
        (wonderOptions
          ? `<div class="csub">Wonders</div>` +
            `<div style="display:flex;gap:6px;align-items:center;margin-top:4px">` +
            `<select id="cheat-wonder" class="lobby-in" style="flex:1">${wonderOptions}</select>` +
            `<button class="btn" data-cheat="buildWonder">Build Wonder</button>` +
            `</div>`
          : `<div class="csub">Wonders</div><div class="sub">All wonders built.</div>`);
    } else if (waterTile) {
      html +=
        `<div class="csub">Selected Tile (${escapeHtml(TERRAIN_NAMES[tile.terrain])})</div>` +
        `<div class="sub">Land tile cheats need passable land. Naval units can spawn here.</div>`;
    } else if (tile) {
      html +=
        `<div class="csub">Selected Tile (${escapeHtml(TERRAIN_NAMES[tile.terrain])})</div>` +
        `<div class="sub">Select passable land or water for tile cheats.</div>`;
    } else {
      html +=
        `<div class="csub">Selected Tile</div>` +
        `<div class="sub">Select a tile to use tile cheats.</div>`;
    }

    if (spawnTileOk && options) {
      html +=
        `<div style="display:flex;gap:6px;align-items:center;margin-top:4px">` +
        `<select id="cheat-unit" class="lobby-in" style="flex:1">${options}</select>` +
        `<button class="btn" data-cheat="spawnUnit">Spawn Unit</button>` +
        `</div>`;
    } else if (spawnTileOk) {
      html += `<div class="sub">No units available for this tile type.</div>`;
    }

    if (teleportUnit && spawnTileOk) {
      const unitLabel = escapeHtml(UNIT_DEFS[teleportUnit.type].name);
      html += `<button class="btn" data-cheat="teleportUnit">Teleport ${unitLabel} here</button>`;
    } else if (teleportUnit) {
      html += `<div class="sub">Select a passable land or water tile to teleport ${escapeHtml(UNIT_DEFS[teleportUnit.type].name)}.</div>`;
    } else if (spawnTileOk) {
      html += `<div class="sub">Select one of your units to teleport it to this tile.</div>`;
    }
    html += `</div>`;

    withPreservedScroll(godBody, () => {
      godBody.innerHTML = html;
    });
    renderSig = sig;

    godBody.querySelector<HTMLButtonElement>("#god-liftfog")?.addEventListener("click", () => {
      handlers.onToggleLiftFog(!view.liftFog);
    });
    godBody.querySelectorAll<HTMLButtonElement>("[data-cheat]").forEach((el) => {
      el.addEventListener("click", () => {
        const type = el.dataset.cheat!;
        switch (type) {
          case "unlockTechs":
            handlers.onCheat({ type: "unlockTechs" });
            break;
          case "completeWorks":
            handlers.onCheat({ type: "completeWorks" });
            break;
          case "healUnits":
            handlers.onCheat({ type: "healUnits" });
            break;
          case "revealMap":
            handlers.onCheat({ type: "revealMap" });
            break;
          case "addGold":
            handlers.onCheat({ type: "addGold", amount: Number(el.dataset.amount) });
            break;
          case "addPopulation":
            handlers.onCheat({ type: "addPopulation" });
            break;
          case "addResource":
            handlers.onCheat({ type: "addResource", resource: el.dataset.resource!, amount: Number(el.dataset.amount) });
            break;
          case "buildRoad": {
            if (!tile) break;
            handlers.onCheat({
              type: "buildRoad",
              col: tile.col,
              row: tile.row,
              level: Number(el.dataset.level) as 1 | 2 | 3,
            });
            break;
          }
          case "foundCity": {
            if (!tile) break;
            handlers.onCheat({ type: "foundCity", col: tile.col, row: tile.row });
            break;
          }
          case "buildWork": {
            if (!tile) break;
            handlers.onCheat({
              type: "buildWork",
              kind: el.dataset.kind!,
              col: tile.col,
              row: tile.row,
            });
            break;
          }
          case "spawnUnit": {
            if (!tile) break;
            const sel = godBody.querySelector<HTMLSelectElement>("#cheat-unit")!;
            handlers.onCheat({
              type: "spawnUnit",
              unitType: sel.value as UnitTypeId,
              col: tile.col,
              row: tile.row,
            });
            break;
          }
          case "teleportUnit": {
            const unit = view.selectedUnit;
            if (!unit || !tile) break;
            handlers.onCheat({
              type: "teleportUnit",
              unitId: unit.id,
              col: tile.col,
              row: tile.row,
            });
            break;
          }
          case "buildWonder": {
            if (!tile) break;
            const sel = godBody.querySelector<HTMLSelectElement>("#cheat-wonder");
            if (!sel || !sel.value) break;
            handlers.onCheat({
              type: "buildWonder",
              wonderId: sel.value,
              col: tile.col,
              row: tile.row,
            });
            break;
          }
        }
      });
    });
  };

  return {
    render,
    isOpen: () => open,
    open: () => {
      open = true;
    },
    close: () => {
      closePanel();
    },
  };
}

/** Warm the god-mode panel chunk during tier-2 preload. */
export function preloadGodModePanelModule(): void {
  void import("./ui-god-mode");
}
