import { seatById, VOTERS, type SeatId } from "./seats";
import {
  createFlight,
  crewSpeed,
  noseAltitude,
  stepFlight,
  type Flight,
} from "./physics";

export type WindState = "open" | "sounding" | "await" | "nominal" | "sporty" | "override";
export type CabinState = "pending" | "bad" | "good" | "scrub";
export type EngineState = "pending" | "sensor" | "inhibit" | "abort";
export type LoftState = "pending" | "accepted";
export type Vote = "none" | "go" | "nogo";
export type FidoState = "wait" | "open" | "commit" | "ditch";
export type Scripted = "sounding" | "recycle" | "regen" | null;

export interface LogLine {
  t: number;
  speaker: string;
  person: string;
  text: string;
}

export interface Choice {
  action: string;
  label: string;
  tone: "go" | "hold" | "danger" | "neutral";
}

export interface Card {
  id: string;
  seat: SeatId;
  kicker: string;
  title: string;
  body: string;
  tone: "normal" | "warn" | "danger";
  choices: Choice[];
  /** Shown on the seat, but it does not light the call strip or stop the clock. */
  optional?: boolean;
}

export interface ScoreRow {
  label: string;
  earned: number;
  max: number;
  note: string;
}

export interface Debrief {
  title: string;
  subtitle: string;
  rows: ScoreRow[];
  total: number;
  max: number;
  grade: string;
}

export interface Mission {
  t: number;
  paused: boolean;
  held: boolean;
  holdNote: string;
  timeScale: number;
  seat: SeatId;
  ended: boolean;
  endKind: string;
  scripted: Scripted;
  wallHold: number;
  resumeReady: boolean;
  wind: WindState;
  windMissed: boolean;
  windDue: number;
  cabin: CabinState;
  cabinFirst: "none" | "b" | "a" | "scrub";
  engine: EngineState;
  pilot: "pending" | "set";
  pilotRecycled: boolean;
  loft: LoftState;
  loftHow: "none" | "accept" | "regen" | "auto";
  votes: Record<SeatId, Vote>;
  pollNogo: boolean;
  relay: boolean;
  flightGo: boolean;
  armed: boolean;
  flight: Flight | null;
  fido: FidoState;
  fidoAuto: boolean;
  maxq: boolean;
  maxqSeen: boolean;
  tower: boolean;
  staging: boolean;
  inflightAbort: boolean;
  boosterNoted: boolean;
  log: LogLine[];
  debrief: Debrief | null;
}

const CREW: SeatId[] = ["commander", "pilot", "specialist"];

export function createMission(): Mission {
  const votes = {} as Record<SeatId, Vote>;
  for (const seat of VOTERS) votes[seat] = "none";
  const m: Mission = {
    t: -600,
    paused: false,
    held: false,
    holdNote: "",
    timeScale: 1,
    seat: "flight",
    ended: false,
    endKind: "",
    scripted: null,
    wallHold: 0,
    resumeReady: false,
    wind: "open",
    windMissed: false,
    windDue: 0,
    cabin: "pending",
    cabinFirst: "none",
    engine: "pending",
    pilot: "pending",
    pilotRecycled: false,
    loft: "pending",
    loftHow: "none",
    votes,
    pollNogo: false,
    relay: false,
    flightGo: false,
    armed: false,
    flight: null,
    fido: "wait",
    fidoAuto: false,
    maxq: false,
    maxqSeen: false,
    tower: false,
    staging: false,
    inflightAbort: false,
    boosterNoted: false,
    log: [],
    debrief: null,
  };
  say(m, "sys", "Skiff-1, the count is at T-10 minutes and counting.");
  say(m, "flight", "Seats, watch your calls. Weather has the winds at Bay One.");
  return m;
}

export function stepMission(m: Mission, realDt: number): void {
  if (m.ended || m.paused) return;
  const dt = Math.max(0, Math.min(realDt, 0.1));
  tickScripted(m, dt);
  evaluate(m);
  refreshHold(m);
  if (m.held) return;
  let left = dt * effectiveScale(m);
  let guard = 0;
  while (left > 0 && !m.held && !m.ended && guard < 8) {
    advance(m, Math.min(0.2, left));
    evaluate(m);
    refreshHold(m);
    left -= 0.2;
    guard += 1;
  }
}

function effectiveScale(m: Mission): number {
  if (m.flight?.phase === "landing" && m.timeScale > 4) return 4;
  return m.timeScale;
}

