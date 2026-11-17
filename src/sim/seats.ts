export type SeatId =
  | "commander"
  | "pilot"
  | "specialist"
  | "flight"
  | "capcom"
  | "guidance"
  | "propulsion"
  | "fido"
  | "weather";

export interface Seat {
  id: SeatId;
  key: string;
  role: string;
  person: string;
  short: string;
  blurb: string;
  crew: boolean;
}

export const SEATS: Seat[] = [
  {
    id: "commander",
    key: "1",
    role: "Commander",
    person: "Alex Rivera",
    short: "CDR",
    blurb: "Left seat. You call the crew go, and the abort handle is yours.",
    crew: true,
  },
  {
    id: "pilot",
    key: "2",
    role: "Pilot",
    person: "Sam Okonkwo",
    short: "PLT",
    blurb: "Right seat. Displays, pitch, and the abort boundaries.",
    crew: true,
  },
  {
    id: "specialist",
    key: "3",
    role: "Mission specialist",
    person: "Jordan Hale",
    short: "MS",
    blurb: "Cabin pressure, suits, and the sensors that disagree.",
    crew: true,
  },
  {
    id: "flight",
    key: "4",
    role: "Flight director",
    person: "Morgan Ellis",
    short: "FLIGHT",
    blurb: "You run the poll. Hold, go, or take a risk the room did not brief.",
    crew: false,
  },
  {
    id: "capcom",
    key: "5",
    role: "CAPCOM",
    person: "Riley Chen",
    short: "CAPCOM",
    blurb: "The only voice the crew is supposed to hear.",
    crew: false,
  },
  {
    id: "guidance",
    key: "6",
    role: "Guidance",
    person: "Quinn Adeyemi",
    short: "GUIDO",
    blurb: "Trajectory, loft, and the call at max Q.",
    crew: false,
  },
  {
    id: "propulsion",
    key: "7",
    role: "Propulsion",
    person: "Parker Singh",
    short: "PROP",
    blurb: "Engines and tanks. A noisy sensor is still your call.",
    crew: false,
  },
  {
    id: "fido",
    key: "8",
    role: "FIDO",
    person: "Drew Alvarez",
    short: "FIDO",
    blurb: "Booster entry, Bay One, and whether the ship is worth committing.",
    crew: false,
  },
  {
    id: "weather",
    key: "9",
    role: "Weather",
    person: "Casey Nguyen",
    short: "WEATHER",
    blurb: "Winds at the landing ship. Limit is a number, not a mood.",
    crew: false,
  },
];

export const VOTERS: SeatId[] = [
  "weather",
  "propulsion",
  "guidance",
  "fido",
  "commander",
  "pilot",
  "specialist",
];

export function seatById(id: SeatId): Seat {
  const seat = SEATS.find((s) => s.id === id);
  if (!seat) throw new Error(`unknown seat ${id}`);
  return seat;
}
