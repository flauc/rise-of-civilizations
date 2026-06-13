import {
  availableProduction,
  availablePromotions,
  availableTechs,
  buildableHere,
  citiesOf,
  cityDefenseStrength,
  cityMaxHp,
  foodToGrow,
  getCityYields,
  territorySize,
  BUILDING_DEFS,
  IMPROVEMENT_DEFS,
  PROMOTION_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  UNIT_MAX_HP,
  type City,
  type GameState,
  type ImprovementKind,
  type ProductionItem,
  type PromotionId,
  type TechId,
  type Unit,
} from "@roc/sim";

export interface UIView {
  state: GameState;
  selectedUnit: Unit | null;
  selectedCity: City | null;
}

export interface UIHandlers {
  onEndTurn(): void;
  onFoundCity(): void;
  onBuild(kind: ImprovementKind): void;
  onPromote(promotion: PromotionId): void;
  onSetProduction(item: ProductionItem): void;
  onSetResearch(techId: TechId): void;
  onCloseCity(): void;
}

export interface UI {
  render(view: UIView): void;
  banner(text: string): void;
}

function div(id: string, cls: string): HTMLDivElement {
  const el = document.createElement("div");
  el.id = id;
  el.className = cls;
  document.body.appendChild(el);
  return el;
}

function prodCost(item: ProductionItem): number {
  return item.kind === "unit" ? UNIT_DEFS[item.id].cost : BUILDING_DEFS[item.id].cost;
}

function prodName(item: ProductionItem): string {
  return item.kind === "unit" ? UNIT_DEFS[item.id].name : BUILDING_DEFS[item.id].name;
}

