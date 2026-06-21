/// <reference types="vite/client" />
// Shared unique-unit dialog: the clickable unit block + the expanded detail
// modal used by BOTH the lobby civ-selection screen and the in-game wiki's
// Civilizations page, so the two stay identical. The `.uu-*` / `.uud-*` CSS is
// injected globally by the lobby (createLobby runs at startup).

import { ASSET_BASE_URL } from "./asset-base";
import {
  CIVILIZATIONS,
  UNIQUE_UNITS,
  UNIT_DEFS,
  ACTIVE_ABILITY_DEFS,
  unitActiveAbilityIds,
  isRanged,
  type UnitTypeId,
  type UnitAbility,
  type ActiveAbilityId,
} from "@roc/sim";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** The unique unit a civilization fields, if any (one per civ). */
export function uniqueUnitFor(civId: string): typeof UNIQUE_UNITS[number] | undefined {
  return UNIQUE_UNITS.find((u) => u.civId === civId);
}

/** Passive always-on combat modifiers, with player-facing names + tooltips. */
const PASSIVE_ABILITY_INFO: Record<UnitAbility, { name: string; desc: string }> = {
  bonus_vs_cavalry: { name: "Anti-Cavalry", desc: "Bonus combat strength when fighting mounted units." },
  bonus_vs_city: { name: "City Assault", desc: "Bonus combat strength when attacking cities." },
};

/**
 * A small icon + name + meta block describing a civ's unique unit. The block is
 * clickable: it opens an expanded view of the unit's abilities (see
 * openUnitDetail). Ability details are intentionally NOT shown here — only on
 * the expanded view — so the selection screen stays uncluttered.
 */
