import { cityMaxHp, tileYields, UNIT_DEFS, unitMaxHp, type GameState } from "@roc/sim";
import { axialNeighbors, axialToOffset, getTile, hashSeed, offsetToAxial } from "@roc/shared";
import { Camera } from "./camera";
import { BASE_SIZE, VSQUISH, tileCenterWorld } from "./renderer";
import { isImageReady, type UnitAtlas } from "./unit-assets";
import { cityImageIndex, type CityAtlas } from "./city-assets";
import { barbCampFrameFor, villageFrameFor, type FeatureAtlas } from "./feature-assets";

export interface OverlayState {
  viewingPlayerId: number;
  visible: Set<string>;
  explored: Set<string>;
  selectedUnitId: number | null;
  selectedCityId: number | null;
  reachable: Set<string>;
  attackTargets: Set<string>;
  cityWorkable: Set<string>;
  cityWorked: Set<string>;
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
          const y = tileYields(t);
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
    if (selected) {
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.strokeStyle = "#ffd967";
      ctx.strokeRect(imgX - 1, imgY - 1, imgSize + 2, imgSize + 2);
    }

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
  for (const unit of state.units.values()) {
    const own = unit.ownerId === o.viewingPlayerId;
    if (!own && !o.visible.has(`${unit.col},${unit.row}`)) continue;
    const s = screen(unit.col, unit.row);
    const half = size * 0.42;
    const imgSize = half * 1.8;
    const imgX = s.x - imgSize / 2;
    const imgY = s.y - imgSize / 2;

    // Unit sprite (or fallback glyph).
    const unitImg = o.unitAtlas?.images[unit.type];
    if (unitImg && isImageReady(unitImg)) {
      ctx.drawImage(unitImg, imgX, imgY, imgSize, imgSize);
    } else if (showLabels) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(UNIT_DEFS[unit.type].glyph, s.x, s.y + 1);
    }

    const selected = o.selectedUnitId === unit.id;
    const fatigued = own && unit.movementLeft <= 0;

    // Promotion-available star.
    if (own && unit.unspentPromotions > 0 && size > 12) {
      ctx.fillStyle = "#ffd967";
      ctx.font = `${Math.round(size * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", s.x + half * 0.9, s.y - half * 0.9);
    }

    // Player-color label above the unit (colored dot + unit name + level stars).
    if (size >= 10) {
      const stars = unit.level > 1 ? " ★".repeat(unit.level - 1) : "";
      const label = UNIT_DEFS[unit.type].name + stars;
      const fontSize = Math.max(8, Math.round(size * 0.32));
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
