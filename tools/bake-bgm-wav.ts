// Bake a short looping ambient WAV for mobile WebView BGM (HTML5 Audio).
// Run: bun run tools/bake-bgm-wav.ts

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SAMPLE_RATE = 22050;
const DURATION_SEC = 20;
const OUT = join(import.meta.dir, "../packages/client/public/audio/bgm-ancient.wav");

const MELODY = [220, 247, 262, 294, 330, 392, 440];

function sampleAt(t: number): number {
  const drone = 0.14 * Math.sin(2 * Math.PI * 55 * t) + 0.09 * Math.sin(2 * Math.PI * 82.5 * t);
  const slot = Math.floor(t / 3.2);
  const phase = (t % 3.2) / 3.2;
  const freq = MELODY[slot % MELODY.length]!;
  const env = phase < 0.12 ? phase / 0.12 : phase > 0.85 ? (1 - phase) / 0.15 : 1;
  const melody = 0.07 * env * Math.sin(2 * Math.PI * freq * t);
  return Math.max(-1, Math.min(1, drone + melody));
}

function writeWav(samples: Float32Array): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
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

const count = SAMPLE_RATE * DURATION_SEC;
const samples = new Float32Array(count);
for (let i = 0; i < count; i++) samples[i] = sampleAt(i / SAMPLE_RATE);

await mkdir(join(import.meta.dir, "../packages/client/public/audio"), { recursive: true });
await writeFile(OUT, writeWav(samples));
console.log(`Wrote ${OUT} (${(count / SAMPLE_RATE).toFixed(1)}s loop)`);
