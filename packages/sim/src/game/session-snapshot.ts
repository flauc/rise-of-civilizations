import type { SessionScoreboardEntry } from "@roc/shared";
import { getGreatPerson, getLegend, getNaturalWonder, WONDER_DEFS } from "@roc/data";
import { getCivic, getGovernment } from "./civs";
import { isMilitary, TECH_DEFS, type TechId } from "./content";
import { citiesOf, unitsOf, type GameState, type Player } from "./state";
import { playerScore } from "./victory";

const WONDER_NAME = new Map(WONDER_DEFS.map((w) => [w.id, w.name]));

function wonderName(id: string): string {
  return WONDER_NAME.get(id) ?? id.replace(/_/g, " ");
}

function techName(id: TechId): string {
  return TECH_DEFS[id]?.name ?? id;
}

function playerSnapshot(
  state: GameState,
  p: Player,
): Pick<
  SessionScoreboardEntry,
  | "cities"
  | "cityNames"
  | "gold"
  | "population"
  | "techs"
  | "researching"
  | "government"
  | "civics"
  | "wonders"
  | "legends"
  | "legendsRecruited"
  | "naturalWonders"
  | "greatPeople"
  | "greatPeopleRecruited"
  | "faith"
  | "religion"
  | "battlesWon"
  | "citiesCaptured"
  | "eliminated"
  | "units"
  | "militaryUnits"
> {
  const cities = citiesOf(state, p.id);
  const units = unitsOf(state, p.id);
  const wonderIds = [...new Set(cities.flatMap((c) => c.wonders))];
  const activeLegends = [...new Set(units.map((u) => u.legendId).filter(Boolean) as string[])];
  const techs = [...p.researched].map(techName).sort((a, b) => a.localeCompare(b));
  const civics = [...p.civicsAdopted]
    .map((id) => getCivic(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
  const recruitedIds = p.greatPeopleRecruited ?? [];
  const greatPeopleRecruited = recruitedIds
    .map((id) => getGreatPerson(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
  const pendingGreatPeople = (p.greatPeople ?? [])
    .map((id) => getGreatPerson(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
  const naturalWonders = Object.entries(state.discoveredWonders ?? {})
    .filter(([, ownerId]) => ownerId === p.id)
    .map(([id]) => getNaturalWonder(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
  const foundedReligion = state.religions.find((r) => r.founderId === p.id);

  return {
    cities: cities.length,
    cityNames: cities.map((c) => c.name),
    gold: p.gold,
    population: cities.reduce((sum, c) => sum + c.population, 0),
    techs,
    researching: p.researching ? techName(p.researching) : undefined,
    government: getGovernment(p.government)?.name ?? p.government,
    civics,
    wonders: wonderIds.map(wonderName).sort((a, b) => a.localeCompare(b)),
    legends: activeLegends.map((id) => getLegend(id)?.name ?? id).sort((a, b) => a.localeCompare(b)),
    legendsRecruited: p.legendsRecruited ?? 0,
    naturalWonders,
    greatPeopleRecruited,
    greatPeople: pendingGreatPeople,
    faith: p.faith,
    religion: foundedReligion?.name,
    battlesWon: p.battlesWon ?? 0,
    citiesCaptured: p.citiesCaptured ?? 0,
    eliminated: p.eliminated,
    units: units.length,
    militaryUnits: units.filter((u) => isMilitary(u.type)).length,
  };
}

/** Build final standings with per-player end-of-game stats for analytics. */
export function buildSessionScoreboard(state: GameState, viewerId: number): SessionScoreboardEntry[] {
  return state.players
    .filter((p) => !p.isBarbarian)
    .map((p) => ({
      name: p.name,
      civId: p.civId,
      isHuman: p.isHuman,
      isBarbarian: p.isBarbarian,
      score: playerScore(state, p.id),
      isViewer: p.id === viewerId,
      ...playerSnapshot(state, p),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
