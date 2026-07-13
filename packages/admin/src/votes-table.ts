import type { VoteTotal } from "@roc/shared";
import { mountClientTable } from "./client-table";
import { esc, titleCase } from "./util";

export function mountVotesTable(host: HTMLElement, votes: VoteTotal[]): void {
  mountClientTable(host, {
    id: "votes-table",
    emptyMessage: "No votes yet.",
    noMatchMessage: "No features match your search.",
    defaultSort: { id: "votes", order: "desc" },
    columns: [
      {
        id: "feature",
        label: "Feature",
        text: (v) => titleCase(v.featureId),
        render: (v) => esc(titleCase(v.featureId)),
      },
      {
        id: "votes",
        label: "Votes",
        align: "num",
        sortValue: (v) => v.votes,
        text: (v) => String(v.votes),
        render: (v) => v.votes.toLocaleString(),
      },
    ],
    rows: votes,
  });
}
