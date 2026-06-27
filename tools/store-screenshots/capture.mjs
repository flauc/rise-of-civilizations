// Headless capture of portrait in-game screenshots for App Store / Play Store.
// Drives the real client: starts a Single Player game, develops it a few turns,
// then captures the map plus the visually rich panels.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "raw");
const URL = process.env.ROC_URL || "http://localhost:5180/";
const EXE =
  process.env.CHROME_EXE ||
  join(
    process.env.LOCALAPPDATA,
    "ms-playwright",
    "chromium_headless_shell-1228",
    "chrome-headless-shell-win64",
    "chrome-headless-shell.exe",
  );

// Phone-screen aspect ~9:19.5 (0.4614) so framing inside a phone is clean.
const VW = 412;
const VH = 893;
const DSF = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODAL_IDS = [
  "research", "techtree", "civics", "production", "religion",
  "great-people", "legends", "diplomacy", "wiki", "morale-dialog",
  "turn-update-overlay", "turn-update-dialog", "tile-panel", "city-panel",
  "unit-panel", "menu", "cities-list",
];

async function closeAll(page) {
  await page.evaluate((ids) => {
    // dismiss the turn-update popup the polite way first, then hide via class
    document.getElementById("turn-update-close")?.click();
    for (const id of ids) document.getElementById(id)?.classList.add("hidden");
  }, MODAL_IDS);
  await sleep(250);
}

async function shot(page, name) {
  const path = join(RAW, name + ".png");
  await page.screenshot({ path });
  console.log("  captured", name);
}

async function clickId(page, id) {
  const ok = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.click();
    return true;
  }, id);
  return ok;
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DSF,
  });
  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail/i.test(t)) console.log("  [page]", t);
  });

  console.log("goto", URL);
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(500);

  // --- Lobby: Single Player -> Start Game ---
  await page.evaluate(() => {
    document.querySelector('[data-screen="sp"]')?.click();
  });
  await sleep(600);
  await page.evaluate(() => document.getElementById("sp-start")?.click());

  // --- Wait for game + atlases ---
  await page.waitForFunction(
    () => !document.getElementById("game-loading") && !!(window.__roc && window.__roc.state),
    { timeout: 30000 },
  );
  await sleep(2500); // let sprite atlases stream in
  console.log("game started");

  // --- Develop the empire so the hero shot looks alive ---
  await page.evaluate(() => {
    const s = window.__roc.session;
    const st = window.__roc.state;
    const me = st.players[0].id;
    // found capital with our settler
    let settler = null;
    for (const u of st.units.values()) {
      if (u.ownerId === me && /settler/i.test(u.type)) { settler = u; break; }
    }
    if (settler) s.order({ type: "foundCity", unitId: settler.id });
  });
  await sleep(300);
  // set research + production, then advance turns
  await page.evaluate(() => {
    const s = window.__roc.session;
    const st = window.__roc.state;
    const me = st.players[0].id;
    let city = null;
    for (const c of st.cities.values()) { if (c.ownerId === me) { city = c; break; } }
    try { s.order({ type: "setResearchTarget", techId: "writing" }); } catch {}
    if (city) { try { s.order({ type: "setProduction", cityId: city.id, item: { kind: "unit", id: "warrior" } }); } catch {} }
  });
  for (let i = 0; i < 14; i++) {
    await page.evaluate(() => {
      const s = window.__roc.session;
      const st = window.__roc.state;
      const me = st.players[0].id;
      // keep capital busy
      for (const c of st.cities.values()) {
        if (c.ownerId === me && (!c.production || !c.production.item)) {
          try { s.order({ type: "setProduction", cityId: c.id, item: { kind: "unit", id: "warrior" } }); } catch {}
        }
      }
      s.endTurn();
    });
    await sleep(120);
  }
  await sleep(800);
  console.log("advanced turns; turn =", await page.evaluate(() => window.__roc.state?.turn));

  // --- Center camera on our capital and capture the map hero shot ---
  await page.evaluate(() => {
    const st = window.__roc.state;
    const me = st.players[0].id;
    for (const c of st.cities.values()) {
      if (c.ownerId === me) { window.__roc.tapTile(c.col, c.row); break; }
    }
  });
  await sleep(400);
  await closeAll(page);
  await shot(page, "01-map");

  // --- City panel (tap capital tile) ---
  await page.evaluate(() => {
    const st = window.__roc.state;
    const me = st.players[0].id;
    for (const c of st.cities.values()) {
      if (c.ownerId === me) { window.__roc.tapTile(c.col, c.row); break; }
    }
  });
  await sleep(500);
  await shot(page, "02-city");
  await closeAll(page);

  // --- Tech tree ---
  await clickId(page, "research-btn");
  await sleep(500);
  await clickId(page, "open-techtree");
  await sleep(700);
  await shot(page, "03-techtree");
  await closeAll(page);

  // --- Civics ---
  if (await clickId(page, "civics-btn")) {
    await sleep(600);
    await shot(page, "04-civics");
    await closeAll(page);
  }

  // --- Great People ---
  if (await clickId(page, "great-people-btn")) {
    await sleep(600);
    await shot(page, "05-great-people");
    await closeAll(page);
  }

  // --- Legends ---
  if (await clickId(page, "legends-btn")) {
    await sleep(600);
    await shot(page, "06-legends");
    await closeAll(page);
  }

  // --- Research modal itself (techs list) ---
  if (await clickId(page, "research-btn")) {
    await sleep(500);
    await shot(page, "07-research");
    await closeAll(page);
  }

  await browser.close();
  console.log("DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