function advance(m: Mission, h: number): void {
  const prev = m.t;
  m.t += h;
  if (!m.flight && prev < 0 && m.t >= 0) {
    if (canLaunch(m)) beginFlight(m);
    else {
      m.t = -0.05;
      m.holdNote = "Holding at T-0. The terminal count is not complete.";
      m.held = true;
      return;
    }
  }
  if (m.flight && m.flight.result === "flying") stepFlight(m.flight, h);
  if (m.flight) drain(m);
}

export function act(m: Mission, action: string): boolean {
  if (m.ended) return false;
  const ok = apply(m, action);
  if (ok) {
    evaluate(m);
    refreshHold(m);
  }
  return ok;
}

export function cards(m: Mission): Card[] {
  const out: Card[] = [];
  if (m.ended) return out;
  windCards(m, out);
  cabinCards(m, out);
  pilotCards(m, out);
  engineCards(m, out);
  loftCards(m, out);
  pollCards(m, out);
  flightCards(m, out);
  return out;
}

export function pendingSeats(m: Mission): SeatId[] {
  const set = new Set<SeatId>();
  for (const card of cards(m)) if (!card.optional) set.add(card.seat);
  return [...set];
}

export function fidoAdvice(m: Mission): "commit" | "ditch" {
  if (m.wind === "override" || m.engine === "inhibit") return "ditch";
  return "commit";
}

