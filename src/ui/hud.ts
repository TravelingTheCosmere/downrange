import { formatKpa, formatKm, formatMps, formatT } from "../sim/format";
import { cards, pendingSeats, pollBoard, type Mission } from "../sim/mission";
import { crewSpeed, noseAltitude } from "../sim/physics";
import { SEATS, seatById, type SeatId } from "../sim/seats";
import type { ViewId } from "../render/world";
import { icon } from "./icons";

export interface Hud {
  setSeat(seat: SeatId): void;
  setView(view: ViewId): void;
  paint(mission: Mission): void;
}

export function mountHud(onAct: (action: string) => void, onSeat: (seat: SeatId) => void): Hud {
  const seats = document.querySelector("#seats") as HTMLElement;
  const meters = document.querySelector("#meters") as HTMLElement;
  const telem = document.querySelector("#telem") as HTMLElement;
  const cardHost = document.querySelector("#cards") as HTMLElement;
  const lines = document.querySelector("#lines") as HTMLElement;

  for (const seat of SEATS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.seat = seat.id;
    btn.innerHTML = `${icon(seat.id)}<span>${seat.key} ${seat.short}</span>`;
    btn.addEventListener("click", () => onSeat(seat.id));
    seats.append(btn);
  }

  const meter = (id: string, label: string) => {
    const cell = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = label;
    const b = document.createElement("b");
    b.id = id;
    cell.append(span, b);
    meters.append(cell);
  };
  meter("m-alt", "ALT");
  meter("m-spd", "SPEED");
  meter("m-q", "Q");
  meter("m-eng", "ENG");

  document.querySelectorAll<HTMLButtonElement>("#views button").forEach((btn) => {
    const label = btn.textContent ?? "";
    btn.innerHTML = `${icon(btn.dataset.view ?? "")}<span>${label}</span>`;
  });

  let cardSig = "";
  let logCount = 0;

  function setSeat(seat: SeatId): void {
    document.querySelectorAll<HTMLButtonElement>("#seats button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.seat === seat);
    });
  }

  function setView(view: ViewId): void {
    document.querySelectorAll<HTMLButtonElement>("#views button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.view === view);
    });
  }

  function paint(m: Mission): void {
    const clock = document.querySelector("#clock") as HTMLElement;
    const phase = document.querySelector("#phase") as HTMLElement;
    clock.textContent = formatT(m.flight ? m.flight.t : m.t);
    phase.textContent = m.paused ? "Paused" : phaseLabel(m);
    const alt = m.flight ? noseAltitude(m.flight) : 65;
    const spd = m.flight ? crewSpeed(m.flight) : 0;
    text("#m-alt", formatKm(alt));
    text("#m-spd", formatMps(spd));
    text("#m-q", m.flight ? formatKpa(m.flight.q) : "—");
    text("#m-eng", m.flight ? String(m.flight.separated ? 1 : m.flight.upper.engines) : "9");

    const hold = document.querySelector("#hold") as HTMLElement;
    if (m.held && !m.ended) {
      hold.hidden = false;
      hold.textContent = m.holdNote || "Holding.";
    } else hold.hidden = true;

    const pending = new Set(pendingSeats(m));
    document.querySelectorAll<HTMLButtonElement>("#seats button").forEach((btn) => {
      btn.classList.toggle("pending", pending.has(btn.dataset.seat as SeatId));
    });

    const who = seatById(m.seat);
    const head = document.querySelector("#seathead") as HTMLElement;
    head.replaceChildren();
    const h2 = document.createElement("h2");
    h2.textContent = who.role;
    const person = document.createElement("div");
    person.className = "who";
    person.textContent = who.person;
    const blurb = document.createElement("p");
    blurb.textContent = who.blurb;
    head.append(h2, person, blurb);

    telem.replaceChildren();
    for (const row of rowsFor(m)) {
      const cell = document.createElement("div");
      cell.className = "cell" + (row.tone ? ` ${row.tone}` : "");
      const span = document.createElement("span");
      span.textContent = row.label;
      const b = document.createElement("b");
      b.textContent = row.value;
      cell.append(span, b);
      telem.append(cell);
    }

    const mine = cards(m).filter((card) => card.seat === m.seat);
    const sig = JSON.stringify(mine);
    if (sig !== cardSig) {
      cardSig = sig;
      cardHost.replaceChildren();
      if (!mine.length) {
        const quiet = document.createElement("p");
        quiet.className = "quiet";
        const open = pendingSeats(m);
        quiet.textContent = open.length
          ? `Open on ${open.map((id) => seatById(id).short).join(", ")}. That seat opens on its own.`
          : "Nothing on your console. Run the clock, or watch the vehicle.";
        cardHost.append(quiet);
      }
      for (const card of mine) {
        const box = document.createElement("article");
        box.className = `card ${card.tone}`;
        const kicker = document.createElement("div");
        kicker.className = "kicker";
        kicker.textContent = card.kicker;
        const title = document.createElement("h3");
        title.textContent = card.title;
        const body = document.createElement("p");
        body.textContent = card.body;
        box.append(kicker, title, body);
        if (who.crew) {
          const note = document.createElement("p");
          note.className = "quiet";
          note.textContent = "Take this on the cabin panel. Lit gauges and the abort handle are live.";
          box.append(note);
        } else {
          const choices = document.createElement("div");
          choices.className = "choices";
          for (const choice of card.choices) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = choice.tone;
            btn.textContent = choice.label;
            btn.addEventListener("click", () => onAct(choice.action));
            choices.append(btn);
          }
          box.append(choices);
        }
        cardHost.append(box);
      }
    }

    if (m.log.length < logCount) {
      lines.replaceChildren();
      logCount = 0;
    }
    if (m.log.length !== logCount) {
      const atBottom = lines.scrollTop + lines.clientHeight >= lines.scrollHeight - 24;
      for (let i = logCount; i < m.log.length; i++) {
        const line = m.log[i];
        const row = document.createElement("div");
        row.className = "line";
        const t = document.createElement("span");
        t.className = "t";
        t.textContent = formatT(line.t);
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = line.speaker;
        const text = document.createElement("span");
        text.textContent = line.text;
        row.append(t, who, text);
        lines.append(row);
      }
      logCount = m.log.length;
      if (atBottom) lines.scrollTop = lines.scrollHeight;
    }

    document.querySelectorAll<HTMLButtonElement>("#rates button[data-rate]").forEach((btn) => {
      btn.classList.toggle("on", Number(btn.dataset.rate) === m.timeScale);
    });
    const pause = document.querySelector("#btn-pause") as HTMLButtonElement;
    pause.classList.toggle("on", m.paused);
    pause.textContent = m.paused ? "Paused" : "Pause";
  }

  return { setSeat, setView, paint };
}

