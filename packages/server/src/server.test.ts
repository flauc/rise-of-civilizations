import { describe, it, expect } from "vitest";
import { MemoryStorage } from "./storage";
import { Lobby } from "./lobby";
import { deserializeState, serializeState } from "@roc/sim";

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
    const g = lobby.create("Test Match", "uA", "Alice", { seed: "seed-mp" });
    const joined = lobby.join(g.id, "uB", "Bob");
    expect("slotId" in joined).toBe(true);

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

  it("restores an active game from a serialized state blob", () => {
    const lobby = new Lobby();
    const g = lobby.create("Restorable", "uA", "Alice", { seed: "seed-restore" });
    lobby.join(g.id, "uB", "Bob");
    expect(lobby.start(g.id)).toEqual({ ok: true });

    const original = lobby.get(g.id)!.host!.state;
    const blob = JSON.stringify(serializeState(original));
    const restoredState = deserializeState(JSON.parse(blob));

    // Mutate the live state so we can verify restore really replaces it.
    original.turn = 9999;
    expect(lobby.get(g.id)!.host!.state.turn).toBe(9999);

    const r = lobby.restore(g.id, restoredState);
    expect(r).toEqual({ ok: true });
    expect(lobby.get(g.id)!.host!.state.turn).toBe(restoredState.turn);
    expect(lobby.get(g.id)!.host!.state.turn).not.toBe(9999);
  });

  it("supports host-defined capacity up to 12 players", () => {
    const lobby = new Lobby();
    const g = lobby.create("Big Match", "uA", "Alice", { seed: "seed-big", capacity: 5 });
    expect(g.slots.filter((s) => s.kind === "human").length).toBe(5);

    lobby.join(g.id, "uB", "Bob");
    lobby.join(g.id, "uC", "Carol");
    lobby.join(g.id, "uD", "Dan");
    lobby.join(g.id, "uE", "Eve");

    expect(lobby.start(g.id)).toEqual({ ok: true });
    const host = lobby.get(g.id)!.host!;
    expect(host.state.players.filter((p) => !p.isBarbarian).length).toBe(5);
    expect(host.state.players.filter((p) => p.isHuman).length).toBe(5);
  });

  it("supports more than 4 AI with per-AI civs and unique colors", () => {
    const lobby = new Lobby();
    const g = lobby.create("AI Horde", "uA", "Alice", {
      seed: "seed-ai",
      capacity: 1,
      aiCivIds: ["rome", null, "sumer", null, null, null, null],
      colors: ["#111111", "#222222"],
    });
    expect(g.slots.filter((s) => s.kind === "ai").length).toBe(7);

    expect(lobby.start(g.id)).toEqual({ ok: true });
    const players = lobby.get(g.id)!.host!.state.players.filter((p) => !p.isBarbarian);
    expect(players.length).toBe(8); // 1 human + 7 AI

    // The host's chosen human color and AI civ assignments survive (humans first).
    expect(players[0]!.color).toBe("#111111");
    expect(players[1]!.civId).toBe("rome");
    expect(players[3]!.civId).toBe("sumer");

    // Every player has a distinct color.
    const colors = players.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("caps the total roster at 24 slots", () => {
    const lobby = new Lobby();
    const g = lobby.create("Too Many", "uA", "Alice", {
      seed: "seed-clamp",
      capacity: 1,
      aiCount: 50,
    });
    expect(g.slots.length).toBe(24);
    expect(g.slots.filter((s) => s.kind === "ai").length).toBe(23);
  });

  it("lets the host edit the roster: add/toggle/remove slots and kick players", () => {
    const lobby = new Lobby();
    const g = lobby.create("Editable", "uA", "Alice", { seed: "seed-edit", capacity: 2 });
    lobby.join(g.id, "uB", "Bob");

    // Add an AI slot, then verify the roster shape.
    expect(lobby.addSlot(g.id, "uA", "ai")).toEqual({ ok: true });
    let room = lobby.room(g.id)!;
    expect(room.slots.length).toBe(3);
    expect(room.slots.filter((s) => s.kind === "human").length).toBe(2);

    // Non-host cannot edit.
    expect("error" in lobby.addSlot(g.id, "uB", "ai")).toBe(true);

    // Toggling Bob's seat to AI evicts Bob.
    const bobSlot = lobby.room(g.id)!.slots.find((s) => s.userId === "uB")!;
    const r = lobby.updateSlot(g.id, "uA", bobSlot.id, { kind: "ai" });
    expect(r).toEqual({ ok: true, kicked: "uB" });
    expect(lobby.slotOf(g.id, "uB")).toBeUndefined();

    // Host cannot remove their own seat or the last human seat.
    const hostSlot = lobby.room(g.id)!.slots.find((s) => s.userId === "uA")!;
    expect("error" in lobby.removeSlot(g.id, "uA", hostSlot.id)).toBe(true);

    // Open a fresh human seat for Carol, then kick her out of it.
    expect(lobby.addSlot(g.id, "uA", "human")).toEqual({ ok: true });
    expect(lobby.join(g.id, "uC", "Carol")).toHaveProperty("slotId");
    const carolSlot = lobby.room(g.id)!.slots.find((s) => s.userId === "uC")!;
    expect(lobby.kick(g.id, "uA", carolSlot.id)).toEqual({ ok: true, kicked: "uC" });
    expect(lobby.slotOf(g.id, "uC")).toBeUndefined();
  });

  it("enforces a join password and only the host can start", () => {
    const lobby = new Lobby();
    const g = lobby.create("Private", "uA", "Alice", { seed: "seed-pw", capacity: 3, password: "secret" });
    expect(lobby.list()[0]!.hasPassword).toBe(true);

    expect("error" in lobby.join(g.id, "uB", "Bob", "wrong")).toBe(true);
    expect("error" in lobby.join(g.id, "uB", "Bob")).toBe(true);
    expect(lobby.join(g.id, "uB", "Bob", "secret")).toHaveProperty("slotId");

    // Host clears the password; now anyone can walk in.
    expect(lobby.configure(g.id, "uA", { password: "" })).toEqual({ ok: true });
    expect(lobby.join(g.id, "uC", "Carol")).toHaveProperty("slotId");

    // Only the host may start.
    expect("error" in lobby.start(g.id, "uB")).toBe(true);
    expect(lobby.start(g.id, "uA")).toEqual({ ok: true });
  });

  it("honors the startingGold option and applies it to player treasuries", () => {
    const lobby = new Lobby();
    const g = lobby.create("Tight", "uA", "Alice", {
      seed: "seed-gold",
      capacity: 1,
      startingGold: "tight",
    });
    expect(g.startingGold).toBe("tight");
    expect(lobby.start(g.id)).toEqual({ ok: true });
    const host = lobby.get(g.id)!.host!;
    expect(host.state.players[0]!.gold).toBe(25);

    const g2 = lobby.create("Generous", "uA", "Alice", {
      seed: "seed-gold2",
      capacity: 1,
      startingGold: "generous",
    });
    lobby.start(g2.id);
    expect(lobby.get(g2.id)!.host!.state.players[0]!.gold).toBe(150);
  });

  it("lets seated players pick distinct civs that survive into the game", () => {
    const lobby = new Lobby();
    const g = lobby.create("Civ Picks", "uA", "Alice", { seed: "seed-civ", capacity: 2 });
    lobby.join(g.id, "uB", "Bob");

    expect(lobby.pickCiv(g.id, "uA", "rome")).toEqual({ ok: true });
    expect(lobby.pickCiv(g.id, "uB", "sumer")).toEqual({ ok: true });

    // The room snapshot reflects the choices.
    const room = lobby.room(g.id)!;
    expect(room.slots[0]!.civId).toBe("rome");
    expect(room.slots[1]!.civId).toBe("sumer");

    expect(lobby.start(g.id)).toEqual({ ok: true });
    const players = lobby.get(g.id)!.host!.state.players;
    expect(players[0]!.civId).toBe("rome");
    expect(players[1]!.civId).toBe("sumer");
  });

  it("rejects picking a civ already taken by a human or an AI", () => {
    const lobby = new Lobby();
    const g = lobby.create("Contested", "uA", "Alice", {
      seed: "seed-contested",
      capacity: 2,
      aiCivIds: ["egypt"],
    });
    lobby.join(g.id, "uB", "Bob");

    expect(lobby.pickCiv(g.id, "uA", "rome")).toEqual({ ok: true });
    // Another human can't take the host's civ.
    expect("error" in lobby.pickCiv(g.id, "uB", "rome")).toBe(true);
    // Nobody can take an AI's civ.
    expect("error" in lobby.pickCiv(g.id, "uB", "egypt")).toBe(true);
    // A non-seated user is rejected.
    expect("error" in lobby.pickCiv(g.id, "uZ", "sumer")).toBe(true);

    // Clearing back to random frees the civ for someone else.
    expect(lobby.pickCiv(g.id, "uA", null)).toEqual({ ok: true });
    expect(lobby.pickCiv(g.id, "uB", "rome")).toEqual({ ok: true });
    expect(lobby.room(g.id)!.slots[0]!.civId).toBeUndefined();
  });

  it("lets the host delete a game and rejects deletions by others", () => {
    const lobby = new Lobby();
    const g = lobby.create("Deletable", "uA", "Alice", { seed: "seed-del" });
    expect(lobby.delete(g.id, "uA")).toEqual({ ok: true });
    expect(lobby.get(g.id)).toBeUndefined();

    const g2 = lobby.create("Protected", "uA", "Alice", { seed: "seed-prot" });
    lobby.join(g2.id, "uB", "Bob");
    expect("error" in lobby.delete(g2.id, "uB")).toBe(true);
    expect(lobby.get(g2.id)).toBeDefined();
  });
});
