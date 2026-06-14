import {
  axialNeighbor,
  axialRound,
  axialToOffset,
  axialToPixel,
  getTile,
  hashSeed,
  offsetToAxial,
  pixelToAxial,
  type GameMap,
  type Offset,
  type Point,
} from "@roc/shared";
import { Camera, type Bounds } from "./camera";
import { TERRAIN_COLORS, HEX_STROKE, HEX_HOVER_STROKE } from "./palette";
import { isImageReady, type TerrainAtlas } from "./terrain-assets";
import { farmFrameFor, type ImprovementAtlas } from "./improvement-assets";
import { RESOURCE_DEFS, resourceActive, type GameState } from "@roc/sim";

// Hex size (center-to-corner) in world units at zoom 1.
export const BASE_SIZE = 26;

// The terrain sprites use a SQUARE-footprint pointy-top hex (width == height),
// not a regular hex (which is taller than wide). We render on a regular-hex
// grid but compress the vertical axis by this factor so the on-screen hex
// footprint becomes square and the art tessellates perfectly.
export const VSQUISH = Math.sqrt(3) / 2;

/** Footprint width of a tile (== height after squish) for a given hex size. */
export function tileFootprint(size: number): number {
  return Math.sqrt(3) * size;
}

/** World-space pixel center of an offset (col,row) tile. */
export function tileCenterWorld(col: number, row: number): Point {
  const p = axialToPixel(offsetToAxial({ col, row }), BASE_SIZE);
  return { x: p.x, y: p.y * VSQUISH };
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
  const w = tileFootprint(BASE_SIZE);
  return {
    minX: minX - w / 2,
    minY: minY - w, // leave room for terrain overhang (mountains)
    maxX: maxX + w / 2,
    maxY: maxY + w / 2,
  };
}

/** Compute a 6-bit edge mask for a road tile from its neighbors.
 *  A road connects to adjacent roads and to adjacent cities. */
function roadMask(map: GameMap, col: number, row: number, cityKeys: Set<string>): number {
  const here = offsetToAxial({ col, row });
  let mask = 0;
  for (let d = 0; d < 6; d++) {
    const nb = axialToOffset(axialNeighbor(here, d));
    const t = getTile(map, nb.col, nb.row);
    if (t?.road || cityKeys.has(`${nb.col},${nb.row}`)) {
      mask |= 1 << d;
    }
  }
  return mask;
}

/** Highest road level among a tile's road neighbors (defaults to 1). */
function maxNeighborRoadLevel(map: GameMap, col: number, row: number): number {
  const here = offsetToAxial({ col, row });
  let level = 1;
  for (let d = 0; d < 6; d++) {
    const nb = axialToOffset(axialNeighbor(here, d));
    const t = getTile(map, nb.col, nb.row);
    if (t?.road) {
      level = Math.max(level, t.roadLevel ?? 1);
    }
  }
  return level;
}

/** Midpoint of a hex side in screen space. */
function sideMidpoint(corners: Point[], side: number, sx: number, sy: number): Point {
  const a = corners[side]!;
  const b = corners[(side + 1) % 6]!;
  return { x: sx + (a.x + b.x) / 2, y: sy + (a.y + b.y) / 2 };
}

interface RoadStyle {
  /** Soft dark shadow under the path (semi-transparent so it blends). */
  edge: string;
  edgeWidth: number;
  /** Main worn surface colour. */
  surface: string;
  surfaceWidth: number;
  /** Optional lighter centre line (paved roads). */
  center?: string;
  centerWidth?: number;
}

function roadStyle(level: number, base: number): RoadStyle {
  if (level >= 3) {
    // Imperial road — dressed stone with a pale centre.
    return { edge: "rgba(28,24,20,0.45)", edgeWidth: base * 1.9, surface: "#b9b3a1", surfaceWidth: base * 1.05, center: "#d8d2c0", centerWidth: base * 0.4 };
  }
  if (level === 2) {
    // Paved road — packed stone.
    return { edge: "rgba(30,26,22,0.45)", edgeWidth: base * 1.8, surface: "#9c9385", surfaceWidth: base * 0.95, center: "#b3ab9b", centerWidth: base * 0.32 };
  }
  // Dirt road — a worn earthen track that sits softly on the terrain.
  return { edge: "rgba(40,28,16,0.4)", edgeWidth: base * 1.7, surface: "#9d7748", surfaceWidth: base * 0.82, center: "#b6904f", centerWidth: base * 0.3 };
}

/**
 * Draw a procedurally-styled road segment. `mask` bit `d` means the neighbour in
 * axial direction `d` (E, NE, NW, W, SW, SE) carries a road or is a city; that
 * neighbour lies across hex edge `(6 - d) % 6`, so the stub is drawn toward that
 * edge's midpoint (the same world point the neighbour draws to → seamless joins).
 * Two-way roads are drawn as one smooth curve through the centre; junctions get
 * a small hub so the spokes blend instead of spiking.
 */
