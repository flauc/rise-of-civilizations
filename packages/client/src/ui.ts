import { renderTechTreeInto } from "./techtree";
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
  BELIEFS,
  getBelief,
  religionById,
  cityFollowerCount,
  canFoundReligion,
  religionUnlocked,
  civicsUnlocked,
  availableReligionNames,
  CIVICS_REQUIRED_TECH,
  RELIGION_REQUIRED_TECH,
  FAITH_TO_FOUND,
  buildableHere,
  citiesOf,
  cityDefenseStrength,
  cityMaxHp,
  foodToGrow,
  unitMaxHp,
  getCiv,
  getCityYields,
  territorySize,
  BUILDING_DEFS,
  IMPROVEMENT_DEFS,
  PROMOTION_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  buildingInfo,
  techUnlocks,
  unitInfo,
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
  kind: "units" | "research" | "civic" | "religion" | "production";
  label: string;
}

export interface UIView {
  state: GameState;
  selectedUnit: Unit | null;
  selectedCity: City | null;
  /** The player this client is rendering for. */
  viewerId: number;
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
  onFoundReligion(cityId: number, name: string, beliefs: string[]): void;
  onCloseCity(): void;
  onSuggestion(): void;
}

export interface UI {
  render(view: UIView): void;
  banner(text: string): void;
  openResearch(): void;
  openCivics(): void;
  openReligion(): void;
  openTechTree(): void;
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
  const techtree = div("techtree", "panel hidden");
  const civics = div("civics", "panel hidden");
  const religionPanel = div("religion", "panel hidden");
  const production = div("production", "panel hidden");
  const log = div("log", "");
  const banner = div("banner", "");
  const gameover = div("gameover", "hidden");
  const villageOverlay = div("village-overlay", "");
  const villageDialog = div("village-dialog", "");
  villageDialog.innerHTML =
    `<div class="village-title">🏘️ Village Discovered</div>` +
    `<div class="village-msg" id="village-msg"></div>` +
    `<button class="btn primary" id="village-ok">OK</button>`;
  const villageMsg = villageDialog.querySelector<HTMLDivElement>("#village-msg")!;
  const villageOk = villageDialog.querySelector<HTMLButtonElement>("#village-ok")!;

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
  let techtreeOpen = false;
  let civicsOpen = false;
  let religionOpen = false;
  let productionOpen = false;
  let prodCityId: number | null = null;
  let chosenBeliefs: string[] = [];
  let bannerTimer = 0;
  let lastState: GameState | null = null;
  let lastLogLength = 0;
  let logInitialized = false;
  let villageQueue: string[] = [];

  const showVillageDialog = (msg: string): void => {
    villageMsg.textContent = msg;
    villageOverlay.classList.add("show");
    villageDialog.classList.add("show");
  };

  const closeVillageDialog = (): void => {
    villageOverlay.classList.remove("show");
    villageDialog.classList.remove("show");
    villageQueue.shift();
    if (villageQueue.length > 0) {
      window.setTimeout(() => showVillageDialog(villageQueue[0]!), 150);
    }
  };

  villageOk.addEventListener("click", closeVillageDialog);
  villageOverlay.addEventListener("click", closeVillageDialog);

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
    const civicPct = civicDef ? Math.min(100, (player.cultureProgress / civicDef.cost) * 100) : 0;
    const gov = getGovernment(player.government);
    const civ = getCiv(player.civId);
    const rName = researchingDef ? researchingDef.name : "Choose…";
    const cName = civicDef ? civicDef.name : "Choose…";
    const civTitle = civ ? `${civ.name} — ${civ.abilityName}: ${civ.abilityDesc}` : "";

