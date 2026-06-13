// 2D camera: world (hex-pixel) space -> screen (CSS pixel) space.
// screen = world * zoom + offset.

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

export class Camera {
  offsetX = 0;
  offsetY = 0;
  zoom = 1;

  worldToScreenX(wx: number): number {
    return wx * this.zoom + this.offsetX;
  }
  worldToScreenY(wy: number): number {
    return wy * this.zoom + this.offsetY;
  }
  screenToWorldX(sx: number): number {
    return (sx - this.offsetX) / this.zoom;
  }
  screenToWorldY(sy: number): number {
    return (sy - this.offsetY) / this.zoom;
  }

  panBy(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Zoom by `factor`, keeping the world point under (sx, sy) fixed on screen. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const wx = this.screenToWorldX(sx);
    const wy = this.screenToWorldY(sy);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    this.offsetX = sx - wx * this.zoom;
    this.offsetY = sy - wy * this.zoom;
  }

  /** Fit the given world bounds into a viewport (CSS pixels) with padding. */
  fitToView(bounds: Bounds, viewW: number, viewH: number, padding = 40): void {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const zx = (viewW - padding * 2) / w;
    const zy = (viewH - padding * 2) / h;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zx, zy)));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    this.offsetX = viewW / 2 - cx * this.zoom;
    this.offsetY = viewH / 2 - cy * this.zoom;
  }
}
