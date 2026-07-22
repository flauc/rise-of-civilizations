import type { GameState } from "@roc/sim";
import type { Empire, EmpireHandlers, Tab } from "./empire";

/** Loads `empire.ts` on first open; render is a no-op until then. */
export function createLazyEmpire(handlers: EmpireHandlers): Empire {
  let real: Empire | null = null;
  let load: Promise<Empire> | null = null;

  const ensure = (): Promise<Empire> => {
    if (real) return Promise.resolve(real);
    if (!load) {
      load = import("./empire").then((m) => {
        real = m.createEmpire(handlers);
        return real;
      });
    }
    return load;
  };

  return {
    toggle(state: GameState, viewerId: number, tab?: Tab) {
      void ensure().then((e) => e.toggle(state, viewerId, tab));
    },
    close() {
      real?.close();
    },
    isOpen() {
      return real?.isOpen() ?? false;
    },
    render(state: GameState, viewerId: number) {
      real?.render(state, viewerId);
    },
  };
}

/** Warm the empire chunk during tier-2 preload. */
export function preloadEmpireModule(): void {
  void import("./empire");
}
