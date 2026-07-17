// Themed loading veil: the player's civ leader speaking, with their portrait and
// unique unit/building. Styled to the game's house panels (dark card, gold edge,
// cream text) using the :root tokens from index.html.

import { civLoadingSpeech, sanitizeScrollCopy, type CivLoadingSpeech } from "@roc/data";
import {
  ACTIVE_ABILITY_DEFS,
  TECH_DEFS,
  UNIQUE_UNITS,
  UNIT_DEFS,
  isRanged,
  uniqueInfraForCiv,
  unitActiveAbilityIds,
  type UnitTypeId,
} from "@roc/sim";
import { ASSET_BASE_URL, assetUrl } from "./asset-base";
import { iconify } from "./icons";
import { buildWordRevealTimeline, charCountAtTime, smoothCharCount, type WordRevealMark } from "./loading-sync";
import {
  fetchBakedLoadingScript,
  fetchLoadingVoiceVersion,
  LOADING_VOICE_PLAYBACK_RATE,
  preloadLoadingVoice,
  speakLoadingLine,
  stopLoadingVoice,
} from "./loading-voice";

const MIN_VISIBLE_MS = 2800;
/** Safety cap if speech never finishes; scaled per script length in forceDismissMs(). */
const FORCE_DISMISS_BASE_MS = 48000;
const FORCE_DISMISS_MS_PER_CHAR = 95;
/** Pause on the finished scroll before entering the game. */
const POST_SPEECH_HOLD_MS = 3000;
/** Browser TTS fallback typing interval (scaled to match LOADING_VOICE_PLAYBACK_RATE). */
const TYPE_MS = Math.round(28 / LOADING_VOICE_PLAYBACK_RATE);
/** Nudge scroll text to track audio.currentTime (0 = locked to the clip). */
const TEXT_SYNC_OFFSET = 0;
/** Slight stretch so the last words finish with the clip, not before it. */
const TEXT_SYNC_STRETCH = 1;
/** Per-frame easing for browser-TTS fallback only. */
const TEXT_SMOOTH_RATE = 0.38;

function syncTimeline(text: string, durationSec: number): WordRevealMark[] {
  if (!text || durationSec <= 0) return [];
  return buildWordRevealTimeline(text, durationSec * TEXT_SYNC_STRETCH);
}

function revealCountAtTime(timeline: WordRevealMark[], elapsedSec: number, total: number): number {
  if (timeline.length === 0 || total <= 0) return 0;
  const t = Math.max(0, elapsedSec + TEXT_SYNC_OFFSET);
  return Math.min(total, charCountAtTime(timeline, t));
}
/** Scroll always shows the exact narrated script, not the richer encyclopedia copy. */
function scrollSpeech(base: CivLoadingSpeech, bakedLine: string | null): CivLoadingSpeech {
  const baked = bakedLine?.trim();
  if (baked && baked !== base.text) {
    return {
      ...base,
      text: baked,
      story: baked,
      ability: "",
      leverage: "",
      spoken: { story: baked, ability: "", leverage: "" },
    };
  }
  return {
    ...base,
    story: base.spoken.story,
    ability: base.spoken.ability,
    leverage: base.spoken.leverage,
  };
}

function forceDismissMs(text: string | undefined): number {
  const chars = text ? Array.from(text).length : 0;
  return Math.max(
    FORCE_DISMISS_BASE_MS,
    chars * FORCE_DISMISS_MS_PER_CHAR + POST_SPEECH_HOLD_MS + MIN_VISIBLE_MS,
  );
}

export interface LoadingScreenOptions {
  civId?: string;
  /** Resolve civ once game state is available (multiplayer / saved games). */
  resolveCivId?: () => string | undefined;
  /** Fired when the scroll overlay is removed (speech finished or skipped). */
  onDismiss?: () => void;
}

export interface LoadingScreenHandle {
  /** World/sim state exists; dismiss still waits for the map to finish rendering. */
  notifyWorldGenerated(): void;
  /** Map, atlases, and HUD icons are ready; hide "Loading..." and allow dismiss once speech finishes. */
  notifyMapRendered(): void;
  destroy(): void;
}

