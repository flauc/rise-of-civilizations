import type { WikiNav } from "./wiki";

export interface WikiHandle {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  openDetail(kind: WikiNav["kind"], id: string): void;
}

/** Loads `wiki.ts` (and d3-geo / world-atlas) on first open. */
export function createLazyWiki(): WikiHandle {
  let real: WikiHandle | null = null;
  let load: Promise<WikiHandle> | null = null;

  const ensure = (): Promise<WikiHandle> => {
    if (real) return Promise.resolve(real);
    if (!load) {
      load = import("./wiki").then((m) => {
        real = m.createWiki();
        return real;
      });
    }
    return load;
  };

  return {
    open() {
      void ensure().then((w) => w.open());
    },
    close() {
      real?.close();
    },
    toggle() {
      void ensure().then((w) => w.toggle());
    },
    isOpen() {
      return real?.isOpen() ?? false;
    },
    openDetail(kind, id) {
      void ensure().then((w) => w.openDetail(kind, id));
    },
  };
}
