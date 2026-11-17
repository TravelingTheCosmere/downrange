import { act, cards, createMission, pendingSeats, stepMission, type Mission } from "./sim/mission";
import { SEATS, seatById, type SeatId } from "./sim/seats";
import { mountHud } from "./ui/hud";
import { createAudio } from "./ui/audio";
import { mountCockpit, type Cockpit } from "./ui/cockpit";
import { createWorld, type ViewId } from "./render/world";
import { placeCabinCamera } from "./render/frames";
import * as THREE from "three";

const VIEWS: ViewId[] = ["pad", "track", "cabin", "booster", "room"];

let mission: Mission = createMission();
let view: ViewId = "room";
let started = false;
let runToCall = false;
let muted = false;
let lastPending = "";
let spokenCard = "";
let heardLog = 0;

const canvas = document.querySelector("#view") as HTMLCanvasElement;
const world = createWorld(canvas);
const stage = document.querySelector("#stage") as HTMLElement;
const loop = createAudio();
let cockpit: Cockpit;

function takeAction(action: string): void {
  loop.unlock();
  act(mission, action);
  hud.paint(mission);
  cockpit.paint(mission, view);
  maybeDebrief();
}

cockpit = mountCockpit(takeAction);
const hud = mountHud(takeAction, (seat) => sit(seat));

document.querySelectorAll<HTMLButtonElement>("#views button").forEach((btn) => {
  btn.addEventListener("click", () => {
    view = btn.dataset.view as ViewId;
    hud.setView(view);
  });
});

document.querySelectorAll<HTMLButtonElement>("#rates button[data-rate]").forEach((btn) => {
  btn.addEventListener("click", () => {
    mission.timeScale = Number(btn.dataset.rate);
    runToCall = false;
  });
});

document.querySelector("#btn-run")?.addEventListener("click", () => {
  runToCall = true;
});
document.querySelector("#btn-pause")?.addEventListener("click", () => {
  mission.paused = !mission.paused;
  runToCall = false;
});
document.querySelector("#btn-mute")?.addEventListener("click", () => {
  setMuted(!muted);
});
document.querySelector("#start")?.addEventListener("click", () => {
  loop.unlock();
  started = true;
  (document.querySelector("#cover") as HTMLElement).hidden = true;
  heardLog = mission.log.length;
  hopToCall(true);
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const seat = SEATS.find((item) => item.key === event.key);
  if (seat) {
    sit(seat.id);
    return;
  }
  if (event.key === "v" || event.key === "V") {
    view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
    hud.setView(view);
  } else if (event.key === "n" || event.key === "N") runToCall = true;
  else if (event.key === "p" || event.key === "P") mission.paused = !mission.paused;
  else if (event.key === "z") mission.timeScale = 1;
  else if (event.key === "x") mission.timeScale = 8;
  else if (event.key === "c") mission.timeScale = 24;
  else if (event.key === "m" || event.key === "M") setMuted(!muted);
});

function setMuted(next: boolean): void {
  muted = next;
  loop.setMuted(next);
  const btn = document.querySelector("#btn-mute") as HTMLButtonElement;
  btn.textContent = muted ? "Muted" : "Sound";
  btn.classList.toggle("on", muted);
}

function sit(seat: SeatId): void {
  mission.seat = seat;
  view = seatById(seat).crew ? "cabin" : "room";
  hud.setSeat(seat);
  hud.setView(view);
  hud.paint(mission);
  cockpit.paint(mission, view);
}

/** Sit the newest required call when the pending set changes. A manual look-around stays put until then. */
function hopToCall(fromClick: boolean): void {
  if (!started || mission.ended) return;
  const list = pendingSeats(mission);
  const key = list.join(",");
  const changed = key !== lastPending;
  const prev = lastPending.length ? lastPending.split(",") : [];
  if (!changed && !fromClick) return;
  lastPending = key;
  if (!list.length) return;
  if (!list.includes(mission.seat)) {
    const next = list.find((id) => !prev.includes(id)) ?? list[0];
    sit(next);
    loop.chime();
    speakSeat(next);
  } else if (fromClick) {
    loop.chime();
    speakSeat(mission.seat);
  }
}

