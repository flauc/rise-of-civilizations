import {
  axialRound,
  axialToOffset,
  axialToPixel,
  offsetToAxial,
  pixelToAxial,
  type GameMap,
  type Offset,
  type Point,
} from "@roc/shared";
import { Camera, type Bounds } from "./camera";
import { TERRAIN_COLORS, HEX_STROKE, HEX_HOVER_STROKE } from "./palette";
import { isImageReady, type TerrainAtlas } from "./terrain-assets";

// Hex size (center-to-corner) in world units at zoom 1.
export const BASE_SIZE = 26;

/** World-space pixel center of an offset (col,row) tile. */
export function tileCenterWorld(col: number, row: number): Point {
  return axialToPixel(offsetToAxial({ col, row }), BASE_SIZE);
}

/** Bounding box (world space) of the whole map, including hex extents. */
export function computeWorldBounds(map: GameMap): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const t of map.tiles) {
    const c = tileCenterWorld(t.col, t.row);
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const w = BASE_SIZE * Math.sqrt(3);
  return {
    minX: minX - w,
    minY: minY - BASE_SIZE,
    maxX: maxX + w,
    maxY: maxY + BASE_SIZE,
  };
}

/** Which map tile (if any) is under a screen-space point. */
export function screenToTile(
  camera: Camera,
  map: GameMap,
  sx: number,
  sy: number,
): Offset | undefined {
  const world: Point = {
    x: camera.screenToWorldX(sx),
    y: camera.screenToWorldY(sy),
  };
  const off = axialToOffset(axialRound(pixelToAxial(world, BASE_SIZE)));
  if (off.col < 0 || off.row < 0 || off.col >= map.cols || off.row >= map.rows) {
    return undefined;
  }
  return off;
}

export interface FogState {
  visible: Set<string>;
  explored: Set<string>;
}

export interface RenderOptions {
  dpr: number;
  cssWidth: number;
  cssHeight: number;
  hovered?: Offset | undefined;
  fog?: FogState | undefined;
  terrainAtlas?: TerrainAtlas | undefined;
}

const UNEXPLORED_FILL = "#0a1320";
const FOG_OVERLAY = "rgba(8,16,26,0.5)";

/** Draws the visible map; returns how many tiles were rendered (for the HUD). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  opts: RenderOptions,
): number {
  const { dpr, cssWidth, cssHeight, hovered } = opts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#0b1622";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const size = BASE_SIZE * camera.zoom;
  const margin = size * 2;
  // pre-compute corner unit offsets (pointy-top) at current screen size
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: size * Math.cos(a), y: size * Math.sin(a) });
  }

  ctx.lineWidth = Math.max(0.5, size * 0.03);
  ctx.strokeStyle = HEX_STROKE;
  let drawn = 0;

  for (const t of map.tiles) {
    const c = tileCenterWorld(t.col, t.row);
    const sx = camera.worldToScreenX(c.x);
    const sy = camera.worldToScreenY(c.y);
    if (
      sx < -margin ||
      sy < -margin ||
      sx > cssWidth + margin ||
      sy > cssHeight + margin
    ) {
      continue; // cull off-screen
    }
    const key = `${t.col},${t.row}`;
    const explored = opts.fog ? opts.fog.explored.has(key) : true;
    const visible = opts.fog ? opts.fog.visible.has(key) : true;

    ctx.beginPath();
    ctx.moveTo(sx + corners[0]!.x, sy + corners[0]!.y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(sx + corners[i]!.x, sy + corners[i]!.y);
    }
    ctx.closePath();
    if (!explored) {
      ctx.fillStyle = UNEXPLORED_FILL;
      ctx.fill();
      continue; // hide terrain entirely
    }
    const img = opts.terrainAtlas?.images[t.terrain];
    if (img && isImageReady(img)) {
      // Scale so the sprite height matches the rendered hex height, then anchor
      // at the bottom of the hex footprint so the upper overhang overlaps tiles
      // behind.
      const scale = (3 * size) / img.naturalHeight;
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const drawX = sx - drawW / 2;
      const drawY = sy + size - drawH;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = TERRAIN_COLORS[t.terrain];
      ctx.fill();
    }
    if (!visible) {
      ctx.fillStyle = FOG_OVERLAY;
      ctx.fill();
    }

    // Tile improvements & roads (only worth drawing when reasonably zoomed in).
    if (size > 10) {
      if (t.road) {
        ctx.strokeStyle = "#6b4a2b";
        ctx.lineWidth = Math.max(1.5, size * 0.12);
        ctx.beginPath();
        ctx.moveTo(sx - size * 0.7, sy);
        ctx.lineTo(sx + size * 0.7, sy);
        ctx.stroke();
      }
      if (t.improvement === "farm") {
        ctx.fillStyle = "#d8c24a";
        ctx.fillRect(sx - size * 0.28, sy - size * 0.28, size * 0.56, size * 0.56);
      } else if (t.improvement === "mine") {
        ctx.fillStyle = "#3a3a3f";
        ctx.beginPath();
        ctx.moveTo(sx, sy - size * 0.3);
        ctx.lineTo(sx + size * 0.3, sy + size * 0.25);
        ctx.lineTo(sx - size * 0.3, sy + size * 0.25);
        ctx.closePath();
        ctx.fill();
      }
    }
    drawn++;
  }

  // Hover highlight on top.
  if (hovered) {
    const c = tileCenterWorld(hovered.col, hovered.row);
    const sx = camera.worldToScreenX(c.x);
    const sy = camera.worldToScreenY(c.y);
    ctx.beginPath();
    ctx.moveTo(sx + corners[0]!.x, sy + corners[0]!.y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(sx + corners[i]!.x, sy + corners[i]!.y);
    }
    ctx.closePath();
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.strokeStyle = HEX_HOVER_STROKE;
    ctx.stroke();
  }

  return drawn;
}
