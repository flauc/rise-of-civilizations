// Knock out painted portrait backdrops so only the legend figure remains over the game map.

function rgbDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function avgEdgeColor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const samples: [number, number, number][] = [];
  const sampleAt = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    samples.push([d[i]!, d[i + 1]!, d[i + 2]!]);
  };
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 28))) sampleAt(x, 0);
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 28))) sampleAt(0, y);
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 28))) sampleAt(x, h - 1);
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 28))) sampleAt(w - 1, y);
  sampleAt(0, 0);
  sampleAt(w - 1, 0);
  sampleAt(0, h - 1);
  sampleAt(w - 1, h - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  for (const s of samples) {
    r += s[0];
    g += s[1];
    b += s[2];
  }
  const n = samples.length;
  return [r / n, g / n, b / n];
}

function isParchmentTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max < 10 ? 0 : (max - min) / max;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 45 || lum > 242) return false;
  if (sat > 0.44) return false;
  return r >= b - 20 && g >= b - 30 && r + g > b + 30;
}

function isMapWashTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max < 10 ? 0 : (max - min) / max;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 42 || lum > 232 || sat > 0.4) return false;
  if (g > r * 0.9 && g > b * 0.86) return true;
  if (r > g * 1.04 && r > b * 1.1 && sat < 0.34) return true;
  return false;
}

/** Card backdrop — flood may pass through these. */
function isBackdrop(r: number, g: number, b: number, bgR: number, bgG: number, bgB: number): boolean {
  const dist = rgbDist(r, g, b, bgR, bgG, bgB);
  if (dist < 50) return true;
  if (isParchmentTone(r, g, b) && dist < 72) return true;
  return isMapWashTone(r, g, b);
}

/** Figure paint — flood must never pass through (keeps body/hands/cape intact). */
function isFigurePaint(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max < 10 ? 0 : (max - min) / max;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (sat > 0.24) return true;
  if (lum < 42) return true;
  if (r > 145 && g > 95 && b < 105 && r > b + 35) return true;
  if (r > 175 && g > 130 && b < 115) return true;
  return false;
}

function canFloodBackdrop(r: number, g: number, b: number, bgR: number, bgG: number, bgB: number): boolean {
  if (isFigurePaint(r, g, b)) return false;
  return isBackdrop(r, g, b, bgR, bgG, bgB);
}

function floodBackdrop(d: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const bg = avgEdgeColor(d, w, h);
  const backdrop = new Uint8Array(w * h);
  const queue: number[] = [];

  const seed = (x: number, y: number): void => {
    const idx = y * w + x;
    if (backdrop[idx]) return;
    const i = idx * 4;
    if (!canFloodBackdrop(d[i]!, d[i + 1]!, d[i + 2]!, bg[0], bg[1], bg[2])) return;
    backdrop[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) visit(x - 1, y);
    if (x < w - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < h - 1) visit(x, y + 1);
  }

  function visit(x: number, y: number): void {
    const idx = y * w + x;
    if (backdrop[idx]) return;
    const i = idx * 4;
    if (!canFloodBackdrop(d[i]!, d[i + 1]!, d[i + 2]!, bg[0], bg[1], bg[2])) return;
    backdrop[idx] = 1;
    queue.push(idx);
  }

  return backdrop;
}

function dilateMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (mask[ny * w + nx]) {
            out[idx] = 1;
            break;
          }
        }
        if (out[idx]) break;
      }
    }
  }
  return out;
}

function fillHolesInMask(mask: Uint8Array, w: number, h: number): void {
  const outside = new Uint8Array(w * h);
  const queue: number[] = [];
  const enqueue = (x: number, y: number): void => {
    const idx = y * w + x;
    if (outside[idx] || mask[idx]) return;
    outside[idx] = 1;
    queue.push(idx);
  };
  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) enqueue(x - 1, y);
    if (x < w - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < h - 1) enqueue(x, y + 1);
  }
  for (let idx = 0; idx < w * h; idx++) {
    if (!mask[idx] && !outside[idx]) mask[idx] = 1;
  }
}

