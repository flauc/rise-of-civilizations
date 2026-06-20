// Diplomacy UI: the first-contact dialog (two leaders side by side), a Contacts
// screen listing met civs, and a per-civ negotiation view with a deal builder,
// proposal inbox/outbox, active agreements, and a full trade history.
// Self-contained like empire.ts; ui.ts only toggles it and re-renders per frame.
// Re-renders are signature-gated so the deal builder's inputs survive frames.

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
  type Proposal,
  type Relation,
  type TradeRecord,
} from "@roc/sim";
import { getCiv, getPersonality, personalityLabel } from "@roc/data";

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
  /** Initiator confirms (true) an accepted deal, or dismisses/withdraws (false). */
  onFinalizeDeal(proposalId: number, confirm: boolean): void;
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
#diplomacy{position:fixed;top:0;right:0;bottom:0;width:min(460px,96vw);z-index:54;background:#0d1b27;border-left:1px solid var(--edge);box-shadow:-8px 0 24px rgba(0,0,0,.35);display:flex;flex-direction:column;transform:translateX(0);transition:transform .2s ease}
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
.dp-pill{background:#16293c;border-radius:6px;padding:2px 7px;font-size:12px;white-space:nowrap}
.dp-tag{display:inline-block;background:#1b3146;border:1px solid var(--edge);border-radius:20px;padding:1px 9px;font-size:11px;color:#cfe3f7;margin-left:auto}
.dp-badge{background:#5a3d6e;color:#f0e0ff;border-radius:10px;padding:0 7px;font-size:11px;font-weight:700;margin-left:6px}
.dp-sec{margin-top:14px}
.dp-sec h4{margin:0 0 6px;font-size:11px;color:#9fc0dc;text-transform:uppercase;letter-spacing:.05em}
.dp-actbtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.dp-actbtns input[type=number]{width:64px;background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px;padding:3px 6px}
.dp-mod{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;border-bottom:1px dashed #1c3144}
.dp-mod .v.pos{color:#7ad08a}
.dp-mod .v.neg{color:#e0907d}
.dp-deal{margin-top:8px;border:1px solid var(--edge);border-radius:10px;padding:10px;background:#0f1d2a}
.dp-cols{display:flex;gap:10px}
.dp-col{flex:1;border:1px solid var(--edge);border-radius:8px;padding:8px;background:#11202e}
.dp-col h5{margin:0 0 6px;font-size:11px;color:#9fc0dc;text-transform:uppercase;letter-spacing:.04em}
.dp-col label{display:flex;align-items:center;gap:6px;font-size:12px;margin-top:4px;color:#cfe3f7}
.dp-col input[type=number]{width:70px;background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px;padding:3px 6px}
.dp-col select{background:#14283b;color:#eaf3fb;border:1px solid var(--edge);border-radius:6px;max-width:100%}
.dp-summary{margin-top:8px;padding:8px 10px;border-radius:8px;background:#10283a;border:1px solid #234763;font-size:12.5px;color:#eaf3fb;line-height:1.5}
.dp-summary b{color:#ffd967}
.dp-prop{border:1px solid #4a5a6e;background:#14222f;border-radius:9px;padding:10px;margin-top:8px}
.dp-prop.in{border-color:#5a4a66;background:#251c30}
.dp-prop.ok{border-color:#2f6b46;background:#142a1f}
.dp-prop.no{border-color:#6b3030;background:#2a1717}
.dp-prop .exch{font-size:12.5px;color:#eaf3fb;margin:4px 0;line-height:1.5}
.dp-reason{font-size:12px;color:#cfe3f7;font-style:italic;margin-top:4px}
.dp-agree{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:5px 0;border-bottom:1px dashed #1c3144;color:#dceaf5}
.dp-agree .end{color:#9fc0dc;font-size:11px;white-space:nowrap}
.dp-hist{font-size:12px;color:#cfe3f7;padding:4px 0;border-bottom:1px dashed #15283a;display:flex;gap:8px}
.dp-hist .t{color:#7f9bb3;flex:none;width:46px}
.dp-empty{color:#7f9bb3;font-size:12px;font-style:italic;margin-top:6px}
`;

export interface Diplomacy {
  render(state: GameState, viewerId: number): void;
  toggleContacts(state: GameState, viewerId: number): void;
  close(): void;
  isOpen(): boolean;
}

/** Icon + label for a single deal item. */
function describeItem(it: DealItem): string {
  switch (it.kind) {
    case "gold": return `${it.amount}🪙`;
    case "goldPerTurn": return `${it.amount}🪙/turn ×${it.turns}t`;
    case "resource": return `🍷 ${luxName(it.id)}${it.turns ? ` (${it.turns}t)` : ""}`;
    case "specialist": return `🛠️ ${specName(it.specialistType)} (${it.turns}t)`;
    case "peace": return "🕊 Peace treaty";
    case "openBorders": return "🚪 Open borders";
    case "pact": return `🤝 ${it.tier.replace("_", " ")} (${it.turns}t)`;
    case "declareWarOn": return `⚔ War on #${it.civId}`;
  }
}
function describeItems(items: DealItem[]): string {
  return items.length ? items.map(describeItem).join(", ") : "nothing";
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
  let lastSig = ""; // re-render only when meaningful state changes

  const portrait = (civId?: string): string =>
    civId ? `${import.meta.env.BASE_URL}leaders/${civId}.png` : "";
  const civOf = (pid: number, state: GameState) =>
    getCiv(state.players.find((x) => x.id === pid)?.civId);
  const civName = (pid: number, state: GameState): string => {
    const p = state.players.find((x) => x.id === pid);
    return getCiv(p?.civId)?.name ?? p?.name ?? "Unknown";
  };
  const leaderName = (pid: number, state: GameState): string =>
    getCiv(state.players.find((x) => x.id === pid)?.civId)?.leader ?? "";
  const personalityOf = (pid: number, state: GameState) =>
    getPersonality(state.players.find((x) => x.id === pid)?.civId);

  function close(): void {
    open = false;
    panel.classList.add("hidden");
    selected = null;
  }

  // ---- first contact ----
  function showContact(state: GameState, youId: number, otherId: number): void {
    showingContact = otherId;
    const youCiv = civOf(youId, state);
    const themCiv = civOf(otherId, state);
    const themP = state.players.find((p) => p.id === otherId);
    const att = attitudeLabel(attitudeScore(state, otherId, youId));
    const card = (civId: string | undefined, name: string, leader: string, ability: string) =>
      `<div class="dc-card"><img class="dc-portrait" src="${portrait(civId)}" onerror="this.style.visibility='hidden'"/>` +
      `<div class="dc-civ">${name}</div><div class="dc-leader">${leader}</div>` +
      `<div class="dc-ability">${ability}</div></div>`;
    modal.innerHTML =
      `<div class="dc-box"><div class="dc-title">You have encountered a new civilization</div>` +
      `<div class="dc-cards">` +
      card(youCiv?.id, youCiv?.name ?? "You", youCiv?.leader ?? "", youCiv?.abilityName ?? "") +
      `<div class="dc-vs">vs</div>` +
      card(themCiv?.id, themCiv?.name ?? themP?.name ?? "Them", themCiv?.leader ?? "",
        `${themCiv?.abilityName ?? ""} — feeling ${att}`) +
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

  // ---- signature: forces a re-render only when content actually changes ----
  function signature(state: GameState, viewerId: number): string {
    const me = state.players.find((p) => p.id === viewerId);
    const props = state.diploProposals
      .map((p) => `${p.id}:${p.status}:${p.fromId}>${p.toId}`)
      .join(",");
    const rels = state.relations
      .map((r) => `${r.a}-${r.b}:${r.status}:${r.openBorders ? 1 : 0}:${r.pact}:${r.deals.length}`)
      .join(",");
    const att = (me?.met ?? []).map((c) => `${c}=${attitudeScore(state, c, viewerId)}`).join(",");
    return [open ? 1 : 0, selected ?? -1, state.turn, state.tradeHistory.length, props, rels, att, resultMsg].join("|");
  }

  // ---- contacts panel ----
  function renderContacts(state: GameState, viewerId: number): void {
    const me = state.players.find((p) => p.id === viewerId);
    const met = me?.met ?? [];
    // Proposals addressed TO the viewer that still need a response (the inbox badge).
    const inboxCount = state.diploProposals.filter((p) => p.toId === viewerId && p.status === "pending").length;

    let body = "";
    if (met.length === 0) {
      body += `<div class="dp-empty" style="margin-top:14px">You have not met any other civilizations yet. Explore to make contact.</div>`;
    } else if (selected === null) {
      if (inboxCount > 0) {
        body += `<div class="dp-sub" style="color:#c79ad6;margin-bottom:2px">📨 ${inboxCount} proposal${inboxCount > 1 ? "s" : ""} awaiting your response.</div>`;
      }
      for (const cid of met) {
        const rel = relationBetween(state, viewerId, cid);
        const war = rel?.status === "war";
        const att = attitudeLabel(attitudeScore(state, cid, viewerId));
        const pending = state.diploProposals.filter(
          (p) => (p.fromId === cid || p.toId === cid) &&
            ((p.toId === viewerId && p.status === "pending") || (p.fromId === viewerId && p.status === "accepted")),
        ).length;
        const treaties: string[] = [];
        if (rel?.openBorders) treaties.push("Open borders");
        if (rel && rel.pact !== "none") treaties.push(rel.pact.replace("_", " "));
        body +=
          `<div class="dp-row" data-civ="${cid}">` +
          `<img class="dp-pic" src="${portrait(civOf(cid, state)?.id)}" onerror="this.style.visibility='hidden'"/>` +
          `<div style="flex:1;min-width:0"><div class="dp-rname">${civName(cid, state)}` +
          (pending ? `<span class="dp-badge">${pending}❗</span>` : "") + `</div>` +
          `<div class="dp-sub">${leaderName(cid, state)} · ${att}${treaties.length ? ` · ${treaties.join(", ")}` : ""}</div></div>` +
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
      `<div class="dp-body">${body}${resultMsg ? `<div class="dp-empty" style="color:#ffd967">${resultMsg}</div>` : ""}</div>`;
    wire(state, viewerId);
  }

  function renderProposals(state: GameState, viewerId: number, cid: number): string {
    const involved = state.diploProposals.filter(
      (p) => (p.fromId === viewerId && p.toId === cid) || (p.fromId === cid && p.toId === viewerId),
    );
    if (involved.length === 0) return "";
    const cards = involved.map((p) => proposalCard(state, viewerId, p)).join("");
    return `<div class="dp-sec"><h4>Pending business</h4>${cards}</div>`;
  }

  function proposalCard(state: GameState, viewerId: number, p: Proposal): string {
    const incoming = p.toId === viewerId; // they proposed to us
    const exch = incoming
      // From our perspective: they give p.give, we give p.want.
      ? `<div class="exch">They give: <b>${describeItems(p.give)}</b><br/>You give: <b>${describeItems(p.want)}</b></div>`
      : `<div class="exch">You give: <b>${describeItems(p.give)}</b><br/>They give: <b>${describeItems(p.want)}</b></div>`;
    const reason = p.reason ? `<div class="dp-reason">“${p.reason}”</div>` : "";

    if (incoming && p.status === "pending") {
      const title = p.coercive ? "⚠ They demand tribute" : "📨 They propose a deal";
      return `<div class="dp-prop in"><b>${title}</b>${exch}` +
        `<div class="dp-actbtns"><button class="btn primary" data-accept="${p.id}">Accept</button>` +
        `<button class="btn" data-reject="${p.id}">Decline</button></div></div>`;
    }
    // Outgoing (we proposed).
    if (p.status === "pending") {
      return `<div class="dp-prop"><b>⏳ Awaiting their response</b>${exch}` +
        `<div class="dp-actbtns"><button class="btn" data-withdraw="${p.id}">Withdraw</button></div></div>`;
    }
    if (p.status === "accepted") {
      return `<div class="dp-prop ok"><b>✓ They accepted${p.coercive ? " your demand" : ""}</b>${exch}${reason}` +
        `<div class="dp-actbtns"><button class="btn primary" data-finalize="${p.id}">Finalize deal</button>` +
        `<button class="btn" data-cancel="${p.id}">Cancel</button></div></div>`;
    }
    // declined
    return `<div class="dp-prop no"><b>✗ They declined${p.coercive ? " your demand" : ""}</b>${exch}${reason}` +
      `<div class="dp-actbtns"><button class="btn" data-cancel="${p.id}">Dismiss</button></div></div>`;
  }

  function renderAgreements(state: GameState, rel: Relation | undefined): string {
    if (!rel) return "";
    const rows: string[] = [];
    const ends = (until?: number) =>
      until === undefined ? "" : `<span class="end">ends turn ${until} (${Math.max(0, until - state.turn)} left)</span>`;
    if (rel.openBorders) rows.push(`<div class="dp-agree"><span>🚪 Open borders</span><span class="end">indefinite</span></div>`);
    if (rel.pact !== "none") rows.push(`<div class="dp-agree"><span>🤝 ${rel.pact.replace("_", " ")}</span>${ends(rel.pactUntilTurn)}</div>`);
    for (const d of rel.deals) {
      const dir = d.fromId === rel.a ? `#${rel.a}→#${rel.b}` : `#${rel.b}→#${rel.a}`;
      rows.push(`<div class="dp-agree"><span>${describeItem(d.item)} <span class="dp-sub">(${dir})</span></span>${ends(d.untilTurn)}</div>`);
    }
    if (rows.length === 0) return "";
    return `<div class="dp-sec"><h4>Active agreements</h4>${rows.join("")}</div>`;
  }

  function renderHistory(state: GameState, viewerId: number, cid: number): string {
    const recs = state.tradeHistory
      .filter((t) => (t.fromId === viewerId && t.toId === cid) || (t.fromId === cid && t.toId === viewerId))
      .slice(-12)
      .reverse();
    if (recs.length === 0) return `<div class="dp-sec"><h4>History</h4><div class="dp-empty">No dealings yet.</div></div>`;
    const rows = recs.map((r: TradeRecord) => `<div class="dp-hist"><span class="t">T${r.turn}</span><span>${r.note}</span></div>`).join("");
    return `<div class="dp-sec"><h4>History</h4>${rows}</div>`;
  }

  function renderAttitude(state: GameState, viewerId: number, cid: number): string {
    const at = state.attitudes.find((x) => x.from === cid && x.to === viewerId);
    const mods = (at?.modifiers ?? []).filter((m) => m.value !== 0);
    if (mods.length === 0) return `<div class="dp-sec"><h4>Their opinion of you</h4><div class="dp-empty">No strong feelings either way.</div></div>`;
    const rows = mods
      .sort((a, b) => b.value - a.value)
      .map((m) => `<div class="dp-mod"><span>${m.reason}</span><span class="v ${m.value >= 0 ? "pos" : "neg"}">${m.value >= 0 ? "+" : ""}${m.value}</span></div>`)
      .join("");
    return `<div class="dp-sec"><h4>Their opinion of you</h4>${rows}</div>`;
  }

  function renderNegotiation(state: GameState, viewerId: number, cid: number): string {
    const rel = relationBetween(state, viewerId, cid);
    const war = rel?.status === "war";
    const att = attitudeScore(state, cid, viewerId);
    const rep = reputationOf(state, cid);
    const pers = personalityLabel(personalityOf(cid, state));
    const yourGold = Math.floor(state.players.find((p) => p.id === viewerId)?.gold ?? 0);

    const header =
      `<div class="dp-row" style="cursor:default">` +
      `<img class="dp-pic" src="${portrait(civOf(cid, state)?.id)}" onerror="this.style.visibility='hidden'"/>` +
      `<div style="flex:1"><div class="dp-rname">${civName(cid, state)}</div>` +
      `<div class="dp-sub">${leaderName(cid, state)} · ${pers}</div>` +
      `<div class="dp-sub">${attitudeLabel(att)} (${att >= 0 ? "+" : ""}${att})${rep > 0 ? ` · ⚠ warmonger ${rep}` : ""}</div></div>` +
      `<span class="${war ? "dp-war" : "dp-peace"}">${war ? "⚔ War" : "🕊 Peace"}</span></div>`;

    const quickActions =
      `<div class="dp-actbtns">` +
      (war
        ? `<button class="btn primary" data-act="peace">🕊 Make Peace</button>`
        : `<button class="btn" data-act="war" style="color:#e0907d">⚔ Declare War</button>`) +
      `<button class="btn" data-act="denounce">📢 Denounce</button>` +
      `</div>` +
      `<div class="dp-actbtns">` +
      `<label class="dp-sub">🎁 Gift <input type="number" id="gift-amt" min="0" max="${yourGold}" value="50"/>🪙</label>` +
      `<button class="btn" data-act="gift">Send gift</button>` +
      `</div>` +
      `<div class="dp-actbtns">` +
      `<label class="dp-sub">⚔ Demand <input type="number" id="demand-amt" min="0" value="50"/>🪙</label>` +
      `<button class="btn" data-act="demand">Demand tribute</button>` +
      `</div>`;

    return (
      header +
      renderProposals(state, viewerId, cid) +
      `<div class="dp-sec"><h4>Actions</h4>${quickActions}</div>` +
      dealBuilder(state, viewerId, cid, war, yourGold, rel) +
      renderAgreements(state, rel) +
      renderAttitude(state, viewerId, cid) +
      renderHistory(state, viewerId, cid)
    );
  }

  function dealBuilder(state: GameState, viewerId: number, cid: number, war: boolean, yourGold: number, rel: Relation | undefined): string {
    const myLux = tradeableLuxuries(state, viewerId);
    const theirLux = tradeableLuxuries(state, cid);
    const mySpec = specialistTypesOf(state, viewerId);
    const theirSpec = specialistTypesOf(state, cid);
    const opt = (v: string, label: string) => `<option value="${v}">${label}</option>`;
    const luxSel = (id: string, ids: string[]) =>
      `<select id="${id}">${opt("", "— amenity —")}${ids.map((x) => opt(x, luxName(x))).join("")}</select>`;
    const specSel = (id: string, ids: string[]) =>
      `<select id="${id}">${opt("", "— specialist —")}${ids.map((x) => opt(x, specName(x))).join("")}</select>`;
    // Hide concessions already in force (open borders / a pact of equal-or-higher tier).
    const rank: Record<string, number> = { none: 0, non_aggression: 1, defensive: 2, alliance: 3 };
    const curPact = rank[rel?.pact ?? "none"] ?? 0;
    const pactOpts: [string, string][] = [["non_aggression", "non-aggression"], ["defensive", "defensive pact"], ["alliance", "alliance"]];
    const availPacts = pactOpts.filter(([v]) => (rank[v] ?? 0) > curPact);
    return (
      `<div class="dp-sec"><h4>Propose a deal</h4><div class="dp-deal">` +
      `<div class="dp-cols">` +
      `<div class="dp-col"><h5>You give</h5>` +
      `<label>🪙 <input type="number" id="give-gold" min="0" max="${yourGold}" value="0"/></label>` +
      (myLux.length ? `<label>🍷 ${luxSel("give-lux", myLux)}</label>` : "") +
      (mySpec.length ? `<label>🛠️ ${specSel("give-spec", mySpec)}</label>` : "") +
      (war ? `<label><input type="checkbox" id="deal-peace"/> 🕊 Peace</label>` : "") +
      (rel?.openBorders ? "" : `<label><input type="checkbox" id="deal-ob"/> 🚪 Open borders</label>`) +
      `</div>` +
      `<div class="dp-col"><h5>They give</h5>` +
      `<label>🪙 <input type="number" id="want-gold" min="0" value="0"/></label>` +
      (theirLux.length ? `<label>🍷 ${luxSel("want-lux", theirLux)}</label>` : "") +
      (theirSpec.length ? `<label>🛠️ ${specSel("want-spec", theirSpec)}</label>` : "") +
      `</div>` +
      `</div>` +
      `<label class="dp-sub" style="display:flex;gap:6px;align-items:center;margin-top:6px">Timed items last <input type="number" id="deal-turns" min="5" max="60" value="20" style="width:54px"/> turns</label>` +
      (availPacts.length
        ? `<label class="dp-sub" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">🤝 Pact <select id="deal-pact"><option value="">none</option>${availPacts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select> for <input type="number" id="deal-pact-turns" min="5" max="60" value="20" style="width:54px"/> turns</label>`
        : "") +
      `<div class="dp-summary" id="deal-summary">Add items to build an offer.</div>` +
      `<button class="btn primary" id="deal-propose" style="margin-top:8px;width:100%">Propose deal</button>` +
      `</div></div>`
    );
  }

  /** Read the deal-builder inputs into give/want arrays. */
  function readDeal(): { give: DealItem[]; want: DealItem[] } {
    const num = (id: string) => Math.max(0, Number(panel.querySelector<HTMLInputElement>(`#${id}`)?.value ?? 0));
    const sel = (id: string) => panel.querySelector<HTMLSelectElement>(`#${id}`)?.value || "";
    const chk = (id: string) => panel.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false;
    const turns = num("deal-turns") || 20;
    const give: DealItem[] = [];
    const want: DealItem[] = [];
    const gg = num("give-gold"); if (gg > 0) give.push({ kind: "gold", amount: gg });
    const wg = num("want-gold"); if (wg > 0) want.push({ kind: "gold", amount: wg });
    const gl = sel("give-lux"); if (gl) give.push({ kind: "resource", id: gl, turns });
    const wl = sel("want-lux"); if (wl) want.push({ kind: "resource", id: wl, turns });
    const gs = sel("give-spec"); if (gs) give.push({ kind: "specialist", specialistType: gs, turns });
    const ws = sel("want-spec"); if (ws) want.push({ kind: "specialist", specialistType: ws, turns });
    if (chk("deal-peace")) give.push({ kind: "peace" });
    if (chk("deal-ob")) give.push({ kind: "openBorders" });
    const tier = sel("deal-pact");
    if (tier) give.push({ kind: "pact", tier: tier as "non_aggression" | "defensive" | "alliance", turns: num("deal-pact-turns") || 20 });
    return { give, want };
  }

  function updateSummary(): void {
    const el = panel.querySelector<HTMLDivElement>("#deal-summary");
    if (!el) return;
    const { give, want } = readDeal();
    if (give.length === 0 && want.length === 0) { el.textContent = "Add items to build an offer."; return; }
    el.innerHTML = `You give <b>${describeItems(give)}</b><br/>They give <b>${describeItems(want)}</b>`;
  }

  function wire(state: GameState, viewerId: number): void {
    panel.querySelector<HTMLButtonElement>("#dp-close")?.addEventListener("click", close);
    panel.querySelector<HTMLButtonElement>("#dp-back")?.addEventListener("click", () => { selected = null; resultMsg = ""; forceRender(state, viewerId); });
    panel.querySelectorAll<HTMLDivElement>("[data-civ]").forEach((el) =>
      el.addEventListener("click", () => { selected = Number(el.dataset.civ); resultMsg = ""; forceRender(state, viewerId); }),
    );
    // Proposal inbox/outbox actions.
    panel.querySelectorAll<HTMLButtonElement>("[data-accept]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRespondProposal(Number(el.dataset.accept), true)));
    panel.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRespondProposal(Number(el.dataset.reject), false)));
    panel.querySelectorAll<HTMLButtonElement>("[data-finalize]").forEach((el) =>
      el.addEventListener("click", () => handlers.onFinalizeDeal(Number(el.dataset.finalize), true)));
    panel.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((el) =>
      el.addEventListener("click", () => handlers.onFinalizeDeal(Number(el.dataset.cancel), false)));
    panel.querySelectorAll<HTMLButtonElement>("[data-withdraw]").forEach((el) =>
      el.addEventListener("click", () => handlers.onFinalizeDeal(Number(el.dataset.withdraw), false)));

    const cid = selected;
    if (cid !== null) {
      panel.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((el) =>
        el.addEventListener("click", () => {
          switch (el.dataset.act) {
            case "war": handlers.onDeclareWar(cid); break;
            case "peace": handlers.onMakePeace(cid); break;
            case "denounce": handlers.onDenounce(cid); break;
            case "gift": handlers.onGift(cid, Math.max(0, Number(panel.querySelector<HTMLInputElement>("#gift-amt")?.value ?? 0))); break;
            case "demand": handlers.onDemandTribute(cid, Math.max(0, Number(panel.querySelector<HTMLInputElement>("#demand-amt")?.value ?? 0))); break;
          }
        }),
      );
      // Live exchange summary as the builder changes.
      panel.querySelectorAll<HTMLElement>(".dp-deal input, .dp-deal select").forEach((el) =>
        el.addEventListener("input", updateSummary));
      updateSummary();
      panel.querySelector<HTMLButtonElement>("#deal-propose")?.addEventListener("click", () => {
        const { give, want } = readDeal();
        if (give.length === 0 && want.length === 0) { resultMsg = "Add something to the deal first."; forceRender(state, viewerId); return; }
        handlers.onProposeDeal(cid, give, want);
      });
    }
  }

  /** Force an immediate re-render (used after user navigation). */
  function forceRender(state: GameState, viewerId: number): void {
    lastSig = signature(state, viewerId);
    renderContacts(state, viewerId);
  }

  return {
    render(state, viewerId) {
      handleContacts(state, viewerId);
      if (!open) return;
      const sig = signature(state, viewerId);
      if (sig === lastSig) return; // keep deal-builder inputs intact between frames
      lastSig = sig;
      renderContacts(state, viewerId);
    },
    toggleContacts(state, viewerId) {
      open = !open;
      panel.classList.toggle("hidden", !open);
      if (open) { selected = null; resultMsg = ""; forceRender(state, viewerId); }
    },
    close,
    isOpen: () => open,
  };
}
