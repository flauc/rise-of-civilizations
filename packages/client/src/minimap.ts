import { axialToOffset, pixelToAxial } from "@roc/shared";
import type { GameState } from "@roc/sim";
import { Camera } from "./camera";
import { BASE_SIZE } from "./renderer";
import { TERRAIN_COLORS } from "./palette";

export interface Minimap {
  draw(
    state: GameState,
    viewerId: number,
    explored: Set<string>,
    visible: Set<string>,
    camera: Camera,
    cssWidth: number,
    cssHeight: number,
  ): void;
}

const MM_WIDTH = 196;

/** A small overview map. Click to recenter the main camera (via onSelect). */
export function createMinimap(onSelect: (col: number, row: number) => void): Minimap {
  const canvas = document.createElement("canvas");
  canvas.id = "minimap";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  let cols = 0;
  let rows = 0;
  let cellW = 0;
  let cellH = 0;

  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * cols);
    const row = Math.floor(((e.clientY - r.top) / r.height) * rows);
    if (col >= 0 && row >= 0 && col < cols && row < rows) onSelect(col, row);
  });

  const colorOf = (state: GameState, ownerId: number) =>
    state.players.find((p) => p.id === ownerId)?.color ?? "#aaa";

  return {
    draw(state, viewerId, explored, visible, camera, cssWidth, cssHeight) {
      cols = state.map.cols;
      rows = state.map.rows;
      const mmH = Math.round(MM_WIDTH * (rows / cols) * 0.82);
      if (canvas.width !== MM_WIDTH || canvas.height !== mmH) {
        canvas.width = MM_WIDTH;
        canvas.height = mmH;
      }
      cellW = MM_WIDTH / cols;
      cellH = mmH / rows;

      ctx.fillStyle = "#0a1320";
      ctx.fillRect(0, 0, MM_WIDTH, mmH);

      // terrain
      for (const t of state.map.tiles) {
        const key = `${t.col},${t.row}`;
        if (!explored.has(key)) continue;
        const x = t.col * cellW;
        const y = t.row * cellH;
        ctx.fillStyle = TERRAIN_COLORS[t.terrain];
        ctx.fillRect(x, y, cellW + 0.6, cellH + 0.6);
        if (!visible.has(key)) {
          ctx.fillStyle = "rgba(8,16,26,0.45)";
          ctx.fillRect(x, y, cellW + 0.6, cellH + 0.6);
        }
      }
      // cities (bigger) and units (dots)
      const dot = (col: number, row: number, color: string, size: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(col * cellW - size / 2 + cellW / 2, row * cellH - size / 2 + cellH / 2, size, size);
      };
      for (const c of state.cities.values()) {
        if (c.ownerId === viewerId || visible.has(`${c.col},${c.row}`)) dot(c.col, c.row, colorOf(state, c.ownerId), 4);
      }
      for (const u of state.units.values()) {
        if (u.ownerId === viewerId || visible.has(`${u.col},${u.row}`)) dot(u.col, u.row, colorOf(state, u.ownerId), 2.5);
      }

      // viewport rectangle
      const corner = (sx: number, sy: number) => {
        const a = pixelToAxial({ x: camera.screenToWorldX(sx), y: camera.screenToWorldY(sy) }, BASE_SIZE);
        return axialToOffset({ q: Math.round(a.q), r: Math.round(a.r) });
      };
      const tl = corner(0, 0);
      const br = corner(cssWidth, cssHeight);
      const rx = Math.max(0, tl.col * cellW);
      const ry = Math.max(0, tl.row * cellH);
      const rw = Math.min(MM_WIDTH, (br.col - tl.col) * cellW);
      const rh = Math.min(mmH, (br.row - tl.row) * cellH);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(2, rw), Math.max(2, rh));
    },
  };
}
