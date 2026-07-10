import { describe, it, expect } from "vitest";
import { TUTORIAL_MAP_SIZE, TUTORIAL_MAP_TYPE, createTutorialSetup } from "./tutorial";
import { TOGGLEABLE_VICTORIES } from "@roc/sim";

describe("tutorial preset", () => {
  it("uses a small one-continent map with one AI, minimal barbarians, normal speed, and features on", () => {
    const setup = createTutorialSetup();
    expect(TUTORIAL_MAP_SIZE).toBe("small");
    expect(TUTORIAL_MAP_TYPE).toBe("pangaea");
    expect(setup.mapSize).toBe("small");
    expect(setup.mapType).toBe("pangaea");
    expect(setup.aiCivIds).toEqual([null]);
    expect(setup.barbarianLevel).toBe("minimal");
    expect(setup.gameSpeed).toBe("normal");
    expect(setup.villages).toBe(true);
    expect(setup.naturalWonders).toBe(true);
    expect(setup.legends).toBe(true);
    expect(setup.startingGold).toBe("balanced");
    expect(setup.turnLimit).toBe(120);
    expect(setup.enabledVictories).toEqual([...TOGGLEABLE_VICTORIES]);
    expect(setup.isTutorial).toBe(true);
  });
});
