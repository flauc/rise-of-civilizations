import type { GameState } from "@roc/sim";
import type { Diplomacy, DiploHandlers } from "./diplomacy";

/** Loads `diplomacy.ts` on first render; tier-2 preload avoids missing first contact. */
export function createLazyDiplomacy(handlers: DiploHandlers): Diplomacy {
  let real: Diplomacy | null = null;
  let load: Promise<Diplomacy> | null = null;

  const ensure = (): Promise<Diplomacy> => {
    if (real) return Promise.resolve(real);
    if (!load) {
      load = import("./diplomacy").then((m) => {
        real = m.createDiplomacy(handlers);
        return real;
      });
    }
    return load;
  };

  return {
    render(state: GameState, viewerId: number) {
      if (real) {
        real.render(state, viewerId);
        return;
      }
      void ensure().then((d) => d.render(state, viewerId));
    },
    toggleContacts(state: GameState, viewerId: number) {
      void ensure().then((d) => d.toggleContacts(state, viewerId));
    },
    close() {
      real?.close();
    },
    isOpen() {
      return real?.isOpen() ?? false;
    },
  };
}

/** Warm the diplomacy chunk during tier-2 preload (first-contact modals). */
export function preloadDiplomacyModule(): void {
  void import("./diplomacy");
}