function removeTinySpecks(mask: Uint8Array, w: number, h: number, minPx: number): void {
  const seen = new Uint8Array(w * h);
  const blobs: number[][] = [];
  for (let idx = 0; idx < w * h; idx++) {
    if (seen[idx] || !mask[idx]) continue;
    const blob: number[] = [];
    const q = [idx];
    seen[idx] = 1;
    while (q.length) {
      const cur = q.pop()!;
      blob.push(cur);
      const x = cur % w;
      const y = (cur - x) / w;
      if (x > 0 && mask[cur - 1] && !seen[cur - 1]) {
        seen[cur - 1] = 1;
        q.push(cur - 1);
      }
      if (x < w - 1 && mask[cur + 1] && !seen[cur + 1]) {
        seen[cur + 1] = 1;
        q.push(cur + 1);
      }
      if (y > 0 && mask[cur - w] && !seen[cur - w]) {
        seen[cur - w] = 1;
        q.push(cur - w);
      }
      if (y < h - 1 && mask[cur + w] && !seen[cur + w]) {
        seen[cur + w] = 1;
        q.push(cur + w);
      }
    }
    blobs.push(blob);
  }
  if (blobs.length <= 1) return;
  blobs.sort((a, b) => b.length - a.length);
  const main = blobs[0]!.length;
  const keep = new Set<number>();
  for (const blob of blobs) {
    if (blob.length >= minPx || blob.length >= main * 0.015) {
      for (const idx of blob) keep.add(idx);
    }
  }
  for (let idx = 0; idx < w * h; idx++) {
    if (!keep.has(idx)) mask[idx] = 0;
  }
}

/** Drop backdrop-colored fringe pixels that sit on the outer edge of the silhouette. */
function trimBackdropFringe(
  mask: Uint8Array,
  d: Uint8ClampedArray,
  w: number,
  h: number,
): void {
  const bg = avgEdgeColor(d, w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!mask[idx]) continue;
      const i = idx * 4;
      if (!isBackdrop(d[i]!, d[i + 1]!, d[i + 2]!, bg[0], bg[1], bg[2])) continue;
      if (isFigurePaint(d[i]!, d[i + 1]!, d[i + 2]!)) continue;
      let keepNeighbors = 0;
      if (mask[idx - 1]) keepNeighbors++;
      if (mask[idx + 1]) keepNeighbors++;
      if (mask[idx - w]) keepNeighbors++;
      if (mask[idx + w]) keepNeighbors++;
      if (keepNeighbors <= 2) mask[idx] = 0;
    }
  }
}

function applyMask(d: Uint8ClampedArray, mask: Uint8Array): void {
  for (let idx = 0; idx < mask.length; idx++) {
    d[idx * 4 + 3] = mask[idx] ? 255 : 0;
  }
}

function featherOuterEdge(d: Uint8ClampedArray, mask: Uint8Array, w: number, h: number): void {
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!mask[idx]) continue;
      if (mask[idx - 1] && mask[idx + 1] && mask[idx - w] && mask[idx + w]) continue;
      d[idx * 4 + 3] = 230;
    }
  }
}

function trimBounds(mask: Uint8Array, w: number, h: number, pad: number): { x: number; y: number; w: number; h: number } {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) return { x: 0, y: 0, w, h };
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function maskFigure(d: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const backdrop = floodBackdrop(d, w, h);
  const keep = new Uint8Array(w * h);
  for (let idx = 0; idx < w * h; idx++) keep[idx] = backdrop[idx] ? 0 : 1;
  let expanded = dilateMask(keep, w, h, 3);
  fillHolesInMask(expanded, w, h);
  trimBackdropFringe(expanded, d, w, h);
  removeTinySpecks(expanded, w, h, Math.max(64, Math.floor((w * h) / 6000)));
  expanded = dilateMask(expanded, w, h, 1);
  return expanded;
}

/** Process raw RGBA pixels (shared by browser cutout and bake script). */
export function processPortraitPixels(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  pad = 8,
): { data: Uint8ClampedArray; outW: number; outH: number } {
  const copy = new Uint8ClampedArray(d);
  const keep = maskFigure(copy, w, h);
  applyMask(copy, keep);
  featherOuterEdge(copy, keep, w, h);
  const bounds = trimBounds(keep, w, h, pad);
  const outW = bounds.w;
  const outH = bounds.h;
  const cropped = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const srcIdx = ((bounds.y + y) * w + (bounds.x + x)) * 4;
      const dstIdx = (y * outW + x) * 4;
      cropped[dstIdx] = copy[srcIdx]!;
      cropped[dstIdx + 1] = copy[srcIdx + 1]!;
      cropped[dstIdx + 2] = copy[srcIdx + 2]!;
      cropped[dstIdx + 3] = copy[srcIdx + 3]!;
    }
  }
  return { data: cropped, outW, outH };
}

/** Alpha-out the painted card backdrop; returns a tight PNG data URL of the figure only. */
export function cutLegendPortraitBackground(img: HTMLImageElement, pad = 8): string | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data, outW, outH } = processPortraitPixels(imageData.data, w, h, pad);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.putImageData(new ImageData(data, outW, outH), 0, 0);
  return out.toDataURL("image/png");
}
