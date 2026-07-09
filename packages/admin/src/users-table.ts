import type { AdminRegisteredUser } from "@roc/shared";
import { mountClientTable } from "./client-table";
import { esc, fullDate } from "./util";

export function mountUsersTable(host: HTMLElement, users: AdminRegisteredUser[]): void {
  mountClientTable(host, {
    id: "users-table",
    emptyMessage: "No accounts yet — users appear here after they sign up in the game.",
    noMatchMessage: "No users match your search.",
    defaultSort: { id: "createdAt", order: "desc" },
    columns: [
      {
        id: "handle",
        label: "Username",
        text: (u) => u.handle,
        render: (u) => `<b>${esc(u.handle)}</b>`,
      },
      {
        id: "email",
        label: "Email",
        text: (u) => u.email ?? "",
        render: (u) => (u.email ? esc(u.email) : "—"),
      },
      {
        id: "newsletter",
        label: "Newsletter",
        text: (u) => (u.newsletterOptIn ? "yes" : "no"),
        render: (u) => (u.newsletterOptIn ? "Yes" : "—"),
      },
      {
        id: "createdAt",
        label: "Signed up",
        sortValue: (u) => u.createdAt,
        text: (u) => fullDate(u.createdAt),
        render: (u) => `<span class="muted">${esc(fullDate(u.createdAt))}</span>`,
      },
    ],
    rows: users,
  });
}
