// Diplomacy UI (parchment/gold themed to match the rest of the game). A first-
// contact dialog (two leaders side by side), a Contacts screen listing met civs,
// and a per-civ negotiation view: a relationship card above two tabs —
//  • Overview: live offers, standing actions (war/denounce/gift/demand tribute),
//    active agreements, and an opinion/history drawer;
//  • Make a deal: the composer — treaty terms as toggle chips (open borders,
//    exchange maps, pact tiers; or a Make-Peace button while at war) plus two
//    trays ("You give" / "You receive") you add any items to (gold, luxuries,
//    specialists, tech, cities, units), all under one live accept/refuse verdict
//    and a single Propose button, so any mix goes over as one offer.
// The offer under construction lives in JS state (dealTreaties/dealGive/dealWant),
// so it survives the per-frame, signature-gated re-renders.
// Self-contained like empire.ts; ui.ts only toggles it and re-renders per frame.
// Re-renders are signature-gated so the deal builder's inputs survive frames.

import { ASSET_BASE_URL } from "./asset-base";
import { bindDialogClose } from "./dialog-close";
import { gameHud } from "./hud-root";
import { withPreservedScroll } from "./panel-scroll";
import {
  relationBetween,
  attitudeScore,
  attitudeLabel,
  reputationOf,
  previewProposal,
  previewPeace,
  canDeclareWar,
  tradeableLuxuries,
  tradeableTechs,
  citiesOf,
  unitsOf,
  RESOURCE_DEFS,
  SPECIALIST_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  type GameState,
  type DealItem,
  type TechId,
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
  /** End a standing shared-vision (exchanged-maps) agreement with a civ. */
  onCancelSharedVision(targetId: number): void;
  onRespondProposal(proposalId: number, accept: boolean): void;
  /** Initiator confirms (true) an accepted deal, or dismisses/withdraws (false). */
  onFinalizeDeal(proposalId: number, confirm: boolean): void;
  onAcknowledgeContact(otherId: number): void;
}

