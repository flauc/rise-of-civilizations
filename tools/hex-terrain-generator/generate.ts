import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Must stay in sync with packages/client/src/palette.ts
const TERRAIN_COLORS: Record<string, string> = {
  ocean: "#1c4866",
  coast: "#2e6f93",
  lake: "#2f6d8c",
  plains: "#b7a65a",
  grassland: "#5b8a43",
  desert: "#cdb87a",
  tundra: "#8a9a8c",
  snow: "#e7eef2",
  forest: "#3f6b3a",
  jungle: "#356b3f",
  hills: "#7a8a4e",
  mountains: "#6d6f76",
};

const OUT_DIR = join(__dirname, "..", "..", "assets", "hex-terrain");

// Pointy-top hex with center-to-corner radius 56.
const SIZE = 56;
const W = Math.sqrt(3) * SIZE; // ≈ 97
const H = 2 * SIZE; // 112
const CX = Math.ceil(W / 2); // 49
const CY = Math.ceil(H / 2); // 56
const VIEW_W = Math.ceil(W); // 97
const VIEW_H = Math.ceil(H); // 112

function hexPath(): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = CX + SIZE * Math.cos(angle);
    const y = CY + SIZE * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

const HEX_PATH = hexPath();

function insetHexPath(ratio = 0.88): string {
  const r = SIZE * ratio;
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = CX + r * Math.cos(angle);
    const y = CY + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

function baseTile(fill: string, insetFill?: string): string {
  const inset = insetFill
    ? `<path d="${insetHexPath()}" fill="${insetFill}" />`
    : "";
  return `
    <path d="${HEX_PATH}" fill="${fill}" stroke="rgba(0,0,0,0.18)" stroke-width="1.5" stroke-linejoin="round"/>
    ${inset}
  `;
}

function svg(base: string, decorations: string, extraDefs = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}">
  <defs>
    <clipPath id="hexClip"><path d="${HEX_PATH}"/></clipPath>
    ${extraDefs}
  </defs>
  ${base}
  <g clip-path="url(#hexClip)">
    ${decorations}
  </g>
</svg>`;
}

function radialGradient(id: string, inner: string, outer: string): string {
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="${inner}"/>
    <stop offset="100%" stop-color="${outer}"/>
  </radialGradient>`;
}

function linearGradient(
  id: string,
  stops: { offset: string; color: string }[],
  angle = 0,
): string {
  const x1 = 50 - 50 * Math.cos((angle * Math.PI) / 180);
  const y1 = 50 - 50 * Math.sin((angle * Math.PI) / 180);
  const x2 = 50 + 50 * Math.cos((angle * Math.PI) / 180);
  const y2 = 50 + 50 * Math.sin((angle * Math.PI) / 180);
  const stopEls = stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join("");
  return `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopEls}</linearGradient>`;
}

