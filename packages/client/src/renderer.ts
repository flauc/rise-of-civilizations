import {
  axialNeighbor,
  axialNeighbors,
  axialRound,
  axialToOffset,
  axialToPixel,
  getTile,
  hashSeed,
  isWater,
  offsetToAxial,
  pixelToAxial,
  type GameMap,
  type Offset,
  type Point,
} from "@roc/shared";
import { Camera, type Bounds } from "./camera";
import { TERRAIN_COLORS, HEX_STROKE, HEX_HOVER_STROKE } from "./palette";
import { isImageReady, type TerrainAtlas } from "./terrain-assets";
import { improvementFrameFor, type ImprovementAtlas } from "./improvement-assets";
import { coastFrameFor, type CoastAtlas } from "./coast-assets";
import { riverChannelFrame, riverMouthFrame, riverMountainFrame, type RiverAtlas } from "./river-assets";
import { roadFrame, isolatedRoadFrame, type RoadAtlas } from "./road-assets";
import { RESOURCE_DEFS, resourceActive, type GameState, type ResourceId } from "@roc/sim";
import { type ResourceAtlas } from "./resource-assets";
import { naturalWonderTileImage, type NaturalWonderAtlas } from "./natural-wonder-assets";
import { wonderTileImage, type WonderAtlas } from "./wonder-assets";
import { drawGlyph } from "./icons";

// Hex size (center-to-corner) in world units at zoom 1.
export const BASE_SIZE = 26;

// The terrain sprites use a SQUARE-footprint pointy-top hex (width == height),
// not a regular hex (which is taller than wide). We render on a regular-hex
// grid but compress the vertical axis by this factor so the on-screen hex
// footprint becomes square and the art tessellates perfectly.
export const VSQUISH = Math.sqrt(3) / 2;

/** Screen-space corners of the squished pointy-top hex (matches drawScene). */
export function squishedHexCornersScreen(cx: number, cy: number, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) * VSQUISH });
  }
  return corners;
}

function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True when a screen point lies inside a tile's on-screen hex outline. */
export function pointInTileHex(camera: Camera, col: number, row: number, sx: number, sy: number): boolean {
  const size = BASE_SIZE * camera.zoom;
  const c = tileCenterWorld(col, row);
  const cx = camera.worldToScreenX(c.x);
  const cy = camera.worldToScreenY(c.y);
  return pointInPolygon(sx, sy, squishedHexCornersScreen(cx, cy, size));
}

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

/** True when the map's world bounds project into (or near) the CSS viewport. */
export function mapIntersectsViewport(
  camera: Camera,
  map: GameMap,
  cssWidth: number,
  cssHeight: number,
  margin = 0,
): boolean {
  const b = computeWorldBounds(map);
  const sx0 = camera.worldToScreenX(b.minX);
  const sx1 = camera.worldToScreenX(b.maxX);
  const sy0 = camera.worldToScreenY(b.minY);
  const sy1 = camera.worldToScreenY(b.maxY);
  const minX = Math.min(sx0, sx1) - margin;
  const maxX = Math.max(sx0, sx1) + margin;
  const minY = Math.min(sy0, sy1) - margin;
  const maxY = Math.max(sy0, sy1) + margin;
  return maxX >= 0 && minX <= cssWidth && maxY >= 0 && minY <= cssHeight;
}

/** Compute a 6-bit edge mask for a road tile from its neighbors. A road connects
 *  to adjacent roads and to adjacent cities — but a river along the shared edge
 *  severs the link until a bridge spans it, so unbridged crossings dead-end at the
 *  water instead of joining. */
