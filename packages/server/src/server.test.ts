import { describe, it, expect } from "vitest";
import { MemoryStorage } from "./storage";
import { Lobby } from "./lobby";

describe("storage", () => {
  it("creates users (case-insensitive handle) and sessions", async () => {
    const st = new MemoryStorage();
    const u = await st.createUser("Alice", "hash123");
    expect((await st.userByHandle("alice"))?.id).toBe(u.id);
    const token = await st.createSession(u.id);
    expect(await st.userIdForToken(token)).toBe(u.id);
    await expect(st.createUser("alice", "x")).rejects.toThrow();
  });
});

describe("lobby + game host (simultaneous multiplayer)", () => {
  it("runs a full create/join/start/order/resolve loop with fog", () => {
    const lobby = new Lobby();
    const g = lobby.create("Test Match", "uA", "Alice", "seed-mp");
    const joined = lobby.join(g.id, "uB", "Bob");
    expect("playerId" in joined && joined.playerId).toBe(1);

    expect(lobby.start(g.id)).toEqual({ ok: true });
    const host = lobby.get(g.id)!.host!;

    // Each player founds their capital with their settler.
    const settlerA = [...host.state.units.values()].find((u) => u.ownerId === 0 && u.type === "settler")!;
    const settlerB = [...host.state.units.values()].find((u) => u.ownerId === 1 && u.type === "settler")!;
    expect(host.order(0, { type: "foundCity", unitId: settlerA.id }).ok).toBe(true);
    expect(host.order(1, { type: "foundCity", unitId: settlerB.id }).ok).toBe(true);

    // A player cannot move the other player's unit.
    const warriorB = [...host.state.units.values()].find((u) => u.ownerId === 1 && u.type === "warrior")!;
    const bad = host.order(0, { type: "move", unitId: warriorB.id, col: warriorB.col, row: warriorB.row });
    expect(bad.ok).toBe(false);

    // Simultaneous resolution only happens once both are ready.
    expect(host.awaiting().sort()).toEqual([0, 1]);
    expect(host.ready_(0).resolved).toBe(false);
    expect(host.awaiting()).toEqual([1]);
    const turnBefore = host.state.turn;
    const res = host.ready_(1);
    expect(res.resolved).toBe(true);
    expect(host.state.turn).toBe(turnBefore + 1);

    // Fog: A's view must not reveal the distant player B's units.
    const viewA = host.view(0);
    expect(viewA.yourId).toBe(0);
    expect(viewA.tiles.length).toBeGreaterThan(0);
    expect(viewA.units.some((u) => u.ownerId === 1)).toBe(false);
    // A sees their own founded city.
    expect(viewA.cities.some((c) => c.ownerId === 0)).toBe(true);
  });
});
