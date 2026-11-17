import { describe, expect, it } from "vitest";
import { createFlight, noseAltitude, stepFlight, type Flight } from "../src/sim/physics";

function fly(engines: 8 | 9, gust: "none" | "sporty" | "override" = "none", plan: "commit" | "ditch" = "commit"): Flight {
  const f = createFlight({ engines, gust });
  for (let i = 0; i < 4000 && f.result === "flying" && f.t < 700; i++) {
    if (f.separated && f.plan === "unset" && f.t > (f.sepT ?? 0) + 5) f.plan = plan;
    stepFlight(f, 0.25);
  }
  return f;
}

describe("NL-9 flight model", () => {
  it("puts a nominal booster on Bay One and sends Skiff fast", () => {
    const f = fly(9);
    expect(f.result).toBe("landed");
    expect(f.touchMiss).toBeLessThan(40);
    expect(Math.abs(f.touchVy)).toBeLessThan(6);
    expect(f.maxQ).toBeGreaterThan(18_000);
    expect(f.maxQ).toBeLessThan(45_000);
    expect(noseAltitude(f)).toBeGreaterThan(80_000);
    expect(Math.hypot(f.upper.vx, f.upper.vy)).toBeGreaterThan(6_000);
  });

  it("still catches the ship in a sporty wind", () => {
    expect(fly(9, "sporty").result).toBe("landed");
  });

  it("walks off the deck when the wind was never briefed", () => {
    expect(fly(9, "override").result).toBe("lost");
  });

  it("misses the ship after an engine is inhibited", () => {
    const f = fly(8);
    expect(f.result).toBe("lost");
    expect(f.touchMiss).toBeGreaterThan(2_000);
  });

  it("ditches cleanly when FIDO stands the ship down", () => {
    expect(fly(9, "override", "ditch").result).toBe("expended");
    expect(fly(8, "none", "ditch").result).toBe("expended");
  });
});