function apply(m: Mission, action: string): boolean {
  switch (action) {
    case "wind:hold":
      if (m.wind !== "open") return false;
      startSounding(m, false);
      say(m, "weather", "Flight, Weather. Bay One is two eight knots, limit two five. Holding for a new sounding.");
      return true;
    case "wind:send":
      if (m.wind !== "open") return false;
      m.wind = "await";
      m.windDue = m.t + 75;
      say(m, "weather", "Flight, Weather. I recommend we accept two eight knots at Bay One. FIDO, your call.");
      return true;
    case "wind:resume":
      if (m.wind !== "sounding" || !m.resumeReady) return false;
      m.wind = "nominal";
      m.scripted = null;
      m.wallHold = 0;
      say(m, "weather", "Flight, Weather. New sounding is one niner knots. Bay One is green. Release the hold.");
      return true;
    case "wind:concur":
      if (m.wind !== "await") return false;
      m.wind = "sporty";
      say(m, "fido", "Flight, FIDO. I concur. We'll brief a sporty landing and commit if the picture holds.");
      return true;
    case "wind:nogo":
      if (m.wind !== "await") return false;
      startSounding(m, false);
      say(m, "fido", "Flight, FIDO. No go. Those winds are outside the brief. Hold for a sounding.");
      return true;
    case "wind:override":
      if (m.wind !== "await") return false;
      m.wind = "override";
      say(m, "flight", "FIDO, copy your silence. Flight accepts the wind. We are pressing.");
      say(m, "fido", "Flight, FIDO. That's outside the brief. Bay One will not be a safe commit.");
      return true;
    case "cabin:b":
      if (m.cabin !== "pending" && m.cabin !== "bad") return false;
      m.cabin = "good";
      if (m.cabinFirst === "none") m.cabinFirst = "b";
      say(m, "specialist", "Flight, Skiff. Cabin pressure is on sensor B, one four point seven two. In the band. We're good.");
      return true;
    case "cabin:a":
      if (m.cabin !== "pending") return false;
      m.cabin = "bad";
      m.cabinFirst = "a";
      say(m, "specialist", "Flight, Skiff. Staying on sensor A as prime.");
      say(m, "sys", "Sensor A is outside the band. The count will hold until the cabin is reselected or scrubbed.");
      return true;
    case "cabin:scrub":
      if (m.cabin !== "pending" && m.cabin !== "bad") return false;
      if (m.cabinFirst === "none") m.cabinFirst = "scrub";
      m.cabin = "scrub";
      say(m, "specialist", "Flight, Skiff. Cabin pressure is no go. Recommend scrub.");
      say(m, "flight", "Copy, Skiff. Scrub. Skiff-1 is scrubbed for cabin pressure. The crew is safe.");
      finish(m, "scrub");
      return true;
    case "pilot:set":
      if (m.pilot !== "pending") return false;
      m.pilot = "set";
      say(m, "pilot", "Flight, Skiff. Displays are set. Abort boundaries check.");
      return true;
    case "pilot:recycle":
      if (m.pilot !== "pending" || m.scripted) return false;
      m.pilotRecycled = true;
      m.scripted = "recycle";
      m.wallHold = 0;
      m.holdNote = "Holding. Pilot is recycling the guidance display.";
      say(m, "pilot", "Flight, Skiff. I need a display recycle. Hold the count.");
      return true;
    case "engine:sensor":
      if (m.engine !== "pending") return false;
      m.engine = "sensor";
      say(m, "propulsion", "Flight, Prop. Engine 5 is in family on flow and turbine. The chamber channel is a bad sensor. Continue.");
      return true;
    case "engine:inhibit":
      if (m.engine !== "pending") return false;
      m.engine = "inhibit";
      say(m, "propulsion", "Flight, Prop. Inhibiting engine 5. We'll fly eight. Landing propellant will be tight.");
      return true;
    case "engine:abort":
      if (m.engine !== "pending") return false;
      m.engine = "abort";
      say(m, "propulsion", "Flight, Prop. I don't like engine 5. Recommend pad abort.");
      say(m, "flight", "Copy. Pad abort. Skiff, you are staying on the ground. The crew is safe.");
      finish(m, "abort");
      return true;
    case "loft:accept":
      if (m.loft !== "pending") return false;
      m.loft = "accepted";
      m.loftHow = "accept";
      say(m, "guidance", "Flight, Guidance. Loft is two degrees high and inside the family. The load stands.");
      return true;
    case "loft:regen":
      if (m.loft !== "pending" || m.scripted) return false;
      m.loftHow = "regen";
      m.scripted = "regen";
      m.wallHold = 0;
      m.holdNote = "Holding. Guidance is regenerating the trajectory load.";
      say(m, "guidance", "Flight, Guidance. Regenerating the load. Hold the count.");
      return true;
    case "capcom:relay":
      if (m.relay || !crewGo(m) || !pollOpen(m)) return false;
      m.relay = true;
      say(m, "capcom", "Skiff, Northline. You are go for launch.");
      return true;
    case "flight:go":
      if (m.flightGo || !canCallGo(m)) return false;
      m.flightGo = true;
      say(m, "flight", "The room is go. Skiff-1 is go for launch.");
      return true;
    case "commander:arm":
      if (m.armed || !m.flightGo) return false;
      m.armed = true;
      say(m, "commander", "Northline, Skiff. Abort mode is armed. Crew is ready.");
      return true;
    case "commander:abort":
      if (!m.flight || m.flight.separated) return false;
      m.inflightAbort = true;
      say(m, "commander", "Abort, abort, abort.");
      say(m, "capcom", "Skiff, Northline. Copy abort. We have you.");
      finish(m, "abort");
      return true;
    case "guidance:maxq": {
      if (m.maxq || !m.maxqSeen) return false;
      m.maxq = true;
      const kpa = ((m.flight?.maxQ ?? 0) / 1000).toFixed(1);
      say(m, "guidance", `Flight, Guidance. Max Q, ${kpa} kilopascals. Vehicle is nominal.`);
      return true;
    }
    case "capcom:tower":
      if (m.tower || !towerWindow(m)) return false;
      m.tower = true;
      say(m, "capcom", "Skiff, tower is clear.");
      say(m, "commander", "Northline, Skiff. Clear.");
      return true;
    case "capcom:staging":
      if (m.staging || !stagingWindow(m)) return false;
      m.staging = true;
      say(m, "capcom", "Skiff, nominal staging.");
      say(m, "pilot", "Copy nominal staging.");
      return true;
    case "fido:commit":
      return takeFido(m, "commit");
    case "fido:ditch":
      return takeFido(m, "ditch");
    default: {
      const vote = /^vote:([a-z]+):(go|nogo)$/.exec(action);
      if (!vote) return false;
      return castVote(m, vote[1] as SeatId, vote[2] as Vote);
    }
  }
}

function takeFido(m: Mission, plan: "commit" | "ditch"): boolean {
  if (m.fido !== "open" || !m.flight) return false;
  m.fido = plan;
  m.flight.plan = plan;
  if (plan === "commit") {
    say(m, "fido", "Flight, FIDO. Committing Bay One.");
  } else {
    say(m, "fido", "Flight, FIDO. Ditching the booster. Bay One is standing down.");
  }
  return true;
}

function castVote(m: Mission, seat: SeatId, vote: Vote): boolean {
  if (!pollOpen(m) || m.flightGo) return false;
  if (!VOTERS.includes(seat)) return false;
  if (vote === "nogo") m.pollNogo = true;
  m.votes[seat] = vote;
  const who = seatById(seat);
  say(m, seat, vote === "go" ? `${who.role} is go.` : `${who.role} is no go.`);
  return true;
}

