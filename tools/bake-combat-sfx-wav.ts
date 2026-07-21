// Bake a short combat clash WAV for mobile WebView SFX (HTML5 Audio).
// Run: bun run tools/bake-combat-sfx-wav.ts

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SAMPLE_RATE = 44100;
const DURATION_SEC = 0.22;
const OUT = join(import.meta.dir, "../packages/client/public/audio/combat-clash.wav");

function writeWav(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

const count = Math.floor(SAMPLE_RATE * DURATION_SEC);
const samples = new Float32Array(count);
for (let i = 0; i < count; i++) {
  const t = i / SAMPLE_RATE;
  const env = Math.pow(1 - t / DURATION_SEC, 2);
  const noise = (Math.random() * 2 - 1) * env * 0.55;
  const blade = Math.sin(2 * Math.PI * (520 - 340 * (t / DURATION_SEC)) * t) * env * 0.35;
  samples[i] = noise + blade;
}

await mkdir(join(import.meta.dir, "../packages/client/public/audio"), { recursive: true });
await writeFile(OUT, writeWav(samples, SAMPLE_RATE));
console.log(`Wrote ${OUT}`);
