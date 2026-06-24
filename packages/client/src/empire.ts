// The "Empire" overview: a tabbed modal listing all of the player's Units,
// Cities, and Specialists/Works (with wonder management). Self-contained so it
// stays out of the busy ui.ts; ui.ts only toggles it and re-renders it per frame
// while open.

import {
  UNIT_DEFS,
  getProjectDef,
  getCityYields,
  citiesOf,
  unitsOf,
  unitMaxHp,
  SPECIALIST_DEFS,
  availableSpecialists,
  workerSlots,
  worksOf,
  worksOfCity,
  workName,
  currentWorkFor,
  type GameState,
  type City,
} from "@roc/sim";
import { WONDER_DEFS, getWonder } from "@roc/data";

export interface EmpireHandlers {
  onSelectUnit(id: number): void;
  onSelectCity(id: number): void;
  onConvertCitizen(cityId: number, specialistId: string, delta: number): void;
  onCancelWork(workId: number): void;
}

export type Tab = "units" | "cities" | "specialists";

const STYLE = `
#empire{position:fixed;top:0;right:0;bottom:0;left:auto;width:min(460px,92vw);z-index:55;background:#0d1b27;border-left:1px solid var(--edge);box-shadow:-8px 0 24px rgba(0,0,0,.35);display:flex;flex-direction:column;transform:translateX(0);transition:transform .2s ease,pointer-events 0s}
#empire.hidden{transform:translateX(100%);pointer-events:none}
.emp-box{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden}
.emp-head{position:relative;display:flex;align-items:center;gap:10px;padding:12px 16px;padding-right:52px;border-bottom:1px solid var(--edge)}
.emp-tab{padding:7px 14px;border-radius:8px;cursor:pointer;color:#b8d4ec;background:transparent;border:1px solid transparent;font:inherit;font-size:14px}
.emp-tab.active{background:#213a52;border-color:var(--edge);color:#fff;font-weight:700}
.emp-title{font-weight:800;font-size:17px;color:#fff;margin-right:8px}
.emp-x{position:absolute;top:8px;right:12px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:50%;border:1px solid var(--edge);background:#11202e;color:#fff;font-size:16px;line-height:1;cursor:pointer}
.emp-x:hover{background:#17304e}
@media(max-width:640px){.emp-title{display:none}.emp-tab{padding:7px 11px;font-size:13px}}
.emp-body{flex:1;overflow:auto;padding:14px 16px}
.emp-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--edge);border-radius:9px;margin-top:7px;cursor:pointer;background:#11202e}
.emp-row:hover{background:#17304470;border-color:#3a5d7c}
.emp-row .grow{flex:1;min-width:0}
.emp-name{font-weight:700;color:#fff}
.emp-sub{color:#9fc0dc;font-size:12px}
.emp-pill{background:#16293c;border-radius:6px;padding:2px 7px;font-size:12px;white-space:nowrap}
.emp-card{border:1px solid var(--edge);border-radius:10px;margin-top:10px;padding:10px 12px;background:#11202e}
.emp-stepper{display:flex;gap:4px;align-items:center}
.emp-bar{height:7px;background:#1a2c40;border-radius:4px;overflow:hidden;margin-top:3px}
.emp-bar>i{display:block;height:100%;background:#c9a24a}
.emp-empty{color:#9fc0dc;margin-top:14px}
.emp-spec-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px}
.emp-spec-list{margin:3px 0 2px;border-left:2px solid #24384c;padding-left:9px}
.emp-spec{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:2px 0}
.emp-spec-name{color:#eaf3fb;font-size:13px}
.emp-spec-meta{color:#9fc0dc;font-size:12px;white-space:nowrap}
.emp-stars{color:#ffd967;letter-spacing:1px}
.emp-idle{color:#7e93a6;font-style:italic}
`;

export interface Empire {
  toggle(state: GameState, viewerId: number, requestedTab?: Tab): void;
  close(): void;
  isOpen(): boolean;
  render(state: GameState, viewerId: number): void;
}

