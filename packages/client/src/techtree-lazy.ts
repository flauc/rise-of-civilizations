import type { GameState, TechId } from "@roc/sim";

type TechTreeModule = typeof import("./techtree");

let mod: TechTreeModule | null = null;
let load: Promise<TechTreeModule> | null = null;

function ensure(): Promise<TechTreeModule> {
  if (mod) return Promise.resolve(mod);
  if (!load) {
    load = import("./techtree").then((m) => {
      mod = m;
      return m;
    });
  }
  return load;
}

/** Paint the full tech tree into `container` (loads techtree.ts on first use). */
export function renderTechTreeIntoLazy(
  container: HTMLElement,
  state: GameState,
  viewerId: number,
  onPick: (techId: TechId) => void,
  onTarget: (techId: TechId) => void,
): void {
  void ensure().then((m) => m.renderTechTreeInto(container, state, viewerId, onPick, onTarget));
}

export function preloadTechTreeModule(): void {
  void import("./techtree");
}
