// Game content lives here as data, sourced from the design docs in /docs.
// Populated in M4+ (civilizations, techs, units, great people). Placeholder for now.

export interface CivDefinition {
  readonly id: string;
  readonly name: string;
  readonly leader: string;
  readonly region: string;
}

/** Will grow into the full 70+ roster from docs/CIVILIZATIONS.md. */
export const CIVILIZATIONS: readonly CivDefinition[] = [];
