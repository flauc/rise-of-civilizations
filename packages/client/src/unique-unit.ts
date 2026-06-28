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
  getLeaderAbilityForCiv,
  leaderAbilityUnlockLabel,
  uniqueInfraForCiv,
  TECH_DEFS,
  type UnitTypeId,
  type UnitAbility,
  type ActiveAbilityId,
} from "@roc/sim";
import { startingUnitsFor, capitalPopulationBonusFor, uniqueUnitForCiv, BASE_CITY_POPULATION } from "@roc/data";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** The unique unit a civilization fields, if any (one per civ). */
export function uniqueUnitFor(civId: string): typeof UNIQUE_UNITS[number] | undefined {
  return UNIQUE_UNITS.find((u) => u.civId === civId);
}

// ---- Starting profile (loadout + capital population) ----------------------
// Pulled straight from the data layer that the sim itself uses, so the lobby and
// wiki always display exactly what a civ starts with.

/** "2× Warrior, 1× Scout" — a civ's starting army, from its single-source loadout.
 *  When a starting unit's base type is the one this civ replaces with its unique
 *  unit, it is shown under the unique name (the civ fields its UU from turn 1). */
export function startingUnitsSummary(civId: string): string {
  const counts = new Map<string, number>();
  for (const u of startingUnitsFor(civId)) counts.set(u, (counts.get(u) ?? 0) + 1);
  return [...counts]
    .map(([id, n]) => {
      const name = uniqueUnitForCiv(civId, id)?.name ?? UNIT_DEFS[id as UnitTypeId]?.name ?? id;
      return `${n}× ${name}`;
    })
    .join(", ");
}

/** Population a civ's capital is founded at (base + capital bonus). */
export function capitalStartPop(civId: string): number {
  return BASE_CITY_POPULATION + capitalPopulationBonusFor(civId);
}

/** One-line starting conditions: capital population + free starting units. */
export function startingConditionsLine(civId: string): string {
  return `🏙️ Capital starts at population ${capitalStartPop(civId)} · ⚔️ ${startingUnitsSummary(civId)}`;
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

/**
 * The civ's active **Leader Ability**: a powerful, cooldown-gated action (distinct
 * from the always-on Civ Ability shown above it). Surfaces the name, an accurate
 * effect summary, its tech/civic unlock, and cooldown so the picker conveys what
 * actually makes each civ play differently. Returns "" if the civ has none.
 */
export function leaderAbilityBlockHtml(civId: string): string {
  const la = getLeaderAbilityForCiv(civId);
  if (!la) return "";
  return (
    `<div class="la-block">` +
    `<div class="la-top"><span class="la-glyph" aria-hidden="true">✦</span>` +
    `<div class="la-info"><div class="la-name">${escapeHtml(la.name)}</div>` +
    `<div class="la-tag">Leader ability · active</div></div></div>` +
    `<div class="la-desc">${escapeHtml(la.desc)}</div>` +
    `<div class="la-foot">Unlocks with <b>${escapeHtml(leaderAbilityUnlockLabel(la))}</b> · ${la.cooldown}-turn cooldown</div>` +
    `</div>`
  );
}

/**
 * The civ's unique infrastructure — a real EXTRA building or tile improvement
 * (see UNIQUE_INFRA in @roc/data), not a flavor string. Shows its art, whether it
 * is a building or improvement, an effect summary, and its tech unlock. Reuses the
 * `.uu-*` block styling; the sprite hides gracefully (wireUuImages) when missing.
 */
export function uniqueInfraBlockHtml(civId: string): string {
  const inf = uniqueInfraForCiv(civId);
  if (!inf) return "";
  const dir = inf.kind === "building" ? "buildings" : "improvements";
  const src = `${ASSET_BASE_URL}${dir}/${inf.id}.png`;
  const tech = TECH_DEFS[inf.reqTech as keyof typeof TECH_DEFS]?.name ?? inf.reqTech;
  const kindLabel = inf.kind === "building" ? "Unique building" : "Unique tile improvement";
  return (
    `<div class="uu-block">` +
    `<div class="uu-top">` +
    `<div class="uu-icon"><img class="js-uu-img" src="${src}" alt="" /></div>` +
    `<div class="uu-info"><div class="uu-name">${escapeHtml(inf.name)}</div>` +
    `<div class="uu-meta">${kindLabel} · unlocks with ${escapeHtml(tech)}</div></div></div>` +
    `<div class="uu-meta" style="margin-top:7px">${escapeHtml(inf.desc)}</div>` +
    `</div>`
  );
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
