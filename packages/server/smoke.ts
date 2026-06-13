// End-to-end smoke test of the live server over real WebSockets (run with Bun).
// Two clients register, create/join/start a game, found cities, and resolve a
// simultaneous turn. Exits 0 on success, 1 on failure.

const URL = `ws://localhost:${process.env.PORT ?? 3030}/ws`;

interface Msg { t: string; [k: string]: unknown }

function client(label: string) {
  const ws = new WebSocket(URL);
  const queue: Msg[] = [];
  const waiters: { pred: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  ws.onmessage = (e: MessageEvent) => {
    const m = JSON.parse(String(e.data)) as Msg;
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m);
    else queue.push(m);
  };
  const ready = new Promise<void>((res) => (ws.onopen = () => res()));
  return {
    label,
    ready,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    next: (pred: (m: Msg) => boolean) =>
      new Promise<Msg>((resolve, reject) => {
        const i = queue.findIndex(pred);
        if (i >= 0) return resolve(queue.splice(i, 1)[0]!);
        waiters.push({ pred, resolve });
        setTimeout(() => reject(new Error(`${label}: timeout waiting for message`)), 5000);
      }),
    close: () => ws.close(),
  };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

const findSettler = (view: any, ownerId: number) =>
  view.units.find((u: any) => u.ownerId === ownerId && u.type === "settler");

async function main() {
  const alice = client("alice");
  const bob = client("bob");
  await Promise.all([alice.ready, bob.ready]);

  // Register.
  alice.send({ t: "register", handle: "alice", password: "secret" });
  assert((await alice.next((m) => m.t === "authOk")).handle === "alice", "alice authOk");
  bob.send({ t: "register", handle: "bob", password: "secret" });
  await bob.next((m) => m.t === "authOk");

  // Create + join + start.
  alice.send({ t: "createGame", name: "Smoke", seed: "smoke-seed" });
  const joined = await alice.next((m) => m.t === "joined");
  const gameId = joined.gameId as string;
  assert(joined.playerId === 0, "alice is player 0");

  bob.send({ t: "joinGame", gameId });
  assert((await bob.next((m) => m.t === "joined")).playerId === 1, "bob is player 1");

  alice.send({ t: "startGame", gameId });
  const sA = await alice.next((m) => m.t === "state");
  const sB = await bob.next((m) => m.t === "state");
  assert((sA.view as any).turn === 1, "turn 1 at start");

  // Fog: alice's state must not contain bob's (distant) units.
  assert(!(sA.view as any).units.some((u: any) => u.ownerId === 1), "fog hides bob from alice");

  // Both found cities.
  const settlerA = findSettler(sA.view, 0);
  alice.send({ t: "order", cmd: { type: "foundCity", unitId: settlerA.id } });
  const afterFoundA = await alice.next((m) => m.t === "state");
  assert((afterFoundA.view as any).cities.some((c: any) => c.ownerId === 0), "alice founded a city");

  const settlerB = findSettler(sB.view, 1);
  bob.send({ t: "order", cmd: { type: "foundCity", unitId: settlerB.id } });
  await bob.next((m) => m.t === "state");

  // Ready up -> simultaneous resolution advances the turn for both.
  alice.send({ t: "ready" });
  const awaitingState = await alice.next((m) => m.t === "state");
  assert((awaitingState.awaiting as number[]).includes(1), "still awaiting bob");

  bob.send({ t: "ready" });
  const resolvedA = await alice.next((m) => (m.t === "state") && (m.view as any).turn === 2);
  assert((resolvedA.view as any).turn === 2, "turn advanced to 2 after both ready");

  console.log("SMOKE PASS: register/create/join/start/order/fog/simultaneous-resolve all OK");
  alice.close();
  bob.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE FAIL:", e.message);
  process.exit(1);
});
