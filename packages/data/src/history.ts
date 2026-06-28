// Historical / lore content for the in-game Encyclopedia. Pure flavour text,
// split into focused modules to keep each readable; this file re-exports them so
// the rest of the codebase can import everything from "@roc/data".
//
// Keying conventions:
//   • CIV_HISTORY, UNIQUE_UNIT_HISTORY, UNIQUE_INFRA_HISTORY, CIV_LOCATION —
//     keyed by CIV id (each civ has exactly one unique unit and one unique
//     building/improvement, so civ id is a stable 1:1 key).
//   • UNIT_HISTORY — keyed by base unit id (sim UNIT_DEFS).
//   • GREAT_PERSON_HISTORY — keyed by great-person id (GREAT_PEOPLE).
//   • LEGEND_HISTORY — keyed by legend id (LEGENDS).
//
// Each module also exports an accessor (civHistory, unitHistory, …) that returns
// undefined when no entry exists, so the UI degrades gracefully.

export * from "./history-civs"; // CivHistory, CIV_HISTORY, civHistory
export * from "./history-units"; // UNIT_HISTORY, UNIQUE_UNIT_HISTORY + accessors
export * from "./history-infra"; // UNIQUE_INFRA_HISTORY, uniqueInfraHistoryByCiv
export * from "./history-people"; // GREAT_PERSON_HISTORY, LEGEND_HISTORY + accessors
export * from "./history-geo"; // CivLocation, CIV_LOCATION, civLocation