function text(sel: string, value: string): void {
  const node = document.querySelector(sel);
  if (node) node.textContent = value;
}

function phaseLabel(m: Mission): string {
  if (m.ended) return "Debrief";
  if (m.held) return "Hold";
  if (!m.flight) return m.t < 0 ? "Count" : "Terminal";
  switch (m.flight.phase) {
    case "ascent": return "Ascent";
    case "boostback": return "Boostback";
    case "coast": return "Coast";
    case "entry": return "Entry burn";
    case "landing": return "Landing burn";
    case "ditch": return "Ditch";
    default: return m.flight.result === "landed" ? "Touchdown" : "Booster down";
  }
}

function rowsFor(m: Mission): { label: string; value: string; tone?: "good" | "bad" }[] {
  const seat = m.seat;
  const rows: { label: string; value: string; tone?: "good" | "bad" }[] = [];
  const push = (label: string, value: string, tone?: "good" | "bad") => rows.push({ label, value, tone });

  if (seat === "weather") {
    push("Bay One", windText(m), m.wind === "override" ? "bad" : m.wind === "nominal" || m.wind === "sporty" ? "good" : undefined);
    push("Limit", "25 kt");
  }
  if (seat === "specialist" || seat === "commander") {
    push("Sensor A", "14.10 psi", "bad");
    push("Sensor B", "14.72 psi", "good");
    push("Prime", m.cabin === "good" ? "B" : m.cabin === "bad" ? "A" : "A, unset", m.cabin === "good" ? "good" : "bad");
  }
  if (seat === "pilot" || seat === "guidance") {
    const pitch = m.flight ? `${((m.flight.upper.pitch * 180) / Math.PI).toFixed(1)}°` : "0°";
    push("Pitch", pitch);
    push("Displays", m.pilot === "set" ? "Set" : "Open", m.pilot === "set" ? "good" : undefined);
    push("Loft", m.loft === "accepted" ? "In family" : "Open");
  }
  if (seat === "propulsion") {
    const eng = m.engine === "inhibit" ? "8, center out" : m.engine === "sensor" ? "9, sensor only" : m.engine === "abort" ? "Abort" : "9, call open";
    push("Engines", eng, m.engine === "inhibit" ? "bad" : m.engine === "sensor" ? "good" : undefined);
    const prop = m.flight ? `${Math.round((m.flight.separated ? m.flight.booster.prop : m.flight.upper.prop) / 1000)} t` : "400 t";
    push(m.flight?.separated ? "Booster prop" : "Stage 1 prop", prop);
  }
  if (seat === "fido") {
    push("Bay One", m.flight ? formatKm(Math.abs((m.flight.separated ? m.flight.booster.x : m.flight.upper.x) - m.flight.bargeX)) + " off" : "Downrange");
    push("Booster", m.flight ? m.flight.phase : "On the pad");
    if (m.flight?.result === "landed") push("Touchdown", `${m.flight.touchMiss.toFixed(0)} m`, "good");
    if (m.flight?.result === "lost") push("Touchdown", "Off the ship", "bad");
  }
  if (seat === "flight" || seat === "capcom") {
    const board = pollBoard(m).map((row) => `${seatById(row.seat).short} ${row.vote === "none" ? "·" : row.vote === "go" ? "GO" : "NO"}`);
    push("Poll", m.flightGo ? "Go for launch" : m.t >= -90 ? "Open" : "Not yet", m.flightGo ? "good" : undefined);
    push("CAPCOM", m.relay ? "Relayed" : "Holding", m.relay ? "good" : undefined);
    push("Abort", m.armed ? "Armed" : "Safe", m.armed ? "good" : undefined);
    push("Room", board.filter((item) => item.includes("GO") || item.includes("NO")).slice(0, 4).join(" ") || "Waiting");
  }
  if (!rows.length) push("Watch", "Nominal");
  return rows.slice(0, 6);
}

function windText(m: Mission): string {
  switch (m.wind) {
    case "open": return "28 kt";
    case "sounding": return "Holding";
    case "await": return "28 kt, with FIDO";
    case "nominal": return "19 kt, green";
    case "sporty": return "28 kt, concurred";
    case "override": return "28 kt, overridden";
  }
}