function speakSeat(seat: SeatId): void {
  const card = cards(mission).find((item) => item.seat === seat && !item.optional);
  if (!card || card.id === spokenCard) return;
  spokenCard = card.id;
  const who = seatById(seat);
  loop.speak(who.short, card.title, who.crew);
}

function drainLog(): void {
  if (mission.log.length < heardLog) heardLog = 0;
  if (mission.log.length === heardLog) return;
  const line = mission.log[mission.log.length - 1];
  heardLog = mission.log.length;
  const crew = SEATS.some((seat) => seat.crew && seat.short === line.speaker);
  loop.speak(line.speaker, line.text, crew);
}

function engineThrottle(): number {
  const flight = mission.flight;
  if (!flight) return 0;
  const booster = flight.separated && flight.booster.alive ? flight.booster.throttle : 0;
  return Math.max(booster, flight.upper.throttle);
}

function maybeDebrief(): void {
  const host = document.querySelector("#debrief") as HTMLElement;
  if (!mission.ended || !mission.debrief) {
    host.hidden = true;
    return;
  }
  if (!host.hidden && host.dataset.kind === mission.endKind) return;
  host.hidden = false;
  host.dataset.kind = mission.endKind;
  host.replaceChildren();
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const grade = document.createElement("div");
  grade.className = "grade";
  grade.textContent = mission.debrief.grade;
  const title = document.createElement("h1");
  title.textContent = mission.debrief.title;
  const sub = document.createElement("p");
  sub.textContent = mission.debrief.subtitle;
  const table = document.createElement("table");
  for (const row of mission.debrief.rows) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = row.label;
    const note = document.createElement("td");
    note.className = "note";
    note.textContent = row.note;
    const pts = document.createElement("td");
    pts.className = "pts";
    pts.textContent = `${row.earned}/${row.max}`;
    tr.append(label, note, pts);
    table.append(tr);
  }
  const total = document.createElement("p");
  total.textContent = `${mission.debrief.total} / ${mission.debrief.max}`;
  const again = document.createElement("button");
  again.id = "again";
  again.type = "button";
  again.textContent = "Fly again";
  again.addEventListener("click", () => {
    mission = createMission();
    runToCall = false;
    host.hidden = true;
    host.dataset.kind = "";
    const lines = document.querySelector("#lines") as HTMLElement;
    lines.replaceChildren();
    lastPending = "";
    spokenCard = "";
    heardLog = mission.log.length;
    cockpit.reset();
    hopToCall(true);
  });
  sheet.append(grade, title, sub, table, total, again);
  host.append(sheet);
}

function frameCheck(): void {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  placeCabinCamera(camera, { x: 0, y: 0, pitch: 0.5 }, 40, 0);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const nose = new THREE.Vector3(Math.sin(0.5), Math.cos(0.5), 0);
  if (dir.dot(nose) < 0.98) throw new Error("cabin camera is not looking downrange along the nose");
}

let lastW = 0;
let lastH = 0;
function resize(): void {
  const rect = stage.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (w === lastW && h === lastH) return;
  lastW = w;
  lastH = h;
  world.resize(w, h);
}

let last = performance.now();
function frame(now: number): void {
  resize();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started && !mission.ended) {
    const before = pendingSeats(mission).join(",");
    if (runToCall && (before.length > 0 || mission.held)) {
      runToCall = false;
      mission.timeScale = 1;
    } else if (runToCall) mission.timeScale = 24;
    stepMission(mission, dt);
    const after = pendingSeats(mission).join(",");
    if (after !== before && after !== "") {
      runToCall = false;
      mission.timeScale = 1;
    }
    drainLog();
    hopToCall(false);
    if (mission.ended) {
      loop.rumble(0);
      maybeDebrief();
    } else loop.rumble(engineThrottle());
  }
  hud.paint(mission);
  cockpit.paint(mission, view);
  world.render(mission, view);
  requestAnimationFrame(frame);
}

frameCheck();
resize();
window.addEventListener("resize", resize);
hud.setSeat(mission.seat);
hud.setView(view);
hud.paint(mission);
requestAnimationFrame(frame);
