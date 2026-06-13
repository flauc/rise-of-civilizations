import {
  availableCivics,
  availableGovernments,
  availableProduction,
  availablePromotions,
  availableTechs,
  unlockedPolicies,
  getCivic,
  getGovernment,
  getPolicy,
  buildableHere,
  citiesOf,
  cityDefenseStrength,
  cityMaxHp,
  foodToGrow,
  getCiv,
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

export interface CombatOdds {
  targetName: string;
  toDefender: number;
  toAttacker: number;
  vsCity: boolean;
}

export interface Suggestion {
  kind: "units" | "research" | "civic" | "production";
  label: string;
}

export interface UIView {
  state: GameState;
  selectedUnit: Unit | null;
  selectedCity: City | null;
  /** Combat odds for the attack target currently hovered (if any). */
  odds?: CombatOdds | null;
  /** Next suggested action (drives the smart action button). */
  suggestion?: Suggestion | null;
}

export interface UIHandlers {
  onEndTurn(): void;
  onFoundCity(): void;
  onBuild(kind: ImprovementKind): void;
  onPromote(promotion: PromotionId): void;
  onSetProduction(item: ProductionItem): void;
  onSetResearch(techId: TechId): void;
  onSetCivic(civicId: string): void;
  onSetGovernment(governmentId: string): void;
  onTogglePolicy(policyId: string): void;
  onCloseCity(): void;
  onSuggestion(): void;
}

export interface UI {
  render(view: UIView): void;
  banner(text: string): void;
  openResearch(): void;
  openCivics(): void;
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
  const civics = div("civics", "panel hidden");
  const log = div("log", "");
  const banner = div("banner", "");
  const gameover = div("gameover", "hidden");

  const endturn = document.createElement("button");
  endturn.id = "endturn";
  endturn.className = "btn primary";
  document.body.appendChild(endturn);

  const endturn2 = document.createElement("button");
  endturn2.id = "endturn2";
  endturn2.className = "btn";
  endturn2.textContent = "End Turn ⏭";
  endturn2.addEventListener("click", () => handlers.onEndTurn());
  document.body.appendChild(endturn2);

  let researchOpen = false;
  let civicsOpen = false;
  let bannerTimer = 0;
  let lastState: GameState | null = null;

  const renderAction = (view: UIView): void => {
    if (view.suggestion) {
      endturn.textContent = view.suggestion.label;
      endturn.onclick = () => handlers.onSuggestion();
      endturn2.classList.remove("hidden");
    } else {
      endturn.textContent = "End Turn";
      endturn.onclick = () => handlers.onEndTurn();
      endturn2.classList.add("hidden");
    }
  };

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
    const researchPct = researchingDef
      ? Math.min(100, (player.scienceProgress / researchingDef.cost) * 100)
      : 0;
    const cul = citiesOf(state, player.id).reduce((n, c) => n + getCityYields(state, c).culture, 0);
    const civicDef = getCivic(player.researchingCivic ?? undefined);
    const civicLabel = civicDef
      ? `${civicDef.name} (${Math.floor(player.cultureProgress)}/${civicDef.cost})`
      : "— none —";
    const civicPct = civicDef ? Math.min(100, (player.cultureProgress / civicDef.cost) * 100) : 0;
    const gov = getGovernment(player.government);
    const civ = getCiv(player.civId);
    topbar.innerHTML = `
      <span><b>Turn ${state.turn}</b></span>
      <span><span class="dot" style="background:${player.color}"></span><b>${player.name}</b>${
        civ ? ` <span title="${civ.abilityName}: ${civ.abilityDesc}" style="color:#9fc0dc;cursor:help">· ${civ.name} ⓘ</span>` : ""
      }</span>
      <span>🪙 <b>${Math.floor(player.gold)}</b></span>
      <span style="min-width:150px">🔬 <b>${researchLabel}</b> <span style="color:#9fc0dc">+${sci}</span>
        <div class="bar" style="width:140px"><i style="width:${researchPct}%"></i></div></span>
      <span style="min-width:150px">🎭 <b>${civicLabel}</b> <span style="color:#9fc0dc">+${cul}</span>
        <div class="bar" style="width:140px"><i style="width:${civicPct}%;background:#c07ad0"></i></div></span>
      <button class="btn" id="research-btn">Research</button>
      <button class="btn" id="civics-btn" title="${gov?.name ?? "Government"}">🏛️ Civics</button>`;
    topbar.querySelector<HTMLButtonElement>("#research-btn")!.addEventListener("click", () => {
      researchOpen = !researchOpen;
      civicsOpen = false;
      renderResearch(state);
      renderCivics(state);
    });
    topbar.querySelector<HTMLButtonElement>("#civics-btn")!.addEventListener("click", () => {
      civicsOpen = !civicsOpen;
      researchOpen = false;
      renderCivics(state);
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

  const renderCivics = (state: GameState): void => {
    civics.classList.toggle("hidden", !civicsOpen);
    if (!civicsOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const gov = getGovernment(player.government);
    const slots = gov?.slots ?? 0;
    const civicList = availableCivics(player);
    const govList = availableGovernments(player);
    const policyList = unlockedPolicies(player);

    let html =
      `<div class="row" style="justify-content:space-between"><b>Civics & Government</b><button class="btn" id="vclose">✕</button></div>`;

    html += `<div class="csub">Develop a civic</div>`;
    html += civicList.length
      ? civicList
          .map((id) => {
            const d = getCivic(id)!;
            return `<div class="tech" data-civic="${id}"><span>${d.name}</span><span style="color:#9fc0dc">${d.cost}🎭</span></div>`;
          })
          .join("")
      : `<div style="color:#9fc0dc;font-size:12px">No new civics available yet.</div>`;

    html += `<div class="csub">Government — <b style="color:#fff">${gov?.name ?? "—"}</b></div>`;
    html += `<div class="row" style="flex-wrap:wrap">${govList
      .map((id) => {
        const g = getGovernment(id)!;
        const active = id === player.government;
        return `<button class="btn ${active ? "primary" : ""}" data-gov="${id}" title="${g.desc}">${g.name}</button>`;
      })
      .join("")}</div>`;

    html += `<div class="csub">Policies <span style="color:#9fc0dc">(${player.policies.length}/${slots} slots)</span></div>`;
    html += policyList.length
      ? `<div class="row" style="flex-wrap:wrap">${policyList
          .map((id) => {
            const p = getPolicy(id)!;
            const active = player.policies.includes(id);
            return `<button class="btn ${active ? "primary" : ""}" data-policy="${id}" title="${p.desc}">${p.name}</button>`;
          })
          .join("")}</div>`
      : `<div style="color:#9fc0dc;font-size:12px">Unlock policies by developing civics.</div>`;

    civics.innerHTML = html;
    civics.querySelector<HTMLButtonElement>("#vclose")!.addEventListener("click", () => {
      civicsOpen = false;
      civics.classList.add("hidden");
    });
    civics.querySelectorAll<HTMLDivElement>("[data-civic]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onSetCivic(el.dataset.civic!);
        civicsOpen = false;
        civics.classList.add("hidden");
      }),
    );
    civics.querySelectorAll<HTMLButtonElement>("[data-gov]").forEach((el) =>
      el.addEventListener("click", () => handlers.onSetGovernment(el.dataset.gov!)),
    );
    civics.querySelectorAll<HTMLButtonElement>("[data-policy]").forEach((el) =>
      el.addEventListener("click", () => handlers.onTogglePolicy(el.dataset.policy!)),
    );
  };

  const renderUnitPanel = (state: GameState, unit: Unit | null, odds?: CombatOdds | null): void => {
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
    if (odds) {
      html +=
        `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--edge)">` +
        `⚔️ vs <b>${odds.targetName}</b>: deal <b style="color:#5fcf61">${odds.toDefender}</b>` +
        (odds.toAttacker > 0 ? ` · take <b style="color:#e0533d">${odds.toAttacker}</b>` : ` (no retaliation)`) +
        `</div>`;
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

    const surplus = y.food - city.population * 2;
    const surplusStr = surplus >= 0 ? `+${surplus}` : `${surplus}`;

    cityPanel.innerHTML =
      `<div class="row" style="justify-content:space-between">` +
      `<b style="font-size:15px">${city.isCapital ? "★ " : ""}${city.name}</b>` +
      `<button class="btn" id="cclose">✕</button></div>` +
      `<div style="color:#9fc0dc;margin-top:2px">Pop <b style="color:#fff">${city.population}</b> · ` +
      `🛡️ ${cityDefenseStrength(state, city)} · ❤️ ${Math.max(0, Math.floor(city.hp))}/${cityMaxHp(city)} · ⬣ ${territorySize(state, city)}</div>` +
      // yields grid
      `<div class="ygrid">` +
      `<span title="Food (growth)">🍞 <b>${y.food}</b> <span style="color:#9fc0dc">(${surplusStr})</span></span>` +
      `<span title="Production">⚒️ <b>${y.production}</b></span>` +
      `<span title="Gold">🪙 <b>${y.gold}</b></span>` +
      `<span title="Science">🔬 <b>${y.science}</b></span>` +
      `</div>` +
      // citizens
      `<div style="margin-top:6px">👥 Citizens <b>${city.workedTiles.length}/${city.population}</b> assigned ` +
      `<span style="color:#9fc0dc;font-size:11px">— click tiles to reassign</span></div>` +
      // growth
      `<div style="margin-top:6px">Growth ${Math.floor(city.foodStored)}/${need}<div class="bar"><i style="width:${foodPct}%"></i></div></div>` +
      // production
      `<div style="margin-top:6px">Building <b>${curName}</b> ${curCost ? `${Math.floor(city.productionStored)}/${curCost}` : ""}<div class="bar"><i style="width:${prodPct}%"></i></div></div>` +
      `<select id="prod">` +
      `<option value="">— choose production —</option>` +
      options
        .map((o) => `<option value="${o.item.kind}:${o.item.id}">${o.name} (${o.cost}⚒️)</option>`)
        .join("") +
      `</select>` +
      (city.buildings.length
        ? `<div style="margin-top:6px;color:#9fc0dc;font-size:12px">Built: ${city.buildings.map((b) => BUILDING_DEFS[b].name).join(", ")}</div>`
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

  const renderGameOver = (state: GameState): void => {
    if (!state.gameOver) {
      gameover.classList.add("hidden");
      return;
    }
    const viewerId = state.players[state.currentPlayerIndex]?.id;
    const winner = state.players.find((p) => p.id === state.gameOver!.winnerId);
    const won = winner?.id === viewerId;
    gameover.classList.remove("hidden");
    gameover.innerHTML =
      `<div class="title" style="color:${won ? "#ffd967" : "#e0533d"}">${won ? "Victory!" : "Defeat"}</div>` +
      `<div class="sub"><b style="color:${winner?.color}">${winner?.name ?? "Someone"}</b> wins by ${state.gameOver.condition} on turn ${state.turn}.</div>` +
      `<button class="btn primary" id="go-menu" style="font-size:15px;padding:10px 18px">Back to Menu</button>`;
    gameover.querySelector<HTMLButtonElement>("#go-menu")?.addEventListener("click", () => location.reload());
  };

  return {
    render(view) {
      lastState = view.state;
      renderTopbar(view.state);
      renderResearch(view.state);
      renderCivics(view.state);
      renderUnitPanel(view.state, view.selectedUnit, view.odds);
      renderCityPanel(view.state, view.selectedCity);
      renderLog(view.state);
      renderGameOver(view.state);
      renderAction(view);
    },
    openResearch() {
      if (!lastState) return;
      researchOpen = true;
      renderResearch(lastState);
    },
    openCivics() {
      if (!lastState) return;
      civicsOpen = true;
      renderCivics(lastState);
    },
    banner(text) {
      banner.textContent = text;
      banner.classList.add("show");
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => banner.classList.remove("show"), 1400);
    },
  };
}
