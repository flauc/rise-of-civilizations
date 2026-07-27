import type { AdminGameSession } from "@roc/shared";
import { titleCase } from "./util";

export interface SetupField {
  label: string;
  value: string;
}

function onOff(v: boolean | undefined): string {
  if (v === true) return "On";
  if (v === false) return "Off";
  return "—";
}

/** Human-readable game-setup fields for the admin detail view. */
export function gameSetupFields(g: AdminGameSession): SetupField[] {
  const map =
    g.mapType || g.mapSize
      ? [g.mapType ? titleCase(g.mapType) : null, g.mapSize ? titleCase(g.mapSize) : null]
          .filter(Boolean)
          .join(" · ")
      : "—";
  const mapSize = g.mapSize ? titleCase(g.mapSize) : "—";
  const turnLimit =
    g.turnLimit == null ? "—" : g.turnLimit === 0 ? "Unlimited" : `Turn ${g.turnLimit}`;
  const victories =
    g.enabledVictories?.length ? g.enabledVictories.map(titleCase).join(", ") : "—";
  const aiCivs =
    g.aiCivIds?.length
      ? g.aiCivIds.map((c) => (c ? titleCase(c) : "Random")).join(", ")
      : g.aiCount != null && g.aiCount > 0
        ? `${g.aiCount} random`
        : "—";

  const tutorial = !g.isTutorial
    ? "No"
    : g.tutorialOutcome === "completed"
      ? "Yes, coaching finished"
      : g.tutorialOutcome === "skipped"
        ? `Yes, tips skipped${g.tutorialStep ? ` at ${g.tutorialStep}` : ""}`
        : g.tutorialOutcome === "abandoned"
          ? `Yes, left early${g.tutorialStep ? ` at ${g.tutorialStep}` : ""}`
          : "Yes, coaching still running";

  return [
    { label: "Mode", value: g.mode ? g.mode.toUpperCase() : "—" },
    { label: "Tutorial", value: tutorial },
    { label: "Map", value: map },
    { label: "Map size", value: mapSize },
    { label: "Game speed", value: g.gameSpeed ? titleCase(g.gameSpeed) : "—" },
    { label: "Starting gold", value: g.startingGold ? titleCase(g.startingGold) : "—" },
    { label: "Your civilization", value: g.civId ? titleCase(g.civId) : "—" },
    { label: "AI opponents", value: g.aiCount != null ? String(g.aiCount) : "—" },
    { label: "AI civilizations", value: aiCivs },
    { label: "Barbarians", value: g.barbarianLevel ? titleCase(g.barbarianLevel) : onOff(g.barbarians) },
    { label: "Natural wonders", value: onOff(g.naturalWonders) },
    { label: "Villages", value: onOff(g.villages) },
    { label: "Legends", value: onOff(g.legends) },
    { label: "Turn limit", value: turnLimit },
    { label: "Victory conditions", value: victories },
  ];
}
