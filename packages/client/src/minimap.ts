import { axialToOffset, offsetToAxial, pixelToAxial } from "@roc/shared";
import type { GameState } from "@roc/sim";
import { Camera } from "./camera";
import { BASE_SIZE, VSQUISH } from "./renderer";
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

const MM_SIZE = 220;
const RADIUS = MM_SIZE / 2;
const MIN_HALF_WINDOW = 9;
const EXPLORATION_BUFFER = 5;
const BG = "#0a1624";

/** Compute axial distance between two offset coordinates. */
function offsetDistance(a: { col: number; row: number }, b: { col: number; row: number }): number {
  const aa = offsetToAxial(a);
  const ba = offsetToAxial(b);
  return (Math.abs(aa.q - ba.q) + Math.abs(aa.q + aa.r - ba.q - ba.r) + Math.abs(aa.r - ba.r)) / 2;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * A circular, player-centered minimap. It shows only a small window around the
 * camera, grows slightly as the player explores, and uses a heavy radial fade
 * so the boundary between explored and unexplored/out-of-bounds is invisible.
 * The background matches the game canvas so the widget itself does not stand
 * out or reveal map edges.
 */
export function createMinimap(onSelect: (col: number, row: number) => void): Minimap {
  const canvas = document.createElement("canvas");
  canvas.id = "minimap";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  canvas.width = MM_SIZE;
  canvas.height = MM_SIZE;

  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left - RADIUS;
    const py = e.clientY - r.top - RADIUS;
    if (px * px + py * py > RADIUS * RADIUS) return;
    onSelect(lastCenter.col + px / lastCellW, lastCenter.row + py / lastCellH);
  });

  let lastCenter = { col: 0, row: 0 };
  let lastCellW = 1;
  let lastCellH = 1;

  const colorOf = (state: GameState, ownerId: number) =>
    state.players.find((p) => p.id === ownerId)?.color ?? "#aaa";

  return {
    draw(state, viewerId, explored, visible, camera, cssWidth, cssHeight) {
      const cols = state.map.cols;
      const rows = state.map.rows;

      // Camera center in tile coordinates.
      const centerWorld = {
        x: camera.screenToWorldX(cssWidth / 2),
        y: camera.screenToWorldY(cssHeight / 2) / VSQUISH,
      };
      const centerAxial = pixelToAxial(centerWorld, BASE_SIZE);
      const camCenter = axialToOffset({ q: Math.round(centerAxial.q), r: Math.round(centerAxial.r) });

      // Explored spread determines how large the minimap window is.
      let exploredSpread = 0;
      let exploredCentroid = { col: cols / 2, row: rows / 2 };
      if (explored.size > 0) {
        let sumCol = 0;
        let sumRow = 0;
        for (const key of explored) {
          const [col, row] = key.split(",").map(Number) as [number, number];
          sumCol += col;
          sumRow += row;
        }
        exploredCentroid = { col: sumCol / explored.size, row: sumRow / explored.size };
        for (const key of explored) {
          const [col, row] = key.split(",").map(Number) as [number, number];
          exploredSpread = Math.max(exploredSpread, offsetDistance(exploredCentroid, { col, row }));
        }
      }

      // While the empire is tiny, gently pull the minimap center toward the
      // explored centroid so the start area is visible; afterwards follow the camera.
      const center =
        explored.size < 40
          ? {
              col: exploredCentroid.col * 0.55 + camCenter.col * 0.45,
              row: exploredCentroid.row * 0.55 + camCenter.row * 0.45,
            }
          : camCenter;

      // Window grows with exploration but never reaches the map edge.
      const mapHalf = Math.min(cols, rows) / 2;
      const maxHalfWindow = Math.max(MIN_HALF_WINDOW, mapHalf - 4);
      const halfWindow = Math.min(maxHalfWindow, Math.max(MIN_HALF_WINDOW, exploredSpread + EXPLORATION_BUFFER));
      const windowW = halfWindow * 2;
      const windowH = halfWindow * 2;
      const cellW = MM_SIZE / windowW;
      const cellH = MM_SIZE / windowH;

      lastCenter = center;
      lastCellW = cellW;
      lastCellH = cellH;

      // Clear to transparent; the CSS backing provides the game background color.
      ctx.clearRect(0, 0, MM_SIZE, MM_SIZE);

      ctx.save();
      ctx.beginPath();
      ctx.arc(RADIUS, RADIUS, RADIUS - 1, 0, Math.PI * 2);
      ctx.clip();

      // Inner background matches the game background exactly.
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);

      const startCol = Math.floor(center.col - halfWindow);
      const startRow = Math.floor(center.row - halfWindow);
      const fadeStart = RADIUS * 0.35;
      const fadeEnd = RADIUS * 0.78;

      // Terrain with per-tile radial fade so explored edges blend into fog.
      for (let r = 0; r < windowH; r++) {
        for (let c = 0; c < windowW; c++) {
          const col = startCol + c;
          const row = startRow + r;
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
          const key = `${col},${row}`;
          if (!explored.has(key)) continue;

          const px = c * cellW + cellW / 2;
          const py = r * cellH + cellH / 2;
          const dist = Math.sqrt((px - RADIUS) ** 2 + (py - RADIUS) ** 2);
          const alpha = 1 - smoothstep(fadeStart, fadeEnd, dist);
          if (alpha <= 0.02) continue;

          const tile = state.map.tiles[row * cols + col];
          ctx.globalAlpha = alpha;
          ctx.fillStyle = TERRAIN_COLORS[tile!.terrain];
          ctx.fillRect(c * cellW, r * cellH, cellW + 0.6, cellH + 0.6);
          if (!visible.has(key)) {
            ctx.fillStyle = "rgba(5,10,16,0.5)";
            ctx.fillRect(c * cellW, r * cellH, cellW + 0.6, cellH + 0.6);
          }
          ctx.globalAlpha = 1;
        }
      }

      // Cities and units, also faded by distance.
      const dot = (col: number, row: number, color: string, size: number) => {
        const c = col - startCol;
        const r = row - startRow;
        if (c < 0 || r < 0 || c >= windowW || r >= windowH) return;
        const px = c * cellW + cellW / 2;
        const py = r * cellH + cellH / 2;
        const dist = Math.sqrt((px - RADIUS) ** 2 + (py - RADIUS) ** 2);
        const alpha = 1 - smoothstep(fadeStart, fadeEnd, dist);
        if (alpha <= 0.02) return;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(c * cellW - size / 2 + cellW / 2, r * cellH - size / 2 + cellH / 2, size, size);
        ctx.globalAlpha = 1;
      };
      for (const city of state.cities.values()) {
        if (city.ownerId === viewerId || visible.has(`${city.col},${city.row}`)) {
          dot(city.col, city.row, colorOf(state, city.ownerId), 4);
        }
      }
      for (const unit of state.units.values()) {
        if (unit.ownerId === viewerId || visible.has(`${unit.col},${unit.row}`)) {
          dot(unit.col, unit.row, colorOf(state, unit.ownerId), 2.5);
        }
      }

      // Viewport rectangle.
      const corner = (sx: number, sy: number) => {
        const a = pixelToAxial(
          { x: camera.screenToWorldX(sx), y: camera.screenToWorldY(sy) / VSQUISH },
          BASE_SIZE,
        );
        return axialToOffset({ q: Math.round(a.q), r: Math.round(a.r) });
      };
      const tl = corner(0, 0);
      const br = corner(cssWidth, cssHeight);
      const rx = (tl.col - startCol) * cellW;
      const ry = (tl.row - startRow) * cellH;
      const rw = (br.col - tl.col) * cellW;
      const rh = (br.row - tl.row) * cellH;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(2, rw), Math.max(2, rh));

      ctx.restore();

      // Strong radial vignette to hide the circular window edge.
      const gradient = ctx.createRadialGradient(
        RADIUS,
        RADIUS,
        RADIUS * 0.25,
        RADIUS,
        RADIUS,
        RADIUS * 0.92,
      );
      gradient.addColorStop(0, "rgba(11,22,34,0)");
      gradient.addColorStop(0.5, "rgba(11,22,34,0.45)");
      gradient.addColorStop(1, "rgba(11,22,34,0.92)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);

      // Subtle outer ring.
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(RADIUS, RADIUS, RADIUS - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    },
  };
}