function ensureStyles(): void {
  if (document.getElementById("game-loading-style")) return;
  const gs = document.createElement("style");
  gs.id = "game-loading-style";
  gs.textContent = `
    #game-loading{
      position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
      padding:20px 14px;
      background:#0f0e0b;
      transition:background .65s ease;
      pointer-events:none;
    }
    #game-loading.map-backdrop{
      background:rgba(8,7,6,0.08);
    }
    #game-loading.post-speech-hold.map-backdrop{
      background:rgba(8,7,6,0.08);
    }
    #game-loading.map-backdrop::before{
      content:"";position:absolute;inset:0;pointer-events:none;
      background:radial-gradient(ellipse at 50% 45%,transparent 0%,transparent 55%,rgba(8,7,6,.28) 100%);
    }
    #game-loading .gl-panel{pointer-events:auto;position:relative;z-index:1}
    #game-loading.hide{opacity:0;pointer-events:none}
    #game-loading.hide,#game-loading.hide *{pointer-events:none !important}
    body.roc-loading-scroll #game-hud{
      opacity:0;pointer-events:none;
      transition:opacity .45s ease;
    }
    /* Canvas stays invisible until the first full-quality frame has painted,
       then fades in behind the translucent veil. */
    body.roc-loading-scroll #game{
      opacity:0;transition:opacity 1.2s ease;
    }
    body.roc-map-painted #game{
      opacity:1;
    }
    #game-loading .gl-panel{
      width:min(1040px,100%);max-height:min(94vh,860px);min-height:0;
      display:flex;flex-direction:column;align-items:stretch;gap:14px;
    }
    /* Bottom slot: "Loading..." while the world builds, cross-fading into Skip
       the moment it is ready. Both sit in one grid cell so nothing shifts. */
    #game-loading .gl-foot{
      flex-shrink:0;display:grid;justify-items:end;align-items:center;min-height:44px;
    }
    #game-loading .gl-foot > *{grid-area:1/1}
    #game-loading .gl-loading-status{
      font-family:'Cinzel',Georgia,serif;font-size:clamp(13px,3.2vw,16px);letter-spacing:.16em;text-transform:uppercase;
      color:var(--parchment-dim);text-shadow:0 2px 10px rgba(0,0,0,.55);
      transition:opacity .45s ease,visibility 0s linear .45s;
    }
    #game-loading.game-ready .gl-loading-status{opacity:0;visibility:hidden}
    #game-loading .gl-columns{
      display:grid;grid-template-columns:320px minmax(0,1fr);grid-template-rows:auto auto;
      grid-template-areas:"hero scroll" "uniques uniques";
      gap:16px 24px;min-height:0;
    }
    #game-loading .gl-hero{
      grid-area:hero;position:relative;border-radius:14px;overflow:hidden;
      height:min(400px,52vh);
      border:1px solid var(--edge);background:#15120c;
      box-shadow:0 18px 40px rgba(0,0,0,.6);
    }
    #game-loading .gl-portrait{
      display:block;width:100%;height:100%;object-fit:cover;object-position:50% 18%;
      background:#15120c;filter:sepia(.2) contrast(1.05) brightness(.95);
    }
    #game-loading .gl-hero-name{
      position:absolute;left:0;right:0;bottom:0;padding:46px 14px 12px;text-align:center;
      background:linear-gradient(180deg,transparent 0%,rgba(10,8,5,.6) 42%,rgba(10,8,5,.94) 100%);
    }
    #game-loading .gl-civ{
      font-family:'Cinzel',Georgia,serif;font-size:clamp(20px,2.4vw,26px);font-weight:700;
      color:var(--parchment);line-height:1.15;text-shadow:0 2px 8px rgba(0,0,0,.7);
    }
    #game-loading .gl-leader{
      font-family:'Cinzel',Georgia,serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
      color:var(--accent);margin-top:3px;text-shadow:0 1px 5px rgba(0,0,0,.7);
    }
    #game-loading .gl-uniques{
      grid-area:uniques;flex-shrink:0;
      display:grid;grid-template-columns:1fr 1fr;gap:14px;
    }
    #game-loading .gl-card[hidden]{display:none}
    #game-loading .gl-card{
      display:flex;gap:12px;align-items:flex-start;padding:11px 12px;border-radius:10px;text-align:left;
      border:1px solid var(--edge);
      background:linear-gradient(180deg,#1f1c14,#15120c);
      box-shadow:0 10px 24px rgba(0,0,0,.45);
    }
    #game-loading .gl-card-imgbox{
      width:62px;height:78px;flex-shrink:0;border-radius:8px;overflow:hidden;
      border:1px solid var(--edge);background:rgba(0,0,0,.25);
    }
    #game-loading .gl-card-img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}
    #game-loading .gl-card-body{min-width:0}
    #game-loading .gl-card-kicker{
      font-family:'Cinzel',Georgia,serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
      color:var(--accent);
    }
    #game-loading .gl-card-name{
      font-family:'Cinzel',Georgia,serif;font-size:15px;font-weight:700;color:var(--parchment);margin-top:1px;
    }
    #game-loading .gl-card-meta{font-size:11px;color:var(--parchment-dim);margin-top:2px}
    #game-loading .gl-card-desc{
      font-size:12px;line-height:1.55;color:var(--parchment-dim);margin-top:6px;
      display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;
    }
    /* The speech panel follows the game's house style (see .uud-modal in the
       lobby): dark card, gold-tinted edge, cream text. */
    #game-loading .gl-scroll{
      grid-area:scroll;height:min(400px,52vh);min-height:0;
      display:flex;flex-direction:column;align-items:stretch;
      border-radius:14px;overflow:hidden;
      border:1px solid var(--edge);
      background:linear-gradient(180deg,#1f1c14,#15120c);
      box-shadow:0 18px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,230,180,.05);
    }
    #game-loading .gl-scroll-body{
      flex:1;min-height:0;overflow-y:auto;position:relative;
      padding:26px 30px 22px;color:var(--parchment);
    }
    #game-loading .gl-prologue{
      font-family:Georgia,'Times New Roman',serif;font-size:clamp(18px,4.2vw,22px);line-height:1.75;
      color:var(--parchment);text-align:left;min-height:2.8em;
    }
    #game-loading .gl-divider{
      margin:20px 0 18px;opacity:0;max-height:0;overflow:hidden;transition:opacity .35s ease,max-height .35s ease;
    }
    #game-loading .gl-divider.visible{opacity:1;max-height:48px}
    #game-loading .gl-divider-main{
      height:1px;
      background:linear-gradient(90deg,transparent,var(--edge) 12%,rgba(201,162,39,.55) 50%,var(--edge) 88%,transparent);
    }
    #game-loading .gl-ability{
      font-family:Georgia,'Times New Roman',serif;font-size:clamp(17px,3.8vw,20px);line-height:1.7;
      color:var(--accent-bright);text-align:left;font-weight:600;min-height:0;
    }
    #game-loading .gl-leverage-block{
      margin-top:18px;opacity:0;max-height:0;overflow:hidden;transition:opacity .35s ease,max-height .6s ease;
    }
    #game-loading .gl-leverage-block.visible{opacity:1;max-height:320px}
    #game-loading .gl-leverage-label{
      font-family:'Cinzel',Georgia,serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
      color:var(--accent);margin-bottom:8px;
    }
    #game-loading .gl-leverage{
      font-family:Georgia,'Times New Roman',serif;font-size:clamp(17px,3.8vw,20px);line-height:1.7;
      color:var(--parchment);text-align:left;
    }
    #game-loading .gl-prologue,#game-loading .gl-ability,#game-loading .gl-leverage{
      transition:none;
    }
    #game-loading .gl-prologue .gi,#game-loading .gl-ability .gi,#game-loading .gl-leverage .gi{
      height:1.05em;width:auto;vertical-align:-.15em;
    }
    /* Matches the lobby's primary button (.menu-btn.primary). */
    #game-loading .gl-skip{
      font:inherit;font-family:'Cinzel',Georgia,serif;font-size:13px;font-weight:700;
      letter-spacing:.08em;text-transform:uppercase;
      padding:10px 22px;border-radius:999px;border:1px solid transparent;
      background:linear-gradient(135deg,#c9a227,#a6821f);color:#15120c;cursor:pointer;
      min-height:44px;min-width:96px;box-shadow:0 6px 18px rgba(0,0,0,.4);
      opacity:0;visibility:hidden;pointer-events:none;
      transition:opacity .45s ease,visibility 0s linear .45s,background .12s;
    }
    #game-loading.game-ready .gl-skip{
      opacity:1;visibility:visible;pointer-events:auto;transition:opacity .45s ease,background .12s;
    }
    #game-loading .gl-skip:hover{background:linear-gradient(135deg,#f0d878,#c9a227);color:#0f0e0b}
    #game-loading .gl-skip:focus-visible{outline:2px solid #c9a227;outline-offset:2px}
    #game-loading .gl-skip:active{transform:translateY(1px)}
    /* Portrait phones and small tablets: a single column that exactly fills the
       screen; the parchment flexes, nothing needs page scrolling. */
    @media (max-width:880px){
      #game-loading{padding:12px 10px}
      #game-loading .gl-panel{height:100%;max-height:none;gap:10px}
      #game-loading .gl-columns{
        display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;
      }
      #game-loading .gl-hero{height:clamp(150px,24vh,280px);flex-shrink:0}
      #game-loading .gl-hero-name{padding:30px 12px 10px}
      #game-loading .gl-civ{font-size:clamp(18px,5vw,24px)}
      #game-loading .gl-scroll{height:auto;flex:1;min-height:140px}
      #game-loading .gl-scroll-body{padding:20px 18px 16px}
      #game-loading .gl-prologue{font-size:clamp(16px,4.4vw,20px)}
      #game-loading .gl-ability,#game-loading .gl-leverage{font-size:clamp(15px,4vw,18px)}
      #game-loading .gl-uniques{gap:10px}
      #game-loading .gl-card{gap:10px;padding:9px 10px}
      #game-loading .gl-card-imgbox{width:46px;height:58px}
      #game-loading .gl-card-kicker{font-size:9px}
      #game-loading .gl-card-name{font-size:13px}
      #game-loading .gl-card-meta{display:none}
      #game-loading .gl-card-desc{font-size:11px;line-height:1.45;margin-top:4px;-webkit-line-clamp:2}
    }
    /* Landscape phones: compact hero on the left, parchment beside it, slim
       name-only unique cards along the bottom. */
    @media (orientation:landscape) and (max-height:520px){
      #game-loading{padding:10px 12px}
      #game-loading .gl-panel{height:100%;max-height:none;gap:8px}
      #game-loading .gl-loading-status{font-size:12px}
      #game-loading .gl-columns{
        display:grid;grid-template-columns:170px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;
        grid-template-areas:"hero scroll" "uniques uniques";
        gap:10px 14px;flex:1;min-height:0;
      }
      #game-loading .gl-hero{height:auto}
      #game-loading .gl-hero-name{padding:22px 8px 7px}
      #game-loading .gl-civ{font-size:15px}
      #game-loading .gl-leader{font-size:9px;letter-spacing:.1em;margin-top:1px}
      #game-loading .gl-scroll{height:auto;flex:none;min-height:0}
      #game-loading .gl-scroll-body{padding:14px 16px 12px}
      #game-loading .gl-prologue{font-size:15px;line-height:1.6}
      #game-loading .gl-ability,#game-loading .gl-leverage{font-size:14px}
      #game-loading .gl-uniques{gap:10px}
      #game-loading .gl-card{align-items:center;gap:9px;padding:6px 9px}
      #game-loading .gl-card-imgbox{width:36px;height:44px}
      #game-loading .gl-card-kicker{font-size:8px}
      #game-loading .gl-card-name{font-size:12px;margin-top:0}
      #game-loading .gl-card-meta{display:none}
      #game-loading .gl-card-desc{display:none}
      #game-loading .gl-foot{min-height:38px}
      #game-loading .gl-skip{min-height:38px;padding:7px 14px}
    }`;
  document.head.appendChild(gs);
}