function startSounding(m: Mission, missed: boolean): void {
  m.wind = "sounding";
  m.windMissed = m.windMissed || missed;
  m.scripted = "sounding";
  m.wallHold = 0;
  m.resumeReady = false;
  m.holdNote = missed
    ? "Holding. No wind call was on the loop."
    : "Holding for a Bay One sounding.";
}

function tickScripted(m: Mission, dt: number): void {
  if (!m.scripted) return;
  m.wallHold += dt;
  if (m.scripted === "sounding" && m.wallHold >= 4) m.resumeReady = true;
  if (m.scripted === "recycle" && m.wallHold >= 4) {
    m.scripted = null;
    m.pilot = "set";
    m.wallHold = 0;
    say(m, "pilot", "Flight, Skiff. Displays are back. Abort boundaries check.");
  }
  if (m.scripted === "regen" && m.wallHold >= 10) {
    m.scripted = null;
    m.loft = "accepted";
    m.wallHold = 0;
    say(m, "guidance", "Flight, Guidance. New load is in. Loft matches the reference. Release the hold.");
  }
}

function evaluate(m: Mission): void {
  if (m.ended) return;
  if (m.wind === "open" && m.t >= -480) {
    startSounding(m, true);
    say(m, "flight", "No wind call. I'm holding the count.");
  }
  if (m.wind === "await" && m.t >= m.windDue) {
    startSounding(m, false);
    say(m, "flight", "No concur, and I am not overriding. Holding for a sounding.");
  }
  if (m.loft === "pending" && windSettled(m) && m.t >= -120) {
    m.loft = "accepted";
    m.loftHow = "auto";
    say(m, "guidance", "Flight, Guidance. Loft timer expired. The load stands.");
  }
  const f = m.flight;
  if (f && f.q > 15_000) m.maxqSeen = true;
  if (f && m.fido === "wait" && f.separated && f.t > (f.sepT ?? 0) + 8 && (f.phase === "coast" || f.phase === "entry")) {
    m.fido = "open";
    say(m, "sys", "FIDO, booster call is open.");
  }
  if (f && m.fido === "open" && f.entryTime > 6) {
    const plan = fidoAdvice(m);
    m.fido = plan;
    m.fidoAuto = true;
    f.plan = plan;
    say(m, "fido", plan === "commit"
      ? "Flight, FIDO. No call from me in the window. Auto commit, Bay One."
      : "Flight, FIDO. No call from me in the window. Auto ditch.");
  }
  if (f && f.result !== "flying" && !m.boosterNoted) {
    m.boosterNoted = true;
    m.t = Math.max(m.t, f.t);
  }
  if (f && m.boosterNoted && m.t > f.t + 3.5) finish(m, "flight");
}

function refreshHold(m: Mission): void {
  if (m.ended) {
    m.held = true;
    return;
  }
  if (m.scripted) {
    m.held = true;
    return;
  }
  const gate = gateReason(m);
  m.held = gate !== null;
  m.holdNote = gate ?? "";
}

function gateReason(m: Mission): string | null {
  if (!windSettled(m)) return null;
  if (m.cabin === "pending" && m.t >= -300) return "Holding for the cabin call.";
  if (m.cabin === "bad") return "Holding. Sensor A is outside the band.";
  if (m.cabin === "good" && m.pilot === "pending" && m.t >= -200) return "Holding for the pilot displays.";
  if (m.pilot === "set" && m.engine === "pending" && m.t >= -150) return "Holding for propulsion.";
  if (pollOpen(m) && anyNogo(m)) return "Holding. A seat is no go.";
  if (pollOpen(m) && m.t >= -15 && !m.flightGo) return "Holding. The poll is not complete.";
  if (m.flightGo && !m.armed && m.t >= -3) return "Holding. The commander has not armed abort.";
  return null;
}

function windSettled(m: Mission): boolean {
  return m.wind === "nominal" || m.wind === "sporty" || m.wind === "override";
}

function canLaunch(m: Mission): boolean {
  return windSettled(m) && m.cabin === "good" && (m.engine === "sensor" || m.engine === "inhibit") && m.pilot === "set" && m.loft === "accepted" && m.flightGo && m.armed;
}

function beginFlight(m: Mission): void {
  m.flight = createFlight({
    engines: m.engine === "inhibit" ? 8 : 9,
    gust: m.wind === "override" ? "override" : m.wind === "sporty" ? "sporty" : "none",
  });
  // Mission clock and the flight clock share liftoff. Keep the flight at zero
  // and let the next slices advance it; this slice already crossed T-0.
  say(m, "sys", "Liftoff.");
  say(m, "capcom", "Skiff, Northline. Liftoff.");
}

