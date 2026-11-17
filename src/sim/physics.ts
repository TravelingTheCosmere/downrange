import {
  AREA,
  BAY_ONE_X,
  BOOSTER_H,
  CAPSULE,
  DECK_Y,
  ENTRY_KEEP,
  G0,
  LANDING_KEEP,
  MECO_PROP,
  MERLIN_ISP_SL,
  MERLIN_ISP_VAC,
  MERLIN_SL,
  MERLIN_VAC,
  MVAC_ISP,
  MVAC_THRUST,
  S1_DRY,
  S1_PROP,
  S2_DRY,
  S2_PROP,
  UPPER_H,
  density,
  gravity,
} from "./vehicle";
import { clamp } from "./format";

export type BoosterPhase =
  | "ascent"
  | "boostback"
  | "coast"
  | "entry"
  | "landing"
  | "ditch"
  | "down";

export type BoosterResult = "flying" | "landed" | "expended" | "lost";
export type Gust = "none" | "sporty" | "override";
export type FidoPlan = "unset" | "commit" | "ditch";

export interface Craft {
  x: number;
  y: number;
  vx: number;
  vy: number;
  prop: number;
  dry: number;
  throttle: number;
  /** Radians from vertical. Positive pitches the nose toward +x (downrange). */
  pitch: number;
  engines: number;
  thrustSl: number;
  thrustVac: number;
  ispSl: number;
  ispVac: number;
  area: number;
  cd: number;
  alive: boolean;
}

export interface Flight {
  t: number;
  separated: boolean;
  /** Tail of the crewed stack before staging, then the base of the upper stage. */
  upper: Craft;
  booster: Craft;
  phase: BoosterPhase;
  plan: FidoPlan;
  gust: Gust;
  bargeX: number;
  q: number;
  maxQ: number;
  sepT: number | null;
  entryTime: number;
  entryDone: boolean;
  landingTime: number;
  boostTime: number;
  predictedX: number;
  sincePredict: number;
  /** Leftover time so every run integrates in the same 0.05 s steps. */
  simRemain: number;
  gustApplied: boolean;
  result: BoosterResult;
  touchVy: number;
  touchVx: number;
  touchMiss: number;
  events: string[];
  trace: string[];
}

export interface FlightOpts {
  engines: 8 | 9;
  bargeX?: number;
  gust?: Gust;
  trace?: boolean;
}

export function createFlight(opts: FlightOpts): Flight {
  const upper: Craft = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    prop: S1_PROP,
    dry: S1_DRY + S2_DRY + S2_PROP + CAPSULE,
    throttle: 1,
    pitch: 0,
    engines: opts.engines,
    thrustSl: MERLIN_SL,
    thrustVac: MERLIN_VAC,
    ispSl: MERLIN_ISP_SL,
    ispVac: MERLIN_ISP_VAC,
    area: AREA,
    cd: 0.42,
    alive: true,
  };
  return {
    t: 0,
    separated: false,
    upper,
    booster: deadBooster(),
    phase: "ascent",
    plan: "unset",
    gust: opts.gust ?? "none",
    bargeX: opts.bargeX ?? BAY_ONE_X,
    q: 0,
    maxQ: 0,
    sepT: null,
    entryTime: 0,
    entryDone: false,
    landingTime: 0,
    boostTime: 0,
    predictedX: 0,
    sincePredict: 10,
    simRemain: 0,
    gustApplied: false,
    result: "flying",
    touchVy: 0,
    touchVx: 0,
    touchMiss: 0,
    events: [],
    trace: opts.trace ? [] : [],
  };
}

function deadBooster(): Craft {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    prop: 0,
    dry: S1_DRY,
    throttle: 0,
    pitch: 0,
    engines: 0,
    thrustSl: MERLIN_SL,
    thrustVac: MERLIN_VAC,
    ispSl: MERLIN_ISP_SL,
    ispVac: MERLIN_ISP_VAC,
    area: AREA,
    cd: 0.9,
    alive: false,
  };
}

export function massOf(c: Craft): number {
  return c.dry + Math.max(0, c.prop);
}

/** Thrust direction: +pitch tilts thrust toward +x. ty = cos, tx = sin. */
export function thrustDir(pitch: number): { tx: number; ty: number } {
  return { tx: Math.sin(pitch), ty: Math.cos(pitch) };
}

export function noseAltitude(f: Flight): number {
  if (!f.separated) {
    return f.upper.y + Math.cos(f.upper.pitch) * (BOOSTER_H + UPPER_H);
  }
  return f.upper.y + Math.cos(f.upper.pitch) * UPPER_H;
}

