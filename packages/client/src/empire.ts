// The empire overview dialogs: Cities, Units, Specialists/Works (with wonder
// management) and Trade Routes. Each opens as its own centered dialog in the
// same style as the treasury / morale dialogs; one is shown at a time.
// Self-contained so it stays out of the busy ui.ts; ui.ts only toggles it and
// re-renders it per frame while open.

import { wirePanelClose } from "./dialog-close";
import { gameHud } from "./hud-root";
import { withPreservedScroll } from "./panel-scroll";
import { confirmDialog } from "./confirm-dialog";
import {
  UNIT_DEFS,
  TRAINING_BUILDING_DEFS,
  getProjectDef,
  cityDisplayYields,
  citiesOf,
  unitsOf,
  unitMaxHp,
  SPECIALIST_DEFS,
  availableSpecialists,
  workerSlots,
  worksOf,
  worksOfCity,
  workName,
  specialistNameForDiscipline,
  wonderStartCost,
  TECH_DEFS,
  type Discipline,
  type TechId,
  currentWorkFor,
  tradeRoutesOf,
  tradeRouteYield,
  tradeRouteGoldBreakdown,
  uniqueUnitForCiv,
  type GameState,
  type City,
  type CityAutoFocus,
} from "@roc/sim";
import { WONDER_DEFS, getWonder, getCiv } from "@roc/data";
import { ASSET_BASE_URL } from "./asset-base";

/** Glyph shown next to a governed city's focus in the Cities list. */
const GOVERNOR_GLYPH: Record<CityAutoFocus, string> = {
  growth: "🌾", military: "⚔️", science: "🔬", money: "🪙",
};

export interface EmpireHandlers {
  onSelectUnit(id: number): void;
  onSelectCity(id: number): void;
  onConvertCitizen(cityId: number, specialistId: string, delta: number): void;
  onCancelWork(workId: number): void;
  /** Close a trade route — the trader that established it is lost. */
  onCancelTradeRoute(routeId: number): void;
  onLeaveTradeEscort(routeId: number): void;
}

export type Tab = "units" | "cities" | "specialists" | "trade";

const STYLE = `
/* Overlay + centered dialog, same treatment as the treasury (#gold-dialog) and
   morale dialogs. The hidden class (not .show) also keeps the tutorial coach's
   findVisibleTarget from anchoring to the closed dialog. */
#empire-overlay{position:fixed;inset:0;background:rgba(15,14,11,.72);opacity:1;pointer-events:none;transition:opacity .2s;z-index:60}
#empire-overlay.hidden{opacity:0;pointer-events:none}
#empire{position:fixed;left:50%;top:var(--dialog-top);transform:var(--dialog-transform);width:min(560px,calc(100vw - 32px));max-height:min(80vh,var(--dialog-max-h));background:var(--panel);border:1px solid var(--edge);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;overflow:hidden;opacity:1;pointer-events:auto;transition:opacity .2s;z-index:61}
#empire.hidden{opacity:0;pointer-events:none}
#empire .dialog-x{pointer-events:auto;touch-action:manipulation;z-index:3}
/* Cinzel/accent title styling comes from the shared .emp-title rule in
   index.html; the band metrics keep the title clear of the pinned ✕. */
.emp-title{margin-bottom:12px;min-height:var(--dialog-x-size);padding-right:var(--dialog-x-gutter);display:flex;flex-direction:column;justify-content:center}
.emp-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;font-size:13px;line-height:1.5}
.emp-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:10px 12px;border:1px solid var(--edge);border-radius:11px;margin-top:8px;cursor:pointer;background:var(--bg-card)}
.emp-row:hover{background:rgba(201,162,39,.10);border-color:var(--accent)}
.emp-row .grow{flex:1 1 180px;min-width:0}
.emp-unit-icon{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 auto;font-size:18px}
.emp-unit-icon img{position:absolute;inset:0;width:28px;height:28px;object-fit:contain;image-rendering:auto}
.emp-name{font-weight:700;color:var(--parchment)}
.emp-sub{color:var(--parchment-dim);font-size:12px}
.emp-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;border-radius:20px;padding:3px 10px;border:1px solid var(--edge);background:rgba(0,0,0,.22);color:var(--parchment-dim);white-space:nowrap}
.emp-card{border:1px solid var(--edge);border-radius:12px;margin-top:10px;padding:11px 13px;background:var(--bg-card)}
.emp-stepper{display:flex;gap:6px;align-items:center}
.emp-stepper .btn{min-width:38px;min-height:38px;padding:0;display:inline-flex;align-items:center;justify-content:center}
.emp-bar{height:7px;background:rgba(0,0,0,.35);border-radius:4px;overflow:hidden;margin-top:3px}
.emp-bar>i{display:block;height:100%;background:var(--accent)}
.emp-empty{color:var(--parchment-dim);margin-top:14px;line-height:1.6}
.emp-spec-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px}
.emp-spec-list{margin:3px 0 2px;border-left:2px solid var(--edge);padding-left:9px}
.emp-spec{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:2px 0}
.emp-spec-name{color:var(--parchment);font-size:13px}
.emp-spec-meta{color:var(--parchment-dim);font-size:12px;white-space:nowrap}
.emp-stars{color:var(--accent-bright);letter-spacing:1px}
.emp-idle{color:var(--parchment-dim);font-style:italic}
/* mobile */
@media(max-width:560px){
  #empire{padding:14px 14px}
  .emp-row{padding:12px}
  .emp-body .btn{min-height:44px}
  .emp-stepper .btn{min-width:44px}
}
`;