const STYLE = `
#diplo-contact,#diplo-proposal{position:fixed;inset:0;z-index:65;background:rgba(10,9,6,.78);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;padding:var(--dialog-top) 16px 16px;pointer-events:none}
#diplo-contact .dc-box,#diplo-proposal .dc-box{max-height:var(--dialog-max-h);overflow-y:auto}
/* Centered on touch screens, like every dialog (a % --dialog-top can't drive
   padding: padding percentages resolve against width). */
html.roc-phone-shell #diplo-contact,
html.roc-phone-shell #diplo-proposal{align-items:center;padding:16px}
#diplo-proposal{z-index:66}
#diplo-contact.show,#diplo-proposal.show{display:flex;pointer-events:auto}
.dpm-body{display:flex;gap:16px;padding:18px;align-items:flex-start}
.dpm-portrait{width:96px;height:112px;object-fit:cover;border-radius:10px;border:1px solid var(--edge);background:var(--bg-card);flex:none}
.dpm-info{flex:1;min-width:0}
.dpm-civ{font-family:'Cinzel',Georgia,serif;font-weight:700;color:var(--accent-bright);font-size:18px}
.dpm-leader{color:var(--parchment);margin-bottom:2px}
.dpm-att{color:var(--parchment-dim);font-size:12px}
.dpm-exch{font-size:13px;color:var(--parchment);margin-top:10px;line-height:1.6;padding:9px 11px;background:rgba(0,0,0,.25);border:1px solid var(--edge);border-radius:8px}
.dpm-exch b{color:var(--accent-bright)}
.dpm-reason{font-size:12.5px;color:var(--parchment-dim);font-style:italic;margin-top:8px}
.dc-box{width:min(760px,96vw);background:var(--bg-elevated);border:1px solid var(--edge);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dc-title{text-align:center;padding:14px;border-bottom:1px solid var(--edge)}
.dc-cards{display:flex;align-items:stretch}
.dc-card{flex:1;padding:18px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;border-top:3px solid var(--dc-civ-color,#666)}
.dc-vs{display:flex;align-items:center;justify-content:center;padding:0 6px;color:var(--parchment-dim);font-weight:700}
.dc-portrait{width:120px;height:138px;object-fit:cover;border-radius:10px;border:1px solid var(--edge);background:var(--bg-card)}
.dc-civ{font-family:'Cinzel',Georgia,serif;font-weight:700;color:var(--parchment);font-size:17px}
.dc-leader{color:var(--parchment-dim)}
.dc-ability{color:var(--parchment-dim);font-size:12px;line-height:1.4}
.dc-quote{font-style:italic;color:var(--parchment);font-size:13px;padding:12px 18px;text-align:center;border-top:1px solid var(--edge)}
.dc-actions{display:flex;gap:10px;justify-content:center;padding:14px;border-top:1px solid var(--edge)}
#diplomacy{position:fixed;left:50%;top:var(--dialog-top);transform:var(--dialog-transform);width:min(560px,calc(100vw - 32px));max-height:min(80vh,var(--dialog-max-h));background:var(--panel);border:1px solid var(--edge);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;overflow:hidden;opacity:1;pointer-events:auto;transition:opacity .2s}
#diplomacy.hidden{opacity:0;pointer-events:none}
/* Title and ✕ come from the shared .dialog-title / .dialog-x rules in index.html.
   The head is unpositioned so the ✕ pins to the dialog corner itself; the head
   just reserves the gutter beside it. */
.dp-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-right:var(--dialog-x-gutter);min-height:var(--dialog-x-size)}
.dp-head .btn#dp-back{min-width:44px;min-height:44px;padding:0 12px;flex-shrink:0;touch-action:manipulation}
.dp-title{flex:1}
.dp-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden}
/* contacts list rows */
.dp-row{display:flex;align-items:center;gap:11px;padding:11px 12px;border:1px solid var(--edge);border-radius:11px;margin-top:8px;cursor:pointer;background:var(--bg-card)}
.dp-row:hover{background:rgba(201,162,39,.10);border-color:var(--accent)}
.dp-swatch{width:14px;height:14px;border-radius:4px;flex-shrink:0;border:1px solid rgba(255,255,255,.25)}
.dp-pic{width:40px;height:46px;object-fit:cover;border-radius:7px;border:1px solid var(--edge);background:var(--bg-card);flex:none}
.dp-rname{font-weight:700;color:var(--parchment)}
.dp-sub{color:var(--parchment-dim);font-size:12px}
.dp-war{color:#d98a5c;font-weight:700}
.dp-peace{color:#9cbf72;font-weight:700}
.dp-badge{background:var(--accent);color:#15120c;border-radius:10px;padding:0 7px;font-size:11px;font-weight:800;margin-left:6px}
.dp-sec{margin-top:16px}
.dp-sec h4{font-family:'Cinzel',Georgia,serif;margin:0 0 8px;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.08em}
/* tabs */
.dp-tabs{display:flex;gap:4px;padding:4px;background:var(--bg-card);border:1px solid var(--edge);border-radius:11px;margin:14px 0 4px}
.dp-tab{flex:1;text-align:center;padding:10px 8px;border-radius:8px;font:inherit;font-weight:700;font-size:13px;color:var(--parchment-dim);cursor:pointer;background:transparent;border:none;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background .15s ease,color .15s ease}
.dp-tab:hover{color:var(--parchment)}
.dp-tab.on{background:linear-gradient(135deg,var(--accent),#a6821f);color:#15120c}
.dp-tab .dp-badge{margin-left:0}
/* relationship header card */
.dp-card{display:flex;gap:12px;padding:13px;border:1px solid var(--edge);border-radius:12px;background:var(--bg-card);border-left-width:3px}
.dp-card .dp-pic{width:56px;height:66px;border-radius:8px}
.dp-card-info{flex:1;min-width:0}
.dp-card-name{font-family:'Cinzel',Georgia,serif;font-weight:700;color:var(--parchment);font-size:16px;display:flex;align-items:center;gap:6px}
.dp-meter{position:relative;height:8px;border-radius:6px;margin:9px 0 5px;background:linear-gradient(90deg,#8a2c2c 0%,#c9a227 50%,#4a6e46 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
.dp-meter-mark{position:absolute;top:-3px;width:4px;height:14px;border-radius:3px;background:var(--parchment);box-shadow:0 0 4px rgba(0,0,0,.7);transform:translateX(-2px)}
.dp-meter-val{font-size:12px;color:var(--parchment);display:flex;justify-content:space-between}
.dp-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
.dp-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;border-radius:20px;padding:3px 10px;border:1px solid var(--edge);background:rgba(0,0,0,.2);color:var(--parchment-dim);white-space:nowrap}
.dp-chip.war{background:rgba(138,44,44,.25);border-color:#8a4a3a;color:#e0a893}
.dp-chip.peace{background:rgba(74,110,70,.25);border-color:#5c7f4f;color:#bcd8a3}
.dp-chip.warn{background:rgba(201,162,39,.15);border-color:#7a5a1f;color:var(--accent-bright)}
.dp-chip.treaty{background:rgba(201,162,39,.10);border-color:var(--edge);color:var(--parchment)}
/* standing actions */
.dp-actbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.dp-actbtns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.dp-actbtns label{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--parchment)}
.dp-actbtns input[type=number]{width:78px;background:#16130d;color:var(--parchment);border:1px solid var(--edge);border-radius:7px;padding:8px 9px}
.dp-mod{display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px dashed rgba(201,162,39,.14);color:var(--parchment)}
.dp-mod .v.pos{color:#9cbf72}
.dp-mod .v.neg{color:#d98a6a}
/* deal composer */
.dp-builder-toggle{width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;min-height:44px}
.dp-deal-lbl{font-size:11px;color:var(--parchment-dim);text-transform:uppercase;letter-spacing:.06em;margin:2px 0 7px}
.dp-chips-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
.dp-chip-toggle{font:inherit;font-size:12.5px;font-weight:700;color:var(--parchment);background:var(--bg-card);border:1px solid var(--edge);border-radius:20px;padding:8px 14px;cursor:pointer;min-height:40px;display:inline-flex;align-items:center;gap:5px;transition:background .15s ease,border-color .15s ease,color .15s ease}
.dp-chip-toggle:hover{border-color:var(--accent);background:rgba(201,162,39,.10)}
.dp-chip-toggle.on{background:rgba(74,110,70,.35);border-color:#6f9e5f;color:#d3e8bd}
.dp-chip-toggle.on::before{content:"";display:inline-block;width:11px;height:11px;margin-right:3px;vertical-align:-1px;background:url(${ASSET_BASE_URL}icons/ic_check.png) center/contain no-repeat}
/* the give / receive trays */
.dp-tray{border:1px solid var(--edge);border-radius:11px;padding:11px;background:var(--bg-card);margin-bottom:10px}
.dp-tray h5{font-family:'Cinzel',Georgia,serif;margin:0 0 8px;font-size:12px;color:var(--accent);letter-spacing:.03em;display:flex;align-items:center;gap:6px}
.dp-tray-items{display:flex;flex-direction:column;gap:6px;margin-bottom:9px}
.dp-item{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--parchment);background:rgba(0,0,0,.22);border:1px solid var(--edge);border-radius:8px;padding:7px 10px}
.dp-item .lbl{flex:1;min-width:0}
.dp-item input[type=number]{width:72px;background:#16130d;color:var(--parchment);border:1px solid var(--edge);border-radius:6px;padding:6px 8px}
.dp-item .rm{flex:none;width:28px;height:28px;border-radius:6px;border:1px solid var(--edge);background:transparent;color:var(--parchment-dim);cursor:pointer;font-size:14px;line-height:1}
.dp-item .rm:hover{border-color:#8a4a3a;color:#e0a893;background:rgba(138,44,44,.18)}
.dp-tray-empty{font-size:12px;color:var(--parchment-dim);font-style:italic;margin-bottom:9px}
.dp-add{width:100%;background:#16130d;color:var(--parchment);border:1px dashed var(--edge);border-radius:8px;padding:9px;min-height:42px;cursor:pointer}
.dp-add:hover{border-color:var(--accent)}
.dp-turns{display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--parchment-dim);margin:2px 0 4px}
.dp-turns input[type=number]{width:58px;background:#16130d;color:var(--parchment);border:1px solid var(--edge);border-radius:6px;padding:7px 8px}
.dp-hint{font-size:11.5px;color:var(--accent-bright);opacity:.85;margin-top:8px}
/* up-front verdict */
.dp-verdict{margin-top:12px;font-size:12.5px;font-weight:700;border-radius:9px;padding:10px 11px;line-height:1.45}
.dp-verdict.yes{background:rgba(74,110,70,.25);border:1px solid #5c7f4f;color:#c3dcaa}
.dp-verdict.no{background:rgba(138,44,44,.22);border:1px solid #8a4a3a;color:#e6ac9a}
.dp-verdict.neutral{background:rgba(201,162,39,.07);border:1px solid var(--edge);color:var(--parchment-dim);font-weight:400}
.dp-verdict i{opacity:.85;font-weight:400}
.dp-verdict .sum{display:block;margin-top:6px;font-size:11.5px;color:var(--parchment);font-style:normal;font-weight:400;opacity:.92}
.dp-verdict-inline{font-size:11px;font-weight:700;white-space:nowrap}
.dp-verdict-inline.yes{color:#9cbf72}
.dp-verdict-inline.no{color:#d98a6a}
/* offer cards */
.dp-prop{border:1px solid var(--edge);background:var(--bg-card);border-radius:10px;padding:11px;margin-top:9px}
.dp-prop.in{border-color:var(--accent);box-shadow:0 0 0 1px rgba(201,162,39,.25)}
.dp-prop.ok{border-color:#5c7f4f;background:rgba(74,110,70,.15)}
.dp-prop .exch{font-size:12.5px;color:var(--parchment);margin:4px 0;line-height:1.5}
.dp-prop b{color:var(--accent-bright)}
.dp-prop .dp-actbtns{margin-top:9px}
.dp-resolved{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--parchment-dim);background:rgba(0,0,0,.22);border:1px solid var(--edge);border-radius:8px;padding:8px 10px;margin-top:8px}
.dp-resolved .x{margin-left:auto;cursor:pointer;color:var(--parchment-dim);border:1px solid var(--edge);border-radius:6px;padding:3px 9px}
.dp-resolved .x:hover{background:rgba(201,162,39,.10);color:var(--parchment)}
.dp-reason{font-size:12px;color:var(--parchment-dim);font-style:italic;margin-top:4px}
.dp-agree{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;padding:7px 0;border-bottom:1px dashed rgba(201,162,39,.14);color:var(--parchment)}
.dp-agree .end{color:var(--parchment-dim);font-size:11px;white-space:nowrap}
.dp-hist{font-size:12px;color:var(--parchment);padding:5px 0;border-bottom:1px dashed rgba(201,162,39,.10);display:flex;gap:8px}
.dp-hist .t{color:var(--parchment-dim);flex:none;width:46px}
.dp-empty{color:var(--parchment-dim);font-size:12px;font-style:italic;margin-top:6px}
.dp-cta{margin-top:12px;width:100%;min-height:46px}
/* mobile */
@media (max-width:560px){
  #diplomacy{padding:14px 14px}
  .dp-actbar .btn,.dp-actbtns .btn{padding:11px 14px;min-height:44px}
  .dp-actbtns label{flex:1 1 100%}
  .dp-row{padding:12px}
  .dc-cards{flex-direction:column}
  .dc-vs{padding:4px}
  .dc-actions{flex-wrap:wrap}
  .dc-actions .btn{flex:1 1 40%;min-height:44px}
}
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
    case "sharedVision": return "🗺 Shared vision";
    case "pact": return `🤝 ${it.tier.replace("_", " ")} (${it.turns}t)`;
    case "declareWarOn": return `⚔ War on #${it.civId}`;
    case "tech": return `🔬 ${TECH_DEFS[it.techId as TechId]?.name ?? it.techId}`;
    case "city": return `🏙 City #${it.cityId}`;
    case "unit": return it.turns > 0 ? `🪖 Unit #${it.unitId} (loan ${it.turns}t)` : `🪖 Unit #${it.unitId}`;
  }
}
function describeItems(items: DealItem[]): string {
  return items.length ? items.map(describeItem).join(", ") : "nothing";
}

