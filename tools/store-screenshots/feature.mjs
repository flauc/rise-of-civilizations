// Build the Google Play "Feature Graphic" (1024x500): a landscape crop of the
// in-game map hero shot (raw/01-map.png) as a full-bleed background, a dark
// scrim on the left for legibility, the app-icon badge and Cinzel title on
// top. Same dark/gold brand language as the store screenshots.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fwd = (p) => p.replace(/\\/g, "/");
const ROOT = join(__dirname, "..", "..");
const RAW = join(__dirname, "raw");
const OUT = join(__dirname, "out");
const TMP = join(__dirname, ".tmp-feature");
const FONTS = join(__dirname, "fonts");
const CINZEL = fwd(join(FONTS, "Cinzel-VF.ttf"));
const LATO = fwd(join(FONTS, "Lato-Regular.ttf"));
const LATO_B = fwd(join(FONTS, "Lato-Bold.ttf"));
const BADGE = fwd(join(ROOT, "mobile", "assets", "icon-only.png"));
const HERO = fwd(join(ROOT, "dist-itchio", "itch-page", "screenshots", "shot-1-world-map.jpg"));

const W = 1024, H = 500;
const run = (args) => execFileSync("magick", args, { stdio: ["ignore", "ignore", "inherit"] });
const r = Math.round;
const t = (n) => fwd(join(TMP, `${n}.png`));

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(join(OUT, "playstore"), { recursive: true });

// 1) background: the itch landscape world-map shot. Patch the "Settler/Warrior"
// name pill with the forest just above it, then crop to 2.048:1 skipping the
// HUD (top), leader portrait (right) and play buttons (bottom).
run([HERO,
  "(", "+clone", "-crop", "225x65+900+380", "+repage", ")",
  "-geometry", "+900+455", "-composite", t("patched")]);
run([t("patched"), "-crop", "1720x840+100+90", "+repage", "-resize", `${W}x${H}!`,
  "-modulate", "102,112,100", t("bgcrop")]);

// 2) scrims: strong left fade for the text column + soft top/bottom frames
run(["-size", `${H}x${W}`, "gradient:#0b0a07-none", "-rotate", "-90",
  "-channel", "A", "-evaluate", "multiply", "0.55", "+channel", t("fadefull")]);
run(["-size", `${H}x660`, "gradient:#0b0a07-none", "-rotate", "-90",
  "-channel", "A", "-evaluate", "multiply", "0.92", "+channel", t("fadeleft")]);
run(["-size", `${W}x110`, "gradient:#0b0a07-none",
  "-channel", "A", "-evaluate", "multiply", "0.55", "+channel", t("fadetop")]);
run(["-size", `${W}x140`, "gradient:none-#0b0a07",
  "-channel", "A", "-evaluate", "multiply", "0.65", "+channel", t("fadebot")]);

run([t("bgcrop"),
  t("fadefull"), "-geometry", "+0+0", "-composite",
  t("fadeleft"), "-geometry", "+0+0", "-composite",
  t("fadetop"), "-geometry", "+0+0", "-composite",
  t("fadebot"), "-geometry", `+0+${H - 140}`, "-composite",
  t("bg")]);

// 3) badge: app icon with a drop shadow, vertically centered on the left
const BADGE_SZ = 170;
const badgeX = 64, badgeY = r((H - BADGE_SZ) / 2);
run([BADGE, "-resize", `${BADGE_SZ}x${BADGE_SZ}`, t("badge")]);
run(["-size", `${W}x${H}`, "xc:none", t("badge"), "-fill", "black", "-colorize", "100",
  "-geometry", `+${badgeX}+${badgeY + 10}`, "-composite",
  "-blur", "0x14", "-channel", "A", "-evaluate", "multiply", "0.6", "+channel", t("shadow")]);
run([t("bg"), t("shadow"), "-composite",
  t("badge"), "-geometry", `+${badgeX}+${badgeY}`, "-composite", t("base")]);

// 4) text block to the right of the badge
const textX = badgeX + BADGE_SZ + 46;
const args = [t("base"), "-gravity", "northwest"];
// Eyebrow (Lato bold, spaced) with dark offset shadow
args.push("-font", LATO_B, "-kerning", "6", "-pointsize", "16");
args.push("-fill", "#120e04aa", "-annotate", `+${textX + 5}+139`, "BUILD AN EMPIRE ACROSS THE AGES");
args.push("-fill", "#d4b45a", "-annotate", `+${textX + 3}+137`, "BUILD AN EMPIRE ACROSS THE AGES");
// Title (Cinzel) two lines, gold with dark offset shadow
const titleLines = ["Rise of", "Civilizations"];
const titlePt = 60, titleY0 = 170, titleGap = 76;
args.push("-font", CINZEL, "-kerning", "0");
titleLines.forEach((ln, i) => {
  const y = titleY0 + i * titleGap;
  args.push("-fill", "#120e0499", "-pointsize", `${titlePt}`, "-annotate", `+${textX + 3}+${y + 4}`, ln);
  args.push("-fill", "#f6e6ae", "-pointsize", `${titlePt}`, "-annotate", `+${textX}+${y}`, ln);
});
// Subtitle with dark offset shadow
const subY = titleY0 + 2 * titleGap + 8;
args.push("-font", LATO, "-kerning", "0", "-pointsize", "23");
args.push("-fill", "#120e04aa", "-annotate", `+${textX + 4}+${subY + 2}`, "130+ civilizations. One living hex world.");
args.push("-fill", "#ecdfbc", "-annotate", `+${textX + 2}+${subY}`, "130+ civilizations. One living hex world.");

const outPath = fwd(join(OUT, "playstore", "feature-graphic.png"));
args.push("-alpha", "off"); // Play requires 24-bit PNG, no alpha
args.push(outPath);
run(args);

rmSync(TMP, { recursive: true, force: true });
console.log("wrote", outPath, `(${W}x${H})`);