function lighter(color: string, amount = 20): string {
  const num = parseInt(color.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function darker(color: string, amount = 20): string {
  const num = parseInt(color.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function circle(x: number, y: number, r: number, fill: string): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
}

function ellipse(
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
}

function triangle(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): string {
  return `<polygon points="${x},${y - h / 2} ${x + w / 2},${y + h / 2} ${x - w / 2},${y + h / 2}" fill="${fill}"/>`;
}

function waveLine(y: number, amp: number, color: string): string {
  let d = `M 0,${y}`;
  for (let x = 0; x <= VIEW_W; x += 8) {
    d += ` Q ${x + 4},${y + (x % 16 === 0 ? -amp : amp)} ${x + 8},${y}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
}

function tree(x: number, y: number, scale: number, fill: string): string {
  const trunk = `<rect x="${x - 2.5 * scale}" y="${y}" width="${5 * scale}" height="${10 * scale}" fill="${darker(fill, 40)}"/>`;
  const crown = triangle(x, y, 22 * scale, 28 * scale, fill);
  return `${crown}${trunk}`;
}

function mountainPeak(
  x: number,
  y: number,
  scale: number,
  fill: string,
  snow: string,
): string {
  const base = triangle(x, y, 30 * scale, 34 * scale, fill);
  const cap = triangle(x, y - 7 * scale, 14 * scale, 15 * scale, snow);
  return `${base}${cap}`;
}

function hillMound(x: number, y: number, scale: number, fill: string): string {
  return ellipse(x, y, 22 * scale, 11 * scale, fill);
}

const TERRAIN_SVGS: Record<string, string> = {
  ocean: svg(
    baseTile(TERRAIN_COLORS.ocean, lighter(TERRAIN_COLORS.ocean, 8)).replace(
      `<path d="${HEX_PATH}" fill="${TERRAIN_COLORS.ocean}"`,
      `<path d="${HEX_PATH}" fill="url(#oceanGrad)"`,
    ),
    waveLine(CY + 12, 5, "rgba(255,255,255,0.18)") +
      waveLine(CY - 6, 4, "rgba(255,255,255,0.12)") +
      circle(CX + 28, CY - 22, 3.5, "rgba(255,255,255,0.14)") +
      circle(CX - 22, CY + 24, 2.5, "rgba(255,255,255,0.12)"),
    radialGradient("oceanGrad", lighter(TERRAIN_COLORS.ocean, 12), TERRAIN_COLORS.ocean),
  ),

  coast: svg(
    baseTile(TERRAIN_COLORS.coast, lighter(TERRAIN_COLORS.coast, 10)).replace(
      `<path d="${HEX_PATH}" fill="${TERRAIN_COLORS.coast}"`,
      `<path d="${HEX_PATH}" fill="url(#coastGrad)"`,
    ),
    ellipse(CX, CY + 24, 42, 16, "#c9b896") +
      waveLine(CY - 8, 4, "rgba(255,255,255,0.2)"),
    radialGradient("coastGrad", lighter(TERRAIN_COLORS.coast, 14), TERRAIN_COLORS.coast),
  ),

  lake: svg(
    baseTile(TERRAIN_COLORS.lake, lighter(TERRAIN_COLORS.lake, 8)).replace(
      `<path d="${HEX_PATH}" fill="${TERRAIN_COLORS.lake}"`,
      `<path d="${HEX_PATH}" fill="url(#lakeGrad)"`,
    ),
    circle(CX - 18, CY - 14, 4, "rgba(255,255,255,0.14)") +
      waveLine(CY + 4, 3, "rgba(255,255,255,0.14)"),
    radialGradient("lakeGrad", lighter(TERRAIN_COLORS.lake, 12), TERRAIN_COLORS.lake),
  ),

  plains: svg(
    baseTile(TERRAIN_COLORS.plains, lighter(TERRAIN_COLORS.plains, 8)),
    hillMound(CX - 14, CY + 16, 1, lighter(TERRAIN_COLORS.plains, 18)) +
      hillMound(CX + 18, CY - 10, 0.85, lighter(TERRAIN_COLORS.plains, 14)),
  ),

  grassland: svg(
    baseTile(TERRAIN_COLORS.grassland, lighter(TERRAIN_COLORS.grassland, 8)),
    hillMound(CX + 12, CY + 14, 1, lighter(TERRAIN_COLORS.grassland, 14)) +
      circle(CX - 22, CY - 14, 4, lighter(TERRAIN_COLORS.grassland, 18)) +
      circle(CX + 26, CY - 20, 3.5, lighter(TERRAIN_COLORS.grassland, 16)),
  ),

  desert: svg(
    baseTile(TERRAIN_COLORS.desert, lighter(TERRAIN_COLORS.desert, 6)),
    linearGradient(
      "duneGrad",
      [
        { offset: "0%", color: lighter(TERRAIN_COLORS.desert, 18) },
        { offset: "100%", color: TERRAIN_COLORS.desert },
      ],
      15,
    ) +
      ellipse(CX - 12, CY + 4, 42, 13, "url(#duneGrad)") +
      ellipse(CX + 16, CY + 20, 36, 11, "url(#duneGrad)"),
  ),

  tundra: svg(
    baseTile(TERRAIN_COLORS.tundra, lighter(TERRAIN_COLORS.tundra, 8)),
    circle(CX - 18, CY - 10, 5, "#b8c8c0") +
      circle(CX + 22, CY + 12, 4, "#b0c0b8") +
      circle(CX - 6, CY + 26, 3.5, "#a8b8b0"),
  ),

  snow: svg(
    baseTile(TERRAIN_COLORS.snow, "#ffffff"),
    linearGradient(
      "snowGrad",
      [
        { offset: "0%", color: "#ffffff" },
        { offset: "100%", color: "#d8e2e8" },
      ],
      160,
    ) +
      hillMound(CX + 10, CY + 12, 1.1, "url(#snowGrad)") +
      circle(CX - 24, CY - 18, 3.5, "#d8e2e8"),
  ),

  forest: svg(
    baseTile(TERRAIN_COLORS.forest, lighter(TERRAIN_COLORS.forest, 6)),
    tree(CX - 16, CY - 2, 1, lighter(TERRAIN_COLORS.forest, 16)) +
      tree(CX + 14, CY + 4, 0.9, lighter(TERRAIN_COLORS.forest, 12)) +
      tree(CX + 2, CY - 18, 0.75, lighter(TERRAIN_COLORS.forest, 14)),
  ),

  jungle: svg(
    baseTile(TERRAIN_COLORS.jungle, lighter(TERRAIN_COLORS.jungle, 6)),
    tree(CX - 18, CY, 1.05, lighter(TERRAIN_COLORS.jungle, 14)) +
      tree(CX + 10, CY + 6, 0.95, lighter(TERRAIN_COLORS.jungle, 10)) +
      tree(CX - 4, CY - 20, 0.85, lighter(TERRAIN_COLORS.jungle, 16)) +
      tree(CX + 22, CY - 14, 0.75, lighter(TERRAIN_COLORS.jungle, 12)),
  ),

  hills: svg(
    baseTile(TERRAIN_COLORS.hills, lighter(TERRAIN_COLORS.hills, 8)),
    hillMound(CX - 16, CY + 4, 1.3, lighter(TERRAIN_COLORS.hills, 18)) +
      hillMound(CX + 18, CY + 12, 1.1, lighter(TERRAIN_COLORS.hills, 12)) +
      hillMound(CX + 2, CY - 14, 0.95, lighter(TERRAIN_COLORS.hills, 14)),
  ),

  mountains: svg(
    baseTile(TERRAIN_COLORS.mountains, lighter(TERRAIN_COLORS.mountains, 6)),
    mountainPeak(CX - 16, CY + 10, 1.1, TERRAIN_COLORS.mountains, "#c8d0d8") +
      mountainPeak(CX + 16, CY + 16, 0.95, TERRAIN_COLORS.mountains, "#b8c0c8") +
      mountainPeak(CX + 2, CY - 14, 0.75, TERRAIN_COLORS.mountains, "#d0d8e0"),
  ),
};

function buildSpritesheet(): string {
  const terrains = Object.keys(TERRAIN_SVGS);
  const pad = 8;
  const totalW = terrains.length * (VIEW_W + pad) + pad;
  const totalH = VIEW_H + pad * 2;
  let bodies = "";
  terrains.forEach((t, i) => {
    const x = pad + i * (VIEW_W + pad);
    const y = pad;
    // Reference individual SVGs as images to avoid duplicate defs/ids.
    bodies += `<image href="${t}.svg" x="${x}" y="${y}" width="${VIEW_W}" height="${VIEW_H}"/>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
  <rect width="100%" height="100%" fill="#0b1622"/>
  ${bodies}
</svg>`;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [terrain, svg] of Object.entries(TERRAIN_SVGS)) {
    const path = join(OUT_DIR, `${terrain}.svg`);
    await writeFile(path, svg.trim() + "\n", "utf-8");
    console.log(`wrote ${path}`);
  }

  const sheetPath = join(OUT_DIR, "spritesheet.svg");
  await writeFile(sheetPath, buildSpritesheet().trim() + "\n", "utf-8");
  console.log(`wrote ${sheetPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
