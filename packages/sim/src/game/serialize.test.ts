import { describe, it, expect } from "vitest";
import { createGame, serializeState, deserializeState } from "@roc/sim";

describe("serialize round-trip", () => {
  it("preserves full game state through serialization", () => {
    const state = createGame({ seed: "serialize-test", cols: 30, rows: 20, playerCount: 3, humanSlots: 1 });
    const serialized = serializeState(state);
    const restored = deserializeState(serialized);

    expect(restored.turn).toBe(state.turn);
    expect(restored.currentPlayerIndex).toBe(state.currentPlayerIndex);
    expect(restored.nextEntityId).toBe(state.nextEntityId);
    expect(restored.map.cols).toBe(state.map.cols);
    expect(restored.map.rows).toBe(state.map.rows);
    expect(restored.map.tiles.length).toBe(state.map.tiles.length);

    // Maps and Sets are reconstructed.
    expect(restored.units.size).toBe(state.units.size);
    expect(restored.cities.size).toBe(state.cities.size);
    expect(restored.players.length).toBe(state.players.length);

    for (const [id, unit] of state.units) {
      const r = restored.units.get(id);
      expect(r).toBeDefined();
      expect(r!.type).toBe(unit.type);
      expect(r!.ownerId).toBe(unit.ownerId);
      expect(r!.col).toBe(unit.col);
      expect(r!.row).toBe(unit.row);
    }

    for (const [id, city] of state.cities) {
      const r = restored.cities.get(id);
      expect(r).toBeDefined();
      expect(r!.name).toBe(city.name);
      expect(r!.ownerId).toBe(city.ownerId);
    }

    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i]!;
      const rp = restored.players[i]!;
      expect([...rp.researched].sort()).toEqual([...p.researched].sort());
      expect([...rp.explored].sort()).toEqual([...p.explored].sort());
    }
  });
});
