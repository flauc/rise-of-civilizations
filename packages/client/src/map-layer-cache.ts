import type { GameState } from "@roc/sim";
import { Camera } from "./camera";
import {
  BASE_SIZE,
  computeWorldBounds,
  drawScene,
  punchCacheBottomSkirtHoles,
  tileFootprint,
  type RenderOptions,
} from "./renderer";

/** Skip world-layer caching above this width/height (mobile memory guard). */
const MAX_CACHE_PX = 4096;
/** Typical in-game zoom after fitCameraToStart. The bake target is this times
 *  devicePixelRatio so the blit is 1:1 with device pixels (sharp) at that zoom. */
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
  /** Zoom level the offscreen bitmap should be rasterized at (>= 1). */
  private buildZoom = 1;
  /** Zoom level the current bitmap actually was rasterized at (dpr may change). */
  private builtZoom = 0;
  private terrainRev = -1;
  private lastDrawn = 0;
  private usable = false;

  /** True when the map fits in a reasonably sized offscreen canvas. */
  canUse(state: GameState, dpr = 1): boolean {
    this.buildZoom = resolveBuildZoom(state, dpr);
    return this.buildZoom > 0;
  }

  /** Zoom the cache bitmap is (to be) built at (1 when unused). */
  get buildZoomLevel(): number {
    return this.buildZoom;
  }

  isValid(terrainRev: number): boolean {
    return this.usable && this.terrainRev === terrainRev && this.builtZoom === this.buildZoom;
  }

  rebuild(state: GameState, opts: RenderOptions, terrainRev: number): void {
    const buildZoom = resolveBuildZoom(state, opts.dpr);
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
    const ctx = this.canvas.getContext("2d", { alpha: true });
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
      skipMapEdgePass: true,
    });
    punchCacheBottomSkirtHoles(ctx, state.map, originX, originY, buildZoom);
    this.terrainRev = terrainRev;
    this.builtZoom = buildZoom;
    this.usable = true;
  }

  /** When clear is false, composite cached terrain over whatever is already drawn (hex-under skirts). */
  blit(ctx: CanvasRenderingContext2D, camera: Camera, dpr: number, clear = true): void {
    if (!this.canvas || !this.usable) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clear) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = "#0a1624";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
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

/** Pick a bake zoom that fits in MAX_CACHE_PX and matches typical gameplay
 *  zoom in DEVICE pixels (zoom × devicePixelRatio), so the blit stays sharp. */
function resolveBuildZoom(state: GameState, dpr: number): number {
  const { w, h } = cacheDimensions(state);
  if (w <= 0 || h <= 0) return 0;
  const maxDim = Math.max(w, h);
  if (maxDim > MAX_CACHE_PX) return 0;
  return Math.min(TARGET_CACHE_ZOOM * Math.max(1, dpr), MAX_CACHE_PX / maxDim);
}
