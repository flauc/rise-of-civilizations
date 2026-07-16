// Themed loading veil: parchment scroll with the player's civ leader speaking.

import { civLoadingSpeech, type CivLoadingSpeech } from "@roc/data";
import { assetUrl } from "./asset-base";
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
const FORCE_DISMISS_MS = 48000;
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
    /* Keep the canvas hidden until the first full-quality frame has painted. */
    body.roc-loading-scroll:not(.roc-map-painted) #game{
      visibility:hidden;
    }
    #game-loading .gl-panel{
      width:min(680px,100%);max-height:min(92vh,820px);display:flex;flex-direction:column;align-items:center;gap:14px;
    }
    #game-loading .gl-loading-status{
      font-family:'Cinzel',Georgia,serif;font-size:clamp(14px,3.2vw,18px);letter-spacing:.16em;text-transform:uppercase;
      color:#d4bc8a;text-shadow:0 2px 10px rgba(0,0,0,.55);flex-shrink:0;transition:opacity .35s ease,max-height .35s ease;
    }
    #game-loading .gl-loading-status.done{opacity:0;max-height:0;overflow:hidden;margin:0;padding:0}
    #game-loading .gl-scroll{
      width:100%;height:min(72vh,680px);max-height:min(72vh,680px);display:flex;flex-direction:column;align-items:stretch;
      filter:drop-shadow(0 22px 48px rgba(0,0,0,.72)) sepia(.12);
    }
    #game-loading .gl-scroll-rod{
      height:20px;border-radius:10px;flex-shrink:0;position:relative;
      background:
        linear-gradient(180deg,rgba(255,255,255,.04),transparent 32%),
        linear-gradient(180deg,#4a3218 0%,#352410 38%,#24180a 72%,#140e06 100%);
      border:1px solid #3d2810;
      box-shadow:inset 0 2px 3px rgba(255,255,255,.04),inset 0 -4px 8px rgba(0,0,0,.5),0 4px 10px rgba(0,0,0,.45);
    }
    #game-loading .gl-scroll-rod::before,#game-loading .gl-scroll-rod::after{
      content:"";position:absolute;top:50%;transform:translateY(-50%);
      width:11px;height:11px;border-radius:50%;
      background:radial-gradient(circle at 35% 28%,#6a5030,#2a1c0a 72%);
      border:1px solid #1a1208;box-shadow:inset 0 1px 2px rgba(255,255,255,.08),0 1px 3px rgba(0,0,0,.4);
    }
    #game-loading .gl-scroll-rod::before{left:8px}
    #game-loading .gl-scroll-rod::after{right:8px}
    #game-loading .gl-scroll-rod.bottom{margin-top:-3px}
    #game-loading .gl-scroll-body{
      flex:1;min-height:0;overflow-y:auto;position:relative;
      padding:28px 32px 22px;
      background:
        radial-gradient(ellipse at 12% 18%,rgba(55,35,15,.42) 0%,transparent 46%),
        radial-gradient(ellipse at 88% 22%,rgba(45,28,12,.38) 0%,transparent 40%),
        radial-gradient(ellipse at 72% 78%,rgba(60,38,18,.45) 0%,transparent 44%),
        radial-gradient(ellipse at 22% 82%,rgba(50,32,14,.4) 0%,transparent 42%),
        radial-gradient(ellipse at 48% 55%,rgba(40,25,10,.18) 0%,transparent 58%),
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(70,48,22,.04) 2px,
          rgba(70,48,22,.04) 3px
        ),
        linear-gradient(168deg,#9a7d52 0%,#8a6c48 18%,#7d6240 42%,#6e5536 68%,#5f4a2e 100%);
      border-left:2px solid #5a4228;border-right:2px solid #5a4228;
      box-shadow:
        inset 0 0 48px rgba(30,18,8,.45),
        inset 0 0 18px rgba(20,12,5,.35),
        inset 0 3px 0 rgba(255,230,180,.12),
        inset 12px 0 24px rgba(40,25,10,.22),
        inset -12px 0 24px rgba(40,25,10,.22);
      color:#2a1e10;
    }
    #game-loading .gl-scroll-body::before{
      content:"";pointer-events:none;position:absolute;inset:0;opacity:.55;z-index:0;
      background:
        radial-gradient(circle at 15% 35%,rgba(35,22,8,.28) 0%,transparent 28%),
        radial-gradient(circle at 78% 62%,rgba(30,18,6,.32) 0%,transparent 32%),
        radial-gradient(circle at 42% 88%,rgba(40,25,10,.25) 0%,transparent 26%),
        radial-gradient(circle at 90% 12%,rgba(25,15,5,.2) 0%,transparent 22%);
    }
    #game-loading .gl-scroll-body::after{
      content:"";pointer-events:none;position:absolute;left:0;right:0;top:0;height:100%;opacity:.35;z-index:0;
      background:repeating-linear-gradient(
        93deg,
        transparent,
        transparent 18px,
        rgba(50,32,14,.06) 18px,
        rgba(50,32,14,.06) 19px
      );
    }
    #game-loading .gl-scroll-body > *{position:relative;z-index:1}
    #game-loading .gl-scroll-edge{
      pointer-events:none;position:absolute;left:0;right:0;height:16px;z-index:2;opacity:.5;
      background:repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(40,25,10,.16) 3px,rgba(40,25,10,.16) 4px);
    }
    #game-loading .gl-scroll-edge.top{top:0}
    #game-loading .gl-scroll-edge.bottom{bottom:0;transform:scaleY(-1)}
    #game-loading .gl-head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-bottom:22px}
    #game-loading .gl-portrait{
      width:100px;height:100px;border-radius:50%;object-fit:cover;
      border:3px solid #6a4e28;box-shadow:0 5px 16px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,230,180,.12);
      background:#1a160f;filter:sepia(.35) contrast(1.08) brightness(.92);
    }
    #game-loading .gl-civ{
      font-family:'Cinzel',Georgia,serif;font-size:clamp(26px,5.5vw,34px);font-weight:700;
      color:#3d2810;line-height:1.12;text-shadow:0 1px 0 rgba(255,235,200,.2);
    }
    #game-loading .gl-leader{
      font-family:'Cinzel',Georgia,serif;font-size:14px;letter-spacing:.12em;text-transform:uppercase;
      color:#5a3d1c;
    }
    #game-loading .gl-prologue{
      font-family:Georgia,'Times New Roman',serif;font-size:clamp(19px,4.2vw,24px);line-height:1.78;
      color:#2a1e10;text-align:left;text-shadow:0 1px 0 rgba(255,240,210,.12);min-height:2.8em;
    }
    #game-loading .gl-divider{
      margin:22px 0 20px;opacity:0;max-height:0;overflow:hidden;transition:opacity .35s ease,max-height .35s ease;
    }
    #game-loading .gl-divider.visible{opacity:1;max-height:48px}
    #game-loading .gl-divider-main{
      height:4px;border-radius:2px;
      background:linear-gradient(90deg,transparent,#5a3d18 8%,#3d2810 50%,#5a3d18 92%,transparent);
      box-shadow:0 3px 8px rgba(40,25,10,.45),0 1px 0 rgba(255,230,180,.25);
    }
    #game-loading .gl-divider-sub{
      height:1px;margin-top:7px;border-radius:1px;
      background:linear-gradient(90deg,transparent,rgba(80,55,30,.55) 15%,rgba(80,55,30,.55) 85%,transparent);
      box-shadow:0 1px 3px rgba(40,25,10,.25);
    }
    #game-loading .gl-ability{
      font-family:Georgia,'Times New Roman',serif;font-size:clamp(18px,3.8vw,22px);line-height:1.72;
      color:#2f2214;text-align:left;font-weight:600;min-height:0;
    }
    #game-loading .gl-leverage-block{
      margin-top:18px;opacity:0;max-height:0;overflow:hidden;transition:opacity .35s ease,max-height .6s ease;
    }
    #game-loading .gl-leverage-block.visible{opacity:1;max-height:320px}
    #game-loading .gl-leverage-label{
      font-family:'Cinzel',Georgia,serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;
      color:#6b4a22;margin-bottom:10px;text-shadow:0 1px 0 rgba(255,235,200,.3);
    }
    #game-loading .gl-leverage{
      font-family:Georgia,'Times New Roman',serif;font-size:clamp(18px,3.8vw,22px);line-height:1.72;
      color:#2a1e10;text-align:left;
    }
    #game-loading .gl-prologue,#game-loading .gl-ability,#game-loading .gl-leverage{
      transition:none;
    }
    #game-loading .gl-prologue .gi,#game-loading .gl-ability .gi,#game-loading .gl-leverage .gi{
      height:1.05em;width:auto;vertical-align:-.15em;
    }
    #game-loading .gl-skip{
      align-self:flex-end;flex-shrink:0;margin-top:10px;
      font-family:'Cinzel',Georgia,serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
      padding:10px 18px;border-radius:5px;border:1px solid #6b5230;
      background:linear-gradient(180deg,#c4a876,#a88d5c);color:#3a2810;cursor:pointer;
      min-height:44px;min-width:88px;box-shadow:0 2px 6px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,240,210,.25);
    }
    #game-loading .gl-skip:hover{background:linear-gradient(180deg,#d0b482,#b89968)}
    #game-loading .gl-skip:active{transform:translateY(1px)}
    @media (max-width:520px){
      #game-loading .gl-scroll-body{padding:22px 18px 18px}
      #game-loading .gl-portrait{width:84px;height:84px}
      #game-loading .gl-prologue{font-size:clamp(18px,5vw,22px)}
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
  root.innerHTML =
    `<div class="gl-panel">` +
    `<div class="gl-loading-status">Loading...</div>` +
    `<div class="gl-scroll">` +
    `<div class="gl-scroll-rod top"></div>` +
    `<div class="gl-scroll-body">` +
    `<div class="gl-scroll-edge top"></div>` +
    `<div class="gl-scroll-edge bottom"></div>` +
    `<div class="gl-head">` +
    `<img class="gl-portrait" alt="" />` +
    `<div class="gl-civ"></div>` +
    `<div class="gl-leader"></div>` +
    `</div>` +
    `<div class="gl-prologue"></div>` +
    `<div class="gl-divider" hidden>` +
    `<div class="gl-divider-main"></div>` +
    `<div class="gl-divider-sub"></div>` +
    `</div>` +
    `<div class="gl-ability"></div>` +
    `<div class="gl-leverage-block" hidden>` +
    `<div class="gl-leverage-label">Civ Leverage</div>` +
    `<div class="gl-leverage"></div>` +
    `</div>` +
    `</div>` +
    `<div class="gl-scroll-rod bottom"></div>` +
    `</div>` +
    `<button type="button" class="gl-skip">Skip</button>` +
    `</div>`;
  document.body.appendChild(root);
  document.body.classList.add("roc-loading-scroll");

  function clearLoadingBodyClass(): void {
    document.body.classList.remove("roc-loading-scroll", "roc-map-painted");
  }

  const portraitEl = root.querySelector<HTMLImageElement>(".gl-portrait")!;
  const civEl = root.querySelector<HTMLDivElement>(".gl-civ")!;
  const leaderEl = root.querySelector<HTMLDivElement>(".gl-leader")!;
  const prologueEl = root.querySelector<HTMLDivElement>(".gl-prologue")!;
  const dividerEl = root.querySelector<HTMLDivElement>(".gl-divider")!;
  const abilityEl = root.querySelector<HTMLDivElement>(".gl-ability")!;
  const leverageBlockEl = root.querySelector<HTMLDivElement>(".gl-leverage-block")!;
  const leverageEl = root.querySelector<HTMLDivElement>(".gl-leverage")!;
  const skipBtn = root.querySelector<HTMLButtonElement>(".gl-skip")!;
  const loadingStatusEl = root.querySelector<HTMLDivElement>(".gl-loading-status")!;

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
    scheduleHoldIfNeeded();
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

    speechDone = false;
    typingDone = false;
    clearHold();
    clearSections();

    preloadLoadingVoice(speech.civId);
    activeScroll = scrollSpeech(speech, null);
    speakLine(activeScroll, null);

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
    if (dismissed || !worldReady || !mapRendered) return;
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

  dismissTimer = window.setTimeout(() => {
    if (!dismissed) dismiss();
  }, FORCE_DISMISS_MS);

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
      loadingStatusEl.classList.add("done");
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