export function createEmpire(handlers: EmpireHandlers): Empire {
  let open = false;
  let tab: Tab = "cities";
  let last: { state: GameState; viewerId: number } | null = null;

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "empire";
  root.className = "hidden";
  root.innerHTML =
    `<div class="emp-box">` +
    `<div class="emp-head"><span class="emp-title">🏛️ Empire</span>` +
    `<button class="emp-tab" data-tab="cities">Cities</button>` +
    `<button class="emp-tab" data-tab="units">Units</button>` +
    `<button class="emp-tab" data-tab="specialists">Specialists</button>` +
    `<button class="emp-x" id="emp-close" title="Close" aria-label="Close">✕</button></div>` +
    `<div class="emp-body" id="emp-body"></div></div>`;
  document.body.appendChild(root);

  const body = root.querySelector<HTMLDivElement>("#emp-body")!;
  root.querySelector<HTMLButtonElement>("#emp-close")!.addEventListener("click", () => close());
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((el) =>
    el.addEventListener("click", () => {
      tab = el.dataset.tab as Tab;
      if (last) render(last.state, last.viewerId);
    }),
  );

  function close(): void {
    open = false;
    root.classList.add("hidden");
  }

  const yieldsLine = (state: GameState, c: City): string => {
    const y = getCityYields(state, c);
    return `🍞${y.food} ⚒️${y.production} 🪙${y.gold} 🔬${y.science} 🎭${y.culture} ☮️${y.faith}`;
  };

  function renderCities(state: GameState, viewerId: number): string {
    const cities = citiesOf(state, viewerId);
    if (cities.length === 0) return `<div class="emp-empty">No cities yet.</div>`;
    return cities
      .map((c) => {
        const prod = c.production
          ? c.production.kind === "unit"
            ? UNIT_DEFS[c.production.id].name
            : c.production.kind === "project"
              ? getProjectDef(c.production.id)?.name ?? c.production.id
              : c.production.id
          : "—";
        const works = worksOfCity(state, c.id).length;
        return (
          `<div class="emp-row" data-city="${c.id}">` +
          `<div class="grow"><div class="emp-name">${c.isCapital ? "★ " : ""}${c.name}</div>` +
          `<div class="emp-sub">${yieldsLine(state, c)}</div></div>` +
          `<span class="emp-pill">Pop ${c.population}</span>` +
          `<span class="emp-pill">🛠️ ${c.specialists.length}</span>` +
          `<span class="emp-pill">⚒️ ${prod}</span>` +
          (works ? `<span class="emp-pill">${works} works</span>` : "") +
          `</div>`
        );
      })
      .join("");
  }

  function renderUnits(state: GameState, viewerId: number): string {
    const units = unitsOf(state, viewerId).sort((a, b) => a.type.localeCompare(b.type));
    if (units.length === 0) return `<div class="emp-empty">No units.</div>`;
    return units
      .map((u) => {
        const d = UNIT_DEFS[u.type];
        const idle = u.movementLeft > 0 && !u.sleeping;
        const status = u.sleeping ? "💤 Sleeping" : idle ? "Ready" : "Done";
        const color = u.sleeping ? "#7e93a6" : idle ? "#ffd967" : "#7e93a6";
        return (
          `<div class="emp-row" data-unit="${u.id}">` +
          `<span style="font-size:18px;width:22px;text-align:center">${d.glyph}</span>` +
          `<div class="grow"><div class="emp-name">${d.name}${u.level > 1 ? ` <span style="color:#ffd967">Lv${u.level}</span>` : ""}</div>` +
          `<div class="emp-sub">(${u.col}, ${u.row}) · moves ${u.movementLeft}/${d.movement}${d.strength > 0 ? ` · HP ${u.hp}/${unitMaxHp(u)}` : ""}</div></div>` +
          `<span class="emp-pill" style="color:${color}">${status}</span>` +
          `</div>`
        );
      })
      .join("");
  }

  function renderSpecialists(state: GameState, viewerId: number): string {
    const cities = citiesOf(state, viewerId);
    let html = "";
    for (const c of cities) {
      const free = workerSlots(c);
      const avail = availableSpecialists(state.players.find((p) => p.id === viewerId)!);
      const jobOf = (w: ReturnType<typeof currentWorkFor>): string => {
        if (!w) return `<span class="emp-idle">idle</span>`;
        const label = w.kind === "wonder" ? getWonder(w.wonderId)?.name ?? "a wonder" : workName(w.kind, w.tier ?? 1);
        return `→ ${label}`;
      };
      const steppers = avail
        .map((id) => {
          const def = SPECIALIST_DEFS[id];
          const mine = c.specialists.filter((s) => s.type === id).sort((a, b) => b.level - a.level);
          // Group header with train/release steppers …
          const header =
            `<div class="emp-spec-head">` +
            `<span title="${def.latin} — ${def.desc}"><b style="color:#fff">${def.name}</b>` +
            (mine.length ? ` <span class="emp-sub">×${mine.length}</span>` : ` <span class="emp-sub">—</span>`) +
            `</span>` +
            `<span class="emp-stepper"><button class="btn" data-spec-minus="${id}" data-city="${c.id}"${mine.length ? "" : " disabled"}>−</button>` +
            `<button class="btn" data-spec-plus="${id}" data-city="${c.id}"${free > 0 ? "" : " disabled"}>＋</button></span></div>`;
          // … then every craftsman of this kind, by name, level and current job.
          const list = mine
            .map((s) => {
              const stars = "★".repeat(Math.min(5, s.level));
              return (
                `<div class="emp-spec"><span class="emp-spec-name">${s.name ?? def.name}</span>` +
                `<span class="emp-spec-meta"><span class="emp-stars" title="Level ${s.level}">${stars}</span> ${jobOf(currentWorkFor(state, c, s))}</span></div>`
              );
            })
            .join("");
          return header + (mine.length ? `<div class="emp-spec-list">${list}</div>` : "");
        })
        .join("");
      const works = worksOfCity(state, c.id)
        .map((w) => {
          const req = Object.values(w.requirement).reduce((a, b) => a + (b ?? 0), 0);
          const done = Object.values(w.progress).reduce((a, b) => a + (b ?? 0), 0);
          const pct = req > 0 ? Math.floor((done / req) * 100) : 0;
          const label = w.kind === "wonder" ? getWonder(w.wonderId)?.name ?? "Wonder" : workName(w.kind, w.tier ?? 1);
          return (
            `<div style="margin-top:6px"><div class="emp-sub">${label} — ${pct}% ` +
            `<a href="#" data-cancel="${w.id}" style="color:#e0907d;margin-left:6px">cancel</a></div>` +
            `<div class="emp-bar"><i style="width:${pct}%"></i></div></div>`
          );
        })
        .join("");
      html +=
        `<div class="emp-card"><div class="emp-name">${c.isCapital ? "★ " : ""}${c.name} ` +
        `<span class="emp-sub">(${free} free citizens)</span></div>` +
        steppers +
        (works ? `<div class="emp-sub" style="margin-top:8px;color:#c79ad6">Public works</div>${works}` : "") +
        `</div>`;
    }

    // Wonders.
    html += `<div class="emp-card"><div class="emp-name">🏛️ Wonders</div>`;
    for (const w of WONDER_DEFS) {
      const built = state.completedWonders.includes(w.id);
      const inProg = worksOf(state, viewerId).find((x) => x.wonderId === w.id);
      const reqStr = Object.entries(w.requirement)
        .map(([d, n]) => `${d} ${n}`)
        .join(" · ");
      let action: string;
      if (built) action = `<span class="emp-pill" style="color:#7ad08a">Built</span>`;
      else if (inProg) {
        const req = Object.values(inProg.requirement).reduce((a, b) => a + (b ?? 0), 0);
        const done = Object.values(inProg.progress).reduce((a, b) => a + (b ?? 0), 0);
        action = `<span class="emp-pill">${req > 0 ? Math.floor((done / req) * 100) : 0}%</span>`;
      } else {
        // Wonders are raised on a chosen tile (like an improvement): select an
        // empty owned tile near a city with the required craftsmen and pick the
        // wonder from that tile's panel.
        action = `<span class="emp-pill" style="color:#9fc3e0" title="Select an empty tile in your territory to raise this wonder">🗺️ build on a tile</span>`;
      }
      html +=
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid var(--edge)">` +
        `<div class="grow"><div class="emp-name" style="font-size:14px">${w.name}</div>` +
        `<div class="emp-sub">${w.desc}</div><div class="emp-sub" style="color:#c9a24a">Needs: ${reqStr}</div></div>${action}</div>`;
    }
    html += `</div>`;
    return html;
  }

  function render(state: GameState, viewerId: number): void {
    last = { state, viewerId };
    if (!open) return;
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((el) =>
      el.classList.toggle("active", el.dataset.tab === tab),
    );
    body.innerHTML =
      tab === "cities" ? renderCities(state, viewerId) : tab === "units" ? renderUnits(state, viewerId) : renderSpecialists(state, viewerId);

    body.querySelectorAll<HTMLDivElement>("[data-city]").forEach((el) => {
      if (el.classList.contains("emp-row")) {
        el.addEventListener("click", () => {
          handlers.onSelectCity(Number(el.dataset.city));
          close();
        });
      }
    });
    body.querySelectorAll<HTMLDivElement>("[data-unit]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onSelectUnit(Number(el.dataset.unit));
        close();
      }),
    );
    body.querySelectorAll<HTMLButtonElement>("[data-spec-plus]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onConvertCitizen(Number(el.dataset.city), el.dataset.specPlus!, 1);
        render(state, viewerId);
      }),
    );
    body.querySelectorAll<HTMLButtonElement>("[data-spec-minus]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onConvertCitizen(Number(el.dataset.city), el.dataset.specMinus!, -1);
        render(state, viewerId);
      }),
    );
    body.querySelectorAll<HTMLAnchorElement>("[data-cancel]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        handlers.onCancelWork(Number(el.dataset.cancel));
        render(state, viewerId);
      }),
    );
  }

  return {
    toggle(state, viewerId, requestedTab) {
      if (requestedTab && requestedTab !== tab) {
        tab = requestedTab;
        if (!open) {
          open = true;
          root.classList.remove("hidden");
        }
        render(state, viewerId);
        return;
      }
      open = !open;
      root.classList.toggle("hidden", !open);
      if (open) render(state, viewerId);
    },
    close,
    isOpen: () => open,
    render(state, viewerId) {
      if (open) render(state, viewerId);
    },
  };
}