export interface Empire {
  toggle(state: GameState, viewerId: number, requestedTab?: Tab): void;
  close(): void;
  isOpen(): boolean;
  render(state: GameState, viewerId: number): void;
}

/** Dialog title per screen. */
const TITLES: Record<Tab, string> = {
  cities: "Cities",
  units: "Units",
  specialists: "Specialists",
  trade: "Trade Routes",
};

export function createEmpire(handlers: EmpireHandlers): Empire {
  let open = false;
  let tab: Tab = "cities";

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "empire-overlay";
  overlay.className = "hidden";
  gameHud().appendChild(overlay);

  const root = document.createElement("div");
  root.id = "empire";
  root.className = "panel hidden";
  root.innerHTML =
    `<button type="button" class="dialog-x" id="emp-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="emp-title" id="emp-title"></div>` +
    `<div class="emp-body" id="emp-body"></div>`;
  gameHud().appendChild(root);

  const title = root.querySelector<HTMLDivElement>("#emp-title")!;
  const body = root.querySelector<HTMLDivElement>("#emp-body")!;
  wirePanelClose(root.querySelector<HTMLButtonElement>("#emp-close")!, () => close());

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    root.classList.toggle("hidden", !open);
    overlay.classList.toggle("hidden", !open);
  }

  function close(): void {
    setOpen(false);
  }

  const yieldsLine = (state: GameState, c: City): string => {
    const y = cityDisplayYields(state, c); // fold in standing-project conversion
    return `🍞${y.food} ⚒️${y.production} 🪙${y.gold} 🔬${y.science} 🎭${y.culture} ☮️${y.faith}`;
  };

  function renderCities(state: GameState, viewerId: number): string {
    const cities = citiesOf(state, viewerId);
    if (cities.length === 0) return `<div class="emp-empty">No cities yet.</div>`;
    return cities
      .map((c) => {
        const prod = c.production
          ? c.production.kind === "project"
            ? getProjectDef(c.production.id)?.name ?? c.production.id
            : c.production.kind === "trainingBuilding"
              ? `${TRAINING_BUILDING_DEFS[c.production.family].name} T${c.production.tier}`
              : c.production.id
          : "Idle";
        const training = c.trainingQueue.length;
        const works = worksOfCity(state, c.id).length;
        return (
          `<div class="emp-row" data-city="${c.id}">` +
          `<div class="grow"><div class="emp-name">${c.isCapital ? "★ " : ""}${c.name}</div>` +
          `<div class="emp-sub">${yieldsLine(state, c)}</div></div>` +
          `<span class="emp-pill">Pop ${c.population}</span>` +
          `<span class="emp-pill">🛠️ ${c.specialists.length}</span>` +
          `<span class="emp-pill">⚒️ ${prod}</span>` +
          (training ? `<span class="emp-pill">⚔️ ${training} training</span>` : "") +
          (works ? `<span class="emp-pill">${works} works</span>` : "") +
          (c.autoMode ? `<span class="emp-pill" title="Governor mode">${GOVERNOR_GLYPH[c.autoMode]} ${c.autoMode}</span>` : "") +
          `</div>`
        );
      })
      .join("");
  }

  function renderUnits(state: GameState, viewerId: number): string {
    const units = unitsOf(state, viewerId).sort((a, b) => a.type.localeCompare(b.type));
    if (units.length === 0) return `<div class="emp-empty">No units.</div>`;
    const civId = state.players.find((p) => p.id === viewerId)?.civId;
    return units
      .map((u) => {
        const d = UNIT_DEFS[u.type];
        const idle = u.movementLeft > 0 && !u.sleeping;
        const status = u.sleeping ? "💤 Sleeping" : idle ? "Ready" : "Done";
        const color = u.sleeping ? "var(--parchment-dim)" : idle ? "var(--accent-bright)" : "var(--parchment-dim)";
        // Match the map overlay's sprite: legend id, else unique-unit id, else base
        // type. On load failure the image is swapped for the glyph — showing the
        // glyph underneath instead would bleed through transparent PNG regions.
        const imgId = u.legendId ?? uniqueUnitForCiv(civId, u.type)?.id ?? u.type;
        const tokenSrc = `${ASSET_BASE_URL}units/${imgId}.png`;
        return (
          `<div class="emp-row" data-unit="${u.id}">` +
          `<span class="emp-unit-icon"><img src="${tokenSrc}" alt="" onerror="this.replaceWith(document.createTextNode('${d.glyph}'))"></span>` +
          `<div class="grow"><div class="emp-name">${d.name}${u.level > 1 ? ` <span style="color:var(--accent-bright)">Lv${u.level}</span>` : ""}</div>` +
          `<div class="emp-sub">(${u.col}, ${u.row}) · moves ${u.movementLeft}/${d.movement}${d.strength > 0 ? ` · HP ${u.hp}/${unitMaxHp(u)}` : ""}</div></div>` +
          `<span class="emp-pill" style="color:${color}">${status}</span>` +
          `</div>`
        );
      })
      .join("");
  }

  function renderSpecialists(state: GameState, viewerId: number): string {
    const cities = citiesOf(state, viewerId);
    const avail = availableSpecialists(state.players.find((p) => p.id === viewerId)!);
    let html = "";
    if (cities.length === 0) {
      html += `<div class="emp-empty">No cities yet.<br>Found a city and its citizens can be trained as specialists.</div>`;
    } else if (avail.length === 0) {
      html +=
        `<div class="emp-empty">No specialist professions unlocked yet.<br>` +
        `<span style="color:var(--accent-bright);opacity:.85">Research new technologies to unlock professions, then convert free citizens here.</span></div>`;
    }
    for (const c of cities) {
      const free = workerSlots(c);
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
            `<span title="${def.latin}: ${def.desc}"><b style="color:var(--parchment)">${def.name}</b>` +
            (mine.length ? ` <span class="emp-sub">×${mine.length}</span>` : ` <span class="emp-sub">×0</span>`) +
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
            `<div style="margin-top:6px"><div class="emp-sub">${label}: ${pct}% ` +
            `<a href="#" data-cancel="${w.id}" style="color:#d98a6a;margin-left:6px">cancel</a></div>` +
            `<div class="emp-bar"><i style="width:${pct}%"></i></div></div>`
          );
        })
        .join("");
      html +=
        `<div class="emp-card"><div class="emp-name">${c.isCapital ? "★ " : ""}${c.name} ` +
        `<span class="emp-sub">(${free} free citizens)</span></div>` +
        steppers +
        (works ? `<div class="emp-sub" style="margin-top:8px;color:var(--accent)">Public works</div>${works}` : "") +
        `</div>`;
    }

    // Wonders — only list those whose unlocking tech is known (or already built / in progress).
    const player = state.players.find((p) => p.id === viewerId)!;
    const visibleWonders = WONDER_DEFS.filter((w) => {
      if (state.completedWonders.includes(w.id)) return true;
      if (worksOf(state, viewerId).some((x) => x.wonderId === w.id)) return true;
      return !w.reqTech || player.researched.has(w.reqTech as TechId);
    });
    if (visibleWonders.length > 0) {
      html += `<div class="emp-card"><div class="emp-name">🏛️ Wonders</div>`;
      for (const w of visibleWonders) {
      const built = state.completedWonders.includes(w.id);
      const inProg = worksOf(state, viewerId).find((x) => x.wonderId === w.id);
      const reqStr = Object.entries(w.crew)
        .map(([d, n]) => `${n} ${specialistNameForDiscipline(d as Discipline)}${n === 1 ? "" : "s"}`)
        .join(" · ");
      const cost = wonderStartCost(w);
      const costStr = [cost.gold ? `${cost.gold}🪙` : "", cost.faith ? `${cost.faith}☮️` : "", cost.culture ? `${cost.culture}🎭` : ""]
        .filter(Boolean)
        .join(" ");
      const techStr = w.reqTech ? TECH_DEFS[w.reqTech as TechId]?.name ?? w.reqTech : "";
      const siteStr = w.placement?.site ? `📍 ${w.placement.site}` : "";
      const gateBits = [techStr ? `🔬 ${techStr}` : "", costStr, siteStr].filter(Boolean).join(" · ");
      let action: string;
      if (built) action = `<span class="emp-pill" style="color:#9cbf72">Built</span>`;
      else if (inProg) {
        const req = Object.values(inProg.requirement).reduce((a, b) => a + (b ?? 0), 0);
        const done = Object.values(inProg.progress).reduce((a, b) => a + (b ?? 0), 0);
        action = `<span class="emp-pill">${req > 0 ? Math.floor((done / req) * 100) : 0}%</span>`;
      } else {
        // Wonders are raised on a chosen tile (like an improvement): select an
        // empty owned tile near a city with the required craftsmen and pick the
        // wonder from that tile's panel.
        action = `<span class="emp-pill" style="color:var(--parchment)" title="Select an empty tile in your territory to raise this wonder">🗺️ build on a tile</span>`;
      }
      html +=
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid var(--edge)">` +
        `<div class="grow"><div class="emp-name" style="font-size:14px">${w.name}</div>` +
        `<div class="emp-sub">${w.desc}</div><div class="emp-sub" style="color:var(--accent)">Crew: ${reqStr}</div>` +
        (gateBits ? `<div class="emp-sub" style="color:var(--accent-bright);opacity:.85">Unlock: ${gateBits}</div>` : "") +
        `</div>${action}</div>`;
      }
      html += `</div>`;
    }
    return html;
  }

  /** Name of the civ that owns a player id (falls back to the player's own name). */
  function civNameOf(state: GameState, playerId: number | undefined): string {
    const p = state.players.find((x) => x.id === playerId);
    return getCiv(p?.civId)?.name ?? p?.name ?? "Unknown";
  }

  function renderTrade(state: GameState, viewerId: number): string {
    const routes = tradeRoutesOf(state, viewerId);
    if (routes.length === 0) {
      return (
        `<div class="emp-empty">No trade routes yet.<br>` +
        `Move a Trader into one of your cities and use “Establish trade route” to open one.<br>` +
        `<span style="color:var(--accent-bright);opacity:.85">Tip: connect cities with roads, and upgrade them, to grow a route's gold past the base cap.<br>` +
        `Post a warrior on a route's path and choose <b>🛡 Escort</b> to guard it from barbarian raids.</span></div>`
      );
    }
    const totalGold = routes.reduce((sum, r) => sum + tradeRouteYield(state, r).gold, 0);
    const header =
      `<div class="emp-sub" style="margin-bottom:8px">${routes.length} route${routes.length === 1 ? "" : "s"} · ` +
      `+${totalGold}🪙 / turn total</div>`;
    return (
      header +
      routes
        .map((r) => {
          const from = state.cities.get(r.fromCityId);
          const to = state.cities.get(r.toCityId);
          const y = tradeRouteYield(state, r);
          const b = tradeRouteGoldBreakdown(state, r);
          const yieldBits = [
            y.gold ? `🪙${y.gold}` : "",
            y.food ? `🍞${y.food}` : "",
            y.production ? `⚒️${y.production}` : "",
            y.science ? `🔬${y.science}` : "",
            y.culture ? `🎭${y.culture}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          // Tag: a domestic route between your own cities, or an international one —
          // in which case we name the partner civilization.
          const tag = b.isInternational
            ? `<span class="emp-pill" style="color:var(--accent-bright);border-color:var(--accent)" title="Route to an allied civilization">🤝 ${civNameOf(state, r.toOwnerId ?? to?.ownerId)}</span>`
            : `<span class="emp-pill" title="Route between two of your own cities">🏠 Domestic</span>`;
          // Road-connection line — the ask is to make the infrastructure bonus visible.
          const roadLine =
            b.roadTier > 0
              ? `<div class="emp-sub" style="color:#9cbf72">🛣️ ${workName("road", b.roadTier)} link · +${b.road}🪙</div>`
              : `<div class="emp-sub" style="color:#d98a6a">⚠ No road link, pave every tile of the path to boost this route</div>`;
          const escortLine = r.escortUnitId
            ? `<div class="emp-sub" style="color:#9cbf72">🛡 Escorted${r.escortType ? ` (${r.escortType.replace(/_/g, " ")})` : ""}, visible to all players</div>`
            : `<div class="emp-sub" style="color:#d98a6a">⚠ Unguarded, move a soldier onto the route and choose Escort</div>`;
          const leaveBtn = r.repelledRaidTile
            ? `<button class="btn primary" data-leave-escort="${r.id}" title="Spawn the escort where the raid was stopped">Recall escort</button>`
            : "";
          // Gold breakdown so it's clear how the total is built up.
          const goldParts = [
            `base ${b.base}`,
            b.buildings ? `buildings +${b.buildings}` : "",
            b.road ? `road +${b.road}` : "",
            b.international ? `intl +${b.international}` : "",
            b.overseas ? `sea +${b.overseas}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          const viaNames =
            r.viaCityIds?.map((id) => state.cities.get(id)?.name).filter(Boolean).join(", ") ?? "";
          const viaLine = viaNames
            ? `<div class="emp-sub">↪ via ${viaNames}</div>`
            : "";
          return (
            `<div class="emp-card">` +
            `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">` +
            `<div class="grow"><div class="emp-name">🐫 ${from?.name ?? "?"} → ${to?.name ?? "?"} ${tag}</div>` +
            `<div class="emp-sub">${yieldBits || "no yield"} / turn · ${r.path.length} tiles</div>` +
            viaLine +
            `<div class="emp-sub" style="opacity:.75">${goldParts}</div>` +
            roadLine +
            escortLine +
            (r.repelledRaidTile ? `<div class="emp-sub" style="color:var(--accent-bright)">⚔️ Escort repelled a raid, recall it to disembark at the ambush site.</div>` : "") +
            `</div>` +
            `<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">` +
            leaveBtn +
            `<button class="btn" data-cancel-route="${r.id}" title="Disband this route, the trader is lost">Cancel</button>` +
            `</div></div>`
          );
        })
        .join("")
    );
  }

  function render(state: GameState, viewerId: number): void {
    if (!open) return;
    title.textContent = TITLES[tab];
    withPreservedScroll(body, () => {
      body.innerHTML =
        tab === "cities"
          ? renderCities(state, viewerId)
          : tab === "units"
            ? renderUnits(state, viewerId)
            : tab === "trade"
              ? renderTrade(state, viewerId)
              : renderSpecialists(state, viewerId);
    });

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
    body.querySelectorAll<HTMLButtonElement>("[data-cancel-route]").forEach((el) =>
      el.addEventListener("click", () => {
        void confirmDialog({
          title: "Cancel trade route",
          body: "Cancel this trade route? The trader that opened it is lost.",
          confirmText: "Cancel route",
          danger: true,
        }).then((ok) => {
          if (!ok) return;
          handlers.onCancelTradeRoute(Number(el.dataset.cancelRoute));
          render(state, viewerId);
        });
      }),
    );
    body.querySelectorAll<HTMLButtonElement>("[data-leave-escort]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onLeaveTradeEscort(Number(el.dataset.leaveEscort));
        render(state, viewerId);
      }),
    );
  }

  return {
    toggle(state, viewerId, requestedTab) {
      // Same-screen toggle closes; a different screen switches the open dialog.
      const target = requestedTab ?? tab;
      if (open && target === tab) {
        close();
        return;
      }
      tab = target;
      setOpen(true);
      render(state, viewerId);
    },
    close,
    isOpen: () => open,
    render(state, viewerId) {
      if (open) render(state, viewerId);
    },
  };
}