// ---- one-tap treaties ----------------------------------------------------
// Peace, open borders, shared vision and the three pact tiers are mutual, fully
// determined offers — no builder inputs needed. Each is surfaced as its own
// button with an up-front accept/refuse verdict, keyed by these ids.
const PACT_TURNS = 25;
const TREATY_RANK: Record<string, number> = { none: 0, non_aggression: 1, defensive: 2, alliance: 3 };
type TreatyKey = "peace" | "openBorders" | "sharedVision" | "non_aggression" | "defensive" | "alliance";
const TREATY_META: Record<TreatyKey, { icon: string; label: string }> = {
  peace: { icon: "🕊", label: "Make peace" },
  openBorders: { icon: "🚪", label: "Open borders" },
  sharedVision: { icon: "🗺", label: "Exchange maps (shared vision)" },
  non_aggression: { icon: "🤝", label: "Non-aggression pact" },
  defensive: { icon: "🛡", label: "Defensive pact" },
  alliance: { icon: "⚔", label: "Alliance" },
};

/** The give/want pair for a treaty button (all mutual except peace). */
function treatyDeal(key: TreatyKey): { give: DealItem[]; want: DealItem[] } {
  if (key === "peace") return { give: [{ kind: "peace" }], want: [] };
  if (key === "openBorders") return { give: [{ kind: "openBorders" }], want: [{ kind: "openBorders" }] };
  if (key === "sharedVision") return { give: [{ kind: "sharedVision" }], want: [{ kind: "sharedVision" }] };
  const pact: DealItem = { kind: "pact", tier: key, turns: PACT_TURNS };
  return { give: [pact], want: [{ ...pact }] };
}