export function crewSpeed(f: Flight): number {
  return Math.hypot(f.upper.vx, f.upper.vy);
}

export function stepFlight(f: Flight, dt: number): void {
  if (dt <= 0 || f.result !== "flying") return;
  f.simRemain += dt;
  let guard = 0;
  while (f.simRemain >= 0.05 && guard < 80) {
    stepOnce(f, 0.05);
    f.simRemain -= 0.05;
    guard += 1;
    if (f.result !== "flying") {
      f.simRemain = 0;
      return;
    }
  }
}

function stepOnce(f: Flight, dt: number): void {
  f.t += dt;
  if (!f.separated) {
    guideAscent(f);
    integrate(f.upper, dt);
    const speed = Math.hypot(f.upper.vx, f.upper.vy);
    f.q = 0.5 * density(f.upper.y) * speed * speed;
    if (f.q > f.maxQ) f.maxQ = f.q;
    if (f.upper.prop <= MECO_PROP && f.upper.y > 25_000 && f.t > 70) separate(f);
    if (f.upper.y < 0 && f.t > 3) {
      f.upper.y = 0;
      f.result = "lost";
      f.events.push("lost");
    }
    return;
  }

  guideUpper(f.upper);
  integrate(f.upper, dt);

  if (f.result === "flying" && f.booster.alive) {
    guideBooster(f, dt);
    integrate(f.booster, dt);
    checkBooster(f);
  }
}

function pitchProgram(t: number): number {
  const d = (deg: number) => (deg * Math.PI) / 180;
  if (t < 14) return 0;
  if (t < 36) return d(6) * ((t - 14) / 22);
  if (t < 75) return d(6) + d(16) * ((t - 36) / 39);
  if (t < 115) return d(22) + d(20) * ((t - 75) / 40);
  return Math.min(d(62), d(42) + d(20) * ((t - 115) / 40));
}

function guideAscent(f: Flight): void {
  const c = f.upper;
  const prograde = Math.atan2(c.vx, Math.max(c.vy, 1));
  const program = pitchProgram(f.t);
  // Open-loop kick, then stay within a few degrees of prograde so the turn cannot run away.
  const maxAoa = (3 * Math.PI) / 180;
  const pitch = f.t < 30 ? program : clamp(program, prograde - maxAoa, prograde + maxAoa);
  c.pitch = clamp(pitch, 0, (68 * Math.PI) / 180);
  c.throttle = f.q > 36_000 ? 0.7 : f.q > 30_000 ? 0.85 : 1;
}

function separate(f: Flight): void {
  const src = f.upper;
  const along = thrustDir(src.pitch);
  const booster = deadBooster();
  booster.x = src.x;
  booster.y = src.y;
  booster.vx = src.vx;
  booster.vy = src.vy - 0.3;
  booster.prop = src.prop;
  booster.dry = S1_DRY;
  booster.pitch = src.pitch;
  booster.alive = true;
  booster.cd = 0.95;
  f.booster = booster;

  src.x += along.tx * BOOSTER_H;
  src.y += along.ty * BOOSTER_H;
  src.vy += 0.6;
  src.prop = S2_PROP;
  src.dry = S2_DRY + CAPSULE;
  src.engines = 1;
  src.thrustSl = MVAC_THRUST;
  src.thrustVac = MVAC_THRUST;
  src.ispSl = MVAC_ISP;
  src.ispVac = MVAC_ISP;
  src.cd = 0.35;
  src.throttle = 0;

  f.separated = true;
  f.sepT = f.t;
  f.phase = "boostback";
  f.events.push("meco");
  f.events.push("sep");
  f.events.push("boostback");
}

function guideUpper(c: Craft): void {
  if (c.prop <= 0) {
    c.throttle = 0;
    return;
  }
  c.throttle = 1;
  const prograde = Math.atan2(c.vx, Math.max(c.vy, 0.5));
  c.pitch = clamp(prograde, -0.2, (80 * Math.PI) / 180);
}

