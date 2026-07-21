// Pre-attack confirmation dialog: estimated damage and combat modifiers.

import type { CombatModifier, CombatPreviewDetail } from "@roc/sim";
import { bindDialogClose } from "./dialog-close";
import { assetUrl } from "./asset-base";

let overlayEl: HTMLDivElement | null = null;
let dialogEl: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function ensureElements(): { overlay: HTMLDivElement; dialog: HTMLDivElement } {
  if (!overlayEl) {
    overlayEl = document.createElement("div");
    overlayEl.id = "combat-preview-overlay";
    overlayEl.className = "combat-preview-overlay";
    dialogEl = document.createElement("div");
    dialogEl.id = "combat-preview-dialog";
    dialogEl.className = "combat-preview-dialog panel";
    document.body.appendChild(overlayEl);
    document.body.appendChild(dialogEl);
  }
  return { overlay: overlayEl, dialog: dialogEl! };
}

function escapeHtml(text: string): string {
  const el = document.createElement("div");
  el.textContent = text;
  return el.innerHTML;
}

function tokenSrc(d: CombatPreviewDetail, side: "attacker" | "defender"): string {
  if (side === "attacker") return assetUrl(`units/${d.attackerTokenId}.png`);
  if (d.defenderTokenId) return assetUrl(`units/${d.defenderTokenId}.png`);
  const tier = d.defenderCityTier ?? 1;
  return assetUrl(`buildings/city_${tier}.png`);
}

function hpLine(now: number, after: number, max: number): string {
  const afterClass = after <= 0 ? " combat-preview-hp-kill" : after < now ? " combat-preview-hp-hurt" : "";
  return (
    `<span class="combat-preview-hp-now">${now}</span>` +
    `<span class="combat-preview-hp-arrow">→</span>` +
    `<span class="combat-preview-hp-after${afterClass}">${after}</span>` +
    `<span class="combat-preview-hp-max">/${max}</span>`
  );
}

function damageLine(amount: number, rangedNoRetal: boolean): string {
  if (rangedNoRetal) return `<span class="muted">None</span>`;
  if (amount <= 0) return `<span class="muted">None</span>`;
  return `<b>~${amount}</b>`;
}

function modList(mods: CombatModifier[]): string {
  if (mods.length === 0) return "";
  return (
    `<div class="combat-preview-mods">` +
    mods
      .map(
        (m) =>
          `<div class="combat-preview-mod"><span>${escapeHtml(m.label)}</span><span class="combat-preview-mod-effect">${escapeHtml(m.effect)}</span></div>`,
      )
      .join("") +
    `</div>`
  );
}

function sideColumn(
  d: CombatPreviewDetail,
  side: "attacker" | "defender",
  name: string,
  hpNow: number,
  hpAfter: number,
  hpMax: number,
  damage: number,
  mods: CombatModifier[],
  noRetaliation: boolean,
): string {
  const src = tokenSrc(d, side);
  return (
    `<div class="combat-preview-col">` +
    `<div class="combat-preview-col-head">` +
    `<img class="combat-preview-portrait" src="${src}" alt="" loading="lazy" />` +
    `<div class="combat-preview-col-name">${escapeHtml(name)}</div>` +
    `</div>` +
    `<div class="combat-preview-stat">` +
    `<span class="combat-preview-stat-label">HP</span>` +
    `<span class="combat-preview-stat-val">${hpLine(hpNow, hpAfter, hpMax)}</span>` +
    `</div>` +
    `<div class="combat-preview-stat">` +
    `<span class="combat-preview-stat-label">Damage</span>` +
    `<span class="combat-preview-stat-val">${damageLine(damage, side === "defender" && noRetaliation)}</span>` +
    `</div>` +
    modList(mods) +
    `</div>`
  );
}

function dialogHtml(d: CombatPreviewDetail): string {
  const noRetal = d.ranged;
  return (
    `<button type="button" class="dialog-x" id="combat-preview-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="combat-preview-header"><b>Attack Preview</b></div>` +
    `<div class="combat-preview-matchup">` +
    sideColumn(d, "attacker", d.attackerName, d.attackerHp, d.attackerHpAfter, d.attackerMaxHp, d.attackerDamage, d.attackerMods, false) +
    `<div class="combat-preview-vs">vs</div>` +
    sideColumn(
      d,
      "defender",
      d.defenderName,
      d.defenderHp,
      d.defenderHpAfter,
      d.defenderMaxHp,
      d.defenderDamage,
      d.defenderMods,
      noRetal,
    ) +
    `</div>` +
    `<div class="combat-preview-actions">` +
    `<button type="button" class="btn secondary" id="combat-preview-cancel">Cancel</button>` +
    `<button type="button" class="btn primary" id="combat-preview-attack">Attack</button>` +
    `</div>`
  );
}

function closeDialog(): void {
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  overlayEl?.classList.remove("show");
  dialogEl?.classList.remove("show");
}

/** Show the combat preview and call `onAttack` if the player confirms. */
export function showCombatPreviewDialog(detail: CombatPreviewDetail, onAttack: () => void): void {
  const { overlay, dialog } = ensureElements();
  dialog.innerHTML = dialogHtml(detail);
  overlay.classList.add("show");
  dialog.classList.add("show");

  const dismiss = () => closeDialog();
  bindDialogClose(dialog.querySelector<HTMLButtonElement>("#combat-preview-close")!, dismiss);
  dialog.querySelector<HTMLButtonElement>("#combat-preview-cancel")!.addEventListener("click", dismiss);
  dialog.querySelector<HTMLButtonElement>("#combat-preview-attack")!.addEventListener("click", () => {
    dismiss();
    onAttack();
  });

  escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") dismiss();
  };
  document.addEventListener("keydown", escHandler);
}

export function closeCombatPreviewDialog(): void {
  closeDialog();
}
