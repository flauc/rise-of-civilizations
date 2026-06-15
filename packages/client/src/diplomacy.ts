// Diplomacy UI: the first-contact dialog (two leaders side by side), a Contacts
// screen listing met civs, and a per-civ negotiation view with a deal builder.
// Self-contained like empire.ts; ui.ts only toggles it and re-renders per frame.

import {
  relationBetween,
  attitudeScore,
  attitudeLabel,
  reputationOf,
  tradeableLuxuries,
  citiesOf,
  RESOURCE_DEFS,
  SPECIALIST_DEFS,
  type GameState,
  type DealItem,
} from "@roc/sim";
import { getCiv } from "@roc/data";

/** Unique specialist types present in a player's cities. */
function specialistTypesOf(state: GameState, playerId: number): string[] {
  const set = new Set<string>();
  for (const c of citiesOf(state, playerId)) for (const s of c.specialists) set.add(s.type);
  return [...set];
}
const luxName = (id: string): string => RESOURCE_DEFS[id as keyof typeof RESOURCE_DEFS]?.name ?? id;
const specName = (t: string): string => SPECIALIST_DEFS[t as keyof typeof SPECIALIST_DEFS]?.name ?? t;

export interface DiploHandlers {
  onDeclareWar(targetId: number): void;
  onMakePeace(targetId: number): void;
  onDenounce(targetId: number): void;
  onGift(targetId: number, gold: number): void;
  onDemandTribute(targetId: number, gold: number): void;
  onProposeDeal(targetId: number, give: DealItem[], want: DealItem[]): void;
  onRespondProposal(proposalId: number, accept: boolean): void;
  onAcknowledgeContact(otherId: number): void;
}

const STYLE = `
#diplo-contact{position:fixed;inset:0;z-index:65;background:rgba(6,12,20,.82);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center}
#diplo-contact.show{display:flex}
.dc-box{width:min(760px,94vw);background:#0d1b27;border:1px solid var(--edge);border-radius:14px;overflow:hidden}
.dc-title{text-align:center;font-weight:800;font-size:16px;color:#ffd967;padding:12px;border-bottom:1px solid var(--edge)}
.dc-cards{display:flex;align-items:stretch}
.dc-card{flex:1;padding:18px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.dc-vs{display:flex;align-items:center;justify-content:center;padding:0 6px;color:#9fc0dc;font-weight:700}
.dc-portrait{width:120px;height:138px;object-fit:cover;border-radius:10px;border:1px solid var(--edge);background:#16293c}
.dc-civ{font-weight:800;color:#fff;font-size:17px}
.dc-leader{color:#cfe3f7}
.dc-ability{color:#9fc0dc;font-size:12px;line-height:1.4}
.dc-quote{font-style:italic;color:#e8f4ff;font-size:13px;padding:10px 18px;text-align:center;border-top:1px solid var(--edge)}
.dc-actions{display:flex;gap:10px;justify-content:center;padding:14px;border-top:1px solid var(--edge)}
#diplomacy{position:fixed;top:0;right:0;bottom:0;width:min(440px,94vw);z-index:54;background:#0d1b27;border-left:1px solid var(--edge);box-shadow:-8px 0 24px rgba(0,0,0,.35);display:flex;flex-direction:column;transform:translateX(0);transition:transform .2s ease}
#diplomacy.hidden{transform:translateX(100%);pointer-events:none}
.dp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--edge)}
.dp-title{font-weight:800;font-size:17px;color:#fff;flex:1}
.dp-body{flex:1;overflow:auto;padding:12px 14px}
.dp-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--edge);border-radius:9px;margin-top:7px;cursor:pointer;background:#11202e}
.dp-row:hover{background:#17304470;border-color:#3a5d7c}
.dp-pic{width:38px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--edge);background:#16293c;flex:none}
.dp-rname{font-weight:700;color:#fff}
.dp-sub{color:#9fc0dc;font-size:12px}
.dp-war{color:#e0533d;font-weight:700}
.dp-peace{color:#7ad08a;font-weight:700}
.dp-pill{background:#16293c;border-radius:6px;padding:2px 7px;font-size:12px;white-space:nowrap;margin-left:auto}
.dp-actbtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.dp-deal{margin-top:12px;border-top:1px solid var(--edge);padding-top:10px}
.dp-cols{display:flex;gap:10px}
.dp-col{flex:1;border:1px solid var(--edge);border-radius:8px;padding:8px;background:#11202e}
.dp-col h4{margin:0 0 6px;font-size:12px;color:#9fc0dc;text-transform:uppercase;letter-spacing:.04em}
.dp-col label{display:flex;align-items:center;gap:6px;font-size:12px;margin-top:4px;color:#cfe3f7}
.dp-col input[type=number]{width:70px;background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px;padding:3px 6px}
.dp-prop{display:flex;flex-direction:column;border:1px solid #5a4a66;background:#251c30;border-radius:9px;padding:10px;margin-top:8px}
.dp-result{margin-top:8px;font-size:12px}
`;

