import type { AllData } from "../api";
import { card } from "../util";

export function overviewContent(d: AllData): string {
  const o = d.overview;

  return `
    <div class="cards">
      ${card(o.totalSessions.toLocaleString(), "Sessions")}
      ${card(o.uniquePlayers.toLocaleString(), "Unique players")}
      ${card(d.users.length.toLocaleString(), "Registered")}
      ${card(o.completedSessions.toLocaleString(), "Completed")}
      ${card(o.abandonedSessions.toLocaleString(), "Abandoned")}
      ${card(o.sessionsToday.toLocaleString(), "Today")}
    </div>

    <div class="grid2">
      <section>
        <h2>Outcomes</h2>
        <div id="overview-outcomes"></div>
      </section>
      <section>
        <h2>Victory types</h2>
        <div id="overview-victories"></div>
      </section>
    </div>

    <div class="grid2">
      <section>
        <h2>Civilizations picked</h2>
        <div id="overview-civs"></div>
      </section>
      <section>
        <h2>Game setup</h2>
        <div id="overview-setup"></div>
      </section>
    </div>

    <section>
      <h2>Top scores</h2>
      <div id="overview-leaderboard"></div>
    </section>

    <section>
      <h2>Sessions per player</h2>
      <div id="overview-sessions"></div>
    </section>`;
}
