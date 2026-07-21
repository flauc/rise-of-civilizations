import { describe, expect, it } from "vitest";
import { CIVILIZATIONS } from "./index";
import { CIV_REGIONS } from "./history-geo";
import { bgmTrackForCiv, civBgmRegion } from "./civ-bgm";

describe("civBgmRegion", () => {
  it("covers every civilization", () => {
    for (const civ of CIVILIZATIONS) {
      expect(civBgmRegion(civ.id)).toBeTruthy();
      expect(bgmTrackForCiv(civ.id)).toMatch(/^audio\/.+\.ogg$/);
    }
  });

  it("maps representative civs to expected regions", () => {
    expect(civBgmRegion("mali")).toBe("africa");
    expect(civBgmRegion("egypt")).toBe("ancientMiddleEast");
    expect(civBgmRegion("babylon")).toBe("ancientMiddleEast");
    expect(civBgmRegion("celts_gauls")).toBe("celtic");
    expect(civBgmRegion("han_china")).toBe("eastAsia");
    expect(civBgmRegion("maurya")).toBe("india");
    expect(civBgmRegion("japan")).toBe("japan");
    expect(civBgmRegion("mongols")).toBe("siberian");
    expect(civBgmRegion("rome")).toBe("ancientMiddleEast");
    expect(civBgmRegion("france")).toBe("default");
    expect(civBgmRegion("inca")).toBe("default");
  });

  it("matches every civ id listed in CIV_REGIONS", () => {
    const regionIds = new Set(CIV_REGIONS.flatMap((r) => r.civIds));
    expect(regionIds.size).toBe(CIVILIZATIONS.length);
    for (const id of regionIds) {
      expect(civBgmRegion(id)).toBeTruthy();
    }
  });
});