export function createDiplomacy(handlers: DiploHandlers): Diplomacy {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  // --- first-contact modal ---
  const modal = document.createElement("div");
  modal.id = "diplo-contact";
  gameHud().appendChild(modal);
  let showingContact: number | null = null; // otherId currently in the modal

  // --- incoming-proposal modal (pops the instant another civ proposes to us) ---
  const propModal = document.createElement("div");
  propModal.id = "diplo-proposal";
  gameHud().appendChild(propModal);
  let showingProposal: number | null = null; // proposal id currently in the modal
  const seenProposals = new Set<number>(); // proposals we've already surfaced

  // --- contacts dialog ---
  const panel = document.createElement("div");
  panel.id = "diplomacy";
  panel.className = "roc-dialog hidden";
  panel.innerHTML =
    `<div class="dp-head" id="dp-head"></div>` +
    `<button type="button" class="dialog-x" id="dp-close" title="Close" aria-label="Close"></button>` +
    `<div class="dp-body" id="dp-body"></div>`;
  gameHud().appendChild(panel);
  const dpHead = panel.querySelector<HTMLDivElement>("#dp-head")!;
  const dpBody = panel.querySelector<HTMLDivElement>("#dp-body")!;
  let open = false;
  let selected: number | null = null; // civ id in the negotiation view
  let tab: "overview" | "deal" = "overview"; // negotiation sub-tab
  let detailsOpen = false; // opinion + history expanded?
  // The offer under construction, held in JS (not the DOM) so it survives the
  // per-frame re-renders. Treaty terms are mutual; give/want are material items.
  let dealTreaties = new Set<TreatyKey>();
  let dealGive: DealItem[] = [];
  let dealWant: DealItem[] = [];
  let resultMsg = "";
  let lastSig = ""; // re-render only when meaningful state changes

  function resetComposer(): void {
    dealTreaties.clear();
    dealGive = [];
    dealWant = [];
  }

  const portrait = (civId?: string): string =>
    civId ? `${ASSET_BASE_URL}leaders/${civId}.png` : "";
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
  const playerColor = (pid: number, state: GameState): string =>
    state.players.find((x) => x.id === pid)?.color ?? "#888888";

  function setPanelOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    panel.classList.toggle("hidden", !open);
    if (!open) selected = null;
  }

  function close(): void {
    setPanelOpen(false);
  }
  bindDialogClose(panel.querySelector<HTMLButtonElement>("#dp-close")!, close);

  // ---- first contact ----
  function showContact(state: GameState, youId: number, otherId: number): void {
    showingContact = otherId;
    const youCiv = civOf(youId, state);
    const themCiv = civOf(otherId, state);
    const youP = state.players.find((p) => p.id === youId);
    const themP = state.players.find((p) => p.id === otherId);
    const att = attitudeLabel(attitudeScore(state, otherId, youId));
    const card = (civId: string | undefined, name: string, leader: string, ability: string, color: string) =>
      `<div class="dc-card" style="--dc-civ-color:${color}">` +
      `<span class="dp-swatch" style="background:${color}"></span>` +
      `<img class="dc-portrait" src="${portrait(civId)}" onerror="this.style.visibility='hidden'"/>` +
      `<div class="dc-civ">${name}</div><div class="dc-leader">${leader}</div>` +
      `<div class="dc-ability">${ability}</div></div>`;
    modal.innerHTML =
      `<div class="dc-box"><div class="dc-title">You have encountered a new civilization</div>` +
      `<div class="dc-cards">` +
      card(youCiv?.id, youCiv?.name ?? "You", youCiv?.leader ?? "", youCiv?.abilityName ?? "", playerColor(youId, state)) +
      `<div class="dc-vs">vs</div>` +
      card(themCiv?.id, themCiv?.name ?? themP?.name ?? "Them", themCiv?.leader ?? "",
        `${themCiv?.abilityName ?? ""}, feeling ${att}`, playerColor(otherId, state)) +
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

  // ---- incoming proposal modal ----
  function showProposal(state: GameState, viewerId: number, p: Proposal): void {
    showingProposal = p.id;
    const themCiv = civOf(p.fromId, state);
    const themP = state.players.find((x) => x.id === p.fromId);
    const att = attitudeLabel(attitudeScore(state, p.fromId, viewerId));
    const coercive = !!p.coercive;
    const title = coercive ? "⚠ A demand has been made of you" : "📨 A deal has been proposed to you";
    const exch = coercive
      ? `<div class="dpm-exch">They demand: <b>${describeItems(p.want)}</b></div>`
      : `<div class="dpm-exch">They give: <b>${describeItems(p.give)}</b><br/>You give: <b>${describeItems(p.want)}</b></div>`;
    propModal.innerHTML =
      `<div class="dc-box"><div class="dc-title">${title}</div>` +
      `<div class="dpm-body">` +
      `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:none">` +
      `<span class="dp-swatch" style="background:${playerColor(p.fromId, state)};width:18px;height:18px"></span>` +
      `<img class="dpm-portrait" src="${portrait(themCiv?.id)}" onerror="this.style.visibility='hidden'"/>` +
      `</div>` +
      `<div class="dpm-info">` +
      `<div class="dpm-civ">${themCiv?.name ?? themP?.name ?? "Them"}</div>` +
      `<div class="dpm-leader">${themCiv?.leader ?? ""}</div>` +
      `<div class="dpm-att">Feeling ${att} toward you</div>` +
      exch +
      (p.reason ? `<div class="dpm-reason">“${p.reason}”</div>` : "") +
      `</div></div>` +
      `<div class="dc-actions">` +
      `<button class="btn primary" id="dpm-accept">${coercive ? "Submit" : "Accept"}</button>` +
      (coercive ? "" : `<button class="btn" id="dpm-counter">Counter offer</button>`) +
      `<button class="btn" id="dpm-decline">${coercive ? "Refuse" : "Decline"}</button>` +
      `</div></div>`;
    propModal.classList.add("show");
    const dismiss = () => { propModal.classList.remove("show"); showingProposal = null; };
    propModal.querySelector<HTMLButtonElement>("#dpm-accept")!.addEventListener("click", () => {
      handlers.onRespondProposal(p.id, true); dismiss();
    });
    propModal.querySelector<HTMLButtonElement>("#dpm-decline")!.addEventListener("click", () => {
      handlers.onRespondProposal(p.id, false); dismiss();
    });
    // Counter: drop into the negotiation view for that civ, where the offer is
    // listed alongside the always-present deal composer.
    propModal.querySelector<HTMLButtonElement>("#dpm-counter")?.addEventListener("click", () => {
      dismiss();
      setPanelOpen(true);
      selected = p.fromId;
      tab = "deal";
      resetComposer();
      resultMsg = "";
      forceRender(state, viewerId);
    });
  }

  /** Surface the first not-yet-seen pending proposal addressed to the viewer. */
  function handleIncomingProposals(state: GameState, viewerId: number): void {
    if (showingContact !== null || showingProposal !== null) return; // a dialog is up
    for (const p of state.diploProposals) {
      if (p.toId !== viewerId || p.status !== "pending") continue;
      if (seenProposals.has(p.id)) continue;
      seenProposals.add(p.id);
      showProposal(state, viewerId, p);
      return;
    }
  }

  /** Proposals between the viewer and a civ that still need someone's attention. */
  function actionableProposals(state: GameState, viewerId: number, cid: number): Proposal[] {
    return state.diploProposals.filter(
      (p) =>
        (p.toId === viewerId && p.fromId === cid && p.status === "pending") || // they await us
        (p.fromId === viewerId && p.toId === cid && p.status === "accepted"), // we must finalize
    );
  }

  // ---- signature: forces a re-render only when content actually changes ----
  function signature(state: GameState, viewerId: number): string {
    const me = state.players.find((p) => p.id === viewerId);
    const props = state.diploProposals
      .map((p) => `${p.id}:${p.status}:${p.fromId}>${p.toId}`)
      .join(",");
    const rels = state.relations
      .map((r) => `${r.a}-${r.b}:${r.status}:${r.openBorders ? 1 : 0}:${r.sharedVision ? 1 : 0}:${r.pact}:${r.deals.length}`)
      .join(",");
    const att = (me?.met ?? []).map((c) => `${c}=${attitudeScore(state, c, viewerId)}`).join(",");
    // dealTreaties is deliberately NOT in the signature: toggling a chip updates
    // the verdict in place without a re-render, so the material inputs survive.
    return [open ? 1 : 0, selected ?? -1, detailsOpen ? 1 : 0, state.turn, state.tradeHistory.length, props, rels, att, resultMsg].join("|");
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
        const score = attitudeScore(state, cid, viewerId);
        const att = attitudeLabel(score);
        const pending = actionableProposals(state, viewerId, cid).length;
        const treaties: string[] = [];
        if (rel?.openBorders) treaties.push("Open borders");
        if (rel?.sharedVision) treaties.push("Shared vision");
        if (rel && rel.pact !== "none") treaties.push(rel.pact.replace("_", " "));
        body +=
          `<div class="dp-row" data-civ="${cid}">` +
          `<span class="dp-swatch" style="background:${playerColor(cid, state)}"></span>` +
          `<img class="dp-pic" src="${portrait(civOf(cid, state)?.id)}" onerror="this.style.visibility='hidden'"/>` +
          `<div style="flex:1;min-width:0"><div class="dp-rname">${civName(cid, state)}` +
          (pending ? `<span class="dp-badge">${pending}❗</span>` : "") + `</div>` +
          `<div class="dp-sub">${leaderName(cid, state)} · ${att}${treaties.length ? ` · ${treaties.join(", ")}` : ""}</div></div>` +
          `<span class="${war ? "dp-war" : "dp-peace"}">${war ? "⚔ War" : "🕊 Peace"}</span></div>`;
      }
    } else {
      body += renderNegotiation(state, viewerId, selected);
    }

    withPreservedScroll(panel, () => {
      dpHead.innerHTML =
        (selected !== null ? `<button type="button" class="btn" id="dp-back" aria-label="Back">←</button>` : "") +
        `<span class="dp-title">Diplomacy</span>`;
      dpBody.innerHTML = body + (resultMsg ? `<div class="dp-empty" style="color:#ffd967">${resultMsg}</div>` : "");
    });
    wire(state, viewerId);
  }

  /**
   * The consolidated proposal area. With the sim allowing only one standing offer
   * per direction, this shows at most: an incoming offer to answer, an accepted
   * offer to finalize, our pending offer awaiting a reply — plus a single compact
   * line for the latest resolved (declined/accepted-elsewhere) outcome.
   */
  function renderOffers(state: GameState, viewerId: number, cid: number): string {
    const mine = state.diploProposals.filter(
      (p) => (p.fromId === viewerId && p.toId === cid) || (p.fromId === cid && p.toId === viewerId),
    );
    if (mine.length === 0) return "";
    const live: string[] = [];
    const resolved: string[] = [];
    for (const p of mine) {
      const incoming = p.toId === viewerId;
      const exch = incoming
        ? `<div class="exch">They give: <b>${describeItems(p.give)}</b><br/>You give: <b>${describeItems(p.want)}</b></div>`
        : `<div class="exch">You give: <b>${describeItems(p.give)}</b><br/>They give: <b>${describeItems(p.want)}</b></div>`;
      const reason = p.reason ? `<div class="dp-reason">“${p.reason}”</div>` : "";

      if (incoming && p.status === "pending") {
        const title = p.coercive ? "⚠ They demand tribute" : "📨 They propose a deal";
        live.push(
          `<div class="dp-prop in"><b>${title}</b>${exch}${reason}` +
          `<div class="dp-actbtns"><button class="btn primary" data-accept="${p.id}">Accept</button>` +
          (p.coercive ? "" : `<button class="btn" data-counter="${cid}">Counter</button>`) +
          `<button class="btn" data-reject="${p.id}">${p.coercive ? "Refuse" : "Decline"}</button></div></div>`,
        );
      } else if (!incoming && p.status === "accepted") {
        live.push(
          `<div class="dp-prop ok"><b>✓ They accepted${p.coercive ? " your demand" : ""}</b>${exch}${reason}` +
          `<div class="dp-actbtns"><button class="btn primary" data-finalize="${p.id}">Finalize deal</button>` +
          `<button class="btn" data-cancel="${p.id}">Cancel</button></div></div>`,
        );
      } else if (!incoming && p.status === "pending") {
        live.push(
          `<div class="dp-prop"><b>⏳ Awaiting their response</b>${exch}` +
          `<div class="dp-actbtns"><button class="btn" data-withdraw="${p.id}">Withdraw</button></div></div>`,
        );
      } else if (p.status === "declined") {
        const who = incoming ? "You declined" : "They declined";
        resolved.push(
          `<div class="dp-resolved"><span>✗ ${who}${p.coercive ? " the demand" : " the offer"}` +
          `${p.reason ? `, “${p.reason}”` : ""}</span>` +
          `<span class="x" data-cancel="${p.id}">Dismiss</span></div>`,
        );
      }
    }
    const inner = [...live, ...resolved].join("");
    if (!inner) return "";
    return `<div class="dp-sec"><h4>Active negotiation</h4>${inner}</div>`;
  }

  function renderAgreements(state: GameState, viewerId: number, rel: Relation | undefined): string {
    if (!rel) return "";
    const rows: string[] = [];
    const ends = (until?: number) =>
      until === undefined ? "" : `<span class="end">ends turn ${until} (${Math.max(0, until - state.turn)} left)</span>`;
    // Open borders / pacts surface as chips in the header; here we list the timed
    // resource/gold/specialist obligations that actually have an end turn.
    for (const d of rel.deals) {
      const dir = d.fromId === rel.a ? `#${rel.a}→#${rel.b}` : `#${rel.b}→#${rel.a}`;
      rows.push(`<div class="dp-agree"><span>${describeItem(d.item)} <span class="dp-sub">(${dir})</span></span>${ends(d.untilTurn)}</div>`);
    }
    // Shared vision has no timer — it stands until someone ends it, so it gets a
    // cancel control here (the other party sees it lift on their next view).
    const otherId = rel.a === viewerId ? rel.b : rel.a;
    if (rel.sharedVision) {
      rows.push(
        `<div class="dp-agree"><span>🗺 Shared vision <span class="dp-sub">(indefinite)</span></span>` +
        `<button class="btn" data-cancelsv="${otherId}">End sharing</button></div>` +
        `<div class="dp-sub" style="margin:-4px 0 8px">Their explored map and current unit/city sight appear on your map, fogged where they've been, clear where they see now.</div>`,
      );
    }
    if (rows.length === 0) return "";
    return `<div class="dp-sec"><h4>Active agreements</h4>${rows.join("")}</div>`;
  }

  function renderHistory(state: GameState, viewerId: number, cid: number): string {
    const recs = state.tradeHistory
      .filter((t) => (t.fromId === viewerId && t.toId === cid) || (t.fromId === cid && t.toId === viewerId))
      .slice(-12)
      .reverse();
    if (recs.length === 0) return `<div class="dp-empty">No dealings yet.</div>`;
    return recs.map((r: TradeRecord) => `<div class="dp-hist"><span class="t">T${r.turn}</span><span>${r.note}</span></div>`).join("");
  }

  function renderOpinion(state: GameState, viewerId: number, cid: number): string {
    const at = state.attitudes.find((x) => x.from === cid && x.to === viewerId);
    const mods = (at?.modifiers ?? []).filter((m) => m.value !== 0);
    if (mods.length === 0) return `<div class="dp-empty">No strong feelings either way.</div>`;
    return mods
      .sort((a, b) => b.value - a.value)
      .map((m) => `<div class="dp-mod"><span>${m.reason}</span><span class="v ${m.value >= 0 ? "pos" : "neg"}">${m.value >= 0 ? "+" : ""}${m.value}</span></div>`)
      .join("");
  }

  /** The relationship summary card: portrait, attitude meter, status chips. */
  function relationshipCard(state: GameState, viewerId: number, cid: number, rel: Relation | undefined): string {
    const war = rel?.status === "war";
    const score = attitudeScore(state, cid, viewerId);
    const rep = reputationOf(state, cid);
    const pers = personalityLabel(personalityOf(cid, state));
    const markPct = Math.max(0, Math.min(100, (score + 100) / 2));

    const chips: string[] = [];
    chips.push(`<span class="dp-chip ${war ? "war" : "peace"}">${war ? "⚔ War" : "🕊 Peace"}</span>`);
    if (rel?.openBorders) chips.push(`<span class="dp-chip treaty">🚪 Open borders</span>`);
    if (rel?.sharedVision) chips.push(`<span class="dp-chip treaty">🗺 Shared vision</span>`);
    if (rel && rel.pact !== "none") {
      const left = rel.pactUntilTurn !== undefined ? ` · ${Math.max(0, rel.pactUntilTurn - state.turn)}t left` : "";
      chips.push(`<span class="dp-chip treaty">🤝 ${rel.pact.replace("_", " ")}${left}</span>`);
    }
    if (rel?.warAllowedTurn !== undefined && state.turn < rel.warAllowedTurn) {
      const left = rel.warAllowedTurn - state.turn;
      chips.push(`<span class="dp-chip treaty">🕊 No war for ${left}t</span>`);
    }
    if (rep > 0) chips.push(`<span class="dp-chip warn">⚠ Warmonger ${rep}</span>`);

    return (
      `<div class="dp-card" style="border-left-color:${playerColor(cid, state)}">` +
      `<img class="dp-pic" src="${portrait(civOf(cid, state)?.id)}" onerror="this.style.visibility='hidden'"/>` +
      `<div class="dp-card-info">` +
      `<div class="dp-card-name"><span class="dp-swatch" style="background:${playerColor(cid, state)}"></span>${civName(cid, state)}</div>` +
      `<div class="dp-sub">${leaderName(cid, state)} · ${pers}</div>` +
      `<div class="dp-meter"><div class="dp-meter-mark" style="left:${markPct}%"></div></div>` +
      `<div class="dp-meter-val"><span>${attitudeLabel(score)} (${score >= 0 ? "+" : ""}${score})</span><span class="dp-sub">their view of you</span></div>` +
      `<div class="dp-chips">${chips.join("")}</div>` +
      `</div></div>`
    );
  }

  function renderNegotiation(state: GameState, viewerId: number, cid: number): string {
    const rel = relationBetween(state, viewerId, cid);
    const war = rel?.status === "war";
    // Proposals with this civ that need our attention → a badge on the Overview tab.
    const actionable = actionableProposals(state, viewerId, cid).length;
    const badge = actionable ? `<span class="dp-badge">${actionable}</span>` : "";
    const tabs =
      `<div class="dp-tabs">` +
      `<button class="dp-tab${tab === "overview" ? " on" : ""}" data-tab="overview">Overview${badge}</button>` +
      `<button class="dp-tab${tab === "deal" ? " on" : ""}" data-tab="deal">Make a deal</button>` +
      `</div>`;
    const body = tab === "deal"
      ? dealComposer(state, viewerId, cid, war, rel)
      : overviewTab(state, viewerId, cid, war, rel);
    return relationshipCard(state, viewerId, cid, rel) + tabs + body;
  }

  /** The Overview tab: live offers, standing actions, agreements, opinion/history. */
  function overviewTab(state: GameState, viewerId: number, cid: number, war: boolean, rel: Relation | undefined): string {
    const yourGold = Math.floor(state.players.find((p) => p.id === viewerId)?.gold ?? 0);
    const warCheck = canDeclareWar(state, viewerId, cid);
    const warBtn = war
      ? ""
      : warCheck.ok
        ? `<button class="btn" data-act="war" style="color:#d98a6a">⚔ Declare war</button>`
        : `<button class="btn" data-act="war" disabled title="${warCheck.reason ?? ""}">⚔ Declare war (locked)</button>`;
    const actionBar =
      `<div class="dp-sec"><h4>Actions</h4>` +
      `<div class="dp-actbar">` +
      warBtn +
      `<button class="btn" data-act="denounce">📢 Denounce</button>` +
      `</div>` +
      `<div class="dp-actbtns">` +
      `<label>🎁 Gift <input type="number" id="gift-amt" min="0" max="${yourGold}" value="50"/>🪙</label>` +
      `<button class="btn" data-act="gift">Send</button>` +
      `</div>` +
      `<div class="dp-actbtns">` +
      `<label>⚔ Demand <input type="number" id="demand-amt" min="0" value="50"/>🪙</label>` +
      `<button class="btn" data-act="demand">Demand</button>` +
      `<span id="demand-verdict" class="dp-verdict-inline"></span>` +
      `</div>` +
      (!war && !warCheck.ok ? `<div class="dp-sub" style="margin-top:6px">${warCheck.reason}</div>` : "") +
      `</div>`;
    const detailsToggle =
      `<div class="dp-sec">` +
      `<button class="btn dp-builder-toggle" id="dp-details-toggle"><span>📜 Opinion & history</span><span>${detailsOpen ? "▾" : "▸"}</span></button>` +
      (detailsOpen
        ? `<div class="dp-sec"><h4>Their opinion of you</h4>${renderOpinion(state, viewerId, cid)}</div>` +
          `<div class="dp-sec"><h4>History</h4>${renderHistory(state, viewerId, cid)}</div>`
        : "") +
      `</div>`;
    return renderOffers(state, viewerId, cid) + actionBar + renderAgreements(state, viewerId, rel) + detailsToggle;
  }

  /** Treaty terms still available to add as chips (peace excluded — own path). */
  function availableTreaties(rel: Relation | undefined): TreatyKey[] {
    const keys: TreatyKey[] = [];
    if (!rel?.openBorders) keys.push("openBorders");
    if (!rel?.sharedVision) keys.push("sharedVision");
    const cur = TREATY_RANK[rel?.pact ?? "none"] ?? 0;
    if (cur < 1) keys.push("non_aggression");
    if (cur < 2) keys.push("defensive");
    if (cur < 3) keys.push("alliance");
    return keys;
  }

  /** One row in a give/receive tray: the item, an inline amount for gold, remove. */
  function dealItemRow(it: DealItem, side: "give" | "want", i: number, yourGold: number): string {
    const rm = `<button class="rm" data-rm="${side}:${i}" aria-label="Remove">✕</button>`;
    if (it.kind === "gold") {
      return `<div class="dp-item"><span class="lbl">🪙 Gold</span>` +
        `<input type="number" min="0"${side === "give" ? ` max="${yourGold}"` : ""} value="${it.amount}" data-goldedit="${side}:${i}"/>${rm}</div>`;
    }
    return `<div class="dp-item"><span class="lbl">${describeItem(it)}</span>${rm}</div>`;
  }

  /** The "＋ Add…" dropdown for one side, listing only items not already added. */
  function addSelect(side: "give" | "want", state: GameState, viewerId: number, cid: number, current: DealItem[]): string {
    const meId = side === "give" ? viewerId : cid;
    const otherId = side === "give" ? cid : viewerId;
    const opt = (v: string, l: string) => `<option value="${v}">${l}</option>`;
    const usedRes = new Set(current.filter((i) => i.kind === "resource").map((i) => (i as Extract<DealItem, { kind: "resource" }>).id));
    const usedSpec = new Set(current.filter((i) => i.kind === "specialist").map((i) => (i as Extract<DealItem, { kind: "specialist" }>).specialistType));
    const usedTech = new Set(current.filter((i) => i.kind === "tech").map((i) => (i as Extract<DealItem, { kind: "tech" }>).techId));
    const usedCity = new Set(current.filter((i) => i.kind === "city").map((i) => (i as Extract<DealItem, { kind: "city" }>).cityId));
    const usedUnit = new Set(current.filter((i) => i.kind === "unit").map((i) => (i as Extract<DealItem, { kind: "unit" }>).unitId));
    const groups: string[] = [];
    if (!current.some((i) => i.kind === "gold")) groups.push(opt("gold", "🪙 Gold"));
    const lux = tradeableLuxuries(state, meId).filter((x) => !usedRes.has(x)).map((x) => opt(`res:${x}`, `🍷 ${luxName(x)}`));
    if (lux.length) groups.push(`<optgroup label="Amenities">${lux.join("")}</optgroup>`);
    const spec = specialistTypesOf(state, meId).filter((x) => !usedSpec.has(x)).map((x) => opt(`spec:${x}`, `🛠️ ${specName(x)}`));
    if (spec.length) groups.push(`<optgroup label="Specialists">${spec.join("")}</optgroup>`);
    const tech = tradeableTechs(state, meId, otherId).filter((t) => !usedTech.has(t)).map((t) => opt(`tech:${t}`, `🔬 ${TECH_DEFS[t]?.name ?? t}`));
    if (tech.length) groups.push(`<optgroup label="Technology">${tech.join("")}</optgroup>`);
    const cities = citiesOf(state, meId).filter((c) => !usedCity.has(c.id)).map((c) => opt(`city:${c.id}`, `🏙 ${c.name}`));
    if (cities.length) groups.push(`<optgroup label="Cities">${cities.join("")}</optgroup>`);
    const units = unitsOf(state, meId).filter((u) => !usedUnit.has(u.id)).flatMap((u) => {
      const name = `${UNIT_DEFS[u.type as keyof typeof UNIT_DEFS]?.name ?? u.type} #${u.id}`;
      return [opt(`unit:${u.id}`, `🪖 ${name} (sell)`), opt(`unitloan:${u.id}`, `🪖 ${name} (lend)`)];
    });
    if (units.length) groups.push(`<optgroup label="Units">${units.join("")}</optgroup>`);
    if (groups.length === 0) return "";
    const label = side === "give" ? "＋ Add to your side…" : "＋ Ask for…";
    return `<select class="dp-add" data-add="${side}"><option value="">${label}</option>${groups.join("")}</select>`;
  }

  /** Render one give/receive tray (items + add control). */
  function renderTray(side: "give" | "want", items: DealItem[], state: GameState, viewerId: number, cid: number, yourGold: number): string {
    const title = side === "give" ? "📤 You give" : "📥 You receive";
    const rows = items.length
      ? items.map((it, i) => dealItemRow(it, side, i, yourGold)).join("")
      : `<div class="dp-tray-empty">Nothing yet.</div>`;
    return `<div class="dp-tray"><h5>${title}</h5><div class="dp-tray-items">${rows}</div>${addSelect(side, state, viewerId, cid, items)}</div>`;
  }

  /** Append a freshly-chosen item (encoded add-select value) to a side's tray. */
  function addDealItem(side: "give" | "want", value: string): void {
    const arr = side === "give" ? dealGive : dealWant;
    if (value === "gold") arr.push({ kind: "gold", amount: 50 });
    else if (value.startsWith("res:")) arr.push({ kind: "resource", id: value.slice(4), turns: 20 });
    else if (value.startsWith("spec:")) arr.push({ kind: "specialist", specialistType: value.slice(5), turns: 20 });
    else if (value.startsWith("tech:")) arr.push({ kind: "tech", techId: value.slice(5) });
    else if (value.startsWith("city:")) arr.push({ kind: "city", cityId: Number(value.slice(5)) });
    else if (value.startsWith("unitloan:")) arr.push({ kind: "unit", unitId: Number(value.slice(9)), turns: 20 });
    else if (value.startsWith("unit:")) arr.push({ kind: "unit", unitId: Number(value.slice(5)), turns: 0 });
  }

  /**
   * The deal composer: treaty terms as toggle chips (peacetime) or a peace button
   * (wartime), plus two trays — "You give" / "You receive" — you add any items to
   * (gold, luxuries, specialists, tech, cities, units). Everything feeds one live
   * accept/refuse verdict and a single Propose button, so any mix goes as one
   * offer (e.g. open borders + 40🪙 + a luxury for their tech).
   */
  function dealComposer(state: GameState, viewerId: number, cid: number, war: boolean, rel: Relation | undefined): string {
    const yourGold = Math.floor(state.players.find((p) => p.id === viewerId)?.gold ?? 0);
    const pendingOut = state.diploProposals.some(
      (p) => p.fromId === viewerId && p.toId === cid && p.status === "pending",
    );

    let topSection = "";
    if (war) {
      const pv = previewPeace(state, viewerId, cid);
      const cls = pv ? (pv.accept ? "yes" : "no") : "neutral";
      const line = pv
        ? `<div class="dp-verdict ${cls}">${pv.accept ? "✓ They will accept" : "✗ They will refuse"}${pv.reason ? `, <i>“${pv.reason}”</i>` : ""}</div>`
        : "";
      topSection =
        `<button class="btn primary dp-cta" id="composer-peace" style="margin-top:0">🕊 Make peace</button>${line}` +
        `<div class="dp-deal-lbl" style="margin-top:16px">Or bargain: add the peace treaty to a deal and meet their price</div>` +
        `<div class="dp-chips-row"><button class="dp-chip-toggle${dealTreaties.has("peace") ? " on" : ""}" data-treaty-chip="peace">🕊 Peace treaty</button></div>`;
    } else {
      const keys = availableTreaties(rel);
      const chips = keys
        .map((k) => `<button class="dp-chip-toggle${dealTreaties.has(k) ? " on" : ""}" data-treaty-chip="${k}">${TREATY_META[k].icon} ${TREATY_META[k].label}</button>`)
        .join("");
      topSection = keys.length
        ? `<div class="dp-deal-lbl">Treaty terms, binding on both sides</div><div class="dp-chips-row">${chips}</div>`
        : `<div class="dp-sub" style="margin-bottom:12px">Every treaty is already in force.</div>`;
    }

    return (
      `<div class="dp-sec">` +
      topSection +
      renderTray("give", dealGive, state, viewerId, cid, yourGold) +
      renderTray("want", dealWant, state, viewerId, cid, yourGold) +
      (pendingOut ? `<div class="dp-hint">You already have an offer awaiting their reply. Proposing again replaces it.</div>` : "") +
      `<div class="dp-verdict neutral" id="composer-verdict">Pick treaty terms or add items to build an offer.</div>` +
      `<button class="btn primary dp-cta" id="composer-propose">${pendingOut ? "Revise offer" : "Propose deal"}</button>` +
      `</div>`
    );
  }

  /** The full offer under construction: material trays + mutual treaty terms. */
  function readDeal(): { give: DealItem[]; want: DealItem[] } {
    const give: DealItem[] = [...dealGive];
    const want: DealItem[] = [...dealWant];
    // Toggled treaty terms are mutual: each appears on both halves of the deal.
    for (const key of dealTreaties) {
      const t = treatyDeal(key);
      give.push(...t.give);
      want.push(...t.want);
    }
    return { give, want };
  }

  /** Live accept/refuse verdict (plus a one-line summary) for the whole composer. */
  function updateComposerVerdict(state: GameState, viewerId: number, cid: number): void {
    const el = panel.querySelector<HTMLDivElement>("#composer-verdict");
    if (!el) return;
    const { give, want } = readDeal();
    if (give.length === 0 && want.length === 0) {
      el.className = "dp-verdict neutral";
      el.textContent = "Pick treaty terms or add items to build an offer.";
      return;
    }
    const summary = `<span class="sum">You give ${describeItems(give)} · You receive ${describeItems(want)}</span>`;
    const v = previewProposal(state, viewerId, cid, give, want);
    if (!v) { el.className = "dp-verdict neutral"; el.innerHTML = summary; return; }
    el.className = `dp-verdict ${v.accept ? "yes" : "no"}`;
    el.innerHTML =
      `${v.accept ? "✓ They will accept" : "✗ They will refuse"}${v.reason ? `, <i>“${v.reason}”</i>` : ""}${summary}`;
  }

  /** Live verdict beside the tribute-demand input: would the AI pay up? */
  function updateDemandVerdict(state: GameState, viewerId: number, cid: number): void {
    const el = panel.querySelector<HTMLSpanElement>("#demand-verdict");
    if (!el) return;
    const amt = Math.max(0, Number(panel.querySelector<HTMLInputElement>("#demand-amt")?.value ?? 0));
    const v = amt > 0 ? previewProposal(state, viewerId, cid, [], [{ kind: "gold", amount: amt }], true) : null;
    el.className = `dp-verdict-inline ${v ? (v.accept ? "yes" : "no") : ""}`;
    el.innerHTML = v ? (v.accept ? "✓ would pay" : "✗ would refuse") : "";
  }

  function wire(state: GameState, viewerId: number): void {
    panel.querySelector<HTMLButtonElement>("#dp-back")?.addEventListener("click", () => { selected = null; resetComposer(); resultMsg = ""; forceRender(state, viewerId); });
    panel.querySelectorAll<HTMLDivElement>("[data-civ]").forEach((el) =>
      el.addEventListener("click", () => { selected = Number(el.dataset.civ); tab = "overview"; detailsOpen = false; resetComposer(); resultMsg = ""; forceRender(state, viewerId); }),
    );
    // Proposal inbox/outbox actions.
    panel.querySelectorAll<HTMLButtonElement>("[data-accept]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRespondProposal(Number(el.dataset.accept), true)));
    panel.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRespondProposal(Number(el.dataset.reject), false)));
    panel.querySelectorAll<HTMLButtonElement>("[data-finalize]").forEach((el) =>
      el.addEventListener("click", () => handlers.onFinalizeDeal(Number(el.dataset.finalize), true)));
    panel.querySelectorAll<HTMLElement>("[data-cancel]").forEach((el) =>
      el.addEventListener("click", () => handlers.onFinalizeDeal(Number(el.dataset.cancel), false)));
    panel.querySelectorAll<HTMLButtonElement>("[data-withdraw]").forEach((el) =>
      el.addEventListener("click", () => handlers.onFinalizeDeal(Number(el.dataset.withdraw), false)));
    panel.querySelectorAll<HTMLButtonElement>("[data-cancelsv]").forEach((el) =>
      el.addEventListener("click", () => handlers.onCancelSharedVision(Number(el.dataset.cancelsv))));
    // Counter an incoming offer → jump to the deal tab to build a reply.
    panel.querySelectorAll<HTMLButtonElement>("[data-counter]").forEach((el) =>
      el.addEventListener("click", () => { tab = "deal"; resultMsg = ""; forceRender(state, viewerId); }));

    const cid = selected;
    if (cid !== null) {
      // Tab switching.
      panel.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((el) =>
        el.addEventListener("click", () => { tab = el.dataset.tab === "deal" ? "deal" : "overview"; resultMsg = ""; forceRender(state, viewerId); }));

      // ---- Overview: standing actions + opinion/history ----
      panel.querySelector<HTMLButtonElement>("#dp-details-toggle")?.addEventListener("click", () => { detailsOpen = !detailsOpen; forceRender(state, viewerId); });
      panel.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((el) =>
        el.addEventListener("click", () => {
          switch (el.dataset.act) {
            case "war": handlers.onDeclareWar(cid); break;
            case "denounce": handlers.onDenounce(cid); break;
            case "gift": handlers.onGift(cid, Math.max(0, Number(panel.querySelector<HTMLInputElement>("#gift-amt")?.value ?? 0))); break;
            case "demand": handlers.onDemandTribute(cid, Math.max(0, Number(panel.querySelector<HTMLInputElement>("#demand-amt")?.value ?? 0))); break;
          }
        }),
      );
      panel.querySelector<HTMLInputElement>("#demand-amt")?.addEventListener("input", () => updateDemandVerdict(state, viewerId, cid));
      updateDemandVerdict(state, viewerId, cid);

      // ---- Make a deal: peace / treaty chips / trays / propose ----
      panel.querySelector<HTMLButtonElement>("#composer-peace")?.addEventListener("click", () => handlers.onMakePeace(cid));
      // Toggle a treaty term without a full re-render (would clear the trays).
      panel.querySelectorAll<HTMLButtonElement>("[data-treaty-chip]").forEach((el) =>
        el.addEventListener("click", () => {
          const key = el.dataset.treatyChip as TreatyKey;
          if (dealTreaties.has(key)) dealTreaties.delete(key); else dealTreaties.add(key);
          el.classList.toggle("on");
          updateComposerVerdict(state, viewerId, cid);
        }));
      // Add an item to a tray → re-render so the tray and its add-list refresh.
      panel.querySelectorAll<HTMLSelectElement>("[data-add]").forEach((el) =>
        el.addEventListener("change", () => {
          if (!el.value) return;
          addDealItem(el.dataset.add === "give" ? "give" : "want", el.value);
          forceRender(state, viewerId);
        }));
      // Remove a tray item.
      panel.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach((el) =>
        el.addEventListener("click", () => {
          const [side, i] = (el.dataset.rm ?? "").split(":");
          (side === "give" ? dealGive : dealWant).splice(Number(i), 1);
          forceRender(state, viewerId);
        }));
      // Edit a gold amount in place (keep focus — no re-render).
      panel.querySelectorAll<HTMLInputElement>("[data-goldedit]").forEach((el) =>
        el.addEventListener("input", () => {
          const [side, i] = (el.dataset.goldedit ?? "").split(":");
          const item = (side === "give" ? dealGive : dealWant)[Number(i)];
          if (item?.kind === "gold") item.amount = Math.max(0, Number(el.value) || 0);
          updateComposerVerdict(state, viewerId, cid);
        }));
      updateComposerVerdict(state, viewerId, cid);
      panel.querySelector<HTMLButtonElement>("#composer-propose")?.addEventListener("click", () => {
        const { give, want } = readDeal();
        if (give.length === 0 && want.length === 0) { resultMsg = "Pick treaty terms or add items to the offer first."; forceRender(state, viewerId); return; }
        resetComposer();
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
      handleIncomingProposals(state, viewerId);
      if (!open) return;
      const sig = signature(state, viewerId);
      if (sig === lastSig) return; // keep deal-builder inputs intact between frames
      lastSig = sig;
      renderContacts(state, viewerId);
    },
    toggleContacts(state, viewerId) {
      const next = !open;
      setPanelOpen(next);
      if (next) { selected = null; tab = "overview"; detailsOpen = false; resetComposer(); resultMsg = ""; forceRender(state, viewerId); }
    },
    close,
    isOpen: () => open,
  };
}
