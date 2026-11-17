import { describe, expect, it } from "vitest";
import { act, cards, createMission, pendingSeats, stepMission, type Card, type Mission } from "../src/sim/mission";

function scripted(m: Mission, pick: (card: Card) => string | null, cap = 6000): void {
  for (let i = 0; i < cap && !m.ended; i++) {
    let acted = false;
    for (const card of cards(m)) {
      const action = pick(card);
      if (action) acted = act(m, action) || acted;
    }
    m.timeScale = acted || pendingSeats(m).length > 0 || m.held ? 1 : 20;
    stepMission(m, 0.25);
  }
}

const NOMINAL: Record<string, string> = {
  wind: "wind:hold",
  "wind-resume": "wind:resume",
  cabin: "cabin:b",
  pilot: "pilot:set",
  engine: "engine:sensor",
  loft: "loft:accept",
  relay: "capcom:relay",
  "flight-go": "flight:go",
  arm: "commander:arm",
  maxq: "guidance:maxq",
  tower: "capcom:tower",
  staging: "capcom:staging",
  "fido-land": "fido:commit",
};

function nominalPick(card: Card): string | null {
  if (card.id.startsWith("vote-")) return card.choices[0]?.action ?? null;
  return NOMINAL[card.id] ?? null;
}

describe("mission loop", () => {
  it("flies a clean Skiff-1 onto Bay One", () => {
    const m = createMission();
    scripted(m, nominalPick);
    expect(m.ended).toBe(true);
    expect(m.flight?.result).toBe("landed");
    expect(m.debrief?.grade).toBe("A");
    expect(m.debrief?.total).toBe(m.debrief?.max);
  });

  it("still lands when the player clock runs at 24×", () => {
    const m = createMission();
    m.timeScale = 24;
    for (let i = 0; i < 8000 && !m.ended; i++) {
      for (const card of cards(m)) {
        const action = nominalPick(card);
        if (action) act(m, action);
      }
      if (pendingSeats(m).length === 0 && !m.held) m.timeScale = 24;
      stepMission(m, 0.016);
    }
    expect(m.ended).toBe(true);
    expect(m.flight?.result).toBe("landed");
    expect(m.flight?.touchMiss).toBeLessThan(40);
  });

  it("leaves the abort handle off the call strip", () => {
    const m = createMission();
    for (let i = 0; i < 4000 && !(m.flight && m.flight.t > 8); i++) {
      for (const card of cards(m)) {
        const action = nominalPick(card);
        if (action) act(m, action);
      }
      m.timeScale = 20;
      stepMission(m, 0.25);
    }
    expect(m.flight).not.toBeNull();
    expect(cards(m).some((card) => card.id === "abort")).toBe(true);
    expect(pendingSeats(m)).not.toContain("commander");
  });

  it("holds the count when Weather never calls", () => {
    const m = createMission();
    m.timeScale = 30;
    for (let i = 0; i < 200 && m.wind === "open"; i++) stepMission(m, 0.1);
    expect(m.wind).toBe("sounding");
    expect(m.held).toBe(true);
    expect(m.flight).toBeNull();
  });

  it("scrubs on the cabin call", () => {
    const m = createMission();
    scripted(m, (card) => (card.id === "cabin" ? "cabin:scrub" : nominalPick(card)), 800);
    expect(m.endKind).toBe("scrub");
    expect(m.flight).toBeNull();
    expect(m.debrief?.rows.find((r) => r.label === "Crew")?.earned).toBe(8);
  });

  it("loses the booster when Flight overrides the wind and FIDO commits", () => {
    const m = createMission();
    scripted(m, (card) => {
      if (card.id === "wind") return "wind:send";
      if (card.id === "wind-flight") return "wind:override";
      if (card.id === "wind-fido") return null;
      if (card.id === "fido-land") return "fido:commit";
      return nominalPick(card);
    });
    expect(m.flight?.result).toBe("lost");
    expect(m.ended).toBe(true);
  });

  it("saves the booster with a ditch after inhibiting engine 5", () => {
    const m = createMission();
    scripted(m, (card) => {
      if (card.id === "engine") return "engine:inhibit";
      if (card.id === "fido-land") return "fido:ditch";
      return nominalPick(card);
    });
    expect(m.flight?.result).toBe("expended");
    expect(m.debrief?.rows.find((r) => r.label === "Booster call")?.earned).toBe(16);
  });
});
