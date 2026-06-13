import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { playerEffects, availableGovernments, unlockedPolicies } from "./civs";
import { unitsOf } from "./state";

function game() {
  const s = createGame({ seed: "gov-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  return s;
}

describe("civics & government", () => {
  it("starts in Chiefdom; only the base government is available", () => {
    const s = game();
    expect(s.players[0]!.government).toBe("chiefdom");
    expect(availableGovernments(s.players[0]!)).toContain("chiefdom");
    expect(availableGovernments(s.players[0]!)).not.toContain("despotism");
  });

  it("develops a civic from culture over turns and unlocks its policy", () => {
    const s = game();
    applyCommand(s, { type: "setCivic", civicId: "code_of_laws" });
    for (let i = 0; i < 6; i++) applyCommand(s, { type: "endTurn" });
    expect(s.players[0]!.civicsResearched.has("code_of_laws")).toBe(true);
    expect(unlockedPolicies(s.players[0]!)).toContain("discipline");
  });

  it("slotting a policy applies its effect to the merged player effects", () => {
    const s = game();
    applyCommand(s, { type: "setCivic", civicId: "code_of_laws" });
    for (let i = 0; i < 6; i++) applyCommand(s, { type: "endTurn" });
    const before = playerEffects(s, 0).unitClassCombat?.melee ?? 0;
    expect(applyCommand(s, { type: "togglePolicy", policyId: "discipline" }).ok).toBe(true);
    expect(s.players[0]!.policies).toContain("discipline");
    expect((playerEffects(s, 0).unitClassCombat?.melee ?? 0)).toBe(before + 2);
  });
});