function guideBooster(f: Flight, dt: number): void {
  const b = f.booster;
  if (f.plan === "ditch" && (f.phase === "coast" || f.phase === "landing")) {
    f.events.push("ditch");
    f.phase = "ditch";
    b.throttle = 0;
  }
  if (f.phase === "boostback") {
    f.boostTime += dt;
    f.sincePredict += dt;
    if (f.sincePredict > 0.4) {
      f.predictedX = predictImpactX(b, DECK_Y);
      f.sincePredict = 0;
    }
    const speed = Math.hypot(b.vx, b.vy);
    const retro = Math.atan2(-b.vx / Math.max(speed, 1), -b.vy / Math.max(speed, 1));
    // Coast impact runs long of the ship; entry and drag eat the extra.
    const miss = f.predictedX - (f.bargeX + 21_300);
    b.pitch = retro + clamp(miss / 250_000, -0.15, 0.15);
    b.engines = 3;
    b.throttle = 1;
    const reserve = ENTRY_KEEP + LANDING_KEEP;
    const close = miss < 3_000 && f.boostTime > 6;
    if (f.boostTime > 4 && (b.prop <= reserve || close)) {
      f.phase = "coast";
      b.throttle = 0;
      f.events.push("coast");
    }
    return;
  }

  if (f.phase === "coast") {
    b.throttle = 0;
    b.pitch = Math.atan2(b.vx, Math.max(b.vy, 0.2));
    if (!f.entryDone && b.vy < -40 && b.y < 72_000 && b.y > 18_000) {
      f.phase = "entry";
      f.entryTime = 0;
      f.events.push("entry");
    }
    return;
  }

  if (f.phase === "entry") {
    f.entryTime += dt;
    pointRetro(b);
    const floor = f.plan === "ditch" ? 800 : LANDING_KEEP;
    b.engines = b.prop > floor ? 3 : 0;
    b.throttle = b.engines > 0 ? 1 : 0;
    const speed = Math.hypot(b.vx, b.vy);
    if (f.entryTime > 40 || speed < 300 || b.y < 25_000 || b.prop <= floor) {
      b.throttle = 0;
      f.entryDone = true;
      f.phase = f.plan === "ditch" ? "ditch" : "coast";
    }
    return;
  }

  if (f.phase === "ditch") {
    b.throttle = 0;
    pointRetro(b);
    return;
  }

  if (f.phase === "landing") {
    f.landingTime += dt;
    if (!f.gustApplied && b.y < (f.gust === "override" ? 260 : 2_000)) {
      if (f.gust === "override") b.vx += 34;
      else if (f.gust === "sporty") b.vx += 3.5;
      f.gustApplied = true;
    }
    const h = b.y - DECK_Y;
    const vDown = Math.max(0, -b.vy);
    // Trim horizontal speed only. Downrange position is set by the boostback aim.
    const ax = clamp((0 - b.vx) * 1.1, -8, 8);
    b.pitch = clamp(Math.atan2(ax, 26), -0.2, 0.2);
    const mass = massOf(b);
    b.engines = 1;
    // One engine at minimum throttle still lifts a light booster, so this is a hoverslam:
    // stay shut down until minimum throttle would stop at the deck, then follow that curve,
    // and cut the moment the tail starts rising.
    if (b.vy > 0.8 || (h < 18 && vDown < 3.5) || b.prop <= 0) {
      b.throttle = 0;
      return;
    }
    const aMin = merlinThrust(b.y, 1, 0.62) / mass - gravity(b.y);
    const aNeed = (vDown * vDown) / (2 * Math.max(h, 0.6));
    if (aNeed < aMin * 0.95 && h > 25) {
      b.throttle = 0;
      return;
    }
    const tMax = merlinThrust(b.y, 1, 1);
    const along = ((aNeed + gravity(b.y)) * mass) / Math.max(0.7, Math.cos(Math.abs(b.pitch)));
    b.throttle = tMax > 0 ? clamp(along / tMax, 0.62, 1) : 0;
  }
}

function pointRetro(b: Craft): void {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < 1) {
    b.pitch = 0;
    return;
  }
  b.pitch = Math.atan2(-b.vx / speed, -b.vy / speed);
}

function checkBooster(f: Flight): void {
  const b = f.booster;
  if (f.phase === "ditch" || (f.booster.vy < 0 && f.booster.y < 55_000 && f.booster.throttle < 0.2)) {
    f.booster.cd = 2.4;
  } else if (f.separated) {
    f.booster.cd = 0.85;
  }

  if (f.phase === "coast" && f.entryDone && f.plan !== "ditch" && b.vy < 0 && b.y < 18_000) {
    const start = suicideStart(b);
    if (b.y - DECK_Y < start) {
      f.phase = "landing";
      f.landingTime = 0;
      f.events.push("landing");
    }
  }

  if (f.phase === "ditch" && b.y <= 0) {
    finish(f, "expended");
    return;
  }

  if (f.phase === "landing" && b.y <= DECK_Y + 1.5) {
    const vDown = Math.max(0, -b.vy);
    const miss = Math.abs(b.x - f.bargeX);
    f.touchVy = b.vy;
    f.touchVx = b.vx;
    f.touchMiss = miss;
    const soft = vDown < 6 && Math.abs(b.vx) < 5 && miss < 40;
    finish(f, soft ? "landed" : "lost");
    return;
  }

  if (b.y <= 0 && f.phase !== "landing") {
    f.touchVy = b.vy;
    f.touchVx = b.vx;
    f.touchMiss = Math.abs(b.x - f.bargeX);
    finish(f, "lost");
  }
}

