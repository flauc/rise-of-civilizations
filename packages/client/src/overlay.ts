import { cityAt, cityMaxHp, tileYields, resourceYields, naturalWonderYields, addYields, UNIT_DEFS, unitMaxHp, ACTIVE_ABILITY_DEFS, uniqueUnitForCiv, type GameState, type TradeRoute } from "@roc/sim";
import { axialNeighbor, axialNeighbors, axialToOffset, getTile, hashSeed, offsetToAxial } from "@roc/shared";
import { Camera } from "./camera";
import { BASE_SIZE, VSQUISH, tileCenterWorld } from "./renderer";
import { isImageReady, type UnitAtlas } from "./unit-assets";
import { cityImageIndex, type CityAtlas } from "./city-assets";
import { barbCampFrameFor, villageFrameFor, type FeatureAtlas } from "./feature-assets";
import { getNaturalWonder } from "@roc/data";

export interface OverlayState {
  viewingPlayerId: number;
  visible: Set<string>;
  explored: Set<string>;
  selectedUnitId: number | null;
  selectedCityId: number | null;
  reachable: Set<string>;
  attackTargets: Set<string>;
  /** Tiles a pending targeted ability can be used against (highlighted distinctly). */
  abilityTargets?: Set<string>;
  cityWorkable: Set<string>;
  cityWorked: Set<string>;
  /** The viewer's trade routes, drawn as dashed lines between cities. */
  tradeRoutes?: TradeRoute[];
  unitAtlas?: UnitAtlas;
  cityAtlas?: CityAtlas;
  featureAtlas?: FeatureAtlas;
}

/** "#rrggbb" -> "rgba(r,g,b,a)". */
function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function hexPath(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = sx + size * Math.cos(a);
    const y = sy + size * Math.sin(a) * VSQUISH; // match the squished terrain hexes
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function hpColor(frac: number): string {
  if (frac > 0.6) return "#5fcf61";
  if (frac > 0.3) return "#e0c14a";
  return "#e0533d";
}

interface Pt { x: number; y: number; }

/** Whether the tile at a "col,row" key counts as roaded for trail rendering.
 *  Cities act as road hubs, so a road touching the city wall reads as continuous. */
function isRoadTile(state: GameState, key: string | undefined): boolean {
  if (!key) return false;
  const [col, row] = key.split(",").map(Number) as [number, number];
  const tile = getTile(state.map, col, row);
  return !!tile?.road || !!cityAt(state, col, row);
}

/** Stroke a connected polyline through the given points. */
function strokePolyline(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

/** Point halfway along a polyline by accumulated length (for the route marker). */
function polylineMidpoint(pts: Pt[]): Pt {
  if (pts.length === 1) return pts[0]!;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
  }
  let half = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (half <= len || i === pts.length - 2) {
      const t = len === 0 ? 0 : half / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    half -= len;
  }
  return pts[pts.length - 1]!;
}

/** The six screen-space corners of a tile's hex (matches the terrain geometry). */
function hexCorners(cx: number, cy: number, size: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) * VSQUISH });
  }
  return pts;
}

/**
 * Stroke a rampart along the given hex edges. `sides[k]` is an edge index whose
 * endpoints are corners[side]..corners[(side+1)%6]. Because adjacent tiles share
 * the exact same corner world-points, the segments of neighbouring wall/tower
 * tiles meet seamlessly — the same way roads join at shared edge midpoints.
 */