function roadMask(map: GameMap, col: number, row: number, cityKeys: Set<string>): number {
  const here = offsetToAxial({ col, row });
  const self = getTile(map, col, row);
  let mask = 0;
  for (let d = 0; d < 6; d++) {
    const nb = axialToOffset(axialNeighbor(here, d));
    const t = getTile(map, nb.col, nb.row);
    if (!t?.road && !cityKeys.has(`${nb.col},${nb.row}`)) continue;
    const opp = (d + 3) % 6;
    const river = (((self?.river ?? 0) & (1 << d)) | ((t?.river ?? 0) & (1 << opp))) !== 0;
    // A road on a river tile is a bridge (road+river), so it keeps the link across the
    // water. Derive it inline rather than from the serialization-only `bridge` flag,
    // which is absent on the raw sim tiles a local single-player game renders.
    const selfBridge = !!self?.road && !!self.river;
    const tBridge = !!t?.road && !!t.river;
    if (river && !selfBridge && !tBridge) continue; // unbridged river severs the link
    mask |= 1 << d;
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

/** A lone road with no neighbours to join — a small worn patch in the tile centre. */
function drawIsolatedRoad(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  level: number,
  size: number,
): void {
  const base = Math.max(2.2, size * 0.15);
  const s = roadStyle(level, base);
  const r = base * 1.15;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = s.edge;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = s.surface;
  ctx.fill();
  if (s.center && size > 22) {
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = s.center;
    ctx.fill();
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
    y: camera.screenToWorldY(sy) / VSQUISH,
  };
  const roughAxial = axialRound(pixelToAxial(world, BASE_SIZE));
  const rough = axialToOffset(roughAxial);

  const candidates: Offset[] = [];
  const seen = new Set<string>();
  const add = (col: number, row: number): void => {
    const key = `${col},${row}`;
    if (seen.has(key)) return;
    if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return;
    seen.add(key);
    candidates.push({ col, row });
  };

  add(rough.col, rough.row);
  for (const nb of axialNeighbors(roughAxial)) {
    const off = axialToOffset(nb);
    add(off.col, off.row);
  }

  const hits: Offset[] = [];
  for (const off of candidates) {
    if (pointInTileHex(camera, off.col, off.row, sx, sy)) hits.push(off);
  }

  if (hits.length === 1) return hits[0];

  if (hits.length > 1) {
    let best: { off: Offset; dist: number } | undefined;
    for (const off of hits) {
      const c = tileCenterWorld(off.col, off.row);
      const cx = camera.worldToScreenX(c.x);
      const cy = camera.worldToScreenY(c.y);
      const dist = Math.hypot(sx - cx, sy - cy);
      if (!best || dist < best.dist) best = { off, dist };
    }
    return best!.off;
  }

  if (rough.col >= 0 && rough.row >= 0 && rough.col < map.cols && rough.row < map.rows) {
    return rough;
  }
  return undefined;
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
  coastAtlas?: CoastAtlas | undefined;
  riverAtlas?: RiverAtlas | undefined;
  roadAtlas?: RoadAtlas | undefined;
  improvementAtlas?: ImprovementAtlas | undefined;
  resourceAtlas?: ResourceAtlas | undefined;
  naturalWonderAtlas?: NaturalWonderAtlas | undefined;
  wonderAtlas?: WonderAtlas | undefined;
  /** World-space terrain/fog cache; rebuilds when revisions change, blits on pan/zoom. */
  mapLayerCache?: import("./map-layer-cache").MapLayerCache;
  terrainRev?: number;
  fogRev?: number;
  /** Internal: painting into the offscreen world cache (do not recurse). */
  skipLayerCache?: boolean;
  /** Internal: terrain-only cache build — fog is painted on screen each frame. */
  skipFogPass?: boolean;
}

/** 6-bit land-neighbour mask for a water tile: bit `d` set when the neighbour in
 *  hex direction `d` is land. Used to pick the matching coast shoreline overlay. */
function landNeighborMask(map: GameMap, col: number, row: number): number {
  const here = offsetToAxial({ col, row });
  let mask = 0;
  for (let d = 0; d < 6; d++) {
    const nb = axialToOffset(axialNeighbor(here, d));
    const t = getTile(map, nb.col, nb.row);
    // Off-map edges read as water so we don't paint a shoreline against nothing.
    if (t && !isWater(t.terrain)) mask |= 1 << d;
  }
  return mask;
}

const UNEXPLORED_FILL = "#0a1624";
// Opaque fog colour painted into the offscreen mask; the whole mask is then
// composited over the scene at FOG_ALPHA so overlapping shapes never stack into
// darker seams. (Same hue/strength as the old "rgba(8,16,26,0.5)" overlay.)
const FOG_SOLID = "rgb(8,16,26)";
const FOG_ALPHA = 0.5;

/** Vector fallback when a built-wonder decor PNG is missing or still loading. */
function drawWonderStandin(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  footprint: number,
  wonderId: string,
): void {
  const h = footprint * 1.05;
  const w = footprint * 0.72;
  const baseY = sy + footprint / 2;
  const topY = baseY - h;
  const cx = sx;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY + footprint * 0.04, w * 0.55, footprint * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  const tiers = wonderId.includes("pyramid") || wonderId.includes("sphinx") ? 4 : 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const tierW = w * (1 - t * 0.55);
    const tierH = h / tiers;
    const y0 = baseY - tierH * (i + 1);
    ctx.fillStyle = i % 2 === 0 ? "#c9a24a" : "#b08830";
    ctx.strokeStyle = "#6b4f1d";
    ctx.lineWidth = Math.max(1, footprint * 0.025);
    ctx.fillRect(cx - tierW / 2, y0, tierW, tierH);
    ctx.strokeRect(cx - tierW / 2, y0, tierW, tierH);
  }
  ctx.fillStyle = "#f0d77a";
  ctx.font = `${Math.max(10, Math.round(footprint * 0.22))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawGlyph(ctx, "🏛", cx, topY + footprint * 0.12, Math.round(footprint * 0.28));
  ctx.restore();
}

// A fog "silhouette" is the terrain sprite recoloured to a flat colour, so a
// covered tile's tall art (mountains, forests) is hidden all the way to its peak
// rather than only inside the flat hex. Cached per (source image, colour).
const fogSilhouetteCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
function fogSilhouette(img: HTMLImageElement, color: string): HTMLCanvasElement {
  let byColor = fogSilhouetteCache.get(img);
  if (!byColor) {
    byColor = new Map();
    fogSilhouetteCache.set(img, byColor);
  }
  let c = byColor.get(color);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext("2d")!;
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = "source-in"; // keep only the sprite's alpha shape
    cx.fillStyle = color;
    cx.fillRect(0, 0, c.width, c.height);
    byColor.set(color, c);
  }
  return c;
}

// Reused full-screen scratch buffer for the fog mask (sized to the canvas).
let fogLayerCanvas: HTMLCanvasElement | null = null;
let fogLayerCtx: CanvasRenderingContext2D | null = null;
function getFogLayer(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!fogLayerCanvas) {
    fogLayerCanvas = document.createElement("canvas");
    fogLayerCtx = fogLayerCanvas.getContext("2d");
  }
  if (fogLayerCanvas.width !== w || fogLayerCanvas.height !== h) {
    fogLayerCanvas.width = w;
    fogLayerCanvas.height = h;
  }
  return { canvas: fogLayerCanvas, ctx: fogLayerCtx! };
}

/** Draw a 256x384 hex overlay (coast/river/mouth) aligned to a tile's footprint,
 *  anchoring the square footprint's bottom so the top 128px overhangs upward. */
function drawFootprintOverlay(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  sx: number,
  sy: number,
  footprint: number,
): void {
  if (!img || !isImageReady(img)) return;
  const scale = footprint / img.naturalWidth;
  const drawW = img.naturalWidth * scale; // == footprint
  const drawH = img.naturalHeight * scale;
  ctx.drawImage(img, sx - drawW / 2, sy + footprint / 2 - drawH, drawW, drawH);
}

/** Draw a tile improvement. Farms use the loaded sprite atlas; everything else
 *  falls back to a simple coloured glyph until dedicated art is added. */
function drawImprovement(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  kind: string | undefined,
  level: number,
  atlas: ImprovementAtlas | undefined,
  col: number,
  row: number,
): void {
  if (!kind) return;
  // Base tier (1) renders at normal size; top tier (3) renders 30% larger.
  const tierScale = 1 + (Math.max(1, Math.min(3, level)) - 1) * 0.15;
  const s = size * tierScale;
  const img = improvementFrameFor(atlas, kind, level, col, row);
  if (img) {
    const imgSize = s;
    ctx.drawImage(img, sx - imgSize / 2, sy - imgSize / 2, imgSize, imgSize);
    return;
  }

  // Simple vector stand-ins for improvements without dedicated sprites.
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  switch (kind) {
    case "farm": {
      ctx.fillStyle = "#d8c24a";
      ctx.fillRect(sx - s * 0.28, sy - s * 0.28, s * 0.56, s * 0.56);
      break;
    }
    case "mine": {
      ctx.fillStyle = "#3a3a3f";
      ctx.beginPath();
      ctx.moveTo(sx, sy - s * 0.3);
      ctx.lineTo(sx + s * 0.3, sy + s * 0.25);
      ctx.lineTo(sx - s * 0.3, sy + s * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "lumber_camp": {
      ctx.fillStyle = "#5a3d2b";
      ctx.fillRect(sx - s * 0.26, sy - s * 0.2, s * 0.52, s * 0.34);
      ctx.fillStyle = "#4a8a3a";
      ctx.beginPath();
      ctx.moveTo(sx, sy - s * 0.32);
      ctx.lineTo(sx + s * 0.18, sy + s * 0.08);
      ctx.lineTo(sx - s * 0.18, sy + s * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "quarry": {
      ctx.fillStyle = "#7a7a7f";
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4a4a50";
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(sx - s * 0.12, sy - s * 0.12);
      ctx.lineTo(sx + s * 0.12, sy + s * 0.12);
      ctx.moveTo(sx + s * 0.12, sy - s * 0.12);
      ctx.lineTo(sx - s * 0.12, sy + s * 0.12);
      ctx.stroke();
      break;
    }
    case "pasture": {
      ctx.fillStyle = "#6b9e5a";
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0e6c8";
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "plantation": {
      ctx.fillStyle = "#8a5a3a";
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a8a3a";
      ctx.beginPath();
      ctx.moveTo(sx, sy - s * 0.2);
      ctx.lineTo(sx + s * 0.12, sy + s * 0.12);
      ctx.lineTo(sx - s * 0.12, sy + s * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "camp": {
      ctx.fillStyle = "#bfa878";
      ctx.beginPath();
      ctx.moveTo(sx, sy - s * 0.28);
      ctx.lineTo(sx + s * 0.26, sy + s * 0.2);
      ctx.lineTo(sx - s * 0.26, sy + s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#7a6a4a";
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.stroke();
      break;
    }
    case "fishing_boats": {
      ctx.fillStyle = "#4a9ec4";
      ctx.beginPath();
      ctx.arc(sx - s * 0.1, sy + s * 0.06, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx + s * 0.12, sy - s * 0.06, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "fishery": {
      // A net stretched between two posts over the water.
      ctx.strokeStyle = "#d8e6ee";
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.strokeRect(sx - s * 0.22, sy - s * 0.16, s * 0.44, s * 0.32);
      ctx.beginPath();
      ctx.moveTo(sx - s * 0.22, sy - s * 0.16);
      ctx.lineTo(sx + s * 0.22, sy + s * 0.16);
      ctx.moveTo(sx + s * 0.22, sy - s * 0.16);
      ctx.lineTo(sx - s * 0.22, sy + s * 0.16);
      ctx.stroke();
      break;
    }
    case "saltern": {
      // Grid of evaporation ponds glinting with white salt.
      ctx.fillStyle = "#eef0e6";
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillRect(sx - s * 0.22 + i * s * 0.24, sy - s * 0.22 + j * s * 0.24, s * 0.18, s * 0.18);
        }
      }
      break;
    }
    default:
      // Unknown improvement: small neutral marker.
      ctx.fillStyle = "#999";
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

function primaryTerrainImage(
  t: { col: number; row: number; terrain: string; naturalWonder?: string; river?: number },
  opts: Pick<RenderOptions, "terrainAtlas" | "naturalWonderAtlas" | "riverAtlas">,
): HTMLImageElement | undefined {
  const variants = opts.terrainAtlas?.images[t.terrain as keyof TerrainAtlas["images"]];
  let img =
    variants && variants.length > 0
      ? variants[hashSeed(`${t.col},${t.row},${t.terrain}`) % variants.length]
      : undefined;
  if (t.naturalWonder) {
    const wonderImg = naturalWonderTileImage(opts.naturalWonderAtlas, t.naturalWonder);
    if (wonderImg) img = wonderImg;
  }
  const mtnRiverImg =
    t.terrain === "mountains" && t.river
      ? riverMountainFrame(opts.riverAtlas, t.river, t.col, t.row)
      : undefined;
  if (mtnRiverImg && isImageReady(mtnRiverImg)) img = mtnRiverImg;
  return img && isImageReady(img) ? img : undefined;
}

function paintFogOfWar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  opts: Pick<RenderOptions, "fog" | "terrainAtlas" | "naturalWonderAtlas" | "riverAtlas" | "dpr" | "cssWidth" | "cssHeight">,
  size: number,
  footprint: number,
  corners: Point[],
  margin: number,
  /** True when fog is painted over the baked terrain bitmap (which has no fog
   *  of its own): unexplored tiles must then also cover their sprite's tall
   *  overhang, or mountain peaks leak out above the flat hex fills. */
  coverUnexploredArt: boolean,
): void {
  const fog = opts.fog;
  if (!fog) return;
  const { map } = state;
  const fogDraws: { img: HTMLImageElement | undefined; sx: number; sy: number }[] = [];
  const unexploredDraws: { img: HTMLImageElement | undefined; sx: number; sy: number }[] = [];

  for (const t of map.tiles) {
    const c = tileCenterWorld(t.col, t.row);
    const sx = camera.worldToScreenX(c.x);
    const sy = camera.worldToScreenY(c.y);
    if (
      sx < -margin ||
      sy < -margin ||
      sx > opts.cssWidth + margin ||
      sy > opts.cssHeight + margin
    ) {
      continue;
    }
    const key = `${t.col},${t.row}`;
    const explored = fog.explored.has(key);
    const visible = fog.visible.has(key);
    if (!explored) {
      unexploredDraws.push({
        img: coverUnexploredArt ? primaryTerrainImage(t, opts) : undefined,
        sx,
        sy,
      });
      continue;
    }
    if (!visible) {
      fogDraws.push({ img: primaryTerrainImage(t, opts), sx, sy });
    }
  }

  const traceHex = (c: CanvasRenderingContext2D, sx: number, sy: number): void => {
    c.beginPath();
    c.moveTo(sx + corners[0]!.x, sy + corners[0]!.y);
    for (let i = 1; i < 6; i++) c.lineTo(sx + corners[i]!.x, sy + corners[i]!.y);
    c.closePath();
  };

  if (unexploredDraws.length > 0) {
    // Fill AND stroke each hex: adjacent flat fills alone leave ~1px antialias
    // seams through which the terrain beneath shines as a bright hex grid.
    ctx.fillStyle = UNEXPLORED_FILL;
    ctx.strokeStyle = UNEXPLORED_FILL;
    ctx.lineWidth = Math.max(1, size * 0.05);
    for (const u of unexploredDraws) {
      traceHex(ctx, u.sx, u.sy);
      ctx.fill();
      ctx.stroke();
    }
    // Then cover tall sprite overhang (baked-bitmap mode only): without this,
    // mountain/forest peaks poke out above the flat fills at the map's edge.
    for (const u of unexploredDraws) {
      if (!u.img) continue;
      const sil = fogSilhouette(u.img, UNEXPLORED_FILL);
      const scale = footprint / sil.width;
      const drawW = sil.width * scale;
      const drawH = sil.height * scale;
      ctx.drawImage(sil, u.sx - drawW / 2, u.sy + footprint / 2 - drawH, drawW, drawH);
    }
  }

  if (fogDraws.length > 0) {
    const layer = getFogLayer(ctx.canvas.width, ctx.canvas.height);
    const fc = layer.ctx;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    fc.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
    fc.fillStyle = FOG_SOLID;
    fc.strokeStyle = FOG_SOLID;
    fc.lineWidth = Math.max(1, size * 0.05);
    for (const f of fogDraws) {
      traceHex(fc, f.sx, f.sy);
      fc.fill();
      fc.stroke(); // seal the antialias seam between adjacent fog hexes
      if (f.img) {
        const sil = fogSilhouette(f.img, FOG_SOLID);
        const scale = footprint / sil.width;
        const drawW = sil.width * scale;
        const drawH = sil.height * scale;
        fc.drawImage(sil, f.sx - drawW / 2, f.sy + footprint / 2 - drawH, drawW, drawH);
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = FOG_ALPHA;
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  }
}

function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  hovered: Offset,
  size: number,
  corners: Point[],
): void {
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

/** Draws the visible map; returns how many tiles were rendered (for the HUD). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  opts: RenderOptions,
): number {
  const { dpr, cssWidth, cssHeight, hovered, mapLayerCache, terrainRev = 0, skipLayerCache } =
    opts;

  const size = BASE_SIZE * camera.zoom;
  const footprint = tileFootprint(size);
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: size * Math.cos(a), y: size * Math.sin(a) * VSQUISH });
  }

  // Blit the baked terrain bitmap only while it maps to at least 1:1 device
  // pixels — past its bake resolution it would upscale and blur, so draw live
  // instead (few tiles are on screen that far in, so the live path stays cheap).
  if (
    !skipLayerCache &&
    mapLayerCache?.canUse(state, dpr) &&
    camera.zoom * dpr <= mapLayerCache.buildZoomLevel
  ) {
    if (!mapLayerCache.isValid(terrainRev)) {
      mapLayerCache.rebuild(state, opts, terrainRev);
    }
    mapLayerCache.blit(ctx, camera, dpr);
    // The baked bitmap has no fog, so unexplored tiles must fully conceal it.
    if (
      mapIntersectsViewport(camera, state.map, opts.cssWidth, opts.cssHeight, footprint * 2)
    ) {
      paintFogOfWar(ctx, state, camera, opts, size, footprint, corners, footprint * 2, true);
    }
    if (hovered) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHoverHighlight(ctx, camera, hovered, size, corners);
    }
    return mapLayerCache.tileCount;
  }

  const { map } = state;
  // Clear/fill in device pixels first so there is no sub-pixel gap on fractional-DPR displays.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0a1624";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const margin = footprint * 2;

  ctx.lineWidth = Math.max(0.5, size * 0.03);
  ctx.strokeStyle = HEX_STROKE;
  let drawn = 0;
  const cityKeys = new Set<string>();
  for (const c of state.cities.values()) {
    cityKeys.add(`${c.col},${c.row}`);
  }

  // Fog is painted in a dedicated pass AFTER all terrain (see paintFogOfWar).

  if (!mapIntersectsViewport(camera, map, opts.cssWidth, opts.cssHeight, margin)) {
    return 0;
  }

  // Distance (in tiles) from a tile to its nearest polar map edge, and the width
  // of the polar zone — used to place crevasse and iceberg decor near the caps.
  const polarDim = map.poleAxis === "ew" ? map.cols : map.rows;
  const polarBand = Math.max(4, Math.round(polarDim * 0.16));
  const polarEdgeDist = (col: number, row: number): number =>
    map.poleAxis === "ew" ? Math.min(col, map.cols - 1 - col) : Math.min(row, map.rows - 1 - row);

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

    ctx.beginPath();
    ctx.moveTo(sx + corners[0]!.x, sy + corners[0]!.y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(sx + corners[i]!.x, sy + corners[i]!.y);
    }
    ctx.closePath();
    if (!explored && !opts.skipFogPass) {
      continue; // live path: fog pass covers unexplored tiles
    }
    const variants = opts.terrainAtlas?.images[t.terrain];
    let img =
      variants && variants.length > 0
        ? variants[hashSeed(`${t.col},${t.row},${t.terrain}`) % variants.length]
        : undefined;
    // A natural wonder replaces the terrain art with its own full-tile sprite.
    if (t.naturalWonder) {
      const wonderImg = naturalWonderTileImage(opts.naturalWonderAtlas, t.naturalWonder);
      if (wonderImg) img = wonderImg;
    }
    // A river spring on a mountain uses the combined mountain+river sprite (the
    // flat river overlay below is skipped for it).
    const mtnRiverImg = t.terrain === "mountains" && t.river
      ? riverMountainFrame(opts.riverAtlas, t.river, t.col, t.row)
      : undefined;
    if (mtnRiverImg && isImageReady(mtnRiverImg)) img = mtnRiverImg;
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

    // Wooded hills: a tree cluster grows on the hill crest (decor over terrain).
    if (t.wooded && !t.naturalWonder) {
      const clusters = opts.terrainAtlas?.hillTrees;
      if (clusters && clusters.length > 0) {
        const treeImg = clusters[hashSeed(`trees:${t.col},${t.row}`) % clusters.length]!;
        if (isImageReady(treeImg)) {
          const treeW = footprint * 0.52;
          const treeH = treeImg.naturalHeight * (treeW / treeImg.naturalWidth);
          // Deterministic nudge so plantations don't line up in rows.
          const jx = ((hashSeed(`treesx:${t.col},${t.row}`) % 100) / 100 - 0.5) * footprint * 0.14;
          const jy = ((hashSeed(`treesy:${t.col},${t.row}`) % 100) / 100 - 0.5) * footprint * 0.1;
          ctx.drawImage(treeImg, sx - treeW / 2 + jx, sy - treeH * 0.78 + jy, treeW, treeH);
        }
      }
    }

    // Cold-lands decor on snow: 5% get a crevasse, another 5% a frozen pond. A
    // single roll partitions the two so a tile never shows both.
    if (!t.naturalWonder && !t.wonder && t.terrain === "snow") {
      const crevasses = opts.terrainAtlas?.iceCrevasses;
      const frozen = opts.terrainAtlas?.frozenLakes;
      const roll = hashSeed(`icedecor:${t.col},${t.row}`) % 100;
      let decor: HTMLImageElement | undefined;
      let decorScale = 0.55;
      if (roll < 5 && crevasses && crevasses.length > 0) {
        decor = crevasses[hashSeed(`crevasse-v:${t.col},${t.row}`) % crevasses.length];
        decorScale = 0.64;
      } else if (roll < 10 && frozen && frozen.length > 0) {
        decor = frozen[hashSeed(`frozen-v:${t.col},${t.row}`) % frozen.length];
      }
      if (decor && isImageReady(decor)) {
        const dW = footprint * decorScale;
        const dH = decor.naturalHeight * (dW / decor.naturalWidth);
        const jx = ((hashSeed(`icex:${t.col},${t.row}`) % 100) / 100 - 0.5) * footprint * 0.12;
        const jy = ((hashSeed(`icey:${t.col},${t.row}`) % 100) / 100 - 0.5) * footprint * 0.1;
        ctx.drawImage(decor, sx - dW / 2 + jx, sy - dH / 2 + jy, dW, dH);
      }
    }

    // A completed built wonder draws its decor sprite on top of the terrain (the
    // sprite shares the 256×384 hex-tile format, anchored like a natural wonder
    // but with a transparent background so the terrain shows through).
    if (t.wonder) {
      const wImg = wonderTileImage(opts.wonderAtlas, t.wonder);
      if (wImg && isImageReady(wImg)) {
        const wScale = footprint / wImg.naturalWidth;
        const wW = wImg.naturalWidth * wScale;
        const wH = wImg.naturalHeight * wScale;
        ctx.drawImage(wImg, sx - wW / 2, sy + footprint / 2 - wH, wW, wH);
      } else {
        drawWonderStandin(ctx, sx, sy, footprint, t.wonder);
      }
    }

    // Shoreline overlay: water tiles that border land get a painted coast drawn
    // along the land-facing edges (drawn over the base water, under the fog).
    if (isWater(t.terrain)) {
      const landMask = landNeighborMask(map, t.col, t.row);
      drawFootprintOverlay(ctx, coastFrameFor(opts.coastAtlas, landMask, t.col, t.row), sx, sy, footprint);
      // River mouths fan into the sea here: for each neighbour that is a river
      // tile pointing back at us, paint the delta over this water tile's edge.
      const here = offsetToAxial({ col: t.col, row: t.row });
      for (let d = 0; d < 6; d++) {
        const nb = axialToOffset(axialNeighbor(here, d));
        const n = getTile(map, nb.col, nb.row);
        if (n?.river && (n.river & (1 << ((d + 3) % 6)))) {
          drawFootprintOverlay(ctx, riverMouthFrame(opts.riverAtlas, 1 << d, t.col, t.row), sx, sy, footprint);
        }
      }
      // Icebergs drift in the open water near the poles — a few small floes per
      // tile, kept from overlapping by rejecting positions too close to a placed one.
      // Both the reach from the pole and the spawn rate are kept sparse (~30%
      // tighter than the ice-cap band) so they hug the caps.
      const bergs = opts.terrainAtlas?.icebergs;
      const bergBand = Math.round((polarBand + 2) * 0.7);
      if (
        bergs &&
        bergs.length > 0 &&
        polarEdgeDist(t.col, t.row) <= bergBand &&
        hashSeed(`berg:${t.col},${t.row}`) % 100 < 29
      ) {
        const count = 1 + (hashSeed(`bergn:${t.col},${t.row}`) % 3); // 1..3 floes
        const placedBergs: { x: number; y: number; r: number }[] = [];
        for (let k = 0; k < count * 4 && placedBergs.length < count; k++) {
          const img = bergs[hashSeed(`bergv:${t.col},${t.row}:${k}`) % bergs.length]!;
          if (!isImageReady(img)) continue;
          const bW = footprint * 0.2;
          const bH = img.naturalHeight * (bW / img.naturalWidth);
          const px = ((hashSeed(`bergx:${t.col},${t.row}:${k}`) % 1000) / 1000 - 0.5) * footprint * 0.62;
          const py = ((hashSeed(`bergy:${t.col},${t.row}:${k}`) % 1000) / 1000 - 0.5) * footprint * 0.5;
          const r = Math.max(bW, bH) * 0.5;
          if (placedBergs.some((p) => Math.hypot(p.x - px, p.y - py) < p.r + r)) continue;
          placedBergs.push({ x: px, y: py, r });
          ctx.drawImage(img, sx + px - bW / 2, sy + py - bH / 2, bW, bH);
        }
      }
    } else if (t.river && !mtnRiverImg) {
      // River overlay on land: the channel reaches every connected edge (including
      // the one that meets the sea, so the river-mouth tile reads as a real
      // connector); the matching mouth delta is painted on the adjacent water tile.
      // Mountain springs already drew their combined sprite, so they're skipped.
      drawFootprintOverlay(ctx, riverChannelFrame(opts.riverAtlas, t.river, !!t.riverLake, t.col, t.row), sx, sy, footprint);
    }

    // Tile improvements & roads (only worth drawing when reasonably zoomed in).
    if (size > 10) {
      const isCity = cityKeys.has(key);
      if (t.road || isCity) {
        const mask = roadMask(map, t.col, t.row, cityKeys);
        const level = t.road ? (t.roadLevel ?? 1) : maxNeighborRoadLevel(map, t.col, t.row);
        if (t.road && mask === 0) {
          // No road/city neighbour — a standalone patch on this tile only. Use a
          // real painted road segment (picked deterministically) so it matches the
          // rest of the network; fall back to a procedural patch while loading.
          const img = isolatedRoadFrame(opts.roadAtlas, t.col, t.row, level);
          if (img && isImageReady(img)) {
            drawFootprintOverlay(ctx, img, sx, sy, footprint);
          } else {
            drawIsolatedRoad(ctx, sx, sy, level, size);
          }
        } else if (mask !== 0) {
          // Prefer the painted road overlay (keyed by connection mask; each edge
          // reaches its midpoint so neighbours join seamlessly). A road that sits on a
          // river tile is a bridge (it could only be laid there with Bridge Building):
          // for the straight-through masks that have bridge art (9/18/36) roadFrame
          // swaps in the wooden-bridge sprite, so the crossing renders as a span rather
          // than a road drawn over open water. Fall back to the procedural segment only
          // while the atlas is still loading or a variant failed to load.
          const img = roadFrame(opts.roadAtlas, mask, !!t.river, t.col, t.row, level);
          if (img && isImageReady(img)) {
            drawFootprintOverlay(ctx, img, sx, sy, footprint);
          } else {
            drawRoadSegment(ctx, sx, sy, corners, mask, level, size);
          }
        }
      }
      drawImprovement(ctx, sx, sy, size, t.improvement, t.improvementLevel ?? 1, opts.improvementAtlas, t.col, t.row);
      // A natural wonder's art replaces the whole tile — never overlay a resource icon on it.
      if (t.resource && !t.naturalWonder) {
        const img = opts.resourceAtlas?.images[t.resource as ResourceId];
        if (img && isImageReady(img)) {
          const iconSize = size * 0.75;
          ctx.save();
          ctx.globalAlpha = resourceActive(t, state) ? 1 : 0.55;
          ctx.drawImage(img, sx - iconSize / 2, sy - iconSize / 2, iconSize, iconSize);
          ctx.restore();
        } else {
          // Fallback text initials while the atlas is still loading.
          const def = RESOURCE_DEFS[t.resource as ResourceId];
          if (def) {
            ctx.save();
            ctx.font = `bold ${Math.round(size * 0.3)}px system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = resourceActive(t, state) ? "#ffffff" : "#888888";
            ctx.fillText(def.name.slice(0, 2).toUpperCase(), sx, sy - size * 0.45);
            ctx.restore();
          }
        }
      }
    }
    drawn++;
  }

  // ---- Fog of war -------------------------------------------------------
  if (!opts.skipFogPass) {
    // Live path: unexplored tiles never drew their art, so plain fills suffice.
    paintFogOfWar(ctx, state, camera, opts, size, footprint, corners, margin, false);
  }

  // Hover highlight on top.
  if (hovered) {
    drawHoverHighlight(ctx, camera, hovered, size, corners);
  }

  return drawn;
}