function drain(m: Mission): void {
  const f = m.flight;
  if (!f) return;
  for (const ev of f.events) {
    if (ev === "meco") say(m, "propulsion", "Flight, Prop. Main engine cutoff.");
    else if (ev === "sep") say(m, "guidance", "Flight, Guidance. Stage separation.");
    else if (ev === "boostback") say(m, "fido", "Flight, FIDO. Boostback start.");
    else if (ev === "entry") say(m, "fido", "Flight, FIDO. Entry burn.");
    else if (ev === "landing") say(m, "fido", "Flight, FIDO. Landing burn.");
    else if (ev === "landed") say(m, "fido", "Flight, FIDO. Bay One touchdown.");
    else if (ev === "expended") say(m, "fido", "Flight, FIDO. Booster is in the water. Ditch is complete.");
    else if (ev === "lost") say(m, "fido", "Flight, FIDO. Booster is down, and it is not on Bay One.");
  }
  f.events.length = 0;
}

function finish(m: Mission, kind: string): void {
  if (m.ended) return;
  m.ended = true;
  m.endKind = kind;
  m.held = true;
  m.debrief = score(m);
}

function pollOpen(m: Mission): boolean {
  return windSettled(m) && m.cabin === "good" && m.pilot === "set" && (m.engine === "sensor" || m.engine === "inhibit") && m.loft === "accepted" && m.t >= -90 && !m.flight;
}

function crewGo(m: Mission): boolean {
  return CREW.every((seat) => m.votes[seat] === "go");
}

function canCallGo(m: Mission): boolean {
  return pollOpen(m) && m.relay && VOTERS.every((seat) => m.votes[seat] === "go");
}

function anyNogo(m: Mission): boolean {
  return VOTERS.some((seat) => m.votes[seat] === "nogo");
}

function towerWindow(m: Mission): boolean {
  return !!m.flight && !m.flight.separated && m.flight.t > 6 && m.flight.t < 40 && m.flight.upper.y > 70;
}

function stagingWindow(m: Mission): boolean {
  const f = m.flight;
  return !!f && f.separated && f.t < (f.sepT ?? 0) + 45;
}

function windCards(m: Mission, out: Card[]): void {
  if (m.wind === "open") {
    out.push({
      id: "wind",
      seat: "weather",
      kicker: "Bay One",
      title: "Landing-ship winds",
      body: "Bay One is reporting 28 knots. The commit limit is 25. A fresh sounding is a short hold. You can also send the accept to FIDO.",
      tone: "warn",
      choices: [
        { action: "wind:hold", label: "Hold for a sounding", tone: "hold" },
        { action: "wind:send", label: "Recommend accept", tone: "neutral" },
      ],
    });
  }
  if (m.wind === "sounding" && m.resumeReady) {
    out.push({
      id: "wind-resume",
      seat: "weather",
      kicker: "Bay One",
      title: "Sounding is in",
      body: "The new balloon is 19 knots at the ship. That is inside the limit. Release the hold when you want the count.",
      tone: "normal",
      choices: [{ action: "wind:resume", label: "Winds green — release", tone: "go" }],
    });
  }
  if (m.wind === "await") {
    out.push({
      id: "wind-fido",
      seat: "fido",
      kicker: "Bay One",
      title: "Weather wants to accept 28 knots",
      body: "The limit is 25. Concur if you will plan the landing. No-go holds the count for a new sounding.",
      tone: "warn",
      choices: [
        { action: "wind:concur", label: "Concur", tone: "go" },
        { action: "wind:nogo", label: "No go — hold", tone: "hold" },
      ],
    });
    out.push({
      id: "wind-flight",
      seat: "flight",
      kicker: "Your call",
      title: "Accept without FIDO?",
      body: "FIDO has not concurred. Doing nothing holds for a sounding if the window expires. Overriding launches outside the brief.",
      tone: "danger",
      choices: [{ action: "wind:override", label: "Override and launch", tone: "danger" }],
    });
  }
}

function cabinCards(m: Mission, out: Card[]): void {
  if (!windSettled(m) || m.t < -420) return;
  if (m.cabin === "pending") {
    out.push({
      id: "cabin",
      seat: "specialist",
      kicker: "Cabin",
      title: "Pressure sensors disagree",
      body: "Sensor A, the prime, reads 14.10 psi. Sensor B reads 14.72. The band is 14.50 to 14.90.",
      tone: "warn",
      choices: [
        { action: "cabin:b", label: "Fly on sensor B", tone: "go" },
        { action: "cabin:a", label: "Keep sensor A", tone: "danger" },
        { action: "cabin:scrub", label: "Scrub for cabin", tone: "hold" },
      ],
    });
  }
  if (m.cabin === "bad") {
    out.push({
      id: "cabin-fix",
      seat: "specialist",
      kicker: "Cabin",
      title: "Sensor A is out of limits",
      body: "14.10 psi is below the band. Select B and release the hold, or scrub the flight.",
      tone: "danger",
      choices: [
        { action: "cabin:b", label: "Select B and resume", tone: "go" },
        { action: "cabin:scrub", label: "Scrub", tone: "hold" },
      ],
    });
  }
}

