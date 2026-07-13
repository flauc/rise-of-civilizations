import type { AllData } from "../api";

export function votesContent(d: AllData): string {
  const totalVotes = d.votes.reduce((sum, v) => sum + v.votes, 0);
  return `
    <section class="page-section">
      <h2>Feature votes ${d.votes.length ? `<span class="muted" style="font-weight:400">(${totalVotes.toLocaleString()})</span>` : ""}</h2>
      <div id="votes-table-host"></div>
    </section>`;
}
