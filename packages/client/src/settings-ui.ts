// Shared settings overlay for the lobby home screen and in-game menu.

import { deleteAccount, getAccount, isLoggedIn } from "./account";
import { withPreservedScroll } from "./panel-scroll";
import {
  bindScreenRotationControls,
  screenRotationControlsHtml,
  shouldOfferScreenRotation,
} from "./screen-rotation-ui";
import { isNativeApp, setLobbyHidden } from "./app-routes";
import { unlockAppAudioFromGesture } from "./game-sounds";
import { getSettings, updateSettings, type TurnUpdateView } from "./settings";
import { bindDialogClose } from "./dialog-close";

export interface SettingsPanelOptions {
  /** Show the destructive delete-account section (registered users only). */
  showDeleteAccount?: boolean;
  /** Called after the server confirms account deletion and local session is cleared. */
  onAccountDeleted?: () => void;
  /** Called when turn-update preferences change while the in-game dialog is open. */
  onTurnUpdateSettingsChange?: (view: TurnUpdateView) => void;
}

let overlayEl: HTMLDivElement | null = null;
let dialogEl: HTMLDivElement | null = null;
let open = false;
let panelOptions: SettingsPanelOptions = {};
let deleteFormOpen = false;
let deleteBusy = false;

function ensureElements(): { overlay: HTMLDivElement; dialog: HTMLDivElement } {
  if (!overlayEl) {
    overlayEl = document.createElement("div");
    overlayEl.id = "settings-overlay";
    overlayEl.className = "settings-overlay";
    dialogEl = document.createElement("div");
    dialogEl.id = "settings-dialog";
    dialogEl.className = "settings-dialog";
    document.body.appendChild(overlayEl);
    document.body.appendChild(dialogEl);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        closeSettingsPanel();
      }
    });
  }
  return { overlay: overlayEl, dialog: dialogEl! };
}

function settingsHtml(): string {
  const s = getSettings();
  const tuMode = !s.turnUpdatePopup ? "off" : s.turnUpdateView;
  const showDelete = panelOptions.showDeleteAccount && isLoggedIn() && !isNativeApp();
  const account = getAccount();

  let deleteSection = "";
  if (showDelete && account) {
    if (deleteFormOpen) {
      deleteSection =
        `<div class="settings-section settings-danger">` +
        `<div class="settings-title">Delete account</div>` +
        `<div class="settings-hint">This permanently removes <b>${escapeHtml(account.handle)}</b> and all server login sessions. Local saves on this device are kept.</div>` +
        `<div class="settings-delete-confirm">` +
        `<input type="password" id="settings-delete-password" class="settings-delete-input" placeholder="Enter your password" autocomplete="current-password" />` +
        `<div class="settings-delete-actions">` +
        `<button type="button" class="btn settings-delete-confirm-btn" id="settings-delete-confirm">Confirm delete</button>` +
        `<button type="button" class="btn secondary" id="settings-delete-cancel">Cancel</button>` +
        `</div>` +
        `<div class="settings-delete-error" id="settings-delete-error"></div>` +
        `</div></div>`;
    } else {
      deleteSection =
        `<div class="settings-section settings-danger">` +
        `<div class="settings-title">Account</div>` +
        `<div class="settings-hint">Permanently delete your registered account and server login.</div>` +
        `<button type="button" class="btn settings-delete-btn" id="settings-delete-account">Delete account</button>` +
        `</div>`;
    }
  }

  return (
    `<button type="button" class="dialog-x" id="settings-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="settings-header"><b>Settings</b></div>` +
    `<div class="settings-section">` +
    `<div class="settings-title">Turn Updates</div>` +
    `<div class="settings-hint">What happens at the start of each of your turns.</div>` +
    `<div class="seg">` +
    `<button class="seg-btn ${tuMode === "expanded" ? "active" : ""}" data-tu-mode="expanded" title="Pop up one event at a time">Pop up</button>` +
    `<button class="seg-btn ${tuMode === "compact" ? "active" : ""}" data-tu-mode="compact" title="Pop up all events on one screen">Compact</button>` +
    `<button class="seg-btn ${tuMode === "off" ? "active" : ""}" data-tu-mode="off" title="Don't pop up; still available from the Updates button">Off</button>` +
    `</div></div>` +
    `<div class="settings-section">` +
    `<div class="settings-title">Combat</div>` +
    `<div class="settings-hint">Before your unit attacks, show a preview of likely damage and bonuses on both sides.</div>` +
    `<div class="seg">` +
    `<button class="seg-btn ${!s.autoAttack ? "active" : ""}" data-auto-attack="preview" title="Confirm each attack after seeing the preview">Preview</button>` +
    `<button class="seg-btn ${s.autoAttack ? "active" : ""}" data-auto-attack="instant" title="Attack immediately without a preview">Auto attack</button>` +
    `</div></div>` +
    `<div class="settings-section">` +
    `<div class="settings-title">Map Labels</div>` +
    `<div class="settings-hint">Name tags for units, cities, and barbarians on the map.</div>` +
    `<div class="seg">` +
    `<button class="seg-btn ${s.mapLabels === "selected" ? "active" : ""}" data-map-labels="selected" title="Only show the label of the selected unit or city">When selected</button>` +
    `<button class="seg-btn ${s.mapLabels === "always" ? "active" : ""}" data-map-labels="always" title="Always show every name label">Always</button>` +
    `</div></div>` +
    `<div class="settings-section">` +
    `<div class="settings-title">Audio</div>` +
    `<div class="settings-hint">Background music and combat sound effects play in the lobby and during games.</div>` +
    `<div class="settings-row">` +
    `<label class="settings-check"><input type="checkbox" id="settings-music" ${s.musicEnabled ? "checked" : ""} /> Music</label>` +
    `<label class="settings-check"><input type="checkbox" id="settings-sfx" ${s.sfxEnabled ? "checked" : ""} /> Sound effects</label>` +
    `</div></div>` +
    (shouldOfferScreenRotation()
      ? `<div class="settings-section">` +
        `<div class="settings-title">Screen Rotation</div>` +
        `<div class="settings-hint">Pick one orientation. The game stays fixed and does not rotate with your device.</div>` +
        screenRotationControlsHtml({ showLabel: false }) +
        `</div>`
      : "") +
    deleteSection
  );
}

