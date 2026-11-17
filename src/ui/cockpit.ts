import { cards, type Mission } from "../sim/mission";
import { crewSpeed, noseAltitude } from "../sim/physics";
import type { ViewId } from "../render/world";

export interface Cockpit {
  paint(mission: Mission, view: ViewId): void;
  reset(): void;
}

/** Cabin instruments. Needles track the flight. Lit controls take the crew call. */
export function mountCockpit(onAct: (action: string) => void): Cockpit {
  const host = document.querySelector("#cockpit") as HTMLElement;
  host.innerHTML = `
    <div class="gauge" data-needle="pitch"><div class="face"><i></i></div><span>Pitch</span><b>0°</b></div>
    <div class="gauge" data-needle="alt"><div class="face"><i></i></div><span>Alt</span><b>0</b></div>
    <div class="gauge" data-needle="spd"><div class="face"><i></i></div><span>Speed</span><b>0</b></div>
    <div class="gauge" data-needle="q"><div class="face"><i></i></div><span>Q</span><b>0</b></div>
    <button type="button" class="dial" data-act="cabin:a">
      <div class="face bad-arc"><i></i></div><span>Sensor A</span><b>14.10</b>
    </button>
    <button type="button" class="dial" data-act="cabin:b">
      <div class="face good-arc"><i></i></div><span>Sensor B</span><b>14.72</b>
    </button>
    <div class="keys">
      <button type="button" data-act="pilot:set">Set displays</button>
      <button type="button" data-act="pilot:recycle">Recycle</button>
      <button type="button" data-act="cabin:scrub">Scrub cabin</button>
      <button type="button" data-act="go">Crew go</button>
      <button type="button" data-act="nogo">No go</button>
    </div>
    <button type="button" id="abort-lever">
      <span class="slot"><span class="guard"></span><span class="lever"></span></span>
      <span class="alabel">Safe</span>
    </button>
  `;

  let guardOpen = false;
  let live = new Set<string>();

  host.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!target) return;
    const act = target.dataset.act;
    if (!act || !live.has(act)) return;
    if (act === "go" || act === "nogo") {
      const real = [...live].find((item) => item.startsWith("vote:") && item.endsWith(`:${act}`));
      if (real) onAct(real);
      return;
    }
    onAct(act);
  });

  const lever = host.querySelector("#abort-lever") as HTMLButtonElement;
  lever.addEventListener("click", () => {
    if (live.has("commander:arm")) {
      onAct("commander:arm");
      return;
    }
    if (!live.has("commander:abort")) return;
    if (!guardOpen) {
      guardOpen = true;
      lever.classList.add("open");
      const label = lever.querySelector(".alabel");
      if (label) label.textContent = "Pull";
      return;
    }
    onAct("commander:abort");
  });

  function paint(m: Mission, view: ViewId): void {
    const crew = view === "cabin";
    host.hidden = !crew;
    if (!crew) return;

    const pitch = m.flight ? (m.flight.upper.pitch * 180) / Math.PI : 0;
    const alt = m.flight ? noseAltitude(m.flight) / 1000 : 0.07;
    const speed = m.flight ? crewSpeed(m.flight) : 0;
    const q = m.flight ? m.flight.q / 1000 : 0;
    setNeedle("pitch", span(pitch, -5, 70), `${pitch.toFixed(0)}°`);
    setNeedle("alt", span(alt, 0, 350), alt >= 10 ? `${alt.toFixed(0)} km` : `${alt.toFixed(1)} km`);
    setNeedle("spd", span(speed, 0, 8000), `${Math.round(speed)}`);
    setNeedle("q", span(q, 0, 40), q.toFixed(1));
    // Band is 14.50–14.90. A sits left of the green arc, B sits inside it.
    setDial("cabin:a", span(14.1, 13.6, 15.4));
    setDial("cabin:b", span(14.72, 13.6, 15.4));

    const actions = new Set<string>();
    for (const card of cards(m)) {
      if (card.seat !== m.seat) continue;
      for (const choice of card.choices) {
        actions.add(choice.action);
        if (choice.action.startsWith("vote:") && choice.action.endsWith(":go")) actions.add("go");
        else if (choice.action.startsWith("vote:") && choice.action.endsWith(":nogo")) actions.add("nogo");
      }
    }
    live = actions;

    host.querySelectorAll<HTMLElement>("[data-act]").forEach((node) => {
      const on = actions.has(node.dataset.act ?? "");
      node.classList.toggle("hot", on);
      node.toggleAttribute("disabled", !on && node.tagName === "BUTTON" && node.id !== "abort-lever");
    });

    const arm = actions.has("commander:arm");
    const abort = actions.has("commander:abort");
    lever.classList.toggle("hot", arm || abort);
    lever.classList.toggle("armed", m.armed);
    if (!abort) {
      guardOpen = false;
      lever.classList.remove("open");
    }
    const label = lever.querySelector(".alabel");
    if (label) {
      label.textContent = arm ? "Arm" : abort ? (guardOpen ? "Pull" : "Guard") : m.armed ? "Armed" : "Safe";
    }
  }

  function setNeedle(name: string, degrees: number, readout: string): void {
    const gauge = host.querySelector(`[data-needle="${name}"]`);
    const needle = gauge?.querySelector("i");
    const value = gauge?.querySelector("b");
    if (needle) needle.style.transform = `rotate(${degrees}deg)`;
    if (value) value.textContent = readout;
  }

  function setDial(act: string, degrees: number): void {
    const needle = host.querySelector(`[data-act="${act}"] i`) as HTMLElement | null;
    if (needle) needle.style.transform = `rotate(${degrees}deg)`;
  }

  return {
    paint,
    reset() {
      guardOpen = false;
      lever.classList.remove("open");
    },
  };
}

function span(value: number, min: number, max: number): number {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return -120 + t * 240;
}
