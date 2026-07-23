/** Planned, votable roadmap milestones (empty = hide Roadmap in the lobby menu). */
export interface RoadmapMilestone {
  id: string;
  title: string;
  desc: string;
  /** Short category badge, e.g. "Victory", "Maps". */
  tag: string;
  /** Optional planned-phase label for headline victory milestones. */
  phase?: string;
}

/**
 * Milestone catalogue for the public roadmap. Every entry is votable and the
 * board sorts by votes. Ship wins and other completed work by removing them here.
 */
export const ROADMAP_MILESTONES: RoadmapMilestone[] = [];

export function roadmapHasMilestones(): boolean {
  return ROADMAP_MILESTONES.length > 0;
}
