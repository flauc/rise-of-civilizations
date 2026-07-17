import { API_BASE, getToken } from "./util";

function usersModalEl(): HTMLDivElement {
  let el = document.getElementById("users-modal") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "users-modal";
    el.style.cssText =
      "display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.65);align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto";
    document.body.appendChild(el);
  }
  return el;
}

export function openCreateUserModal(onCreated: () => void): void {
  const modal = usersModalEl();
  modal.style.display = "flex";
  modal.innerHTML = `
    <section class="game-modal-panel" style="max-width:480px">
      <div class="section-head" style="margin-bottom:16px">
        <h2 style="margin:0;font-family:Cinzel,Georgia,serif;font-size:18px">Create user</h2>
        <button type="button" class="btn btn-sm" id="users-create-close">Close</button>
      </div>
      <form id="users-create-form" class="report-field" style="gap:12px">
        <label class="report-field">
          <span class="report-label">Username</span>
          <input class="in" style="width:100%;min-width:0" id="users-create-handle" autocomplete="off" required />
        </label>
        <label class="report-field">
          <span class="report-label">Password</span>
          <input class="in" style="width:100%;min-width:0" id="users-create-password" type="password" autocomplete="new-password" required />
        </label>
        <label class="report-field">
          <span class="report-label">Email (optional)</span>
          <input class="in" style="width:100%;min-width:0" id="users-create-email" type="email" autocomplete="off" />
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:14px">
          <input type="checkbox" id="users-create-newsletter" />
          Newsletter opt-in
        </label>
        <div id="users-create-err" class="err" style="display:none"></div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button type="submit" class="btn" id="users-create-submit">Create account</button>
        </div>
      </form>
    </section>`;

  const close = (): void => {
    modal.style.display = "none";
  };
  modal.querySelector<HTMLButtonElement>("#users-create-close")!.addEventListener("click", close);

  const form = modal.querySelector<HTMLFormElement>("#users-create-form")!;
  const errEl = modal.querySelector<HTMLDivElement>("#users-create-err")!;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void (async () => {
      errEl.style.display = "none";
      const handle = modal.querySelector<HTMLInputElement>("#users-create-handle")!.value.trim();
      const password = modal.querySelector<HTMLInputElement>("#users-create-password")!.value;
      const email = modal.querySelector<HTMLInputElement>("#users-create-email")!.value.trim();
      const newsletter = modal.querySelector<HTMLInputElement>("#users-create-newsletter")!.checked;
      const token = getToken();
      const res = await fetch(`${API_BASE}/admin/api/users`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ handle, password, email: email || undefined, newsletter }),
      });
      const body = (await res.json()) as { error?: string; handle?: string };
      if (!res.ok) {
        errEl.textContent = body.error ?? `Request failed (${res.status})`;
        errEl.style.display = "block";
        return;
      }
      close();
      onCreated();
    })();
  });
}

export function bindCreateUserButton(onCreated: () => void): void {
  document.querySelector<HTMLButtonElement>("#users-create-btn")?.addEventListener("click", () => {
    openCreateUserModal(onCreated);
  });
}
