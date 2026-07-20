// Shared mobile WebKit audio unlock — call from a user gesture (Start Game, Skip, etc.).

const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//uQxAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

let unlocked = false;

export function isGameAudioUnlocked(): boolean {
  return unlocked;
}

/** WebKit inline playback hints (harmless on desktop). */
export function configureMobileAudio(audio: HTMLAudioElement): void {
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
}

/**
 * Unlock MP3 playback and speech synthesis for this document. Safe to call more
 * than once; later calls are no-ops.
 */
export function unlockGameAudio(): void {
  if (unlocked) return;
  unlocked = true;

  const probe = new Audio();
  configureMobileAudio(probe);
  probe.src = SILENT_MP3;
  void probe.play().catch(() => {});

  // iOS Safari often blocks speechSynthesis until the first speak from a gesture.
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance("\u200b");
    u.volume = 0;
    u.rate = 1;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  }
}