function suicideStart(b: Craft): number {
  const vDown = Math.max(0, -b.vy);
  const mass = massOf(b);
  // Start on the minimum-throttle curve. Starting on full thrust hovers and climbs.
  const aNet = merlinThrust(b.y, 1, 0.62) / mass - gravity(b.y);
  if (aNet < 1.2) return 40_000;
  return (vDown * vDown) / (2 * aNet) + 30;
}

function finish(f: Flight, result: BoosterResult): void {
  f.result = result;
  f.booster.alive = false;
  f.booster.throttle = 0;
  f.booster.vy = Math.max(0, f.booster.vy);
  f.phase = "down";
  f.events.push(result === "landed" ? "landed" : result === "expended" ? "expended" : "lost");
}

function predictImpactX(c: Craft, deck: number): number {
  const g = { ...c, throttle: 0, engines: 0 };
  for (let i = 0; i < 900; i++) {
    integrate(g, 0.5);
    if (g.y <= deck) return g.x;
  }
  return g.x;
}

function merlinThrust(y: number, engines: number, throttle: number): number {
  const atmo = clamp(density(y) / 1.225, 0, 1);
  const each = MERLIN_VAC * (1 - atmo) + MERLIN_SL * atmo;
  return each * engines * throttle;
}

function engineThrust(c: Craft, throttle: number): number {
  if (c.thrustVac === MVAC_THRUST && c.engines === 1 && c.ispVac === MVAC_ISP) {
    return c.thrustVac * c.engines * throttle;
  }
  return merlinThrust(c.y, c.engines, throttle);
}

function integrate(c: Craft, dt: number): void {
  if (!c.alive && c.throttle <= 0 && c.y <= 0) return;
  const mass = Math.max(200, massOf(c));
  const atmo = clamp(density(c.y) / 1.225, 0, 1);
  let throttle = c.prop > 0 ? c.throttle : 0;
  const thrust = engineThrust(c, throttle);
  const isp = c.ispVac * (1 - atmo) + c.ispSl * atmo;
  const mdot = thrust > 0 && isp > 0 ? thrust / (isp * G0) : 0;
  const dir = thrustDir(c.pitch);
  let ax = (thrust * dir.tx) / mass;
  let ay = (thrust * dir.ty) / mass;
  const speed = Math.hypot(c.vx, c.vy);
  const rho = density(c.y);
  if (speed > 0.5 && rho > 0) {
    const drag = (0.5 * rho * speed * speed * c.cd * c.area) / mass;
    ax -= drag * (c.vx / speed);
    ay -= drag * (c.vy / speed);
  }
  ay -= gravity(c.y);
  c.vx += ax * dt;
  c.vy += ay * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.prop = Math.max(0, c.prop - mdot * dt);
  if (c.y < -50) c.y = -50;
}

export function enableTrace(f: Flight): void {
  f.trace.push("t,phase,alt,x,vx,vy,prop,q,pred");
}

export function sampleTrace(f: Flight): void {
  const c = f.separated ? f.booster : f.upper;
  f.trace.push(
    [
      f.t.toFixed(1),
      f.phase,
      c.y.toFixed(0),
      c.x.toFixed(0),
      c.vx.toFixed(1),
      c.vy.toFixed(1),
      c.prop.toFixed(0),
      f.maxQ.toFixed(0),
      f.predictedX.toFixed(0),
    ].join(","),
  );
}

/** Crewed-vehicle nose in world meters. +x downrange, +y up. */
export function crewNose(f: Flight): { x: number; y: number } {
  if (!f.separated) {
    const d = thrustDir(f.upper.pitch);
    const len = BOOSTER_H + UPPER_H;
    return { x: f.upper.x + d.tx * len, y: f.upper.y + d.ty * len };
  }
  const d = thrustDir(f.upper.pitch);
  return { x: f.upper.x + d.tx * UPPER_H, y: f.upper.y + d.ty * UPPER_H };
}
