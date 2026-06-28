import { describe, it } from "vitest";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { citiesOf } from "./state";

describe("AI opening measurement (barbs-ON, 32 seeds)", () => {
  it("measures", () => {
    const seeds = Array.from({ length: 32 }, (_, i) => `z${i + 1}`);
    let c40 = 0, c80 = 0, p80 = 0, two = 0, samples = 0;
    for (const seed of seeds) {
      const s = createGame({ seed, cols: 60, rows: 40, barbarians: true, humanSlots: 1, playerCount: 4 });
      beginTurn(s);
      for (let i = 0; i < 40; i++) applyCommand(s, { type: "endTurn" });
      for (const pid of [1, 2, 3]) { samples++; c40 += citiesOf(s, pid).length; if (citiesOf(s, pid).length >= 2) two++; }
      for (let i = 0; i < 40; i++) applyCommand(s, { type: "endTurn" });
      for (const pid of [1, 2, 3]) { c80 += citiesOf(s, pid).length; p80 += citiesOf(s, pid).reduce((a, c) => a + c.population, 0); }
    }
    console.log(`MEASURE cities@40=${(c40/samples).toFixed(2)} had2+by40=${(100*two/samples).toFixed(0)}% cities@80=${(c80/samples).toFixed(2)} pop@80=${(p80/samples).toFixed(1)}`);
  });
});