function drawRoadSegment(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  corners: Point[],
  mask: number,
  level: number,
  size: number,
): void {
  const pts: Point[] = [];
  for (let d = 0; d < 6; d++) {
    if (mask & (1 << d)) pts.push(sideMidpoint(corners, (6 - d) % 6, sx, sy));
  }
  if (pts.length === 0) return;

  const base = Math.max(2.2, size * 0.15);
  const s = roadStyle(level, base);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Trace the road: a single smooth curve for a through-road, otherwise spokes
  // from each connected edge into the tile centre.
  const trace = (): void => {
    ctx.beginPath();
    if (pts.length === 2) {
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      ctx.quadraticCurveTo(sx, sy, pts[1]!.x, pts[1]!.y);
    } else {
      for (const p of pts) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(sx, sy);
      }
    }
  };
  const hub = (r: number, fill: string): void => {
    if (pts.length === 2) return; // a smooth curve needs no junction disc
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // 1) soft shadow, 2) worn surface, 3) optional pale centre line.
  ctx.lineWidth = s.edgeWidth;
  ctx.strokeStyle = s.edge;
  trace();
  ctx.stroke();
  hub(s.edgeWidth * 0.5, s.edge);

  ctx.lineWidth = s.surfaceWidth;
  ctx.strokeStyle = s.surface;
  trace();
  ctx.stroke();
  hub(s.surfaceWidth * 0.5, s.surface);

  if (s.center && s.centerWidth && size > 22) {
    ctx.lineWidth = s.centerWidth;
    ctx.strokeStyle = s.center;
    trace();
    ctx.stroke();
  }
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
    y: camera.screenToWorldY(sy) / VSQUISH, // undo the vertical squish for hit-testing
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
  improvementAtlas?: ImprovementAtlas | undefined;
}

const UNEXPLORED_FILL = "#0a1624";
const FOG_OVERLAY = "rgba(8,16,26,0.5)";

/** Draws the visible map; returns how many tiles were rendered (for the HUD). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  opts: RenderOptions,
): number {
  const { map } = state;
  const { dpr, cssWidth, cssHeight, hovered } = opts;
  // Clear/fill in device pixels first so there is no sub-pixel gap on fractional-DPR displays.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0a1624";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const size = BASE_SIZE * camera.zoom;
  const footprint = tileFootprint(size); // square hex footprint (width == height)
  const margin = footprint * 2;
  // pre-compute corner unit offsets (pointy-top, vertically squished to square)
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: size * Math.cos(a), y: size * Math.sin(a) * VSQUISH });
  }

  ctx.lineWidth = Math.max(0.5, size * 0.03);
  ctx.strokeStyle = HEX_STROKE;
  let drawn = 0;
  const cityKeys = new Set<string>();
  for (const c of state.cities.values()) {
    cityKeys.add(`${c.col},${c.row}`);
  }

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
    const variants = opts.terrainAtlas?.images[t.terrain];
    const img =
      variants && variants.length > 0
        ? variants[hashSeed(`${t.col},${t.row},${t.terrain}`) % variants.length]
        : undefined;
    if (img && isImageReady(img)) {
      // The sprite is a 256x384 image whose bottom 256x256 is the square hex
      // footprint and whose top 128px is transparent overhang. Map the sprite
      // width to the footprint width, and anchor the footprint's bottom vertex
      // at sy + footprint/2 so the overhang overlaps the tiles above.
      const scale = footprint / img.naturalWidth;
      const drawW = img.naturalWidth * scale; // == footprint
      const drawH = img.naturalHeight * scale;
      const drawX = sx - drawW / 2;
      const drawY = sy + footprint / 2 - drawH;
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
      const isCity = cityKeys.has(key);
      if (t.road || isCity) {
        const mask = roadMask(map, t.col, t.row, cityKeys);
        if (mask !== 0) {
          const level = t.road ? (t.roadLevel ?? 1) : maxNeighborRoadLevel(map, t.col, t.row);
          drawRoadSegment(ctx, sx, sy, corners, mask, level, size);
        }
      }
      if (t.improvement === "farm") {
        const farmImg = farmFrameFor(opts.improvementAtlas, t.col, t.row);
        if (farmImg) {
          const farmSize = size * 0.7;
          ctx.drawImage(farmImg, sx - farmSize / 2, sy - farmSize / 2, farmSize, farmSize);
        } else {
          ctx.fillStyle = "#d8c24a";
          ctx.fillRect(sx - size * 0.28, sy - size * 0.28, size * 0.56, size * 0.56);
        }
      } else if (t.improvement === "mine") {
        ctx.fillStyle = "#3a3a3f";
        ctx.beginPath();
        ctx.moveTo(sx, sy - size * 0.3);
        ctx.lineTo(sx + size * 0.3, sy + size * 0.25);
        ctx.lineTo(sx - size * 0.3, sy + size * 0.25);
        ctx.closePath();
        ctx.fill();
      }
      if (t.resource) {
        const def = RESOURCE_DEFS[t.resource as keyof typeof RESOURCE_DEFS];
        if (def) {
          ctx.save();
          ctx.font = `bold ${Math.round(size * 0.3)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = resourceActive(t) ? "#ffffff" : "#888888";
          ctx.fillText(def.name.slice(0, 2).toUpperCase(), sx, sy - size * 0.45);
          ctx.restore();
        }
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
