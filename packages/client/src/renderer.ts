import {
  axialNeighbor,
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
import { riverChannelFrame, riverMouthFrame, type RiverAtlas } from "./river-assets";
import { roadFrame, type RoadAtlas } from "./road-assets";
import { RESOURCE_DEFS, resourceActive, type GameState, type ResourceId } from "@roc/sim";
import { type ResourceAtlas } from "./resource-assets";
import { naturalWonderTileImage, type NaturalWonderAtlas } from "./natural-wonder-assets";

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
    if (river && !self?.bridge && !t?.bridge) continue; // unbridged river severs the link
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
  coastAtlas?: CoastAtlas | undefined;
  riverAtlas?: RiverAtlas | undefined;
  roadAtlas?: RoadAtlas | undefined;
  improvementAtlas?: ImprovementAtlas | undefined;
  resourceAtlas?: ResourceAtlas | undefined;
  naturalWonderAtlas?: NaturalWonderAtlas | undefined;
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
const FOG_OVERLAY = "rgba(8,16,26,0.5)";

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
    default:
      // Unknown improvement: small neutral marker.
      ctx.fillStyle = "#999";
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

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

  // Bridges span the river edge SHARED by two road tiles, so they are collected
  // during the tile loop and painted afterwards (once per edge) on top of the
  // road network, centred on that edge's midpoint.
  const bridgeDraws: { img: HTMLImageElement; mx: number; my: number }[] = [];

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
    let img =
      variants && variants.length > 0
        ? variants[hashSeed(`${t.col},${t.row},${t.terrain}`) % variants.length]
        : undefined;
    // A natural wonder replaces the terrain art with its own full-tile sprite.
    if (t.naturalWonder) {
      const wonderImg = naturalWonderTileImage(opts.naturalWonderAtlas, t.naturalWonder);
      if (wonderImg) img = wonderImg;
    }
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
    } else if (t.river) {
      // River overlay on land: the channel reaches every connected edge (including
      // the one that meets the sea, so the river-mouth tile reads as a real
      // connector); the matching mouth delta is painted on the adjacent water tile.
      drawFootprintOverlay(ctx, riverChannelFrame(opts.riverAtlas, t.river, !!t.riverLake, t.col, t.row), sx, sy, footprint);
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
          // Prefer the painted road overlay; fall back to the procedural segment
          // while the atlas is still loading (or a variant failed to load).
          const img = roadFrame(opts.roadAtlas, mask, false, t.col, t.row);
          if (img && isImageReady(img)) {
            drawFootprintOverlay(ctx, img, sx, sy, footprint);
          } else {
            const level = t.road ? (t.roadLevel ?? 1) : maxNeighborRoadLevel(map, t.col, t.row);
            drawRoadSegment(ctx, sx, sy, corners, mask, level, size);
          }
        }
        // A bridge spans a river along the edge between this road tile and a road or
        // city neighbour. Paint each shared edge once, with the straight-through
        // bridge centred on that edge's midpoint.
        if (t.road) {
          const here = offsetToAxial({ col: t.col, row: t.row });
          for (let d = 0; d < 6; d++) {
            const nb = axialToOffset(axialNeighbor(here, d));
            const n = getTile(map, nb.col, nb.row);
            const nIsCity = cityKeys.has(`${nb.col},${nb.row}`);
            if (!n?.road && !nIsCity) continue;
            const opp = (d + 3) % 6;
            const riverOnEdge = (((t.river ?? 0) & (1 << d)) | ((n?.river ?? 0) & (1 << opp))) !== 0;
            if (!riverOnEdge || (!t.bridge && !n?.bridge)) continue;
            // Draw each shared edge once: a road↔road edge from the lower-coordinate
            // tile; a road↔city edge always from the road tile (cities never initiate).
            if (n?.road && !nIsCity && (nb.row < t.row || (nb.row === t.row && nb.col < t.col))) continue;
            const bridgeMask = (1 << d) | (1 << opp); // one of 9/18/36
            const bImg = roadFrame(opts.roadAtlas, bridgeMask, true, t.col, t.row);
            if (bImg && isImageReady(bImg)) {
              const m = sideMidpoint(corners, (6 - d) % 6, sx, sy);
              bridgeDraws.push({ img: bImg, mx: m.x, my: m.y });
            }
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
          ctx.globalAlpha = resourceActive(t) ? 1 : 0.55;
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
            ctx.fillStyle = resourceActive(t) ? "#ffffff" : "#888888";
            ctx.fillText(def.name.slice(0, 2).toUpperCase(), sx, sy - size * 0.45);
            ctx.restore();
          }
        }
      }
    }
    drawn++;
  }

  // Bridges last, so they sit on top of the road network at each river crossing.
  for (const b of bridgeDraws) {
    drawFootprintOverlay(ctx, b.img, b.mx, b.my, footprint);
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
