// Shared mobile WebKit audio unlock — call from a user gesture (Start Game, Skip, etc.).

const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//uQxAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

let unlocked = false;
let unlockInFlight: Promise<boolean> | null = null;

export function isGameAudioUnlocked(): boolean {
  return unlocked;
}

/** WebKit inline playback hints (harmless on desktop). */
export function configureMobileAudio(audio: HTMLAudioElement): void {
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
}

function primeSpeechSynthesis(): void {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance("\u200b");
  u.volume = 0;
  u.rate = 1;
  window.speechSynthesis.speak(u);
  window.speechSynthesis.cancel();
}

async function tryUnlockProbe(): Promise<boolean> {
  const probe = new Audio();
  configureMobileAudio(probe);
  probe.src = SILENT_MP3;
  try {
    await probe.play();
    probe.pause();
    probe.currentTime = 0;
    return true;
  } catch {
    return false;
  }
}

/** Unlock MP3 playback and speech synthesis. Resolves true only after play succeeds. */
export function ensureGameAudioUnlocked(): Promise<boolean> {
  if (unlocked) return Promise.resolve(true);
  if (!unlockInFlight) {
    unlockInFlight = tryUnlockProbe().then((ok) => {
      unlockInFlight = null;
      if (ok) {
        unlocked = true;
        primeSpeechSynthesis();
      }
      return ok;
    });
  }
  return unlockInFlight;
}

/**
 * Fire-and-forget unlock from a user gesture. Safe to call more than once; later
 * successful calls are no-ops once unlocked.
 */
export function unlockGameAudio(): void {
  void ensureGameAudioUnlocked();
}
