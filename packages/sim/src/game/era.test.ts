import { describe, expect, it } from "vitest";
import { createGame } from "./setup";
import { playerById } from "./state";
import { eraUnlocked, playerGameEra } from "./era";
import { nextAvailableFigure, accrueGreatPeople } from "./great-people";
import { canRecruitLegend, availableLegendsForPlayer } from "./legends";

const newGame = () =>
  createGame({ cols: 12, rows: 12, seed: "era-test", playerCount: 1, humanSlots: 1, barbarians: false, legends: true });

describe("game era gates", () => {
  it("starts in Bronze and unlocks later eras via milestone techs", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    expect(playerGameEra(player)).toBe("Bronze");
    expect(eraUnlocked(player, "Classical")).toBe(false);
    player.researched.add("bronze_alloying");
    expect(playerGameEra(player)).toBe("Classical");
    expect(eraUnlocked(player, "Classical")).toBe(true);
    expect(eraUnlocked(player, "Medieval")).toBe(false);
    player.researched.add("carburizing");
    expect(playerGameEra(player)).toBe("Medieval");
    player.researched.add("gunpowder");
    expect(playerGameEra(player)).toBe("Exploration");
  });

  it("skips Great People from locked eras", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    // Every general in the roster is Classical or later — none at Bronze.
    expect(nextAvailableFigure(state, "general", player)).toBeUndefined();
    player.researched.add("bronze_alloying");
    expect(nextAvailableFigure(state, "general", player)?.id).toBe("epaminondas");
    // Engineers include a Bronze-era figure available from the start.
    expect(nextAvailableFigure(state, "engineer", player)?.era).toBe("Bronze");
  });

  it("does not auto-recruit a Great Person from a locked era", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeoplePoints.general = 999;
    accrueGreatPeople(state, player);
    expect(player.greatPeople ?? []).toHaveLength(0);
    player.researched.add("bronze_alloying");
    accrueGreatPeople(state, player);
    expect(player.greatPeople).toContain("epaminondas");
  });

  it("blocks legend recruitment until the hero's era is reached", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.faith = 500;
    expect(canRecruitLegend(state, 0, "leonidas").ok).toBe(false);
    expect(availableLegendsForPlayer(state, 0).some((l) => l.id === "leonidas")).toBe(false);
    player.researched.add("bronze_alloying");
    expect(canRecruitLegend(state, 0, "leonidas").ok).toBe(false); // still needs a city
  });
});