export function createLoadingScreen(options: LoadingScreenOptions = {}): LoadingScreenHandle {
  ensureStyles();

  let civId = options.civId;
  let speech: CivLoadingSpeech | null = civId ? civLoadingSpeech(civId) : null;
  if (civId) preloadLoadingVoice(civId);
  let worldReady = false;
  let mapRendered = false;
  let speechDone = false;
  let typingDone = false;
  let skipped = false;
  let dismissed = false;
  let mountedAt = performance.now();
  let dismissTimer = 0;
  let holdTimer = 0;
  let contentFinishedAt = 0;
  let holdStarted = false;
  let holdComplete = false;
  let speakSeq = 0;
  let typeTimer = 0;
  let typeRaf = 0;
  let typeSeq = 0;
  let activeScroll: CivLoadingSpeech | null = null;

  const root = document.createElement("div");
  root.id = "game-loading";
  const cardHtml = (kind: string): string =>
    `<div class="gl-card gl-card-${kind}" hidden>` +
    `<div class="gl-card-imgbox"><img class="gl-card-img" alt="" /></div>` +
    `<div class="gl-card-body">` +
    `<div class="gl-card-kicker"></div>` +
    `<div class="gl-card-name"></div>` +
    `<div class="gl-card-meta"></div>` +
    `<div class="gl-card-desc"></div>` +
    `</div>` +
    `</div>`;

  root.innerHTML =
    `<div class="gl-panel">` +
    `<div class="gl-columns">` +
    `<div class="gl-hero">` +
    `<img class="gl-portrait" alt="" />` +
    `<div class="gl-hero-name">` +
    `<div class="gl-civ"></div>` +
    `<div class="gl-leader"></div>` +
    `</div>` +
    `</div>` +
    `<div class="gl-scroll">` +
    `<div class="gl-scroll-body">` +
    `<div class="gl-prologue"></div>` +
    `<div class="gl-divider" hidden>` +
    `<div class="gl-divider-main"></div>` +
    `</div>` +
    `<div class="gl-ability"></div>` +
    `<div class="gl-leverage-block" hidden>` +
    `<div class="gl-leverage-label">Civ Leverage</div>` +
    `<div class="gl-leverage"></div>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `<div class="gl-uniques">` +
    cardHtml("unit") +
    cardHtml("infra") +
    `</div>` +
    `</div>` +
    `<div class="gl-foot">` +
    `<div class="gl-loading-status">Loading...</div>` +
    `<button type="button" class="gl-skip">Skip</button>` +
    `</div>` +
    `</div>`;
  document.body.appendChild(root);
  document.body.classList.add("roc-loading-scroll");

  function clearLoadingBodyClass(): void {
    document.body.classList.remove("roc-loading-scroll", "roc-map-painted");
  }

  const scrollBodyEl = root.querySelector<HTMLDivElement>(".gl-scroll-body")!;
  const portraitEl = root.querySelector<HTMLImageElement>(".gl-portrait")!;
  const civEl = root.querySelector<HTMLDivElement>(".gl-civ")!;
  const leaderEl = root.querySelector<HTMLDivElement>(".gl-leader")!;
  const prologueEl = root.querySelector<HTMLDivElement>(".gl-prologue")!;
  const dividerEl = root.querySelector<HTMLDivElement>(".gl-divider")!;
  const abilityEl = root.querySelector<HTMLDivElement>(".gl-ability")!;
  const leverageBlockEl = root.querySelector<HTMLDivElement>(".gl-leverage-block")!;
  const leverageEl = root.querySelector<HTMLDivElement>(".gl-leverage")!;
  const skipBtn = root.querySelector<HTMLButtonElement>(".gl-skip")!;
  const unitCardEl = root.querySelector<HTMLDivElement>(".gl-card-unit")!;
  const infraCardEl = root.querySelector<HTMLDivElement>(".gl-card-infra")!;

  interface UniqueCardData {
    kicker: string;
    name: string;
    meta: string;
    desc: string;
    img: string;
    /** Second image to try before hiding the art box (e.g. token when big art is missing). */
    imgFallback?: string;
  }

  function setCard(card: HTMLDivElement, data: UniqueCardData): void {
    const img = card.querySelector<HTMLImageElement>(".gl-card-img")!;
    const box = card.querySelector<HTMLElement>(".gl-card-imgbox")!;
    card.querySelector<HTMLDivElement>(".gl-card-kicker")!.textContent = data.kicker;
    card.querySelector<HTMLDivElement>(".gl-card-name")!.textContent = data.name;
    card.querySelector<HTMLDivElement>(".gl-card-meta")!.textContent = data.meta;
    card.querySelector<HTMLDivElement>(".gl-card-desc")!.textContent = data.desc;
    box.style.display = "";
    let triedFallback = false;
    img.onerror = () => {
      if (!triedFallback && data.imgFallback) {
        triedFallback = true;
        img.src = data.imgFallback;
        return;
      }
      box.style.display = "none";
    };
    img.src = data.img;
    card.hidden = false;
  }

  /** Short player-facing blurb: combat edge over the base unit + the abilities it gains. */
  function uniqueUnitDesc(uu: (typeof UNIQUE_UNITS)[number]): string {
    const base = UNIT_DEFS[uu.replaces as UnitTypeId];
    const parts: string[] = [];
    if (base && uu.bonus) {
      parts.push(`+${uu.bonus} ${isRanged(base) ? "ranged" : "combat"} strength over the ${base.name} it replaces.`);
    }
    const baseActive = base?.activeAbilities ?? [];
    const gained = unitActiveAbilityIds(uu.replaces as UnitTypeId, uu.id).filter((a) => !baseActive.includes(a));
    for (const a of gained) {
      const d = ACTIVE_ABILITY_DEFS[a];
      parts.push(`${d.name}: ${sanitizeScrollCopy(d.desc)}`);
    }
    if (parts.length === 0 && base) parts.push(`Replaces the ${base.name}.`);
    return parts.join(" ");
  }

  /** The civ's unique unit and building/improvement cards beside the hero portrait. */
  function renderUniques(cid: string | undefined): void {
    const uu = cid ? UNIQUE_UNITS.find((u) => u.civId === cid) : undefined;
    if (uu) {
      const base = UNIT_DEFS[uu.replaces as UnitTypeId];
      setCard(unitCardEl, {
        kicker: "Unique Unit",
        name: uu.name,
        meta: base ? `Replaces ${base.name}` : "",
        desc: uniqueUnitDesc(uu),
        img: `${ASSET_BASE_URL}units-big/${uu.id}.png`,
        imgFallback: `${ASSET_BASE_URL}units/${uu.id}.png`,
      });
    } else {
      unitCardEl.hidden = true;
    }
    const inf = uniqueInfraForCiv(cid);
    if (inf) {
      const dir = inf.kind === "building" ? "buildings" : "improvements";
      const tech = TECH_DEFS[inf.reqTech as keyof typeof TECH_DEFS]?.name ?? inf.reqTech;
      setCard(infraCardEl, {
        kicker: inf.kind === "building" ? "Unique Building" : "Unique Improvement",
        name: inf.name,
        meta: `Unlocks with ${tech}`,
        desc: sanitizeScrollCopy(inf.desc),
        img: `${ASSET_BASE_URL}${dir}/${inf.id}.png`,
      });
    } else {
      infraCardEl.hidden = true;
    }
  }

  function showFullScroll(s: CivLoadingSpeech): void {
    prologueEl.innerHTML = iconify(s.story);
    abilityEl.innerHTML = s.ability ? iconify(s.ability) : "";
    leverageEl.innerHTML = s.leverage ? iconify(s.leverage) : "";
    dividerEl.hidden = !s.ability;
    dividerEl.classList.toggle("visible", !!s.ability);
    leverageBlockEl.hidden = !s.leverage;
    leverageBlockEl.classList.toggle("visible", !!s.leverage);
  }

  function leverageRevealStart(blocks: Pick<CivLoadingSpeech, "story" | "ability" | "leverage">): number {
    let pos = Array.from(blocks.story).length;
    if (blocks.ability) pos += 1 + Array.from(blocks.ability).length;
    else if (blocks.leverage) pos += 1;
    return pos;
  }

  function updateSectionChrome(
    blocks: Pick<CivLoadingSpeech, "story" | "ability" | "leverage">,
    count: number,
  ): void {
    const storyLen = Array.from(blocks.story).length;
    const showAbility = !!blocks.ability && count > storyLen;
    dividerEl.hidden = !blocks.ability;
    dividerEl.classList.toggle("visible", showAbility);

    const showLeverage = !!blocks.leverage && count > leverageRevealStart(blocks);
    leverageBlockEl.hidden = !blocks.leverage;
    leverageBlockEl.classList.toggle("visible", showLeverage);
  }

  function revealByCharCount(
    blocks: Pick<CivLoadingSpeech, "story" | "ability" | "leverage">,
    count: number,
  ): void {
    // Follow the typing when it overflows the parchment, but let the player
    // scroll up to reread without fighting them.
    const followTyping =
      scrollBodyEl.scrollHeight - scrollBodyEl.scrollTop - scrollBodyEl.clientHeight < 64;
    const blockList: { el: HTMLDivElement; text: string }[] = [];
    if (blocks.story) blockList.push({ el: prologueEl, text: blocks.story });
    if (blocks.ability) blockList.push({ el: abilityEl, text: blocks.ability });
    if (blocks.leverage) blockList.push({ el: leverageEl, text: blocks.leverage });

    let remaining = count;
    for (let i = 0; i < blockList.length; i++) {
      const block = blockList[i]!;
      const chars = Array.from(block.text);
      if (remaining >= chars.length) {
        block.el.innerHTML = iconify(block.text);
        remaining -= chars.length;
        if (i < blockList.length - 1 && remaining > 0) remaining -= 1;
      } else {
        block.el.innerHTML = iconify(chars.slice(0, Math.max(0, remaining)).join(""));
        remaining = 0;
        for (let j = i + 1; j < blockList.length; j++) blockList[j]!.el.textContent = "";
        break;
      }
    }
    updateSectionChrome(blocks, count);
    if (followTyping) scrollBodyEl.scrollTop = scrollBodyEl.scrollHeight;
  }

  function revealAllSpeech(scroll: CivLoadingSpeech): void {
    showFullScroll(scroll);
  }

  function stopTyping(): void {
    if (typeTimer) window.clearInterval(typeTimer);
    typeTimer = 0;
    if (typeRaf) window.cancelAnimationFrame(typeRaf);
    typeRaf = 0;
  }

  function markTypingDone(): void {
    typingDone = true;
    scheduleHoldIfNeeded();
  }

  function clearSections(): void {
    prologueEl.textContent = "";
    abilityEl.textContent = "";
    leverageEl.textContent = "";
    dividerEl.hidden = true;
    dividerEl.classList.remove("visible");
    leverageBlockEl.hidden = true;
    leverageBlockEl.classList.remove("visible");
  }

  function clearHold(): void {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
    contentFinishedAt = 0;
    holdStarted = false;
    holdComplete = false;
    root.classList.remove("post-speech-hold");
  }

  /** Keep the finished scroll on screen before entering the game. */
  function scheduleHoldIfNeeded(): void {
    if (skipped || dismissed || !speech || holdStarted) return;
    if (!speechDone || !typingDone) return;
    holdStarted = true;
    if (activeScroll) showFullScroll(activeScroll);
    root.classList.add("post-speech-hold", "map-backdrop");
    contentFinishedAt = performance.now();
    holdTimer = window.setTimeout(() => {
      holdTimer = 0;
      holdComplete = true;
      tryDismiss();
    }, POST_SPEECH_HOLD_MS);
  }

  function markSpeechDone(): void {
    speechDone = true;
    // Audio can finish without the sync loop marking typing done (e.g. missed
    // "playing" / "ended" on some mobile WebViews). Never block dismiss on that.
    if (activeScroll && !typingDone) {
      stopTyping();
      revealAllSpeech(activeScroll);
      markTypingDone();
    } else {
      scheduleHoldIfNeeded();
    }
  }

  /** MP3 sync — character reveal locked to audio.currentTime. */
  function beginAudioSync(scroll: CivLoadingSpeech, audio: HTMLAudioElement): void {
    stopTyping();
    if (!scroll.text) {
      revealAllSpeech(scroll);
      markTypingDone();
      return;
    }
    const token = ++typeSeq;
    const total = Array.from(scroll.text).length;
    let syncDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    let timeline: WordRevealMark[] = [];

    const rebuildTimeline = (): void => {
      const dur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : syncDur > 0
            ? syncDur
            : Math.max(4, total * 0.042);
      syncDur = dur;
      timeline = syncTimeline(scroll.text, dur);
    };

    const revealAtPlaybackTime = (): void => {
      if (token !== typeSeq) return;
      if (timeline.length === 0) rebuildTimeline();
      const count = revealCountAtTime(timeline, audio.currentTime, total);
      revealByCharCount(scroll.spoken, count);
    };

    const finishReveal = (): void => {
      if (token !== typeSeq) return;
      revealAllSpeech(scroll);
      markTypingDone();
    };

    audio.addEventListener("durationchange", () => {
      rebuildTimeline();
      revealAtPlaybackTime();
    });
    audio.addEventListener("ended", finishReveal, { once: true });

    rebuildTimeline();
    revealAtPlaybackTime();

    const tick = (): void => {
      if (token !== typeSeq) return;
      if (audio.ended) {
        finishReveal();
        return;
      }
      revealAtPlaybackTime();
      if (!audio.paused && !audio.ended) typeRaf = window.requestAnimationFrame(tick);
    };
    typeRaf = window.requestAnimationFrame(tick);
  }

  /** Browser TTS — smooth character reveal on estimated duration. */
  function beginTtsTyping(scroll: CivLoadingSpeech): void {
    stopTyping();
    if (!scroll.text) {
      revealAllSpeech(scroll);
      markTypingDone();
      return;
    }
    const token = ++typeSeq;
    const total = Array.from(scroll.text).length;
    const estDur = ((total * TYPE_MS) / 1000) * TEXT_SYNC_STRETCH;
    const timeline = syncTimeline(scroll.text, estDur);
    const started = performance.now();
    let smoothReveal = 0;

    typeTimer = window.setInterval(() => {
      if (token !== typeSeq) return;
      const elapsed = (performance.now() - started) / 1000;
      const target = revealCountAtTime(timeline, elapsed, total);
      smoothReveal = smoothCharCount(smoothReveal, target, TEXT_SMOOTH_RATE);
      revealByCharCount(scroll.spoken, Math.round(smoothReveal));
      if (target >= total && smoothReveal >= total - 0.5) {
        stopTyping();
        revealAllSpeech(scroll);
        markTypingDone();
      }
    }, TYPE_MS);
  }

  function speakLine(scroll: CivLoadingSpeech, voiceVersion: string | null): void {
    speakLoadingLine(scroll.text, scroll.civId, {
      voiceVersion,
      onSyncStart: (audio) => {
        if (dismissed) return;
        stopTyping();
        beginAudioSync(scroll, audio);
      },
      onFallback: () => {
        if (dismissed) return;
        beginTtsTyping(scroll);
      },
      onEnd: markSpeechDone,
    });
  }

  function resetForceDismissTimer(): void {
    if (dismissTimer) window.clearTimeout(dismissTimer);
    dismissTimer = window.setTimeout(() => {
      if (!dismissed) skip();
    }, forceDismissMs(speech?.text ?? activeScroll?.text));
  }

  function startSpeech(): void {
    if (!speech) return;
    const token = ++speakSeq;

    civEl.textContent = speech.civName;
    leaderEl.textContent = speech.leader;
    portraitEl.src = assetUrl(`leaders/${speech.civId}.png`);
    portraitEl.alt = `${speech.leader}, ${speech.civName}`;
    portraitEl.style.visibility = "";
    portraitEl.onerror = () => {
      portraitEl.style.visibility = "hidden";
    };
    renderUniques(speech.civId);

    speechDone = false;
    typingDone = false;
    clearHold();
    clearSections();

    preloadLoadingVoice(speech.civId);
    activeScroll = scrollSpeech(speech, null);
    speakLine(activeScroll, null);
    resetForceDismissTimer();

    // Baked script / cache-bust are optional; never delay the first spoken line.
    void Promise.all([
      fetchBakedLoadingScript(speech.civId),
      fetchLoadingVoiceVersion(speech.civId),
    ]).then(([baked, voiceVersion]) => {
      if (token !== speakSeq || dismissed) return;
      if (baked && baked !== speech!.text) {
        activeScroll = scrollSpeech(speech!, baked);
      }
      if (voiceVersion) preloadLoadingVoice(speech!.civId, voiceVersion);
    });
  }

  function renderSpeech(): void {
    if (!speech) {
      civEl.textContent = "";
      leaderEl.textContent = "";
      clearSections();
      portraitEl.removeAttribute("src");
      renderUniques(undefined);
      return;
    }
    startSpeech();
  }

  function tryResolveCiv(): void {
    if (speech) return;
    const next = civId ?? options.resolveCivId?.();
    if (!next) return;
    civId = next;
    speech = civLoadingSpeech(civId);
    if (speech) {
      preloadLoadingVoice(civId);
      renderSpeech();
    }
  }

  function skip(): void {
    if (dismissed) return;
    skipped = true;
    speakSeq++;
    stopTyping();
    clearHold();
    stopLoadingVoice();
    if (speech) {
      activeScroll = scrollSpeech(speech, null);
      revealAllSpeech(activeScroll);
      speechDone = true;
      typingDone = true;
    } else {
      speechDone = true;
      typingDone = true;
    }
    holdComplete = true;
    tryDismiss();
  }

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    speakSeq++;
    stopTyping();
    clearHold();
    stopLoadingVoice();
    if (dismissTimer) window.clearTimeout(dismissTimer);
    root.classList.remove("map-backdrop");
    clearLoadingBodyClass();
    options.onDismiss?.();
    root.remove();
  }

  function tryDismiss(): void {
    if (dismissed || !worldReady) return;
    // Auto-dismiss after speech waits for the map; Skip can leave early once the world exists.
    if (!skipped && !mapRendered) return;
    tryResolveCiv();
    const elapsed = performance.now() - mountedAt;
    if (!skipped && elapsed < MIN_VISIBLE_MS) return;
    if (speech) {
      if (!speechDone || !typingDone) return;
      if (!skipped) {
        if (!holdComplete) {
          if (!holdStarted) scheduleHoldIfNeeded();
          return;
        }
      }
    } else if (!skipped && elapsed < MIN_VISIBLE_MS + 1200) {
      return;
    }
    dismiss();
  }

  skipBtn.addEventListener("click", skip);

  renderSpeech();
  const civPoll = window.setInterval(() => {
    if (speech || dismissed) {
      window.clearInterval(civPoll);
      return;
    }
    tryResolveCiv();
  }, 120);

  resetForceDismissTimer();

  /** Swap "Loading..." for Skip once the game is genuinely ready behind the veil.
   *  One class drives both, so the footer is never empty mid-swap. */
  function markGameReadyIfLoaded(): void {
    if (worldReady && mapRendered) root.classList.add("game-ready");
  }

  return {
    notifyWorldGenerated() {
      if (worldReady) return;
      worldReady = true;
      markGameReadyIfLoaded();
      tryDismiss();
    },
    notifyMapRendered() {
      if (mapRendered || dismissed) return;
      mapRendered = true;
      document.body.classList.add("roc-map-painted");
      markGameReadyIfLoaded();
      if (!root.classList.contains("post-speech-hold")) {
        root.classList.add("map-backdrop");
      }
      tryDismiss();
    },
    destroy() {
      window.clearInterval(civPoll);
      stopTyping();
      stopLoadingVoice();
      clearLoadingBodyClass();
      if (!dismissed) root.remove();
      dismissed = true;
    },
  };
}

const TUTORIAL_PREP_MIN_MS = 500;
const TUTORIAL_PREP_FORCE_MS = 8000;

function ensureTutorialPrepStyles(): void {
  ensureStyles();
  if (document.getElementById("tutorial-prep-style")) return;
  const style = document.createElement("style");
  style.id = "tutorial-prep-style";
  style.textContent = `
    #game-loading.tutorial-prep .gl-panel{
      width:min(520px,100%);max-height:none;min-height:0;
      align-items:center;justify-content:center;padding:28px 20px;
    }
    #game-loading.tutorial-prep .tp-status{
      font-family:'Cinzel',Georgia,serif;
      font-size:clamp(15px,3.8vw,20px);letter-spacing:.14em;text-transform:uppercase;
      color:var(--parchment);text-align:center;
      text-shadow:0 2px 12px rgba(0,0,0,.55);
    }
  `;
  document.head.appendChild(style);
}

export interface TutorialPreparingOptions {
  /** Fired when the preparing veil is removed and the coach may start. */
  onDismiss?: () => void;
}

/** Minimal veil while the tutorial world generates and the first map frame paints. */
export function createTutorialPreparingScreen(
  options: TutorialPreparingOptions = {},
): LoadingScreenHandle {
  ensureTutorialPrepStyles();
  const mountedAt = performance.now();
  let worldReady = false;
  let mapRendered = false;
  let dismissed = false;
  let dismissTimer = 0;

  const root = document.createElement("div");
  root.id = "game-loading";
  root.className = "tutorial-prep";
  root.innerHTML =
    `<div class="gl-panel">` +
    `<div class="tp-status">Preparing a tutorial...</div>` +
    `</div>`;
  document.body.appendChild(root);
  document.body.classList.add("roc-loading-scroll");

  function clearLoadingBodyClass(): void {
    document.body.classList.remove("roc-loading-scroll", "roc-map-painted");
  }

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(dismissTimer);
    dismissTimer = 0;
    clearLoadingBodyClass();
    options.onDismiss?.();
    root.remove();
  }

  function tryDismiss(): void {
    if (dismissed || !worldReady || !mapRendered) return;
    const elapsed = performance.now() - mountedAt;
    if (elapsed < TUTORIAL_PREP_MIN_MS) {
      if (!dismissTimer) {
        dismissTimer = window.setTimeout(() => {
          dismissTimer = 0;
          tryDismiss();
        }, TUTORIAL_PREP_MIN_MS - elapsed);
      }
      return;
    }
    dismiss();
  }

  const forceTimer = window.setTimeout(() => {
    if (dismissed) return;
    worldReady = true;
    mapRendered = true;
    dismiss();
  }, TUTORIAL_PREP_FORCE_MS);

  return {
    notifyWorldGenerated() {
      if (worldReady) return;
      worldReady = true;
      tryDismiss();
    },
    notifyMapRendered() {
      if (mapRendered || dismissed) return;
      mapRendered = true;
      document.body.classList.add("roc-map-painted");
      tryDismiss();
    },
    destroy() {
      window.clearTimeout(forceTimer);
      window.clearTimeout(dismissTimer);
      clearLoadingBodyClass();
      if (!dismissed) root.remove();
      dismissed = true;
    },
  };
}