function drawRampart(
  ctx: CanvasRenderingContext2D,
  corners: Pt[],
  sides: number[],
  color: string,
  size: number,
  tier: number,
): void {
  if (sides.length === 0) return;
  const base = Math.max(2, size * 0.13) * (1 + (tier - 1) * 0.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stroke = (w: number, col: string): void => {
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (const sd of sides) {
      const a = corners[sd]!;
      const b = corners[(sd + 1) % 6]!;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  };
  stroke(base * 1.55, "rgba(16,14,12,0.55)"); // soft shadow base
  stroke(base, "#9a948a"); // stone
  stroke(base * 0.5, "#c8c2b4"); // lit stone top
  stroke(base * 0.22, color); // thin owner tint along the crest
  // Crenellation merlons at higher zoom for a fortified read.
  if (size > 18) {
    ctx.fillStyle = "#c8c2b4";
    const m = base * 0.5;
    for (const sd of sides) {
      const a = corners[sd]!;
      const b = corners[(sd + 1) % 6]!;
      for (let k = 0.25; k <= 0.75; k += 0.25) {
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        ctx.fillRect(x - m / 2, y - m / 2, m, m);
      }
    }
  }
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  width: number,
  frac: number,
): void {
  const h = Math.max(2, width * 0.12);
  const x = sx - width / 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x, sy, width, h);
  ctx.fillStyle = hpColor(frac);
  ctx.fillRect(x, sy, width * Math.max(0, Math.min(1, frac)), h);
}

function isMobileScreen(): boolean {
  // Always scale units up for visibility testing.
  return true;
}

const MOBILE_UNIT_SCALE = 1.35;

/** Draws reachable + attack highlights, then cities and units, respecting fog. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  state: GameState,
  o: OverlayState,
): void {
  const size = BASE_SIZE * camera.zoom;
  const screen = (col: number, row: number) => {
    const c = tileCenterWorld(col, row);
    return { x: camera.worldToScreenX(c.x), y: camera.worldToScreenY(c.y) };
  };
  const colorOf = (ownerId: number) =>
    state.players.find((p) => p.id === ownerId)?.color ?? "#aaa";

  // ---- territory (cultural borders) ----
  const tileOwnerPlayer = new Map<number, number>(); // cityId -> playerId
  for (const c of state.cities.values()) tileOwnerPlayer.set(c.id, c.ownerId);
  const ownerPlayerAt = (col: number, row: number): number | undefined => {
    const t = getTile(state.map, col, row);
    return t?.ownerCityId !== undefined ? tileOwnerPlayer.get(t.ownerCityId) : undefined;
  };
  for (const t of state.map.tiles) {
    if (t.ownerCityId === undefined) continue;
    const key = `${t.col},${t.row}`;
    if (!o.explored.has(key)) continue;
    const owner = tileOwnerPlayer.get(t.ownerCityId);
    if (owner === undefined) continue;
    const color = colorOf(owner);
    const s = screen(t.col, t.row);
    hexPath(ctx, s.x, s.y, size * 0.98);
    ctx.fillStyle = rgba(color, 0.14);
    ctx.fill();
    // Outline tiles on the border (neighbor owned by a different player / none).
    let isBorder = false;
    for (const a of axialNeighbors(offsetToAxial({ col: t.col, row: t.row }))) {
      const off = axialToOffset(a);
      if (ownerPlayerAt(off.col, off.row) !== owner) {
        isBorder = true;
        break;
      }
    }
    if (isBorder) {
      ctx.lineWidth = Math.max(1.5, size * 0.09);
      ctx.strokeStyle = rgba(color, 0.85);
      hexPath(ctx, s.x, s.y, size * 0.9);
      ctx.stroke();
    }
  }

  // ---- map features (villages / barbarian camps) ----
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of state.map.tiles) {
    if (!t.feature) continue;
    if (!o.explored.has(`${t.col},${t.row}`)) continue;
    const s = screen(t.col, t.row);
    if (t.feature === "village") {
      const villageImg = villageFrameFor(o.featureAtlas, t.col, t.row);
      if (villageImg) {
        const vSize = size * 0.85;
        ctx.drawImage(villageImg, s.x - vSize / 2, s.y - vSize / 2, vSize, vSize);
      } else {
        ctx.fillStyle = "#cfa867";
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a2c40";
        ctx.font = `bold ${Math.round(size * 0.42)}px system-ui, sans-serif`;
        ctx.fillText("?", s.x, s.y + 1);
      }
    } else if (t.feature === "barb_camp") {
      const campImg = barbCampFrameFor(o.featureAtlas, t.col, t.row);
      if (campImg) {
        const cSize = size * 0.85;
        ctx.drawImage(campImg, s.x - cSize / 2, s.y - cSize / 2, cSize, cSize);
      } else {
        ctx.fillStyle = "#b23b2e";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - size * 0.32);
        ctx.lineTo(s.x + size * 0.3, s.y + size * 0.26);
        ctx.lineTo(s.x - size * 0.3, s.y + size * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(size * 0.34)}px system-ui, sans-serif`;
        ctx.fillText("!", s.x, s.y + size * 0.06);
      }
    }

    // Small label at the bottom of the tile for villages / camps.
    if (size > 14) {
      const label = t.feature === "village" ? "Village" : "Camp";
      const fontSize = Math.max(7, Math.round(size * 0.22));
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      const textW = ctx.measureText(label).width;
      const pad = Math.max(1, size * 0.04);
      const labelH = fontSize + pad * 2;
      const labelW = textW + pad * 4;
      const labelX = s.x - labelW / 2;
      const labelY = s.y + size * 0.55;

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, labelH / 2);
      ctx.fill();

      ctx.fillStyle = t.feature === "village" ? "#cfa867" : "#e07060";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, s.x, labelY + labelH / 2);
    }
  }

  // ---- natural wonders: name label (the full-tile art is drawn by the renderer) ----
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (size > 13) {
    for (const t of state.map.tiles) {
      if (!t.naturalWonder) continue;
      if (!o.explored.has(`${t.col},${t.row}`)) continue;
      const s = screen(t.col, t.row);
      const label = getNaturalWonder(t.naturalWonder)?.name ?? "Natural Wonder";
      const fontSize = Math.max(8, Math.round(size * 0.24));
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      const textW = ctx.measureText(label).width;
      const pad = Math.max(1, size * 0.05);
      const labelH = fontSize + pad * 2;
      const labelW = textW + pad * 4;
      const labelY = s.y + size * 0.58;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(s.x - labelW / 2, labelY, labelW, labelH, labelH / 2);
      ctx.fill();
      ctx.fillStyle = "#f0d77a";
      ctx.fillText(label, s.x, labelY + labelH / 2);
    }
  }

  // ---- defensive structures (walls / towers) ----
  // Walls hug the tile edges that face the owner's frontier and connect to
  // neighbouring walls/towers at shared corners — drawn dynamically (like roads)
  // from the tile's territory-border edges rather than as a centred icon.
  for (const t of state.map.tiles) {
    if (!t.structure || t.structure.hp <= 0) continue;
    if (!o.explored.has(`${t.col},${t.row}`)) continue;
    const ownerPid = t.ownerCityId !== undefined ? tileOwnerPlayer.get(t.ownerCityId) : undefined;
    const color = ownerPid !== undefined ? colorOf(ownerPid) : "#999";
    const s = screen(t.col, t.row);
    const isTower = t.structure.kind === "tower";
    const tier = t.structure.tier;
    const corners = hexCorners(s.x, s.y, size);

    // Edges whose neighbour isn't owned by this structure's player are border
    // edges; that's where the wall is raised. An isolated structure with no
    // border (fully interior) encloses its own tile so it still reads as a fort.
    const here = offsetToAxial({ col: t.col, row: t.row });
    const sides: number[] = [];
    for (let d = 0; d < 6; d++) {
      const nb = axialToOffset(axialNeighbor(here, d));
      if (ownerPlayerAt(nb.col, nb.row) !== ownerPid) sides.push((6 - d) % 6);
    }
    if (sides.length === 0) for (let sd = 0; sd < 6; sd++) sides.push(sd);

    drawRampart(ctx, corners, sides, color, size, tier);

    // Towers add a bastion node on the line; they anchor and connect wall runs.
    if (isTower) {
      const r = size * 0.24 * (1 + (tier - 1) * 0.12);
      ctx.fillStyle = "rgba(26,24,22,0.92)";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, size * 0.05);
      ctx.beginPath();
      ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
      if (size > 12) {
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(size * 0.3)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("♜", s.x, s.y + 1);
      }
    }

    if (t.structure.hp < t.structure.maxHp) {
      drawHpBar(ctx, s.x, s.y + size * 0.55, size * 0.9, t.structure.hp / t.structure.maxHp);
    }
  }

  // ---- trade routes ----
  // Caravans follow the tile-by-tile path computed by the sim (hugging roads and
  // skirting impassable terrain). Segments that run along a road are drawn as a
  // solid paved trail; open-country segments keep the dashed caravan track.
  if (o.tradeRoutes && o.tradeRoutes.length > 0) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const r of o.tradeRoutes) {
      if (r.ownerId !== o.viewingPlayerId) continue;
      const from = state.cities.get(r.fromCityId);
      const to = state.cities.get(r.toCityId);
      if (!from || !to) continue;

      // Resolve the path to screen points, falling back to a straight
      // city-to-city line for legacy routes that lack a stored path.
      const pts: Pt[] =
        r.path.length >= 2
          ? r.path.map((k) => {
              const [c, rw] = k.split(",").map(Number) as [number, number];
              return screen(c, rw);
            })
          : [screen(from.col, from.row), screen(to.col, to.row)];

      // A segment is "on road" when both of its tiles are roaded (cities count
      // as hubs), so the caravan visibly follows the road network where one exists.
      const onRoad = (i: number): boolean => {
        if (r.path.length < 2) return false;
        return isRoadTile(state, r.path[i]) && isRoadTile(state, r.path[i + 1]);
      };

      // Dark backing for contrast over terrain.
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(3, size * 0.13);
      ctx.strokeStyle = "rgba(20,14,6,0.55)";
      strokePolyline(ctx, pts);

      // Trail, drawn per segment so road segments differ from open country.
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (onRoad(i)) {
          // Paved road: solid, thicker, warm stone colour.
          ctx.setLineDash([]);
          ctx.lineWidth = Math.max(2, size * 0.1);
          ctx.strokeStyle = "rgba(214,180,120,0.95)";
        } else {
          // Open country: dashed golden caravan track.
          ctx.setLineDash([Math.max(4, size * 0.34), Math.max(3, size * 0.24)]);
          ctx.lineWidth = Math.max(1.5, size * 0.07);
          ctx.strokeStyle = "rgba(255,206,110,0.9)";
        }
        ctx.stroke();
      }

      // Small marker at the path midpoint.
      if (size > 10) {
        ctx.setLineDash([]);
        const mid = polylineMidpoint(pts);
        ctx.fillStyle = "rgba(255,206,110,0.95)";
        ctx.beginPath();
        ctx.arc(mid.x, mid.y, Math.max(2, size * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a1c08";
        ctx.font = `${Math.max(7, Math.round(size * 0.22))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("$", mid.x, mid.y + 1);
      }
    }
    ctx.restore();
  }

  const highlight = (set: Set<string>, fill: string, stroke: string) => {
    ctx.lineWidth = Math.max(1, size * 0.05);
    for (const key of set) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const s = screen(col, row);
      hexPath(ctx, s.x, s.y, size * 0.92);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  if (o.reachable.size > 0) highlight(o.reachable, "rgba(255,255,255,0.12)", "rgba(255,255,255,0.35)");
  if (o.attackTargets.size > 0) highlight(o.attackTargets, "rgba(224,83,61,0.28)", "rgba(255,90,70,0.9)");
  if (o.abilityTargets && o.abilityTargets.size > 0) highlight(o.abilityTargets, "rgba(120,200,255,0.30)", "rgba(150,220,255,0.95)");

  // ---- city citizen-assignment view ----
  if (o.cityWorkable.size > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const key of o.cityWorkable) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const s = screen(col, row);
      const worked = o.cityWorked.has(key);
      hexPath(ctx, s.x, s.y, size * 0.86);
      if (worked) {
        ctx.fillStyle = "rgba(255,215,103,0.14)";
        ctx.fill();
      }
      ctx.lineWidth = Math.max(1.5, size * (worked ? 0.1 : 0.05));
      ctx.strokeStyle = worked ? "#ffd967" : "rgba(255,255,255,0.45)";
      ctx.stroke();
      if (size > 17) {
        const t = getTile(state.map, col, row);
        if (t) {
          const y = addYields(addYields(tileYields(t), resourceYields(t)), naturalWonderYields(t));
          const parts: string[] = [];
          if (y.food) parts.push(`${y.food}F`);
          if (y.production) parts.push(`${y.production}P`);
          if (y.gold) parts.push(`${y.gold}G`);
          if (y.science) parts.push(`${y.science}S`);
          ctx.font = `${Math.round(size * 0.32)}px system-ui, sans-serif`;
          ctx.fillStyle = "#fff";
          ctx.fillText(parts.join(" ") || "—", s.x, s.y + size * 0.5);
        }
      }
    }
  }

  const showLabels = size > 14;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Cities.
  for (const city of state.cities.values()) {
    const own = city.ownerId === o.viewingPlayerId;
    if (!own && !o.visible.has(`${city.col},${city.row}`)) continue;
    const s = screen(city.col, city.row);
    const half = size * 0.62;
    const pop = Math.min(city.population, 12);
    const imgSize = half * (1.3 + pop * 0.12);
    const imgX = s.x - imgSize / 2;
    const imgY = s.y - imgSize / 2;

    // Pick a frame that stays stable unless the city's population (and therefore
    // its tier) changes.
    const tierIndex = cityImageIndex(city.population);
    const frames = o.cityAtlas?.images[tierIndex] ?? [];
    const readyFrames = frames.filter((img): img is HTMLImageElement => img !== undefined && isImageReady(img));
    const cityImg =
      readyFrames.length > 0
        ? readyFrames[hashSeed(`${city.id},${city.population}`) % readyFrames.length]
        : undefined;
    const hasCityImg = cityImg !== undefined;

    if (hasCityImg) {
      ctx.drawImage(cityImg, imgX, imgY, imgSize, imgSize);
    } else {
      ctx.fillStyle = colorOf(city.ownerId);
      ctx.fillRect(imgX, imgY, imgSize, imgSize);
    }

    const selected = o.selectedCityId === city.id;

    if (showLabels) {
      // City name + population label (same pill style as unit labels).
      const label = `${city.name} (${city.population})`;
      const fontSize = Math.max(8, Math.round(size * 0.32));
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      const textW = ctx.measureText(label).width;
      const dotR = Math.max(2, size * 0.08);
      const pad = Math.max(2, size * 0.06);
      const labelH = Math.max(fontSize + pad * 2, dotR * 2 + pad * 2);
      const labelW = textW + dotR * 3 + pad * 2;
      const labelX = s.x - labelW / 2;
      const labelY = imgY - labelH - pad;

      ctx.fillStyle = selected ? "#ffd967" : "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, labelH / 2);
      ctx.fill();

      if (selected) {
        ctx.lineWidth = Math.max(1, size * 0.05);
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      }

      ctx.fillStyle = selected ? "#332200" : colorOf(city.ownerId);
      ctx.beginPath();
      ctx.arc(labelX + pad + dotR, labelY + labelH / 2, dotR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = selected ? "#332200" : "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX + pad + dotR * 2 + pad, labelY + labelH / 2);
      ctx.textAlign = "center";
    }
    const maxHp = cityMaxHp(city);
    if (city.hp < maxHp) drawHpBar(ctx, s.x, s.y + imgSize / 2 + size * 0.12, imgSize, city.hp / maxHp);
  }

  // Units.
  const unitScale = isMobileScreen() ? MOBILE_UNIT_SCALE : 1;
  const civByPlayer = new Map(state.players.map((p) => [p.id, p.civId]));
  for (const unit of state.units.values()) {
    const own = unit.ownerId === o.viewingPlayerId;
    if (!own && !o.visible.has(`${unit.col},${unit.row}`)) continue;
    const uu = uniqueUnitForCiv(civByPlayer.get(unit.ownerId), unit.type);
    const s = screen(unit.col, unit.row);
    const half = size * 0.42 * unitScale;
    const imgSize = half * 1.8;
    const imgX = s.x - imgSize / 2;
    const imgY = s.y - imgSize / 2;

    // Unit sprite (or fallback glyph). Unique units use their own art when present.
    // Own hidden units render faded so the player can see they're concealed.
    const concealed = own && unit.hidden;
    if (concealed) ctx.globalAlpha = 0.5;
    const unitImg = (uu && o.unitAtlas?.images[uu.id]) || o.unitAtlas?.images[unit.type];
    if (unitImg && isImageReady(unitImg)) {
      ctx.drawImage(unitImg, imgX, imgY, imgSize, imgSize);
    } else if (showLabels) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.5 * unitScale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(UNIT_DEFS[unit.type].glyph, s.x, s.y + 1);
    }
    if (concealed) ctx.globalAlpha = 1;

    const selected = o.selectedUnitId === unit.id;
    const fatigued = own && unit.movementLeft <= 0;

    // Stance badge (Set Spears / Testudo / Emplace…) at the unit's lower-left.
    if (unit.stance && size > 12) {
      ctx.font = `${Math.round(size * 0.42 * unitScale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ACTIVE_ABILITY_DEFS[unit.stance].glyph, s.x - half * 0.9, s.y + half * 0.9);
    }

    // Sleep / hide badge at the unit's lower-right.
    if (own && (unit.sleeping || unit.hidden) && size > 12) {
      ctx.font = `${Math.round(size * 0.42 * unitScale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(unit.hidden ? "🌲" : "💤", s.x + half * 0.9, s.y + half * 0.9);
    }

    // Promotion-available star.
    if (own && unit.unspentPromotions > 0 && size > 12) {
      ctx.fillStyle = "#ffd967";
      ctx.font = `${Math.round(size * 0.5 * unitScale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", s.x + half * 0.9, s.y - half * 0.9);
    }

    // Player-color label above the unit (colored dot + unit name + level stars).
    if (size >= 10) {
      const stars = unit.level > 1 ? " ★".repeat(unit.level - 1) : "";
      const label = (uu?.name ?? UNIT_DEFS[unit.type].name) + stars;
      const fontSize = Math.max(8, Math.round(size * 0.32 * unitScale));
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      const textW = ctx.measureText(label).width;
      const dotR = Math.max(2, size * 0.08);
      const pad = Math.max(2, size * 0.06);
      const labelH = Math.max(fontSize + pad * 2, dotR * 2 + pad * 2);
      const labelW = textW + dotR * 3 + pad * 2;
      const labelX = s.x - labelW / 2;
      const labelY = imgY - labelH - pad;

      ctx.globalAlpha = !selected && fatigued ? 0.5 : 1;

      ctx.fillStyle = selected ? "#ffd967" : "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, labelH / 2);
      ctx.fill();

      if (selected) {
        ctx.lineWidth = Math.max(1, size * 0.05);
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      }

      ctx.fillStyle = selected ? "#332200" : colorOf(unit.ownerId);
      ctx.beginPath();
      ctx.arc(labelX + pad + dotR, labelY + labelH / 2, dotR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = selected ? "#332200" : "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX + pad + dotR * 2 + pad, labelY + labelH / 2);
      ctx.textAlign = "center";
      ctx.globalAlpha = 1;
    }
    const unitHpMax = unitMaxHp(unit);
    if (unit.hp < unitHpMax) drawHpBar(ctx, s.x, s.y + half + size * 0.1, half * 1.8, unit.hp / unitHpMax);
  }
}