function escapeHtml(text: string): string {
  const el = document.createElement("div");
  el.textContent = text;
  return el.innerHTML;
}

function bindSettingsPanel(): void {
  const { dialog } = ensureElements();

  bindDialogClose(dialog.querySelector<HTMLButtonElement>("#settings-close")!, closeSettingsPanel);
  dialog.querySelectorAll<HTMLButtonElement>("[data-tu-mode]").forEach((el) =>
    el.addEventListener("click", () => {
      const mode = el.dataset.tuMode;
      if (mode === "off") {
        updateSettings({ turnUpdatePopup: false });
      } else {
        const view = mode as TurnUpdateView;
        updateSettings({ turnUpdatePopup: true, turnUpdateView: view });
        panelOptions.onTurnUpdateSettingsChange?.(view);
      }
      renderSettingsPanel();
    }),
  );
  dialog.querySelectorAll<HTMLButtonElement>("[data-auto-attack]").forEach((el) =>
    el.addEventListener("click", () => {
      updateSettings({ autoAttack: el.dataset.autoAttack === "instant" });
      renderSettingsPanel();
    }),
  );
  dialog.querySelectorAll<HTMLButtonElement>("[data-map-labels]").forEach((el) =>
    el.addEventListener("click", () => {
      updateSettings({ mapLabels: el.dataset.mapLabels === "always" ? "always" : "selected" });
      renderSettingsPanel();
    }),
  );
  dialog.querySelector<HTMLInputElement>("#settings-music")?.addEventListener("change", (e) => {
    updateSettings({ musicEnabled: (e.target as HTMLInputElement).checked });
    unlockAppAudioFromGesture();
  });
  dialog.querySelector<HTMLInputElement>("#settings-sfx")?.addEventListener("change", (e) => {
    updateSettings({ sfxEnabled: (e.target as HTMLInputElement).checked });
    unlockAppAudioFromGesture();
  });
  if (shouldOfferScreenRotation()) bindScreenRotationControls(dialog, () => renderSettingsPanel());

  dialog.querySelector<HTMLButtonElement>("#settings-delete-account")?.addEventListener("click", () => {
    deleteFormOpen = true;
    renderSettingsPanel();
    dialog.querySelector<HTMLInputElement>("#settings-delete-password")?.focus();
  });
  dialog.querySelector<HTMLButtonElement>("#settings-delete-cancel")?.addEventListener("click", () => {
    deleteFormOpen = false;
    renderSettingsPanel();
  });
  dialog.querySelector<HTMLButtonElement>("#settings-delete-confirm")?.addEventListener("click", () => {
    void submitDeleteAccount();
  });
  const pwd = dialog.querySelector<HTMLInputElement>("#settings-delete-password");
  pwd?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submitDeleteAccount();
    }
  });
}

async function submitDeleteAccount(): Promise<void> {
  if (deleteBusy) return;
  const { dialog } = ensureElements();
  const password = dialog.querySelector<HTMLInputElement>("#settings-delete-password")?.value ?? "";
  const errEl = dialog.querySelector<HTMLDivElement>("#settings-delete-error");
  if (!password) {
    if (errEl) errEl.textContent = "Enter your password to confirm.";
    return;
  }
  deleteBusy = true;
  if (errEl) errEl.textContent = "Deleting…";
  const res = await deleteAccount(password);
  deleteBusy = false;
  if ("error" in res) {
    if (errEl) errEl.textContent = res.error;
    return;
  }
  deleteFormOpen = false;
  closeSettingsPanel();
  panelOptions.onAccountDeleted?.();
}

function renderSettingsPanel(): void {
  const { overlay, dialog } = ensureElements();
  overlay.classList.toggle("show", open);
  dialog.classList.toggle("show", open);
  if (!open) return;
  withPreservedScroll(dialog, () => {
    dialog.innerHTML = settingsHtml();
  });
  bindSettingsPanel();
}

/** Open the settings overlay. Reuses the same panel as in-game Settings. */
export function openSettingsPanel(options: SettingsPanelOptions = {}): void {
  panelOptions = options;
  open = true;
  setLobbyHidden(true);
  renderSettingsPanel();
}

/** Close the settings overlay if it is open. */
export function closeSettingsPanel(): void {
  open = false;
  deleteFormOpen = false;
  deleteBusy = false;
  setLobbyHidden(false);
  renderSettingsPanel();
}

/** Whether the settings overlay is currently visible. */
export function isSettingsPanelOpen(): boolean {
  return open;
}

/** Re-render open settings (e.g. after an external turn-update toggle). */
export function refreshSettingsPanel(): void {
  if (open) renderSettingsPanel();
}