    topbar.innerHTML = `
      <div class="tb-grp">
        <span class="tb-turn">⏱ ${state.turn}</span>
        <span class="tb-civ" title="${civTitle}"><span class="dot" style="background:${player.color}"></span>${player.name}${civ ? ` · <b>${civ.name}</b>` : ""}</span>
      </div>
      <div class="tb-grp tb-res">
        <span class="chip" title="Gold">🪙 ${Math.floor(player.gold)}</span>
        <span class="chip" title="Science / turn">🔬 +${sci}</span>
        <span class="chip" title="Culture / turn">🎭 +${cul}</span>
        <span class="chip" title="Faith stored">☮️ ${Math.floor(player.faith)}</span>
      </div>
      <div class="tb-grp">
        <button class="tb-pill" id="research-btn" title="Research" style="--p:${researchPct}%">
          <span class="tb-pl">🔬</span><b>${rName}</b></button>
        <button class="tb-pill civic" id="civics-btn" title="${gov?.name ?? "Government"}" style="--p:${civicPct}%">
          <span class="tb-pl">🏛️</span><b>${cName}</b></button>
        <button class="tb-pill" id="religion-btn" title="Religion">
          <span class="tb-pl">☮️</span><b>Faith</b></button>
      </div>`;
    topbar.querySelector<HTMLButtonElement>("#research-btn")!.addEventListener("click", () => {
      researchOpen = !researchOpen;
      civicsOpen = false;
      renderResearch(state);
      renderCivics(state);
    });
    topbar.querySelector<HTMLButtonElement>("#civics-btn")!.addEventListener("click", () => {
      civicsOpen = !civicsOpen;
      researchOpen = false;
      religionOpen = false;
      renderCivics(state);
      renderResearch(state);
      renderReligion(state);
    });
    topbar.querySelector<HTMLButtonElement>("#religion-btn")!.addEventListener("click", () => {
      religionOpen = !religionOpen;
      researchOpen = false;
      civicsOpen = false;
      renderReligion(state);
      renderResearch(state);
      renderCivics(state);
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
      `<button class="btn" id="open-techtree" style="width:100%;margin:6px 0">🌳 View Full Tech Tree</button>` +
      (techs.length === 0
        ? `<div style="margin-top:8px;color:#9fc0dc">All available techs researched.</div>`
        : techs
            .map((t) => {
              const u = techUnlocks(t);
              return (
                `<div class="tech" data-tech="${t}"><div style="flex:1">` +
                `<div><b>${TECH_DEFS[t].name}</b></div>` +
                (u.length ? `<div class="sub">Unlocks: ${u.join(", ")}</div>` : "") +
                `</div><span class="cost">${TECH_DEFS[t].cost}🔬</span></div>`
              );
            })
            .join(""));
    research.querySelector<HTMLButtonElement>("#rclose")!.addEventListener("click", () => {
      researchOpen = false;
      research.classList.add("hidden");
    });
    research.querySelector<HTMLButtonElement>("#open-techtree")!.addEventListener("click", () => {
      researchOpen = false;
      research.classList.add("hidden");
      techtreeOpen = true;
      renderTechTree(state);
    });
    research.querySelectorAll<HTMLDivElement>(".tech").forEach((el) => {
      el.addEventListener("click", () => {
        handlers.onSetResearch(el.dataset.tech as TechId);
        researchOpen = false;
        research.classList.add("hidden");
      });
    });
  };

  const renderTechTree = (state: GameState): void => {
    techtree.classList.toggle("hidden", !techtreeOpen);
    if (!techtreeOpen) return;
    const viewerId = state.players[state.currentPlayerIndex]!.id;
    const inner = document.createElement("div");
    renderTechTreeInto(inner, state, viewerId, (techId) => {
      handlers.onSetResearch(techId);
      techtreeOpen = false;
      techtree.classList.add("hidden");
    });
    techtree.innerHTML = `<div class="row" style="justify-content:space-between"><b>Technology Tree</b><button class="btn" id="ttclose">✕</button></div>`;
    techtree.appendChild(inner);
    techtree.querySelector<HTMLButtonElement>("#ttclose")!.addEventListener("click", () => {
      techtreeOpen = false;
      techtree.classList.add("hidden");
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

    if (!civicsUnlocked(player)) {
      html +=
        `<div class="locked-note">🔒 Civics unlock after researching <b>${TECH_DEFS[CIVICS_REQUIRED_TECH].name}</b>.</div>`;
      civics.innerHTML = html;
      civics.querySelector<HTMLButtonElement>("#vclose")!.addEventListener("click", () => {
        civicsOpen = false;
        civics.classList.add("hidden");
      });
      return;
    }

    html += `<div class="csub">Develop a civic</div>`;
    html += civicList.length
      ? civicList
          .map((id) => {
            const d = getCivic(id)!;
            const unlocks: string[] = [];
            if (d.unlocksGovernment) unlocks.push(`Gov: ${getGovernment(d.unlocksGovernment)?.name}`);
            if (d.unlocksPolicy) unlocks.push(`Policy: ${getPolicy(d.unlocksPolicy)?.name}`);
            return (
              `<div class="tech" data-civic="${id}"><div style="flex:1">` +
              `<div><b>${d.name}</b></div>` +
              (unlocks.length ? `<div class="sub">${unlocks.join(" · ")}</div>` : "") +
              `</div><span class="cost">${d.cost}🎭</span></div>`
            );
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

  const renderProduction = (state: GameState): void => {
    production.classList.toggle("hidden", !productionOpen);
    if (!productionOpen) return;
    const city = prodCityId != null ? state.cities.get(prodCityId) : null;
    if (!city) {
      productionOpen = false;
      production.classList.add("hidden");
      return;
    }
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const options = availableProduction(player, city);
    const perTurn = Math.max(1, getCityYields(state, city).production);
    const turns = (cost: number) => Math.max(1, Math.ceil((cost - city.productionStored) / perTurn));

    let html = `<div class="row" style="justify-content:space-between"><b>${city.name} — Choose Production</b><button class="btn" id="pclose">✕</button></div>`;
    html += options
      .map((o) => {
        let glyph: string;
        let desc: string;
        if (o.item.kind === "unit") {
          glyph = UNIT_DEFS[o.item.id].glyph;
          const i = unitInfo(o.item.id);
          desc = `${i.role} — ${i.stats}${i.note ? ` · ${i.note}` : ""}`;
        } else {
          glyph = "🏛";
          desc = buildingInfo(o.item.id);
        }
        return (
          `<div class="pcard" data-kind="${o.item.kind}" data-id="${o.item.id}">` +
          `<span class="pglyph">${glyph}</span>` +
          `<div style="flex:1"><div><b>${o.name}</b> <span class="sub">· ${turns(o.cost)} turns</span></div>` +
          `<div class="sub">${desc}</div></div>` +
          `<span class="cost">${o.cost}⚒️</span></div>`
        );
      })
      .join("");
    production.innerHTML = html;
    production.querySelector<HTMLButtonElement>("#pclose")!.addEventListener("click", () => {
      productionOpen = false;
      production.classList.add("hidden");
    });
    production.querySelectorAll<HTMLDivElement>(".pcard").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onSetProduction({ kind: el.dataset.kind, id: el.dataset.id } as ProductionItem);
        productionOpen = false;
        production.classList.add("hidden");
      }),
    );
  };

  const renderReligion = (state: GameState): void => {
    religionPanel.classList.toggle("hidden", !religionOpen);
    if (!religionOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const totalCities = state.cities.size;
    let html = `<div class="row" style="justify-content:space-between"><b>Religion</b><button class="btn" id="relclose">✕</button></div>`;
    const myRel = religionById(state, player.foundedReligionId);

    if (!myRel && !religionUnlocked(state, player.id)) {
      html += `<div class="locked-note">🔒 Religion unlocks after researching <b>${TECH_DEFS[RELIGION_REQUIRED_TECH].name}</b>. Then build Shrines/Temples to earn faith.</div>`;
      if (state.religions.length) {
        html += `<div class="csub">World religions</div>` + state.religions.map((r) => `<div class="sub">${r.name} — ${cityFollowerCount(state, r.id)} cities</div>`).join("");
      }
      religionPanel.innerHTML = html;
      religionPanel.querySelector<HTMLButtonElement>("#relclose")!.addEventListener("click", () => {
        religionOpen = false;
        religionPanel.classList.add("hidden");
      });
      return;
    }

    if (myRel) {
      const holy = state.cities.get(myRel.holyCityId);
      html += `<div style="margin-top:4px"><b style="font-size:15px">☮️ ${myRel.name}</b></div>`;
      html += `<div class="sub">Holy city: ${holy?.name ?? "—"} · Following <b style="color:#fff">${cityFollowerCount(state, myRel.id)}/${totalCities}</b> cities</div>`;
      html += `<div class="csub">Beliefs</div>`;
      html += myRel.beliefs.length
        ? myRel.beliefs.map((b) => `<div class="sub">• <b style="color:#fff">${getBelief(b)?.name}</b> — ${getBelief(b)?.desc}</div>`).join("")
        : `<div class="sub">No beliefs chosen.</div>`;
    } else if (canFoundReligion(state, player.id)) {
      const holy = [...state.cities.values()].find((c) => c.ownerId === player.id);
      const names = availableReligionNames(state);
      html += `<div class="csub">Found a Religion</div>`;
      html += `<div class="sub">Holy city: <b style="color:#fff">${holy?.name}</b></div>`;
      html += `<div style="margin-top:6px">Name <select id="rel-name" class="lobby-in" style="width:100%">${names.map((n) => `<option>${n}</option>`).join("")}</select></div>`;
      html += `<div class="csub">Choose up to 2 beliefs (${chosenBeliefs.length}/2)</div>`;
      html += BELIEFS.map((b) => {
        const on = chosenBeliefs.includes(b.id);
        return `<div class="tech" data-belief="${b.id}" style="${on ? "border-color:#ffd967;background:#27331d" : ""}"><div style="flex:1"><b>${b.name}</b><div class="sub">${b.desc}</div></div>${on ? "✓" : ""}</div>`;
      }).join("");
      html += `<button class="btn primary" id="found-rel" style="width:100%;margin-top:8px">Found Religion ☮️</button>`;
    } else {
      const pct = Math.min(100, (player.faith / FAITH_TO_FOUND) * 100);
      const allFounded = state.religions.length >= state.players.filter((p) => !p.isBarbarian).length;
      html += `<div class="csub">Faith</div>`;
      html += `<div>${Math.floor(player.faith)}/${FAITH_TO_FOUND} to found a religion<div class="bar"><i style="width:${pct}%;background:#7ad0a0"></i></div></div>`;
      html += `<div class="sub" style="margin-top:6px">Build Shrines and Temples to generate faith.${allFounded ? " All religions have been founded." : ""}</div>`;
    }

    if (state.religions.length) {
      html += `<div class="csub">World religions</div>`;
      html += state.religions.map((r) => `<div class="sub">${r.name} — ${cityFollowerCount(state, r.id)} cities</div>`).join("");
    }

    religionPanel.innerHTML = html;
    religionPanel.querySelector<HTMLButtonElement>("#relclose")!.addEventListener("click", () => {
      religionOpen = false;
      religionPanel.classList.add("hidden");
    });
    religionPanel.querySelectorAll<HTMLDivElement>("[data-belief]").forEach((el) =>
      el.addEventListener("click", () => {
        const id = el.dataset.belief!;
        const i = chosenBeliefs.indexOf(id);
        if (i >= 0) chosenBeliefs.splice(i, 1);
        else if (chosenBeliefs.length < 2) chosenBeliefs.push(id);
        renderReligion(state);
      }),
    );
    religionPanel.querySelector<HTMLButtonElement>("#found-rel")?.addEventListener("click", () => {
      const holy = [...state.cities.values()].find((c) => c.ownerId === player.id);
      if (!holy) return;
      const name = religionPanel.querySelector<HTMLSelectElement>("#rel-name")?.value ?? "";
      handlers.onFoundReligion(holy.id, name, [...chosenBeliefs]);
      chosenBeliefs = [];
      religionOpen = false;
      religionPanel.classList.add("hidden");
    });
  };

  const renderUnitPanel = (state: GameState, unit: Unit | null, viewerId: number, odds?: CombatOdds | null): void => {
    if (!unit) {
      unitPanel.classList.add("hidden");
      return;
    }
    unitPanel.classList.remove("hidden");
    const def = UNIT_DEFS[unit.type];
    const combatant = def.strength > 0 || (def.rangedStrength ?? 0) > 0;
    const own = unit.ownerId === viewerId;
    const owner = state.players.find((p) => p.id === unit.ownerId);

    const info = unitInfo(unit.type);
    let html =
      `<div class="row" style="justify-content:space-between"><b style="font-size:15px">${def.name}</b>` +
      (unit.level > 1 ? `<span style="color:#ffd967">Lv ${unit.level}</span>` : "") +
      `</div>` +
      (owner && !own
        ? `<div class="sub"><span class="dot" style="background:${owner.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>${owner.name}</div>`
        : "") +
      `<div class="sub">${info.role}${info.note ? ` · ${info.note}` : ""}</div>` +
      `<div style="margin-top:2px">Moves <b>${unit.movementLeft}/${def.movement}</b>` +
      (combatant ? ` · HP <b>${unit.hp}/${unitMaxHp(unit)}</b>` : "") +
      `</div>`;
    if (combatant) {
      const levelMult = 1 + 0.05 * (unit.level - 1);
      html +=
        `<div style="color:#9fc0dc">⚔️ ${Math.floor(def.strength * levelMult)}` +
        ((def.rangedStrength ?? 0) > 0 ? ` · 🏹 ${Math.floor((def.rangedStrength ?? 0) * levelMult)} (rng ${def.range})` : "") +
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

    if (own) {
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
      `🛡️ ${cityDefenseStrength(state, city)} · ❤️ ${Math.max(0, Math.floor(city.hp))}/${cityMaxHp(city)} · ⬣ ${territorySize(state, city)}` +
      (city.religion ? ` · ☮️ ${religionById(state, city.religion)?.name ?? ""}` : "") +
      `</div>` +
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
      `<button class="btn primary" id="open-prod" style="width:100%;margin-top:6px">Choose Production ▸ <span style="color:#cfe3f7;font-weight:400">(${options.length})</span></button>` +
      (city.buildings.length
        ? `<div style="margin-top:6px;color:#9fc0dc;font-size:12px">Built: ${city.buildings.map((b) => BUILDING_DEFS[b].name).join(", ")}</div>`
        : "");

    cityPanel
      .querySelector<HTMLButtonElement>("#cclose")!
      .addEventListener("click", () => handlers.onCloseCity());
    cityPanel.querySelector<HTMLButtonElement>("#open-prod")!.addEventListener("click", () => {
      prodCityId = city.id;
      productionOpen = true;
      renderProduction(state);
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
      renderTechTree(view.state);
      renderCivics(view.state);
      renderReligion(view.state);
      renderProduction(view.state);
      renderUnitPanel(view.state, view.selectedUnit, view.viewerId, view.odds);
      renderCityPanel(view.state, view.selectedCity);
      renderLog(view.state);
      renderGameOver(view.state);
      renderAction(view);

      // Show a modal dialog for newly discovered village rewards.
      if (!logInitialized) {
        lastLogLength = view.state.log.length;
        logInitialized = true;
      } else if (view.state.log.length > lastLogLength) {
        const newEntries = view.state.log.slice(lastLogLength);
        const villageEntries = newEntries.filter((m) => /village|trap|ambushed/i.test(m));
        if (villageEntries.length > 0) {
          const wasEmpty = villageQueue.length === 0;
          villageQueue.push(...villageEntries);
          if (wasEmpty && !villageDialog.classList.contains("show")) {
            showVillageDialog(villageQueue[0]!);
          }
        }
        lastLogLength = view.state.log.length;
      }
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
    openReligion() {
      if (!lastState) return;
      religionOpen = true;
      renderReligion(lastState);
    },
    openTechTree() {
      if (!lastState) return;
      techtreeOpen = true;
      renderTechTree(lastState);
    },
    banner(text) {
      banner.textContent = text;
      banner.classList.add("show");
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => banner.classList.remove("show"), 1400);
    },
  };
}
