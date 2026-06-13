import { cityMaxHp, UNIT_DEFS, UNIT_MAX_HP, type GameState } from "@roc/sim";
import { Camera } from "./camera";
import { BASE_SIZE, tileCenterWorld } from "./renderer";

export interface OverlayState {
  viewingPlayerId: number;
  visible: Set<string>;
  selectedUnitId: number | null;
  selectedCityId: number | null;
  reachable: Set<string>;
  attackTargets: Set<string>;
}

function hexPath(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = sx + size * Math.cos(a);
    const y = sy + size * Math.sin(a);
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

  const showLabels = size > 14;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Cities.
  for (const city of state.cities.values()) {
    const own = city.ownerId === o.viewingPlayerId;
    if (!own && !o.visible.has(`${city.col},${city.row}`)) continue;
    const s = screen(city.col, city.row);
    const r = size * 0.62;
    ctx.beginPath();
    ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
    ctx.fillStyle = colorOf(city.ownerId);
    ctx.fill();
    ctx.lineWidth = city.isCapital ? Math.max(2, size * 0.09) : Math.max(1.5, size * 0.05);
    ctx.strokeStyle = city.isCapital ? "#ffd967" : "#ffffff";
    ctx.stroke();
    if (showLabels) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.6)}px system-ui, sans-serif`;
      ctx.fillText(String(city.population), s.x, s.y + 1);
      ctx.font = `${Math.round(Math.min(13, size * 0.42))}px system-ui, sans-serif`;
      const w = ctx.measureText(city.name).width + 8;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(s.x - w / 2, s.y - r - size * 0.62, w, size * 0.5);
      ctx.fillStyle = "#fff";
      ctx.fillText(city.name, s.x, s.y - r - size * 0.37);
    }
    const maxHp = cityMaxHp(city);
    if (city.hp < maxHp) drawHpBar(ctx, s.x, s.y + r + size * 0.12, r * 2, city.hp / maxHp);
  }

  // Units.
  for (const unit of state.units.values()) {
    const own = unit.ownerId === o.viewingPlayerId;
    if (!own && !o.visible.has(`${unit.col},${unit.row}`)) continue;
    const s = screen(unit.col, unit.row);
    const r = size * 0.42;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colorOf(unit.ownerId);
    ctx.fill();
    if (o.selectedUnitId === unit.id) {
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.strokeStyle = "#ffd967";
    } else {
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeStyle = "#ffffff";
    }
    ctx.stroke();
    if (own && unit.movementLeft <= 0) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (showLabels) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`;
      ctx.fillText(UNIT_DEFS[unit.type].glyph, s.x, s.y + 1);
    }
    // Promotion-available star.
    if (own && unit.unspentPromotions > 0 && size > 12) {
      ctx.fillStyle = "#ffd967";
      ctx.font = `${Math.round(size * 0.5)}px system-ui, sans-serif`;
      ctx.fillText("★", s.x + r * 0.9, s.y - r * 0.9);
    }
    if (unit.hp < UNIT_MAX_HP) drawHpBar(ctx, s.x, s.y + r + size * 0.1, r * 1.8, unit.hp / UNIT_MAX_HP);
  }
}
