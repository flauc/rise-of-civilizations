// Experimental realistic hex tile generator.
// Produces a single highly-detailed grassland tile as a proof of concept.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "assets", "hex-terrain");

// Same hex geometry as the main generator.
const SIZE = 56;
const W = Math.sqrt(3) * SIZE;
const H = 2 * SIZE;
const CX = Math.ceil(W / 2);
const CY = Math.ceil(H / 2);
const VIEW_W = Math.ceil(W);
const VIEW_H = Math.ceil(H);

// Seeded Mulberry32 PRNG so the tile is reproducible.
function makeRng(seed = "realistic-grassland") {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = (s << 5) - s + seed.charCodeAt(i);
    s |= 0;
  }
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng();
function rand(min: number, max: number): number {
  return min + rng() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]!;
}

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

// Build a turf of grass blades around a center point.
function grassTuft(cx: number, cy: number, count: number, scale: number): string {
  const colors = ["#4a7a36", "#5b8a43", "#6b9a53", "#3f6b30", "#7aa85a"];
  let svg = "";
  for (let i = 0; i < count; i++) {
    const angle = rand(-Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    const len = rand(6, 12) * scale;
    const bend = rand(-3, 3) * scale;
    const x0 = cx + rand(-4, 4) * scale;
    const y0 = cy + rand(-2, 2) * scale;
    const x1 = x0 + Math.cos(angle) * len * 0.5 + bend;
    const y1 = y0 + Math.sin(angle) * len * 0.5;
    const x2 = x0 + Math.cos(angle) * len;
    const y2 = y0 + Math.sin(angle) * len;
    const w = rand(0.8, 1.6) * scale;
    const color = pick(colors);
    svg += `<path d="M ${x0},${y0} Q ${x1},${y1} ${x2},${y2}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  }
  return svg;
}

function rock(x: number, y: number, r: number): string {
  const colors = ["#6d6f76", "#7a7c84", "#5c5e64"];
  const color = pick(colors);
  const path: string[] = [];
  const points = 7;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const radius = r * rand(0.7, 1.0);
    path.push(`${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`);
  }
  return `<polygon points="${path.join(" ")}" fill="${color}" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>`;
}

function flower(x: number, y: number): string {
  const petal = pick(["#e8d06e", "#d6a8c0", "#f0f0f0"]);
  const center = "#5a3a1a";
  let svg = "";
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const px = x + Math.cos(angle) * 2;
    const py = y + Math.sin(angle) * 2;
    svg += `<circle cx="${px}" cy="${py}" r="1.2" fill="${petal}"/>`;
  }
  svg += `<circle cx="${x}" cy="${y}" r="0.8" fill="${center}"/>`;
  return svg;
}

function castShadow(x: number, y: number, w: number, h: number): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="rgba(0,0,0,0.22)" filter="url(#blur)"/>`;
}

const defs = `
  <clipPath id="hexClip"><path d="${HEX_PATH}"/></clipPath>

  <!-- Organic ground texture: low-frequency noise tinted green. -->
  <filter id="groundTexture" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="5" seed="42" result="noise"/>
    <feColorMatrix type="matrix" in="noise" result="colored"
      values="0.6 0 0 0 0.15
              0 0.7 0 0 0.35
              0 0 0.5 0 0.10
              0 0 0 1 0"/>
    <feComponentTransfer in="colored" result="contrasted">
      <feFuncR type="linear" slope="1.4" intercept="-0.15"/>
      <feFuncG type="linear" slope="1.4" intercept="-0.15"/>
      <feFuncB type="linear" slope="1.4" intercept="-0.15"/>
    </feComponentTransfer>
    <feComposite operator="in" in="contrasted" in2="SourceGraphic" result="textured"/>
    <feBlend mode="multiply" in="textured" in2="SourceGraphic"/>
  </filter>

  <!-- Soft blur for shadows and ambient occlusion. -->
  <filter id="blur">
    <feGaussianBlur stdDeviation="1.2"/>
  </filter>

  <!-- Subtle top-left lighting gradient. -->
  <radialGradient id="sunLight" cx="30%" cy="25%" r="80%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/>
    <stop offset="60%" stop-color="#ffffff" stop-opacity="0.05"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.25"/>
  </radialGradient>

  <!-- Inset shadow around the hex edge for depth. -->
  <filter id="insetShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feOffset dx="0" dy="1"/>
    <feGaussianBlur stdDeviation="2" result="offset-blur"/>
    <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
    <feFlood flood-color="black" flood-opacity="0.35" result="color"/>
    <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
    <feComposite operator="over" in="shadow" in2="SourceGraphic"/>
  </filter>
`;

function generate(): string {
  let decorations = "";

  // Scattered grass tufts.
  for (let i = 0; i < 26; i++) {
    const x = rand(8, VIEW_W - 8);
    const y = rand(8, VIEW_H - 8);
    decorations += grassTuft(x, y, randInt(4, 7), rand(0.7, 1.1));
  }

  // A few rocks.
  for (let i = 0; i < 4; i++) {
    const x = rand(18, VIEW_W - 18);
    const y = rand(22, VIEW_H - 18);
    const r = rand(3, 5.5);
    decorations += castShadow(x + 1, y + 2, r * 0.8, r * 0.4);
    decorations += rock(x, y, r);
  }

  // Tiny flowers.
  for (let i = 0; i < 9; i++) {
    const x = rand(12, VIEW_W - 12);
    const y = rand(16, VIEW_H - 12);
    decorations += flower(x, y);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}">
  <defs>
    ${defs}
  </defs>
  <g clip-path="url(#hexClip)">
    <!-- Base ground. -->
    <path d="${HEX_PATH}" fill="#5b8a43" filter="url(#groundTexture)"/>
    <!-- Lighting / ambient occlusion overlay. -->
    <path d="${HEX_PATH}" fill="url(#sunLight)"/>
    <!-- Vegetation and rocks. -->
    ${decorations}
    <!-- Edge definition (subtle stroke + inset shadow). -->
    <path d="${HEX_PATH}" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.5" stroke-linejoin="round" filter="url(#insetShadow)"/>
  </g>
</svg>`;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "realistic-grassland.svg");
  await writeFile(path, generate().trim() + "\n", "utf-8");
  console.log(`wrote ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