export function uniqueUnitBlockHtml(civId: string): string {
  const uu = uniqueUnitFor(civId);
  const civ = CIVILIZATIONS.find((c) => c.id === civId);
  if (!uu) {
    return civ?.uniqueUnit
      ? `<div class="uu-block"><div class="uu-info"><div class="uu-name">${escapeHtml(civ.uniqueUnit)}</div><div class="uu-meta">Unique unit</div></div></div>`
      : "";
  }
  const base = UNIT_DEFS[uu.replaces as UnitTypeId];
  const src = `${ASSET_BASE_URL}units/${uu.id}.png`;
  const meta = [
    "Unique unit",
    base ? `replaces ${escapeHtml(base.name)}` : "",
    uu.bonus ? `+${uu.bonus} strength` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `
    <button type="button" class="uu-block uu-clickable" data-uu-detail="${uu.id}">
      <div class="uu-top">
        <div class="uu-icon"><img class="js-uu-img" src="${src}" alt="" /></div>
        <div class="uu-info">
          <div class="uu-name">${escapeHtml(uu.name)}</div>
          <div class="uu-meta">${meta}</div>
        </div>
        <span class="uu-caret" aria-hidden="true">&rsaquo;</span>
      </div>
      <div class="uu-hint">View abilities</div>
    </button>`;
}

const ABILITY_KIND_LABEL: Record<string, string> = { stance: "Stance", targeted: "Targeted", self: "Self" };

/**
 * Expanded unique-unit view: stats, every ability with its full description, and
 * how the unit differs from the base unit it replaces (combat bonus, abilities
 * gained / lost). Returned as the inner HTML of the detail dialog.
 */
export function uniqueUnitDetailHtml(uu: typeof UNIQUE_UNITS[number]): string {
  const base = UNIT_DEFS[uu.replaces as UnitTypeId];
  const civ = CIVILIZATIONS.find((c) => c.id === uu.civId);
  const ranged = base ? isRanged(base) : false;
  const bonus = uu.bonus;
  const effStr = (base?.strength ?? 0) + (ranged ? 0 : bonus);
  const effRanged = (base?.rangedStrength ?? 0) + (ranged ? bonus : 0);
  const src = `${ASSET_BASE_URL}units/${uu.id}.png`;

  const stat = (label: string, val: string): string =>
    `<div class="uud-stat"><span>${label}</span><b>${val}</b></div>`;
  const stats: string[] = [];
  if (effStr > 0) stats.push(stat("⚔ Strength", `${effStr}${!ranged && bonus ? ` <span class="uud-plus">+${bonus}</span>` : ""}`));
  if ((base?.rangedStrength ?? 0) > 0)
    stats.push(stat("🏹 Ranged", `${effRanged}${ranged && bonus ? ` <span class="uud-plus">+${bonus}</span>` : ""} · range ${base!.range}`));
  if (base) {
    stats.push(stat("🥾 Movement", String(base.movement)));
    stats.push(stat("⚙ Cost", String(base.cost)));
    if (base.upkeep > 0) stats.push(stat("🪙 Upkeep", `${base.upkeep}/turn`));
    if (base.reqResource) stats.push(stat("Resource", `${base.reqResource.count} ${escapeHtml(base.reqResource.resource)}`));
  }

  const baseActive = base?.activeAbilities ?? [];
  const effActive = unitActiveAbilityIds(uu.replaces as UnitTypeId, uu.id);
  const gained = effActive.filter((a) => !baseActive.includes(a));
  const lost = baseActive.filter((a) => !effActive.includes(a));

  const abilityRow = (a: ActiveAbilityId, isNew: boolean): string => {
    const d = ACTIVE_ABILITY_DEFS[a];
    return (
      `<div class="uud-ability"><div class="uud-ability-head"><span class="uud-ability-glyph">${d.glyph}</span>` +
      `<b>${escapeHtml(d.name)}</b>` +
      `<span class="uud-ability-kind">${ABILITY_KIND_LABEL[d.kind] ?? d.kind}${d.cooldown ? ` · ${d.cooldown}t cooldown` : ""}</span>` +
      (isNew ? `<span class="uud-badge">New</span>` : "") +
      `</div><div class="uud-ability-desc">${escapeHtml(d.desc)}</div></div>`
    );
  };
  const passiveRow = (p: UnitAbility): string => {
    const info = PASSIVE_ABILITY_INFO[p];
    return (
      `<div class="uud-ability"><div class="uud-ability-head"><span class="uud-ability-glyph">●</span>` +
      `<b>${escapeHtml(info.name)}</b><span class="uud-ability-kind">Passive</span></div>` +
      `<div class="uud-ability-desc">${escapeHtml(info.desc)}</div></div>`
    );
  };
  const abilityHtml =
    effActive.map((a) => abilityRow(a, gained.includes(a))).join("") +
    (base?.abilities ?? []).map(passiveRow).join("");

  const baseName = base?.name ?? uu.replaces;
  const compareParts: string[] = [];
  if (bonus) compareParts.push(`<li><b>+${bonus} ${ranged ? "ranged" : "combat"} strength</b> over the ${escapeHtml(baseName)}.</li>`);
  if (gained.length) compareParts.push(`<li><b>Gains:</b> ${gained.map((a) => escapeHtml(ACTIVE_ABILITY_DEFS[a].name)).join(", ")}.</li>`);
  if (lost.length) compareParts.push(`<li><b>Loses:</b> ${lost.map((a) => escapeHtml(ACTIVE_ABILITY_DEFS[a].name)).join(", ")}.</li>`);
  if (!gained.length && !lost.length) compareParts.push(`<li>Same tactical abilities as the ${escapeHtml(baseName)} — its edge is raw combat strength.</li>`);

  return (
    `<div class="uud-head">` +
    `<div class="uud-img"><img class="js-uu-img" src="${src}" alt="" /></div>` +
    `<div class="uud-headinfo">` +
    `<div class="uud-title">${escapeHtml(uu.name)}</div>` +
    `<div class="uud-subtitle">Unique unit${civ ? ` of ${escapeHtml(civ.name)}` : ""} · replaces ${escapeHtml(baseName)}</div>` +
    `<div class="uud-stats">${stats.join("")}</div>` +
    `</div></div>` +
    `<div class="uud-section"><div class="uud-section-title">Compared to the ${escapeHtml(baseName)}</div>` +
    `<ul class="uud-compare">${compareParts.join("")}</ul></div>` +
    `<div class="uud-section"><div class="uud-section-title">Abilities</div>` +
    (abilityHtml || `<div class="uud-ability-desc">No special abilities.</div>`) +
    `</div>`
  );
}

/** Hide any unique-unit icons inside `root` whose sprite failed to load. */
export function wireUuImages(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement>(".js-uu-img").forEach((img) => {
    const hide = () => {
      const box = img.closest<HTMLElement>(".uu-icon, .uud-img");
      if (box) box.style.display = "none";
      else img.style.display = "none";
    };
    if (img.complete && img.naturalWidth === 0) hide();
    img.onerror = hide;
  });
}

/**
 * Open the expanded unique-unit detail as a modal dialog (above the civ picker
 * or the wiki). Closed via the ✕, a backdrop click, or Escape.
 */
export function openUnitDetail(uuId: string): void {
  const uu = UNIQUE_UNITS.find((u) => u.id === uuId);
  if (!uu) return;
  const overlay = document.createElement("div");
  overlay.className = "uud-overlay";
  overlay.innerHTML = `
    <div class="uud-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(uu.name)}">
      <button class="uud-close" aria-label="Close">✕</button>
      <div class="uud-content">${uniqueUnitDetailHtml(uu)}</div>
    </div>`;
  document.body.appendChild(overlay);
  wireUuImages(overlay);
  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  overlay.querySelector<HTMLButtonElement>(".uud-close")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

/** Wire clickable unique-unit blocks within `root` to open their detail dialog. */
export function wireUuDetail(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-uu-detail]").forEach((el) =>
    el.addEventListener("click", () => openUnitDetail(el.dataset.uuDetail!)),
  );
}
