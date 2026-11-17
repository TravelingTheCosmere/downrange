# Downrange

A one-player launch sim. You hot-seat the crew and the control room for **Skiff-1**, a crewed flight on the **Northline NL-9**. The booster comes home to the ship **Bay One**.

This is an original game. It is not affiliated with SpaceX, and it does not use their names or marks.

## Play

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/downrange
npm install
npm run dev
```

Open the URL Vite prints. On this machine that is http://localhost:5173. From another machine on the network, use the Network URL Vite prints (this server is http://10.10.8.25:5173).

The open call sits you in that seat and speaks the request. Keys:

- `1`–`9` sit a seat anyway
- `V` cycle pad, track, cabin, booster, control room
- `N` run the clock to the next call
- `P` pause
- `Z` `X` `C` set 1×, 8×, 24×
- `M` mute the loop, the chime, and the engines

The count holds if a gate is late. A lit seat has an open call, pinned at the top of the console. In the cabin, the live gauges are the crew controls: sensors, displays, go/no-go, and the abort handle.

## What the first flight is

Countdown from T−10 through booster landing. Calls that matter:

- Weather and FIDO on the Bay One wind
- Mission specialist on two cabin sensors that disagree
- Propulsion on a noisy engine sensor
- A go/no-go poll, CAPCOM's relay, and the commander's abort arm
- FIDO's landing commit

A wrong wind override, or shutting down a healthy engine, changes whether Bay One catches the booster. The crew still flies.

## Where a Kerbal-style game would grow

`src/sim/physics.ts` already integrates thrust, mass, drag, and gravity for both stages. The calls sit on top of that state. Later slices can hand pitch and throttle to the pilot, swap the flat world for a gravity well, and add a vehicle editor without throwing away the loop.
