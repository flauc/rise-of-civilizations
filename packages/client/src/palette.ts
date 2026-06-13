import type { TerrainType } from "@roc/shared";

// Simple, readable colors for the M0 vector look. Deliberately flat — the art
// plan (PLAN.md §4.3) is procedural/vector, not sprite packs.
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  ocean: "#1c4866",
  coast: "#2e6f93",
  lake: "#2f6d8c",
  plains: "#b7a65a",
  grassland: "#5b8a43",
  desert: "#cdb87a",
  tundra: "#8a9a8c",
  snow: "#e7eef2",
  forest: "#3f6b3a",
  jungle: "#356b3f",
  hills: "#7a8a4e",
  mountains: "#6d6f76",
};

export const HEX_STROKE = "rgba(0,0,0,0.18)";
export const HEX_HOVER_STROKE = "#ffd967";