function pilotCards(m: Mission, out: Card[]): void {
  if (m.cabin !== "good" || m.t < -270 || m.pilot !== "pending" || m.scripted === "recycle") return;
  out.push({
    id: "pilot",
    seat: "pilot",
    kicker: "Displays",
    title: "Guidance display and abort boundaries",
    body: "The tape is up. Confirm it, or recycle the display. A recycle is a short hold.",
    tone: "normal",
    choices: [
      { action: "pilot:set", label: "Set and checked", tone: "go" },
      { action: "pilot:recycle", label: "Recycle displays", tone: "hold" },
    ],
  });
}

function engineCards(m: Mission, out: Card[]): void {
  if (m.pilot !== "set" || m.t < -240 || m.engine !== "pending") return;
  out.push({
    id: "engine",
    seat: "propulsion",
    kicker: "Engine 5",
    title: "Center engine sensor",
    body: "Chamber pressure on engine 5 is noisy and high. Fuel flow, turbine speed, and the other eight chambers are in family.",
    tone: "warn",
    choices: [
      { action: "engine:sensor", label: "Sensor only — continue", tone: "go" },
      { action: "engine:inhibit", label: "Inhibit engine 5", tone: "neutral" },
      { action: "engine:abort", label: "Recommend pad abort", tone: "danger" },
    ],
  });
}

function loftCards(m: Mission, out: Card[]): void {
  if (m.engine === "pending" || m.t < -180 || m.loft !== "pending" || m.scripted === "regen") return;
  if (m.engine !== "sensor" && m.engine !== "inhibit") return;
  out.push({
    id: "loft",
    seat: "guidance",
    kicker: "Trajectory",
    title: "Loft is two degrees high",
    body: "The loaded loft is inside the family. Accept it, or regenerate. A regenerate holds the count.",
    tone: "normal",
    choices: [
      { action: "loft:accept", label: "Accept the load", tone: "go" },
      { action: "loft:regen", label: "Regenerate", tone: "hold" },
    ],
  });
}

function pollCards(m: Mission, out: Card[]): void {
  if (!pollOpen(m) || m.flightGo) return;
  for (const seat of VOTERS) {
    if (m.votes[seat] === "go") continue;
    const who = seatById(seat);
    out.push({
      id: `vote-${seat}`,
      seat,
      kicker: "Go / No-Go",
      title: `${who.role} poll`,
      body: m.votes[seat] === "nogo"
        ? "You are no-go. The count is holding. Change the vote when the seat is clean."
        : "Flight is polling the loop. Go, or no-go if your system is not ready.",
      tone: m.votes[seat] === "nogo" ? "danger" : "normal",
      choices: [
        { action: `vote:${seat}:go`, label: "Go", tone: "go" },
        { action: `vote:${seat}:nogo`, label: "No go", tone: "danger" },
      ],
    });
  }
  if (!m.relay && crewGo(m)) {
    out.push({
      id: "relay",
      seat: "capcom",
      kicker: "Crew loop",
      title: "Relay the go",
      body: "Commander, pilot, and specialist are go. The crew does not have it until you say it.",
      tone: "normal",
      choices: [{ action: "capcom:relay", label: "Skiff, you are go for launch", tone: "go" }],
    });
  }
  if (canCallGo(m)) {
    out.push({
      id: "flight-go",
      seat: "flight",
      kicker: "Poll",
      title: "The room is go",
      body: "Every seat has voted go, and CAPCOM has told the crew. Call it.",
      tone: "normal",
      choices: [{ action: "flight:go", label: "We are go for launch", tone: "go" }],
    });
  }
}

