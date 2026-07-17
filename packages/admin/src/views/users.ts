import type { AllData } from "../api";

export function usersContent(d: AllData): string {
  return `
    <section class="page-section">
      <div class="section-head">
        <h2 style="margin:0">Registered users ${d.users.length ? `<span class="muted" style="font-weight:400">(${d.users.length})</span>` : ""}</h2>
        <button type="button" class="btn" id="users-create-btn">Create user</button>
      </div>
      <div id="users-table-host"></div>
    </section>`;
}
