import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { advanceWorks } from "./works";
import { citiesOf, unitsOf } from "./state";
import { computeRoadPath, startRoadRoute, tilesNeedingRoad } from "./road-routes";

function gameWithSurveyor(): ReturnType<typeof createGame> {
  const s = createGame({ seed: "road-route", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  city.population = 5;
  city.specialists.push({ id: s.nextEntityId++, type: "agrimensor", xp: 0, level: 1 });
  return s;
}

function grassland(s: ReturnType<typeof createGame>, city: ReturnType<typeof citiesOf>[number], col: number, row: number) {
  const t = getTile(s.map, col, row)!;
  t.terrain = "grassland";
  t.improvement = undefined;
  t.road = false;
  t.river = undefined; // clear any worldgen river so a road can be laid without Bridge Building
  t.ownerCityId = city.id;
  return t;
}

describe("road routes", () => {
  it("finds a land path and queues tiles that need paving", () => {
    const s = gameWithSurveyor();
    const city = citiesOf(s, 0)[0]!;
    const a = grassland(s, city, city.col + 1, city.row);
    const b = grassland(s, city, city.col + 2, city.row);
    const c = grassland(s, city, city.col + 3, city.row);
    const path = computeRoadPath(s, 0, a.col, a.row, c.col, c.row);
    expect(path.length).toBeGreaterThanOrEqual(3);
    const queue = tilesNeedingRoad(s, 0, path);
    expect(queue.length).toBeGreaterThanOrEqual(3);
    expect(queue.some((t) => t.col === b.col && t.row === b.row)).toBe(true);
  });

  it("paves a route one tile at a time with a single surveyor", () => {
    const s = gameWithSurveyor();
    const city = citiesOf(s, 0)[0]!;
    const start = grassland(s, city, city.col + 1, city.row);
    grassland(s, city, city.col + 2, city.row);
    grassland(s, city, city.col + 3, city.row);
    const end = grassland(s, city, city.col + 4, city.row);
    const res = startRoadRoute(s, 0, start.col, start.row, end.col, end.row);
    expect(res.ok).toBe(true);
    expect(s.roadRoutes).toHaveLength(1);
    expect(s.works.filter((w) => w.routeId === res.routeId)).toHaveLength(1);

    let guard = 0;
    while (s.roadRoutes.length > 0 && guard++ < 80) {
      const w = s.works.find((x) => x.ownerId === 0 && x.kind === "road");
      if (w) w.progress = { ...w.requirement };
      advanceWorks(s, 0);
    }

    expect(getTile(s.map, end.col, end.row)?.road).toBe(true);
    expect(s.roadRoutes).toHaveLength(0);
  });

  it("paves several tiles in parallel with multiple surveyors", () => {
    const s = gameWithSurveyor();
    const city = citiesOf(s, 0)[0]!;
    city.specialists.push({ id: 99, type: "agrimensor", xp: 0, level: 1 });
    const ids = city.specialists.filter((sp) => sp.type === "agrimensor").map((sp) => sp.id);
    expect(ids.length).toBe(2);

    const start = grassland(s, city, city.col + 1, city.row);
    for (let d = 2; d <= 4; d++) grassland(s, city, city.col + d, city.row);
    const end = grassland(s, city, city.col + 5, city.row);
    const res = startRoadRoute(s, 0, start.col, start.row, end.col, end.row, ids);
    expect(res.ok).toBe(true);
    expect(s.works.filter((w) => w.routeId === res.routeId).length).toBe(2);

    let guard = 0;
    while (s.roadRoutes.length > 0 && guard++ < 80) {
      for (const w of s.works.filter((x) => x.ownerId === 0 && x.kind === "road")) {
        w.progress = { ...w.requirement };
      }
      advanceWorks(s, 0);
    }

    const paved = [2, 3, 4, 5].every((d) => getTile(s.map, city.col + d, city.row)?.road);
    expect(paved).toBe(true);
  });

  it("rejects routes with no available surveyor", () => {
    const s = gameWithSurveyor();
    const city = citiesOf(s, 0)[0]!;
    city.specialists = [];
    const start = grassland(s, city, city.col + 1, city.row);
    const end = grassland(s, city, city.col + 3, city.row);
    expect(startRoadRoute(s, 0, start.col, start.row, end.col, end.row).ok).toBe(false);
  });

  it("runs through the command path", () => {
    const s = gameWithSurveyor();
    const city = citiesOf(s, 0)[0]!;
    const start = grassland(s, city, city.col + 1, city.row);
    grassland(s, city, city.col + 2, city.row);
    const end = grassland(s, city, city.col + 3, city.row);
    expect(
      applyCommand(s, {
        type: "startRoadRoute",
        fromCol: start.col,
        fromRow: start.row,
        toCol: end.col,
        toRow: end.row,
      }).ok,
    ).toBe(true);
    expect(s.roadRoutes).toHaveLength(1);
  });
});