function flightCards(m: Mission, out: Card[]): void {
  if (m.flightGo && !m.armed && !m.flight) {
    out.push({
      id: "arm",
      seat: "commander",
      kicker: "Abort mode",
      title: "Arm the handle",
      body: "The room is go. Arm abort mode before the terminal count.",
      tone: "warn",
      choices: [{ action: "commander:arm", label: "Abort mode armed", tone: "go" }],
    });
  }
  if (m.flight && !m.flight.separated && m.flight.t < 90) {
    out.push({
      id: "abort",
      seat: "commander",
      kicker: "Handle",
      title: "In-flight abort",
      body: "The handle ends the ascent. The crew comes home. The mission does not.",
      tone: "danger",
      optional: true,
      choices: [{ action: "commander:abort", label: "Abort", tone: "danger" }],
    });
  }
  if (m.maxqSeen && !m.maxq && m.flight && m.flight.t < 100) {
    out.push({
      id: "maxq",
      seat: "guidance",
      kicker: "Ascent",
      title: "Max Q",
      body: "Dynamic pressure is on the top of the hill. Make the call.",
      tone: "normal",
      choices: [{ action: "guidance:maxq", label: "Call max Q", tone: "go" }],
    });
  }
  if (!m.tower && towerWindow(m)) {
    out.push({
      id: "tower",
      seat: "capcom",
      kicker: "Crew loop",
      title: "Tower clear",
      body: "The stack is off the tower. Tell the crew.",
      tone: "normal",
      choices: [{ action: "capcom:tower", label: "Skiff, tower is clear", tone: "go" }],
    });
  }
  if (!m.staging && stagingWindow(m)) {
    out.push({
      id: "staging",
      seat: "capcom",
      kicker: "Crew loop",
      title: "Staging",
      body: "The booster is away and the upper stage is lit. Relay it.",
      tone: "normal",
      choices: [{ action: "capcom:staging", label: "Skiff, nominal staging", tone: "go" }],
    });
  }
  if (m.fido === "open") {
    const advice = fidoAdvice(m);
    const body = advice === "ditch"
      ? m.engine === "inhibit"
        ? "Eight engines flew the ascent. The booster will come up short of Bay One. Ditch is the recovery. A commit drops it in the water, upright and off the ship."
        : "Bay One was launched outside the wind brief. A commit walks the booster off the deck. Ditch is the call."
      : "Boostback is done. Landing propellant covers Bay One, and the ground track is under the ship. Commit, or ditch if you want the ship to stand down.";
    out.push({
      id: "fido-land",
      seat: "fido",
      kicker: "Booster",
      title: advice === "ditch" ? "Bay One is not the brief" : "Landing commit",
      body,
      tone: advice === "ditch" ? "danger" : "normal",
      choices: [
        { action: "fido:commit", label: "Commit Bay One", tone: advice === "commit" ? "go" : "danger" },
        { action: "fido:ditch", label: "Ditch downrange", tone: advice === "ditch" ? "go" : "hold" },
      ],
    });
  }
}

function say(m: Mission, seat: SeatId | "sys", text: string): void {
  if (seat === "sys") {
    m.log.push({ t: m.t, speaker: "NET", person: "Network", text });
  } else {
    const who = seatById(seat);
    m.log.push({ t: m.t, speaker: who.short, person: who.person, text });
  }
  if (m.log.length > 200) m.log.shift();
}

