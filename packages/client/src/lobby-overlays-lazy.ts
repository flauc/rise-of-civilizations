export interface LobbyOverlayHandle {
  open(): void;
}

export function createLazyChangelog(): LobbyOverlayHandle {
  let real: LobbyOverlayHandle | null = null;
  return {
    open() {
      if (real) {
        real.open();
        return;
      }
      void import("./changelog").then((m) => {
        real = m.createChangelog();
        real.open();
      });
    },
  };
}

export function createLazyRoadmap(): LobbyOverlayHandle {
  let real: LobbyOverlayHandle | null = null;
  return {
    open() {
      if (real) {
        real.open();
        return;
      }
      void import("./roadmap").then((m) => {
        real = m.createRoadmap();
        real.open();
      });
    },
  };
}

export function createLazyCredits(): LobbyOverlayHandle {
  let real: LobbyOverlayHandle | null = null;
  return {
    open() {
      if (real) {
        real.open();
        return;
      }
      void import("./credits").then((m) => {
        real = m.createCredits();
        real.open();
      });
    },
  };
}