export function createUI(handlers: UIHandlers): UI {
  const topbar = div("topbar", "panel");
  const unitPanel = div("unit-panel", "panel hidden");
  const cityPanel = div("city-panel", "panel hidden");
  const research = div("research", "panel hidden");
  const log = div("log", "");
  const banner = div("banner", "");

  const endturn = document.createElement("button");
  endturn.id = "endturn";
  endturn.className = "btn primary";
  endturn.textContent = "End Turn";
  endturn.addEventListener("click", () => handlers.onEndTurn());
  document.body.appendChild(endturn);

  let researchOpen = false;
  let bannerTimer = 0;

  const renderTopbar = (state: GameState): void => {
    const player = state.players[state.currentPlayerIndex]!;
    const sci = citiesOf(state, player.id).reduce(
      (n, c) => n + getCityYields(state, c).science,
      0,
    );
    const researchingDef = player.researching ? TECH_DEFS[player.researching] : null;
    const researchLabel = researchingDef
      ? `${researchingDef.name} (${Math.floor(player.scienceProgress)}/${researchingDef.cost})`
      : "— none —";
    topbar.innerHTML = `
      <span><b>Turn ${state.turn}</b></span>
      <span><span class="dot" style="background:${player.color}"></span><b>${player.name}</b></span>
      <span>🪙 <b>${Math.floor(player.gold)}</b></span>
      <span>🔬 <b>${researchLabel}</b> <span style="color:#9fc0dc">+${sci}/t</span></span>
      <button class="btn" id="research-btn">Research</button>`;
    topbar
      .querySelector<HTMLButtonElement>("#research-btn")!
      .addEventListener("click", () => {
        researchOpen = !researchOpen;
        renderResearch(state);
      });
  };

  const renderResearch = (state: GameState): void => {
    research.classList.toggle("hidden", !researchOpen);
    if (!researchOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const techs = availableTechs(player);
    research.innerHTML =
      `<div class="row" style="justify-content:space-between"><b>Choose research</b>` +
      `<button class="btn" id="rclose">✕</button></div>` +
      (techs.length === 0
        ? `<div style="margin-top:8px;color:#9fc0dc">All available techs researched.</div>`
        : techs
            .map(
              (t) =>
                `<div class="tech" data-tech="${t}"><span>${TECH_DEFS[t].name}</span><span style="color:#9fc0dc">${TECH_DEFS[t].cost}🔬</span></div>`,
            )
            .join(""));
    research.querySelector<HTMLButtonElement>("#rclose")!.addEventListener("click", () => {
      researchOpen = false;
      research.classList.add("hidden");
    });
    research.querySelectorAll<HTMLDivElement>(".tech").forEach((el) => {
      el.addEventListener("click", () => {
        handlers.onSetResearch(el.dataset.tech as TechId);
        researchOpen = false;
        research.classList.add("hidden");
      });
    });
  };

  const renderUnitPanel = (state: GameState, unit: Unit | null): void => {
    if (!unit) {
      unitPanel.classList.add("hidden");
      return;
    }
    unitPanel.classList.remove("hidden");
    const def = UNIT_DEFS[unit.type];
    const combatant = def.strength > 0 || (def.rangedStrength ?? 0) > 0;

    let html =
      `<div class="row" style="justify-content:space-between"><b>${def.name}</b>` +
      (unit.level > 1 ? `<span style="color:#ffd967">Lv ${unit.level}</span>` : "") +
      `</div>` +
      `<div>Moves <b>${unit.movementLeft}/${def.movement}</b>` +
      (combatant ? ` · HP <b>${unit.hp}/${UNIT_MAX_HP}</b>` : "") +
      `</div>`;
    if (combatant) {
      html +=
        `<div style="color:#9fc0dc">⚔️ ${def.strength}` +
        ((def.rangedStrength ?? 0) > 0 ? ` · 🏹 ${def.rangedStrength} (rng ${def.range})` : "") +
        ` · XP ${unit.xp}</div>`;
    }
    if (unit.promotions.length) {
      html += `<div style="color:#9fc0dc">${unit.promotions.map((p) => PROMOTION_DEFS[p].name).join(", ")}</div>`;
    }

    const actions: string[] = [];
    if (def.founder) actions.push(`<button class="btn primary" id="found">Found City</button>`);
    if (def.builder) {
      html += `<div style="margin-top:4px">Charges <b>${unit.charges}</b></div>`;
      for (const k of buildableHere(state, unit)) {
        actions.push(`<button class="btn" data-build="${k}">Build ${IMPROVEMENT_DEFS[k].name}</button>`);
      }
    }
    if (actions.length) html += `<div class="row" style="margin-top:8px">${actions.join("")}</div>`;

    if (unit.unspentPromotions > 0) {
      html +=
        `<div style="margin-top:8px;color:#ffd967">Promote (${unit.unspentPromotions}):</div>` +
        `<div class="row" style="margin-top:4px">` +
        availablePromotions(unit)
          .map((p) => `<button class="btn" data-promote="${p}" title="${PROMOTION_DEFS[p].desc}">${PROMOTION_DEFS[p].name}</button>`)
          .join("") +
        `</div>`;
    }

    unitPanel.innerHTML = html;
    unitPanel.querySelector<HTMLButtonElement>("#found")?.addEventListener("click", () => handlers.onFoundCity());
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-build]").forEach((el) =>
      el.addEventListener("click", () => handlers.onBuild(el.dataset.build as ImprovementKind)),
    );
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-promote]").forEach((el) =>
      el.addEventListener("click", () => handlers.onPromote(el.dataset.promote as PromotionId)),
    );
  };

  const renderCityPanel = (state: GameState, city: City | null): void => {
    if (!city) {
      cityPanel.classList.add("hidden");
      return;
    }
    cityPanel.classList.remove("hidden");
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const y = getCityYields(state, city);
    const need = foodToGrow(city.population);
    const options = availableProduction(player, city);
    const curName = city.production ? prodName(city.production) : "— nothing —";
    const curCost = city.production ? prodCost(city.production) : 0;
    const prodPct = curCost
      ? Math.min(100, (city.productionStored / curCost) * 100)
      : 0;
    const foodPct = Math.min(100, (city.foodStored / need) * 100);

    cityPanel.innerHTML =
      `<div class="row" style="justify-content:space-between">` +
      `<b>${city.isCapital ? "★ " : ""}${city.name}</b>` +
      `<button class="btn" id="cclose">✕</button></div>` +
      `<div>Pop <b>${city.population}</b> · 🍞${y.food} ⚒️${y.production} 🪙${y.gold} 🔬${y.science}</div>` +
      `<div>🛡️ Def <b>${cityDefenseStrength(state, city)}</b> · ❤️ <b>${Math.max(0, Math.floor(city.hp))}/${cityMaxHp(city)}</b> · ⬣ <b>${territorySize(state, city)}</b></div>` +
      `<div style="margin-top:6px">Growth: ${Math.floor(city.foodStored)}/${need}<div class="bar"><i style="width:${foodPct}%"></i></div></div>` +
      `<div style="margin-top:6px">Building: <b>${curName}</b> ${curCost ? `${Math.floor(city.productionStored)}/${curCost}` : ""}<div class="bar"><i style="width:${prodPct}%"></i></div></div>` +
      `<select id="prod">` +
      `<option value="">— choose production —</option>` +
      options
        .map(
          (o) =>
            `<option value="${o.item.kind}:${o.item.id}">${o.name} (${o.cost}⚒️)</option>`,
        )
        .join("") +
      `</select>` +
      (city.buildings.length
        ? `<div style="margin-top:6px;color:#9fc0dc">Built: ${city.buildings
            .map((b) => BUILDING_DEFS[b].name)
            .join(", ")}</div>`
        : "");

    cityPanel
      .querySelector<HTMLButtonElement>("#cclose")!
      .addEventListener("click", () => handlers.onCloseCity());
    cityPanel.querySelector<HTMLSelectElement>("#prod")!.addEventListener("change", (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (!v) return;
      const [kind, id] = v.split(":");
      handlers.onSetProduction({ kind, id } as ProductionItem);
    });
  };

  const renderLog = (state: GameState): void => {
    log.innerHTML = state.log
      .slice(-4)
      .map((l) => `<div>${l}</div>`)
      .join("");
  };

  return {
    render(view) {
      renderTopbar(view.state);
      renderResearch(view.state);
      renderUnitPanel(view.state, view.selectedUnit);
      renderCityPanel(view.state, view.selectedCity);
      renderLog(view.state);
    },
    banner(text) {
      banner.textContent = text;
      banner.classList.add("show");
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => banner.classList.remove("show"), 1400);
    },
  };
}
