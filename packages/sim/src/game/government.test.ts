import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { playerEffects, researchableGovernmentsFor, switchableGovernments } from "./civs";
import { getCityYields } from "./economy";
import { unitsOf, citiesOf } from "./state";

function game() {
  const s = createGame({ seed: "gov-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  s.players[0]!.researched.add("writing"); // the government tree is gated behind Writing
  s.players[0]!.civId = undefined; // isolate government/civic effects from the civ ability
  return s;
}

describe("government tree", () => {
  it("starts in Chiefdom; the three T1 governments are researchable, deeper ones are not", () => {
    const s = game();
    expect(s.players[0]!.government).toBe("chiefdom");
    expect(switchableGovernments(s.players[0]!)).toEqual(["chiefdom"]);
    const researchable = researchableGovernmentsFor(s.players[0]!);
    expect(researchable.sort()).toEqual(["council_of_elders", "despotism", "priest_kingship"]);
    expect(researchable).not.toContain("tyranny"); // needs Despotism first (OR-prereq)
  });

  it("researches a government from the culture pool, then switches to it for free from Chiefdom", () => {
    const s = game();
    const p = s.players[0]!;
    applyCommand(s, { type: "setResearchGovernment", governmentId: "despotism" }, 0);
    p.cultureProgress = 1000;
    for (let i = 0; i < 4; i++) applyCommand(s, { type: "endTurn" });
    expect(p.governmentsResearched.has("despotism")).toBe(true);
    expect(applyCommand(s, { type: "setGovernment", governmentId: "despotism" }, 0).ok).toBe(true);
    expect(p.government).toBe("despotism");
    expect(p.unrestTurns).toBe(0); // first adoption from Chiefdom is free
    expect(playerEffects(s, 0).yieldPercent?.production).toBe(12); // Despotism's +12% production
  });

  it("gates governments behind their prereqs (OR-semantics)", () => {
    const s = game();
    const p = s.players[0]!;
    expect(applyCommand(s, { type: "setResearchGovernment", governmentId: "tyranny" }, 0).ok).toBe(false);
    p.governmentsResearched.add("despotism");
    expect(researchableGovernmentsFor(p)).toContain("tyranny");
    // Oligarchy needs Despotism OR Council of Elders — Despotism alone suffices.
    expect(researchableGovernmentsFor(p)).toContain("oligarchy");
  });
});

describe("civics adoption & slotting", () => {
  it("cannot adopt any civic under Chiefdom (all civics are tier ≥ 1)", () => {
    const s = game();
    s.players[0]!.cultureProgress = 100000;
    expect(applyCommand(s, { type: "adoptCivic", civicId: "festivals" }, 0).ok).toBe(false);
  });

  it("adopts a civic, auto-slots it into a free slot, and applies its effect", () => {
    const s = game();
    const p = s.players[0]!;
    p.governmentsResearched.add("priest_kingship");
    applyCommand(s, { type: "setGovernment", governmentId: "priest_kingship" }, 0);
    p.cultureProgress = 1000;
    expect(applyCommand(s, { type: "adoptCivic", civicId: "divine_kingship" }, 0).ok).toBe(true);
    expect(p.slottedCivics).toContain("divine_kingship");
    // Priest-Kingship (+20% faith) + Divine Kingship (+15% faith) = 35%.
    expect(playerEffects(s, 0).yieldPercent?.faith).toBe(35);
  });

  it("rejects a second adoption in the same turn", () => {
    const s = game();
    const p = s.players[0]!;
    p.governmentsResearched.add("despotism");
    applyCommand(s, { type: "setGovernment", governmentId: "despotism" }, 0);
    p.cultureProgress = 100000;
    expect(applyCommand(s, { type: "adoptCivic", civicId: "festivals" }, 0).ok).toBe(true);
    expect(applyCommand(s, { type: "adoptCivic", civicId: "discipline" }, 0).ok).toBe(false);
  });

  it("rejects an off-branch civic and one above the government's tier", () => {
    const s = game();
    const p = s.players[0]!;
    p.governmentsResearched.add("despotism"); // tier 1, Authority
    applyCommand(s, { type: "setGovernment", governmentId: "despotism" }, 0);
    p.cultureProgress = 100000;
    // Assembly civic under an Authority government → illegal.
    expect(applyCommand(s, { type: "adoptCivic", civicId: "public_assembly" }, 0).ok).toBe(false);
    // Tier-2 neutral civic under a tier-1 government → illegal.
    expect(applyCommand(s, { type: "adoptCivic", civicId: "standing_army" }, 0).ok).toBe(false);
  });
});

describe("revolutions & unrest", () => {
  it("a same-lineage step costs 1 turn of unrest; an off-lineage revolution costs 3 and unslots illegal civics", () => {
    const s = game();
    const p = s.players[0]!;
    p.governmentsResearched.add("despotism");
    p.governmentsResearched.add("tyranny");
    p.governmentsResearched.add("priest_kingship");

    // Chiefdom → Despotism: free.
    applyCommand(s, { type: "setGovernment", governmentId: "despotism" }, 0);
    expect(p.unrestTurns).toBe(0);

    // Adopt an Authority-legal neutral civic and slot it.
    p.cultureProgress = 100000;
    applyCommand(s, { type: "adoptCivic", civicId: "festivals" }, 0);
    expect(p.slottedCivics).toContain("festivals");

    // Despotism → Tyranny (both Authority): 1 turn of unrest, civic stays legal.
    p.governmentChangedTurn = -100; // clear the switch cooldown for the test
    applyCommand(s, { type: "setGovernment", governmentId: "tyranny" }, 0);
    expect(p.unrestTurns).toBe(1);
    expect(p.slottedCivics).toContain("festivals"); // neutral → still legal

    // Adopt a Faith civic is impossible here (Tyranny is Authority); slot festivals stays.
    // Tyranny → Priest-Kingship (Authority → Faith, no shared branch): revolution, 3 turns.
    p.unrestTurns = 0; // pretend the previous unrest elapsed
    p.governmentChangedTurn = -100;
    applyCommand(s, { type: "setGovernment", governmentId: "priest_kingship" }, 0);
    expect(p.unrestTurns).toBe(3);
    // festivals is neutral so it survives; the effect is merely dormant during unrest.
    expect(p.slottedCivics).toContain("festivals");
    // festivals' +15% culture is suppressed during unrest; Priest-Kingship grants none.
    expect(playerEffects(s, 0).yieldPercent?.culture ?? 0).toBe(0);
  });

  it("unrest applies a −25% malus to every city yield", () => {
    const s = game();
    const p = s.players[0]!;
    const city = citiesOf(s, 0)[0]!;
    const base = getCityYields(s, city).production;
    p.unrestTurns = 2;
    expect(getCityYields(s, city).production).toBe(Math.floor(base * 0.75));
  });

  it("enforces the 10-turn switch cooldown", () => {
    const s = game();
    const p = s.players[0]!;
    p.governmentsResearched.add("despotism");
    p.governmentsResearched.add("council_of_elders");
    applyCommand(s, { type: "setGovernment", governmentId: "despotism" }, 0);
    // Immediately trying to switch again is blocked by the cooldown.
    expect(applyCommand(s, { type: "setGovernment", governmentId: "council_of_elders" }, 0).ok).toBe(false);
  });
});
