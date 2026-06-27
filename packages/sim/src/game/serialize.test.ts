import { describe, it, expect } from "vitest";
import { createGame, serializeState, deserializeState, viewForPlayer, type SerializedState } from "@roc/sim";

describe("player view log filtering", () => {
  it("hides other players' private actions from the game log", () => {
    const state = createGame({ seed: "log-view", cols: 30, rows: 20, playerCount: 2, humanSlots: 1, barbarians: false });
    const explored = [...state.players[0]!.explored];
    const [exCol, exRow] = explored[0]!.split(",").map(Number) as [number, number];
    // A tile player 0 has NOT explored.
    let hiddenKey = "";
    for (let row = 0; row < state.map.rows && !hiddenKey; row++)
      for (let col = 0; col < state.map.cols && !hiddenKey; col++)
        if (!state.players[0]!.explored.has(`${col},${row}`)) hiddenKey = `${col},${row}`;
    const [hidCol, hidRow] = hiddenKey.split(",").map(Number) as [number, number];

    state.log = [
      { message: "my own move", turn: 1, actorId: 0 },
      { message: "secret AI move", turn: 1, actorId: 1 },
      { message: "world-wide news", turn: 1, world: true },
      { message: "AI attacks me", turn: 1, actorId: 1, targetIds: [0] },
      { message: "AI acts on my explored tile", turn: 1, actorId: 1, tile: { col: exCol, row: exRow } },
      { message: "AI acts in the fog", turn: 1, actorId: 1, tile: { col: hidCol, row: hidRow } },
    ];

    const messages = viewForPlayer(state, 0).log.map((e) => e.message);
    expect(messages).toContain("my own move");
    expect(messages).toContain("world-wide news");
    expect(messages).toContain("AI attacks me");
    expect(messages).toContain("AI acts on my explored tile");
    expect(messages).not.toContain("secret AI move");
    expect(messages).not.toContain("AI acts in the fog");
  });
});

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
      expect([...rp.civicsResearched].sort()).toEqual([...p.civicsResearched].sort());
      expect([...rp.explored].sort()).toEqual([...p.explored].sort());
    }
  });

  it("round-trips a work's assigned specialists and defaults the field on legacy saves", () => {
    const state = createGame({ seed: "work-serialize", cols: 30, rows: 20, playerCount: 1, humanSlots: 1 });
    state.works.push({
      id: state.nextEntityId++,
      ownerId: 0,
      kind: "farm",
      tier: 1,
      target: { col: 5, row: 5 },
      hostCityId: 1,
      cityIds: [1],
      assignedSpecialistIds: [42, 43],
      requirement: { carpentry: 6 },
      progress: { carpentry: 2 },
    });
    const restored = deserializeState(serializeState(state));
    expect(restored.works[0]!.assignedSpecialistIds).toEqual([42, 43]);

    // Legacy save with no assignedSpecialistIds field → defaults to [].
    const legacy = JSON.parse(JSON.stringify(serializeState(state))) as SerializedState;
    delete (legacy.works[0] as { assignedSpecialistIds?: number[] }).assignedSpecialistIds;
    expect(deserializeState(legacy).works[0]!.assignedSpecialistIds).toEqual([]);
  });

  it("tolerates legacy saves where Set fields were serialized as empty objects", () => {
    const state = createGame({ seed: "legacy", cols: 30, rows: 20, playerCount: 2, humanSlots: 1 });
    const serialized = serializeState(state);
    // Simulate an old save where civicsResearched (and possibly others) became `{}`.
    const legacy = JSON.parse(JSON.stringify(serialized)) as SerializedState;
    for (const p of legacy.players) {
      p.civicsResearched = {} as unknown as string[];
      p.researched = {} as unknown as string[];
      p.explored = {} as unknown as string[];
    }
    expect(() => deserializeState(legacy)).not.toThrow();
    const restored = deserializeState(legacy);
    for (const p of restored.players) {
      expect(p.civicsResearched).toBeInstanceOf(Set);
      expect(p.researched).toBeInstanceOf(Set);
      expect(p.explored).toBeInstanceOf(Set);
    }
  });
});