export interface Diplomacy {
  render(state: GameState, viewerId: number): void;
  toggleContacts(state: GameState, viewerId: number): void;
  isOpen(): boolean;
}

export function createDiplomacy(handlers: DiploHandlers): Diplomacy {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  // --- first-contact modal ---
  const modal = document.createElement("div");
  modal.id = "diplo-contact";
  document.body.appendChild(modal);
  let showingContact: number | null = null; // otherId currently in the modal

  // --- contacts side panel ---
  const panel = document.createElement("div");
  panel.id = "diplomacy";
  panel.className = "hidden";
  document.body.appendChild(panel);
  let open = false;
  let selected: number | null = null; // civ id in the negotiation view
  let resultMsg = "";

  const portrait = (civId?: string): string => {
    const url = `${import.meta.env.BASE_URL}leaders/${civId}.png`;
    return civId ? url : "";
  };
  const civName = (pid: number, state: GameState): string => {
    const p = state.players.find((x) => x.id === pid);
    return getCiv(p?.civId)?.name ?? p?.name ?? "Unknown";
  };
  const leaderName = (pid: number, state: GameState): string => {
    const p = state.players.find((x) => x.id === pid);
    return getCiv(p?.civId)?.leader ?? "";
  };

  function close(): void {
    open = false;
    panel.classList.add("hidden");
    selected = null;
  }

  // ---- first contact ----
  function showContact(state: GameState, youId: number, otherId: number): void {
    showingContact = otherId;
    const youCiv = getCiv(state.players.find((p) => p.id === youId)?.civId);
    const themCiv = getCiv(state.players.find((p) => p.id === otherId)?.civId);
    const themP = state.players.find((p) => p.id === otherId);
    const att = attitudeLabel(attitudeScore(state, otherId, youId));
    const card = (civId: string | undefined, name: string, leader: string, ability: string) =>
      `<div class="dc-card"><img class="dc-portrait" src="${portrait(civId)}" onerror="this.style.visibility='hidden'"/>` +
      `<div class="dc-civ">${name}</div><div class="dc-leader">${leader}</div>` +
      `<div class="dc-ability">${ability}</div></div>`;
    modal.innerHTML =
      `<div class="dc-box"><div class="dc-title">You have encountered a new civilization</div>` +
      `<div class="dc-cards">` +
      card(youCiv?.id, youCiv?.name ?? "You", youCiv?.leader ?? "", youCiv?.abilityName ? `${youCiv.abilityName}` : "") +
      `<div class="dc-vs">vs</div>` +
      card(themCiv?.id, themCiv?.name ?? themP?.name ?? "Them", themCiv?.leader ?? "", `${themCiv?.abilityName ?? ""} — feeling ${att}`) +
      `</div>` +
      (themCiv?.leaderQuote ? `<div class="dc-quote">“${themCiv.leaderQuote}”</div>` : "") +
      `<div class="dc-actions">` +
      `<button class="btn primary" id="dc-greet">Exchange greetings</button>` +
      `<button class="btn" id="dc-denounce">Denounce</button>` +
      `<button class="btn" id="dc-war">Declare War</button>` +
      `</div></div>`;
    modal.classList.add("show");
    const ack = () => {
      handlers.onAcknowledgeContact(otherId);
      modal.classList.remove("show");
      showingContact = null;
    };
    modal.querySelector<HTMLButtonElement>("#dc-greet")!.addEventListener("click", ack);
    modal.querySelector<HTMLButtonElement>("#dc-denounce")!.addEventListener("click", () => { handlers.onDenounce(otherId); ack(); });
    modal.querySelector<HTMLButtonElement>("#dc-war")!.addEventListener("click", () => { handlers.onDeclareWar(otherId); ack(); });
  }

  function handleContacts(state: GameState, viewerId: number): void {
    if (showingContact !== null) return; // a dialog is up
    for (const e of state.contactQueue) {
      if (e.youId !== viewerId) continue;
      if (e.isPlayerCiv) { handlers.onAcknowledgeContact(e.otherId); continue; } // no modal vs other humans
      showContact(state, viewerId, e.otherId);
      return;
    }
  }

  // ---- contacts panel ----
  function renderContacts(state: GameState, viewerId: number): void {
    const me = state.players.find((p) => p.id === viewerId);
    const met = me?.met ?? [];
    const incoming = state.diploProposals.filter((p) => p.toId === viewerId);

    let body = "";
    if (incoming.length) {
      body += `<div class="dp-sub" style="color:#c79ad6">Proposals</div>`;
      for (const pr of incoming) {
        body +=
          `<div class="dp-prop"><div><b>${civName(pr.fromId, state)}</b> proposes a deal.</div>` +
          `<div class="dp-sub">They give: ${describeItems(pr.give) || "nothing"} · You give: ${describeItems(pr.want) || "nothing"}</div>` +
          `<div class="dp-actbtns"><button class="btn primary" data-accept="${pr.id}">Accept</button>` +
          `<button class="btn" data-reject="${pr.id}">Reject</button></div></div>`;
      }
    }

    if (met.length === 0) {
      body += `<div class="dp-sub" style="margin-top:14px">You have not met any other civilizations yet.</div>`;
    } else if (selected === null) {
      for (const cid of met) {
        const rel = relationBetween(state, viewerId, cid);
        const war = rel?.status === "war";
        const att = attitudeLabel(attitudeScore(state, cid, viewerId));
        body +=
          `<div class="dp-row" data-civ="${cid}">` +
          `<img class="dp-pic" src="${portrait(state.players.find((p) => p.id === cid)?.civId)}" onerror="this.style.visibility='hidden'"/>` +
          `<div style="flex:1;min-width:0"><div class="dp-rname">${civName(cid, state)}</div>` +
          `<div class="dp-sub">${leaderName(cid, state)} · ${att}</div></div>` +
          `<span class="${war ? "dp-war" : "dp-peace"}">${war ? "⚔ War" : "🕊 Peace"}</span></div>`;
      }
    } else {
      body += renderNegotiation(state, viewerId, selected);
    }

    panel.innerHTML =
      `<div class="dp-head">` +
      (selected !== null ? `<button class="btn" id="dp-back">←</button>` : "") +
      `<span class="dp-title">🕊️ Diplomacy</span>` +
      `<button class="btn" id="dp-close">Close</button></div>` +
      `<div class="dp-body">${body}${resultMsg ? `<div class="dp-result" style="color:#ffd967">${resultMsg}</div>` : ""}</div>`;
    wire(state, viewerId);
  }

  function renderNegotiation(state: GameState, viewerId: number, cid: number): string {
    const rel = relationBetween(state, viewerId, cid);
    const war = rel?.status === "war";
    const att = attitudeScore(state, cid, viewerId);
    const rep = reputationOf(state, cid);
    const yourGold = state.players.find((p) => p.id === viewerId)?.gold ?? 0;
    const treaties: string[] = [];
    if (rel?.openBorders) treaties.push("Open Borders");
    if (rel && rel.pact !== "none") treaties.push(rel.pact.replace("_", " "));
    return (
      `<div class="dp-row" style="cursor:default">` +
      `<img class="dp-pic" src="${portrait(state.players.find((p) => p.id === cid)?.civId)}" onerror="this.style.visibility='hidden'"/>` +
      `<div style="flex:1"><div class="dp-rname">${civName(cid, state)}</div>` +
      `<div class="dp-sub">${leaderName(cid, state)} · ${attitudeLabel(att)} (${att >= 0 ? "+" : ""}${att})${rep > 0 ? ` · warmonger ${rep}` : ""}</div></div>` +
      `<span class="${war ? "dp-war" : "dp-peace"}">${war ? "⚔ War" : "🕊 Peace"}</span></div>` +
      (treaties.length ? `<div class="dp-sub" style="margin-top:6px">Treaties: ${treaties.join(", ")}</div>` : "") +
      `<div class="dp-actbtns">` +
      (war
        ? `<button class="btn primary" data-act="peace">Make Peace</button>`
        : `<button class="btn" data-act="war" style="color:#e0907d">Declare War</button>`) +
      `<button class="btn" data-act="denounce">Denounce</button>` +
      `<button class="btn" data-act="gift">Gift 50🪙</button>` +
      `<button class="btn" data-act="demand">Demand 50🪙</button>` +
      `</div>` +
      // deal builder
      ((): string => {
        const myLux = tradeableLuxuries(state, viewerId);
        const theirLux = tradeableLuxuries(state, cid);
        const mySpec = specialistTypesOf(state, viewerId);
        const theirSpec = specialistTypesOf(state, cid);
        const opt = (v: string, label: string) => `<option value="${v}">${label}</option>`;
        const luxSel = (id: string, ids: string[]) =>
          `<select id="${id}" style="background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px">${opt("", "— amenity —")}${ids.map((x) => opt(x, luxName(x))).join("")}</select>`;
        const specSel = (id: string, ids: string[]) =>
          `<select id="${id}" style="background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px">${opt("", "— specialist —")}${ids.map((x) => opt(x, specName(x))).join("")}</select>`;
        return (
          `<div class="dp-deal"><div class="dp-sub" style="color:#c79ad6">Propose a deal</div>` +
          `<div class="dp-cols">` +
          `<div class="dp-col"><h4>You give</h4>` +
          `<label>🪙 <input type="number" id="give-gold" min="0" max="${Math.floor(yourGold)}" value="0"/></label>` +
          (myLux.length ? `<label>🍷 ${luxSel("give-lux", myLux)}</label>` : "") +
          (mySpec.length ? `<label>🛠️ ${specSel("give-spec", mySpec)}</label>` : "") +
          `</div>` +
          `<div class="dp-col"><h4>They give</h4>` +
          `<label>🪙 <input type="number" id="want-gold" min="0" value="0"/></label>` +
          (theirLux.length ? `<label>🍷 ${luxSel("want-lux", theirLux)}</label>` : "") +
          (theirSpec.length ? `<label>🛠️ ${specSel("want-spec", theirSpec)}</label>` : "") +
          `</div>` +
          `</div>` +
          `<label class="dp-sub" style="display:flex;gap:6px;align-items:center;margin-top:6px">Per-turn deals last <input type="number" id="deal-turns" min="5" max="60" value="20" style="width:54px"/> turns</label>`
        );
      })() +
      `<div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">` +
      (war ? `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="deal-peace"/> Peace treaty</label>` : "") +
      `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="deal-ob"/> Open borders</label>` +
      `<label style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">Pact <select id="deal-pact" style="background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px"><option value="">none</option><option value="non_aggression">non-aggression</option><option value="defensive">defensive pact</option><option value="alliance">alliance</option></select> for <input type="number" id="deal-pact-turns" min="5" max="60" value="20" style="width:54px"/> turns</label>` +
      `</div>` +
      `<button class="btn primary" id="deal-propose" style="margin-top:8px;width:100%">Propose</button></div>`
    );
  }

  function describeItems(items: DealItem[]): string {
    return items
      .map((it) => {
        switch (it.kind) {
          case "gold": return `${it.amount}🪙`;
          case "goldPerTurn": return `${it.amount}🪙/turn`;
          case "resource": return `${luxName(it.id)} (${it.turns}t)`;
          case "specialist": return `${specName(it.specialistType)} (${it.turns}t)`;
          case "peace": return "peace";
          case "openBorders": return "open borders";
          case "pact": return it.tier.replace("_", " ");
          case "declareWarOn": return `war on #${it.civId}`;
        }
      })
      .join(", ");
  }

  function wire(state: GameState, viewerId: number): void {
    panel.querySelector<HTMLButtonElement>("#dp-close")?.addEventListener("click", close);
    panel.querySelector<HTMLButtonElement>("#dp-back")?.addEventListener("click", () => { selected = null; resultMsg = ""; renderContacts(state, viewerId); });
    panel.querySelectorAll<HTMLDivElement>("[data-civ]").forEach((el) =>
      el.addEventListener("click", () => { selected = Number(el.dataset.civ); resultMsg = ""; renderContacts(state, viewerId); }),
    );
    panel.querySelectorAll<HTMLButtonElement>("[data-accept]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRespondProposal(Number(el.dataset.accept), true)),
    );
    panel.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRespondProposal(Number(el.dataset.reject), false)),
    );
    const cid = selected;
    if (cid !== null) {
      panel.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((el) =>
        el.addEventListener("click", () => {
          switch (el.dataset.act) {
            case "war": handlers.onDeclareWar(cid); break;
            case "peace": handlers.onMakePeace(cid); break;
            case "denounce": handlers.onDenounce(cid); break;
            case "gift": handlers.onGift(cid, 50); break;
            case "demand": handlers.onDemandTribute(cid, 50); break;
          }
        }),
      );
      panel.querySelector<HTMLButtonElement>("#deal-propose")?.addEventListener("click", () => {
        const num = (id: string) => Math.max(0, Number(panel.querySelector<HTMLInputElement>(`#${id}`)?.value ?? 0));
        const give: DealItem[] = [];
        const want: DealItem[] = [];
        const sel = (id: string) => panel.querySelector<HTMLSelectElement>(`#${id}`)?.value || "";
        const turns = num("deal-turns") || 20;
        const gg = num("give-gold");
        const wg = num("want-gold");
        if (gg > 0) give.push({ kind: "gold", amount: gg });
        if (wg > 0) want.push({ kind: "gold", amount: wg });
        const giveLux = sel("give-lux"); if (giveLux) give.push({ kind: "resource", id: giveLux, turns });
        const wantLux = sel("want-lux"); if (wantLux) want.push({ kind: "resource", id: wantLux, turns });
        const giveSpec = sel("give-spec"); if (giveSpec) give.push({ kind: "specialist", specialistType: giveSpec, turns });
        const wantSpec = sel("want-spec"); if (wantSpec) want.push({ kind: "specialist", specialistType: wantSpec, turns });
        if (panel.querySelector<HTMLInputElement>("#deal-peace")?.checked) give.push({ kind: "peace" });
        if (panel.querySelector<HTMLInputElement>("#deal-ob")?.checked) give.push({ kind: "openBorders" });
        const tier = panel.querySelector<HTMLSelectElement>("#deal-pact")?.value;
        if (tier) give.push({ kind: "pact", tier: tier as "non_aggression" | "defensive" | "alliance", turns: num("deal-pact-turns") || 20 });
        if (give.length === 0 && want.length === 0) { resultMsg = "Add something to the deal first."; renderContacts(state, viewerId); return; }
        handlers.onProposeDeal(cid, give, want);
      });
    }
  }

  return {
    render(state, viewerId) {
      handleContacts(state, viewerId);
      if (open) renderContacts(state, viewerId);
    },
    toggleContacts(state, viewerId) {
      open = !open;
      panel.classList.toggle("hidden", !open);
      if (open) { selected = null; resultMsg = ""; renderContacts(state, viewerId); }
    },
    isOpen: () => open,
  };
}
