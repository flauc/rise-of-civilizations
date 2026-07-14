export type AdminPage = "overview" | "reporting" | "games" | "users" | "votes" | "reports";

export const PAGES: { id: AdminPage; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "reporting", label: "Reporting" },
  { id: "games", label: "Games" },
  { id: "users", label: "Users" },
  { id: "votes", label: "Feature votes" },
  { id: "reports", label: "Bug reports" },
];

export function parsePage(hash: string): AdminPage {
  const path = hash.replace(/^#\/?/, "").split("?")[0]?.toLowerCase() ?? "";
  if (path === "reporting" || path === "games" || path === "users" || path === "votes" || path === "reports") return path;
  return "overview";
}

export function pageHref(page: AdminPage): string {
  return page === "overview" ? "#/" : `#/${page}`;
}

export function pageTitle(page: AdminPage): string {
  return PAGES.find((p) => p.id === page)?.label ?? "Overview";
}