function score(m: Mission): Debrief {
  const rows: ScoreRow[] = [];
  const add = (label: string, earned: number, max: number, note: string) => rows.push({ label, earned, max, note });

  if (m.wind === "nominal" && !m.windMissed) add("Winds", 20, 20, "Held, then a green sounding.");
  else if (m.wind === "nominal") add("Winds", 12, 20, "The count held itself. The sounding still saved it.");
  else if (m.wind === "sporty") add("Winds", 20, 20, "FIDO concurred with a sporty ship.");
  else if (m.wind === "override") add("Winds", 4, 20, "Launched outside the brief.");
  else add("Winds", 0, 20, "Never settled.");

  if (m.cabinFirst === "b") add("Cabin", 15, 15, "Sensor B was the one in the band.");
  else if (m.cabin === "good") add("Cabin", 8, 15, "Sensor A first, then a correction.");
  else if (m.cabin === "scrub" || m.cabinFirst === "scrub") add("Cabin", 6, 15, "Scrubbed. The crew never left.");
  else add("Cabin", 0, 15, "Unresolved.");

  if (m.pilot === "set" && !m.pilotRecycled) add("Displays", 8, 8, "Pilot checked them once.");
  else if (m.pilot === "set") add("Displays", 5, 8, "Recycled, then set.");
  else add("Displays", 0, 8, "Never set.");

  if (m.engine === "sensor") add("Engine 5", 20, 20, "Bad sensor. The engine stayed.");
  else if (m.engine === "inhibit") add("Engine 5", 10, 20, "A good engine was shut down.");
  else if (m.engine === "abort") add("Engine 5", 8, 20, "Pad abort. Safe, and the flight is over.");
  else add("Engine 5", 0, 20, "No call.");

  if (m.loftHow === "accept") add("Loft", 6, 6, "Accepted inside the family.");
  else if (m.loftHow === "regen") add("Loft", 3, 6, "Regenerated a load that was already good.");
  else if (m.loftHow === "auto") add("Loft", 2, 6, "The timer accepted it.");
  else add("Loft", 0, 6, "No load.");

  if (m.flightGo && !m.pollNogo) add("Poll", 12, 12, "Clean go around the loop.");
  else if (m.flightGo) add("Poll", 7, 12, "Got to go after a no-go.");
  else add("Poll", 0, 12, "Never called.");

  add("CAPCOM relay", m.relay ? 6 : 0, 6, m.relay ? "The crew heard it from you." : "The crew was never told.");
  add("Abort armed", m.armed ? 6 : 0, 6, m.armed ? "Handle was hot before T-0." : "Not armed.");
  add("Max Q call", m.maxq ? 5 : 0, 5, m.maxq ? "Called on the hill." : "Missed.");
  add("Tower clear", m.tower ? 4 : 0, 4, m.tower ? "Told the crew." : "Missed.");
  add("Staging call", m.staging ? 4 : 0, 4, m.staging ? "Relay was clean." : "Missed.");

  const advice = fidoAdvice(m);
  if (!m.flight) add("Booster call", 0, 16, "Never flew.");
  else if (m.fidoAuto) add("Booster call", advice === m.fido ? 8 : 4, 16, "The window closed and the seat auto-called.");
  else if (m.fido === advice) add("Booster call", 16, 16, advice === "commit" ? "Commit matched the brief." : "Ditch matched the brief.");
  else if (m.fido === "commit" || m.fido === "ditch") add("Booster call", 2, 16, "That was not the brief.");
  else add("Booster call", 0, 16, "No call.");

  const result = m.flight?.result;
  if (result === "landed") add("Bay One", 20, 20, "Soft, and on the ship.");
  else if (result === "expended" && advice === "ditch") add("Bay One", 14, 20, "Ditched on purpose. The crew kept flying.");
  else if (result === "expended") add("Bay One", 6, 20, "The booster went in the water.");
  else if (result === "lost") add("Bay One", 0, 20, "Not on the ship.");
  else add("Bay One", 0, 20, "No landing.");

  const crewSafe = m.endKind !== "crash";
  add("Crew", crewSafe ? 8 : 0, 8, crewSafe ? "Safe." : "Lost.");

  const total = rows.reduce((s, r) => s + r.earned, 0);
  const max = rows.reduce((s, r) => s + r.max, 0);
  const pct = max ? total / max : 0;
  const grade = pct >= 0.9 ? "A" : pct >= 0.75 ? "B" : pct >= 0.6 ? "C" : "Hold";
  return {
    title: titleFor(m),
    subtitle: subtitleFor(m),
    rows,
    total,
    max,
    grade,
  };
}

function titleFor(m: Mission): string {
  if (m.endKind === "scrub") return "Scrubbed";
  if (m.endKind === "abort" && !m.flight) return "Pad abort";
  if (m.inflightAbort) return "Abort";
  if (m.flight?.result === "landed") return "Bay One";
  if (m.flight?.result === "expended") return "Booster expended";
  if (m.flight?.result === "lost") return "Booster lost";
  return "End of watch";
}

function subtitleFor(m: Mission): string {
  const crew = "The crew is safe.";
  if (m.endKind === "scrub") return `${crew} Skiff-1 did not leave the pad.`;
  if (!m.flight) return `${crew} The count never left the hold.`;
  const v = Math.round(crewSpeed(m.flight));
  const alt = noseAltitude(m.flight) / 1000;
  if (m.inflightAbort) return `${crew} Abort before staging.`;
  if (m.flight.result === "landed") {
    return `${crew} Booster is on Bay One. Skiff is at ${alt.toFixed(0)} km, ${v.toLocaleString("en-US")} m/s.`;
  }
  if (m.flight.result === "expended") {
    return `${crew} The booster is in the water by plan. Skiff is still flying.`;
  }
  return `${crew} The booster missed Bay One. Skiff is at ${alt.toFixed(0)} km, ${v.toLocaleString("en-US")} m/s.`;
}

export function pollBoard(m: Mission): { seat: SeatId; vote: Vote }[] {
  return VOTERS.map((seat) => ({ seat, vote: m.votes[seat] }));
}
