// Compose raw portrait game screenshots into branded store screenshots using
// real device-frame PNGs (fastlane/frameit-frames, free/open-source, from
// Facebook's device set): iPhone 16 Pro for the App Store, Samsung Galaxy S21
// for Google Play. Adds a Cinzel headline + subtitle on a dark/gold canvas.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fwd = (p) => p.replace(/\\/g, "/"); // ImageMagick eats Windows backslashes
const RAW = join(__dirname, "raw");
const OUT = join(__dirname, "out");
const TMP = join(__dirname, ".tmp");
const FR = join(__dirname, "frames");
const FONTS = join(__dirname, "fonts");
const CINZEL = fwd(join(FONTS, "Cinzel-VF.ttf"));
const LATO = fwd(join(FONTS, "Lato-Regular.ttf"));
const LATO_B = fwd(join(FONTS, "Lato-Bold.ttf"));

const EYEBROW = "RISE OF CIVILIZATIONS";

const SHOTS = [
  { src: "01-map.png", slug: "empire", lines: ["Forge an Empire", "Through the Ages"], sub: "Explore, expand & conquer a living hex world" },
  { src: "02-city.png", slug: "cities", lines: ["Grow Cities That", "Define an Era"], sub: "Work the land — food, gold, science & culture" },
  { src: "03-techtree.png", slug: "tech", lines: ["Research 85+", "Technologies"], sub: "From stone tools to gunpowder across five ages" },
  { src: "05-great-people.png", slug: "greatpeople", lines: ["Lead History's", "Greatest Minds"], sub: "Scientists, generals, prophets & artists rise" },
  { src: "06-legends.png", slug: "legends", lines: ["Command", "Legendary Heroes"], sub: "Recruit one-of-a-kind champions of antiquity" },
  { src: "07-research.png", slug: "civs", lines: ["Every Choice", "Writes History"], sub: "130+ civilizations — no two games alike" },
];

const STORES = {
  appstore: {
    W: 1290, H: 2796,
    // iPhone 16 Pro (Black Titanium) frame + its transparent screen rectangle
    frame: "iphone16pro-black.png", fw: 1350, fh: 2760, sx: 72, sy: 69, sw: 1206, sh: 2622,
    deviceH: 2120, deviceTopY: 600,
    eyebrowPt: 34, eyebrowY: 150, headPt: 96, hl1Y: 222, lineGap: 116, subPt: 42, subYpad: 40,
  },
  playstore: {
    W: 1080, H: 1920,
    // Samsung Galaxy S21 5G (Black) frame + its transparent screen rectangle
    frame: "galaxy-s21-black.png", fw: 1180, fh: 2500, sx: 44, sy: 42, sw: 1080, sh: 2400,
    deviceH: 1500, deviceTopY: 350,
    eyebrowPt: 25, eyebrowY: 86, headPt: 66, hl1Y: 132, lineGap: 80, subPt: 30, subYpad: 26,
  },
};

const run = (args) => execFileSync("magick", args, { stdio: ["ignore", "ignore", "inherit"] });
const r = Math.round;

function build(store, cfg, shot) {
  const t = (n) => fwd(join(TMP, `${store}-${n}.png`));
  const { W, H } = cfg;
  const scaledW = r(cfg.fw * cfg.deviceH / cfg.fh);
  const deviceX = r((W - scaledW) / 2);
  const deviceY = cfg.deviceTopY;

  // 1) screenshot covers the screen rect, then frame on top -> full device
  run([fwd(join(RAW, shot.src)), "-resize", `${cfg.sw}x${cfg.sh}^`, "-gravity", "center", "-extent", `${cfg.sw}x${cfg.sh}`, t("screen")]);
  run(["-size", `${cfg.fw}x${cfg.fh}`, "xc:none",
    t("screen"), "-geometry", `+${cfg.sx}+${cfg.sy}`, "-composite",
    fwd(join(FR, cfg.frame)), "-composite",
    "-resize", `x${cfg.deviceH}`, t("device")]);

  // 2) background: vertical gradient * vignette + faint gold center glow
  run(["-size", `${W}x${H}`, "gradient:#241d11-#0b0a07",
    "(", "-size", `${W}x${H}`, "radial-gradient:white-gray38", ")", "-compose", "multiply", "-composite",
    "(", "-size", `${W}x${H}`, "radial-gradient:#3c2f13-black", "-channel", "RGB", "-evaluate", "multiply", "0.55", "+channel", ")", "-compose", "screen", "-composite",
    t("bg")]);

  // 3) soft drop shadow of the device
  run([t("device"), "-fill", "black", "-colorize", "100", t("sil")]);
  run(["-size", `${W}x${H}`, "xc:none", t("sil"), "-geometry", `+${deviceX}+${deviceY + 24}`, "-composite",
    "-blur", "0x22", "-channel", "A", "-evaluate", "multiply", "0.5", "+channel", t("shadow")]);

  // 4) base = bg + shadow + device
  run([t("bg"), t("shadow"), "-composite", t("device"), "-geometry", `+${deviceX}+${deviceY}`, "-composite", t("base")]);

  // 5) text
  const subY = deviceY - cfg.subPt - cfg.subYpad;
  const args = [t("base"), "-gravity", "north",
    "-font", LATO_B, "-pointsize", `${cfg.eyebrowPt}`, "-kerning", "9",
    "-fill", "#b6963f", "-annotate", `+0+${cfg.eyebrowY}`, EYEBROW,
    "-kerning", "0", "-font", CINZEL];
  shot.lines.forEach((ln, i) => {
    const y = cfg.hl1Y + i * cfg.lineGap;
    args.push("-fill", "#15100755", "-pointsize", `${cfg.headPt}`, "-annotate", `+3+${y + 4}`, ln);
    args.push("-fill", "#f4e2a6", "-pointsize", `${cfg.headPt}`, "-annotate", `+0+${y}`, ln);
  });
  args.push("-font", LATO, "-pointsize", `${cfg.subPt}`, "-fill", "#d2c3a0", "-annotate", `+0+${subY}`, shot.sub);
  const outPath = fwd(join(OUT, store, `${shot.slug}.png`));
  args.push(outPath);
  run(args);
  return outPath;
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
for (const store of Object.keys(STORES)) mkdirSync(join(OUT, store), { recursive: true });

for (const [store, cfg] of Object.entries(STORES)) {
  for (const shot of SHOTS) console.log("wrote", build(store, cfg, shot));
}
rmSync(TMP, { recursive: true, force: true });
console.log("DONE");
