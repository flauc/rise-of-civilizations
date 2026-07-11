import type { AllData } from "../api";

export function usersContent(d: AllData): string {
  return `
    <section class="page-section">
      <h2>Registered users ${d.users.length ? `<span class="muted" style="font-weight:400">(${d.users.length})</span>` : ""}</h2>
      <div id="users-table-host"></div>
    </section>`;
}
