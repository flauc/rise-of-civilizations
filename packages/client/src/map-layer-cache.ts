import type { GameState } from "@roc/sim";
import { Camera } from "./camera";
import {
  BASE_SIZE,
  computeWorldBounds,
  drawScene,
  tileFootprint,
  type RenderOptions,
} from "./renderer";

/** Skip world-layer caching above this width/height (mobile memory guard). */
const MAX_CACHE_PX = 4096;
/** Typical in-game zoom after fitCameraToStart; baking the cache near this keeps tiles sharp. */
const TARGET_CACHE_ZOOM = 2;

/**
 * World-space terrain bitmap. Pan/zoom blits this layer instead of repainting every
 * hex; fog of war is redrawn on screen each frame.
 */
export class MapLayerCache {
  private canvas: HTMLCanvasElement | null = null;
  private originX = 0;
  private originY = 0;
  /** World width/height at zoom 1 (used for blit placement). */
  private cacheW = 0;
  private cacheH = 0;
  /** Zoom level the offscreen bitmap was rasterized at (>= 1). */
  private buildZoom = 1;
  private terrainRev = -1;
  private lastDrawn = 0;
  private usable = false;

  /** True when the map fits in a reasonably sized offscreen canvas. */
  canUse(state: GameState): boolean {
    this.buildZoom = resolveBuildZoom(state);
    return this.buildZoom > 0;
  }

  /** Zoom the cache bitmap was built at (1 when unused). */
  get buildZoomLevel(): number {
    return this.buildZoom;
  }

  isValid(terrainRev: number): boolean {
    return this.usable && this.terrainRev === terrainRev;
  }

  rebuild(state: GameState, opts: RenderOptions, terrainRev: number): void {
    const buildZoom = resolveBuildZoom(state);
    if (buildZoom <= 0) {
      this.usable = false;
      return;
    }
    const { w, h, originX, originY } = cacheDimensions(state);
    this.originX = originX;
    this.originY = originY;
    this.cacheW = w;
    this.cacheH = h;
    this.buildZoom = buildZoom;
    const pxW = Math.ceil(w * buildZoom);
    const pxH = Math.ceil(h * buildZoom);
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
    }
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      this.usable = false;
      return;
    }
    const cam = new Camera();
    cam.zoom = buildZoom;
    cam.offsetX = -originX * buildZoom;
    cam.offsetY = -originY * buildZoom;
    this.lastDrawn = drawScene(ctx, state, cam, {
      ...opts,
      fog: undefined,
      dpr: 1,
      cssWidth: pxW,
      cssHeight: pxH,
      hovered: undefined,
      skipLayerCache: true,
      skipFogPass: true,
    });
    this.terrainRev = terrainRev;
    this.usable = true;
  }

  blit(ctx: CanvasRenderingContext2D, camera: Camera, dpr: number): void {
    if (!this.canvas || !this.usable) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#0a1624";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = camera.zoom;
    ctx.drawImage(
      this.canvas,
      camera.offsetX + this.originX * z,
      camera.offsetY + this.originY * z,
      this.cacheW * z,
      this.cacheH * z,
    );
  }

  get tileCount(): number {
    return this.lastDrawn;
  }
}

function cacheDimensions(state: GameState): {
  w: number;
  h: number;
  originX: number;
  originY: number;
} {
  const bounds = computeWorldBounds(state.map);
  const pad = tileFootprint(BASE_SIZE) * 2;
  const originX = bounds.minX - pad;
  const originY = bounds.minY - pad;
  const w = Math.ceil(bounds.maxX - bounds.minX + pad * 2);
  const h = Math.ceil(bounds.maxY - bounds.minY + pad * 2);
  return { w, h, originX, originY };
}

/** Pick a bake zoom that fits in MAX_CACHE_PX and matches typical gameplay zoom. */
function resolveBuildZoom(state: GameState): number {
  const { w, h } = cacheDimensions(state);
  if (w <= 0 || h <= 0) return 0;
  const maxDim = Math.max(w, h);
  if (maxDim > MAX_CACHE_PX) return 0;
  return Math.min(TARGET_CACHE_ZOOM, MAX_CACHE_PX / maxDim);
}
