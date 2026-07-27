import type { AllData } from "../api";
import { pageHref } from "../router";
import { card } from "../util";

export function overviewContent(d: AllData): string {
  const o = d.overview;
  const completed = d.outcomes.win + d.outcomes.loss;
  const completionRate = o.totalSessions > 0 ? Math.round((completed / o.totalSessions) * 1000) / 10 : 0;
  const winRate = completed > 0 ? Math.round((d.outcomes.win / completed) * 1000) / 10 : 0;
  const inProgress = Math.max(0, o.totalSessions - completed - d.outcomes.abandoned);
  const bugCount = d.bugReports.length;
  const tutorialRate =
    o.tutorialsStarted && o.tutorialsStarted > 0
      ? Math.round(((o.tutorialsCompleted ?? 0) / o.tutorialsStarted) * 1000) / 10
      : 0;

  return `
    <section class="page-section overview-page">
      <p class="sub page-lead">Live pulse of the game. Open <a href="${pageHref("reporting")}">Reporting</a> for filtered session analytics.</p>

      <div class="cards dash-cards">
        ${card(o.totalSessions.toLocaleString(), "Total sessions")}
        ${card(o.sessionsToday.toLocaleString(), "Sessions today")}
        ${card(d.users.length.toLocaleString(), "Registered users")}
        ${card(o.uniquePlayers.toLocaleString(), "Unique players")}
        ${card(completed.toLocaleString(), "Completed")}
        ${card(bugCount.toLocaleString(), "Bug reports")}
      </div>

      <div class="stat-line muted">
        In progress: <b>${inProgress.toLocaleString()}</b>
        <span class="stat-sep">·</span>
        Abandoned: <b>${d.outcomes.abandoned.toLocaleString()}</b>
        <span class="stat-sep">·</span>
        Completion rate: <b>${completionRate}%</b>
        <span class="stat-sep">·</span>
        Win rate: <b>${winRate}%</b>
        <span class="stat-sep">·</span>
        Avg turns: <b>${o.avgTurns}</b>
      </div>

      ${
        o.tutorialsStarted != null
          ? `<div class="stat-line muted">
        Tutorials played: <b>${o.tutorialsStarted.toLocaleString()}</b>
        <span class="stat-sep">·</span>
        Tutorials finished: <b>${(o.tutorialsCompleted ?? 0).toLocaleString()}</b>
        <span class="stat-sep">·</span>
        Tutorial completion: <b>${tutorialRate}%</b>
        <span class="stat-sep">·</span>
        <a href="${pageHref("reporting")}">Tutorial report</a>
      </div>`
          : ""
      }


      <div class="grid2 dash-grid">
        <section>
          <div class="section-head">
            <h2>Recent games</h2>
            <a class="section-link" href="${pageHref("games")}">View all</a>
          </div>
          <div id="overview-recent-games"></div>
        </section>
        <section>
          <div class="section-head">
            <h2>Latest bug reports</h2>
            <a class="section-link" href="${pageHref("reports")}">View all</a>
          </div>
          <div id="overview-bug-reports"></div>
        </section>
      </div>

      <div class="grid2 dash-grid">
        <section>
          <div class="section-head">
            <h2>Top scores</h2>
            <a class="section-link" href="${pageHref("games")}">Browse games</a>
          </div>
          <div id="overview-leaderboard"></div>
        </section>
        <section>
          <div class="section-head">
            <h2>Most active players</h2>
          </div>
          <div id="overview-sessions"></div>
        </section>
      </div>

      <section>
        <div class="section-head">
          <h2>Feature votes</h2>
          <a class="section-link" href="${pageHref("votes")}">View all</a>
        </div>
        <div id="overview-votes"></div>
      </section>
    </section>`;
}
