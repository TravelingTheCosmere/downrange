import * as THREE from "three";
import type { Mission } from "../sim/mission";
import { noseAltitude } from "../sim/physics";
import { BOOSTER_H, BAY_ONE_X, DECK_Y, RADIUS, UPPER_H } from "../sim/vehicle";
import {
  CABIN_EYE,
  CABIN_PANEL,
  orientCabinPanel,
  placeCabinCamera,
  placePadCamera,
  placeRoomCamera,
  placeTrackCamera,
  poseTail,
  type TailPose,
} from "./frames";

export type ViewId = "pad" | "track" | "cabin" | "booster" | "room";

const white = new THREE.MeshStandardMaterial({ color: 0xf3f0e8, metalness: 0.62, roughness: 0.34 });
const black = new THREE.MeshStandardMaterial({ color: 0x171b20, metalness: 0.45, roughness: 0.42 });
const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.72, roughness: 0.32 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa09a, metalness: 0.05, roughness: 0.86 });
const seaMat = new THREE.MeshStandardMaterial({ color: 0x1c5164, metalness: 0.2, roughness: 0.55 });
const towerMat = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, metalness: 0.35, roughness: 0.45 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb15e, transparent: true, opacity: 0.9, depthWrite: false });
const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff3d4, transparent: true, opacity: 0.95, depthWrite: false });
const flameGlowMat = new THREE.MeshBasicMaterial({
  color: 0xff6a1a,
  transparent: true,
  opacity: 0.38,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const seaUniforms = { uTime: { value: 0 } };
const oceanMat = new THREE.ShaderMaterial({
  uniforms: seaUniforms,
  vertexShader: `
    uniform float uTime;
    varying float vH;
    void main() {
      vec3 p = position;
      float w = sin(p.x * 0.015 + uTime * 0.7) * 2.2 + cos(p.y * 0.012 + uTime * 0.5) * 1.6;
      p.z += w;
      vH = w;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    varying float vH;
    void main() {
      vec3 deep = vec3(0.05, 0.20, 0.30);
      vec3 crest = vec3(0.55, 0.78, 0.82);
      gl_FragColor = vec4(mix(deep, crest, smoothstep(-1.2, 2.4, vH)), 1.0);
    }
  `,
});
const skyUniforms = { uHigh: { value: 0 } };
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  fog: false,
  depthWrite: false,
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uHigh;
    varying vec3 vPos;
    void main() {
      vec3 dir = normalize(vPos);
      float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 day = mix(vec3(0.78, 0.88, 0.95), vec3(0.38, 0.64, 0.88), h);
      vec3 night = mix(vec3(0.015, 0.02, 0.045), vec3(0.04, 0.07, 0.12), h);
      vec3 col = mix(day, night, uHigh);
      float n = fract(sin(dot(floor(dir * 220.0), vec3(127.1, 311.7, 74.7))) * 43758.5453);
      col += step(0.992, n) * uHigh * 0.9;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const roomMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });

export interface World {
  resize(width: number, height: number): void;
  render(mission: Mission, view: ViewId): void;
}

export function createWorld(canvas: HTMLCanvasElement): World {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = false;

  const flight = new THREE.Scene();
  flight.fog = new THREE.Fog(0x8ebcda, 400, 9000);
  const hemi = new THREE.HemisphereLight(0xd7ecff, 0x6a7a55, 0.95);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.55);
  sun.position.set(180, 260, 90);
  const fill = new THREE.DirectionalLight(0x9ec4ff, 0.55);
  fill.position.set(-140, 80, -180);
  flight.add(hemi, sun, fill);

  const booster = buildBooster();
  const upper = buildUpper();
  const cabin = buildCabinFrame();
  upper.add(cabin);
  flight.add(booster, upper);

  const pad = buildPad();
  const coast = new THREE.Mesh(new THREE.CircleGeometry(700, 48), seaMat);
  coast.rotation.x = -Math.PI / 2;
  coast.position.y = -0.6;
  // Plane lies in XY. rotation.x = -PI/2 maps object +z to world +y, so the shader wave is p.z.
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000, 48, 48), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.2;
  const barge = buildBarge();
  // Camera sits inside this shell. BackSide draws the inner faces. Not culled: the eye is inside the sphere.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(22000, 28, 18), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  flight.add(pad, coast, ocean, barge, sky);

  const room = buildRoom();
  const wallTarget = new THREE.WebGLRenderTarget(1280, 720);
  wallTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const wall = room.getObjectByName("wall") as THREE.Mesh;
  (wall.material as THREE.MeshBasicMaterial).map = wallTarget.texture;

  const flightCam = new THREE.PerspectiveCamera(52, 1, 0.3, 80000);
  const roomCam = new THREE.PerspectiveCamera(48, 1, 0.05, 80);
  placeRoomCamera(roomCam);

  const plume = new THREE.PointLight(0xff9944, 0, 80);
  flight.add(plume);

  let leg = 0;
  let width = 1;
  let height = 1;

  function resize(w: number, h: number): void {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
  }

  function render(mission: Mission, view: ViewId): void {
    const pose = poses(mission);
    const focusX = view === "booster" ? pose.booster.x : view === "pad" ? 0 : pose.crew.x;
    poseTail(booster, pose.booster, focusX);
    poseTail(upper, pose.upper, focusX);
    barge.position.set(BAY_ONE_X - focusX, 0, 0);
    pad.position.x = -focusX;
    coast.position.x = -focusX;
    // Keep the water under whichever vehicle the camera is following.
    ocean.position.x = view === "booster" || view === "pad" ? 0 : pose.crew.x - focusX;
    coast.visible = Math.abs(focusX) < 4000;

    const throttle = pose.throttle;
    const burning = throttle > 0.04 && !pose.upperBurn;
    const flicker = 0.9 + Math.sin(performance.now() * 0.018) * 0.1;
    const flame = booster.getObjectByName("flame") as THREE.Mesh;
    flame.visible = burning;
    flame.scale.setScalar((0.55 + throttle) * flicker);
    for (const name of ["flame-core", "flame-glow"]) {
      const mesh = booster.getObjectByName(name) as THREE.Mesh;
      mesh.visible = burning;
      mesh.scale.setScalar((name === "flame-core" ? 0.62 : 0.85) + throttle * flicker);
    }
    const upperFlame = upper.getObjectByName("upper-flame") as THREE.Mesh;
    upperFlame.visible = pose.upperBurn;
    const upperCore = upper.getObjectByName("upper-core") as THREE.Mesh;
    upperCore.visible = pose.upperBurn;
    const center = booster.getObjectByName("engine-center") as THREE.Mesh;
    const inhibited = mission.engine === "inhibit" && !pose.separated;
    const hot = throttle > 0.2 && !pose.upperBurn;
    (center.material as THREE.MeshStandardMaterial).emissive.set(inhibited || !hot ? 0x000000 : 0xff6a2a);
    (center.material as THREE.MeshStandardMaterial).color.set(inhibited ? 0x111418 : 0x3a4048);
    const outer = booster.getObjectByName("engine-0") as THREE.Mesh;
    (outer.material as THREE.MeshStandardMaterial).emissive.set(hot ? 0xff6a2a : 0x000000);

    const deploy = pose.deploy ? 1 : 0;
    leg += (deploy - leg) * 0.08;
    booster.getObjectByName("legs")?.children.forEach((pivot) => {
      const mesh = pivot.children[0];
      if (mesh) mesh.rotation.x = 0.25 + leg * 0.85;
    });

    plume.intensity = throttle * 18;
    plume.position.set(pose.booster.x - focusX, pose.booster.y + 2, 0);

    const alt = mission.flight ? noseAltitude(mission.flight) : BOOSTER_H + UPPER_H;
    const skyAlt = view === "booster" && mission.flight ? mission.flight.booster.y : alt;
    const skyCol = skyColor(skyAlt);
    renderer.setClearColor(skyCol, 1);
    flight.fog = new THREE.Fog(skyCol, view === "cabin" ? 80 : 500, view === "cabin" ? 4000 : 12000);
    flight.background = skyCol;
    seaUniforms.uTime.value = performance.now() * 0.001;
    skyUniforms.uHigh.value = THREE.MathUtils.clamp(skyAlt / 80000, 0, 1);

    flightCam.aspect = width / height;
    flightCam.updateProjectionMatrix();
    if (view === "pad") placePadCamera(flightCam);
    else if (view === "cabin") placeCabinCamera(flightCam, pose.upper, CABIN_EYE, focusX);
    else if (view === "booster") placeTrackCamera(flightCam, pose.booster, focusX, pose.pull * 0.35);
    else placeTrackCamera(flightCam, pose.separated ? pose.upper : pose.booster, focusX, pose.pull);

    const syncSky = () => sky.position.copy(flightCam.position);
    syncSky();

    if (view === "room") {
      placeTrackCamera(flightCam, pose.separated ? pose.upper : pose.booster, focusX, Math.max(20, pose.pull));
      flightCam.aspect = 16 / 9;
      flightCam.updateProjectionMatrix();
      syncSky();
      renderer.setRenderTarget(wallTarget);
      renderer.render(flight, flightCam);
      renderer.setRenderTarget(null);
      roomCam.aspect = width / height;
      roomCam.updateProjectionMatrix();
      renderer.render(room, roomCam);
      return;
    }
    renderer.setRenderTarget(null);
    renderer.render(flight, flightCam);
  }

  return { resize, render };
}

interface Poses {
  booster: TailPose;
  upper: TailPose;
  crew: TailPose;
  throttle: number;
  upperBurn: boolean;
  separated: boolean;
  deploy: boolean;
  pull: number;
}

function poses(m: Mission): Poses {
  const parked: TailPose = { x: 0, y: 0, pitch: 0 };
  if (!m.flight) {
    return {
      booster: parked,
      upper: offset(parked, BOOSTER_H),
      crew: parked,
      throttle: 0,
      upperBurn: false,
      separated: false,
      deploy: false,
      pull: 0,
    };
  }
  const f = m.flight;
  if (!f.separated) {
    const tail = craftPose(f.upper);
    return {
      booster: tail,
      upper: offset(tail, BOOSTER_H),
      crew: tail,
      throttle: f.upper.throttle,
      upperBurn: false,
      separated: false,
      deploy: false,
      pull: Math.min(80, f.upper.y / 40),
    };
  }
  const booster = craftPose(f.booster);
  const upper = craftPose(f.upper);
  return {
    booster,
    upper,
    crew: upper,
    throttle: f.booster.alive ? f.booster.throttle : 0,
    upperBurn: f.upper.throttle > 0.05 && f.upper.prop > 0,
    separated: true,
    deploy: f.phase === "landing" || f.phase === "down",
    pull: Math.min(90, 10 + f.upper.y / 800),
  };
}

function craftPose(c: { x: number; y: number; pitch: number }): TailPose {
  return { x: c.x, y: Math.max(0, c.y), pitch: c.pitch };
}

function offset(pose: TailPose, dist: number): TailPose {
  return {
    x: pose.x + Math.sin(pose.pitch) * dist,
    y: pose.y + Math.cos(pose.pitch) * dist,
    pitch: pose.pitch,
  };
}

function skyColor(alt: number): THREE.Color {
  const day = new THREE.Color(0x8ebcda);
  const high = new THREE.Color(0x071018);
  const k = THREE.MathUtils.clamp(alt / 90_000, 0, 1);
  return day.lerp(high, k);
}

function buildBooster(): THREE.Group {
  const g = new THREE.Group();
  g.name = "booster";
  const body = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, BOOSTER_H - 6, 28), white);
  body.position.y = (BOOSTER_H - 6) / 2;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS + 0.02, RADIUS + 0.02, 6, 28), black);
  band.position.y = BOOSTER_H - 3;
  g.add(band);
  const nose = new THREE.Object3D();
  nose.name = "nose";
  nose.position.y = BOOSTER_H;
  g.add(nose);

  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 1.35), metal);
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    fin.position.set(Math.cos(a) * (RADIUS + 1.05), BOOSTER_H - 4.2, Math.sin(a) * (RADIUS + 1.05));
    fin.lookAt(0, fin.position.y, 0);
    g.add(fin);
  }

  const centerMat = metal.clone();
  const engineMat = metal.clone();
  const spots: [number, number, string][] = [[0, 0, "engine-center"]];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spots.push([Math.cos(a) * 1.18, Math.sin(a) * 1.18, `engine-${i}`]);
  }
  for (const [x, z, name] of spots) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 0.85, 12), name === "engine-center" ? centerMat : engineMat);
    bell.position.set(x, -0.28, z);
    bell.name = name;
    g.add(bell);
  }

  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.35, 16, 18), flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = -8;
  flame.name = "flame";
  g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.48, 9, 12), flameCoreMat);
  core.rotation.x = Math.PI;
  core.position.y = -4.6;
  core.name = "flame-core";
  g.add(core);
  const glow = new THREE.Mesh(new THREE.ConeGeometry(2.1, 20, 16), flameGlowMat);
  glow.rotation.x = Math.PI;
  glow.position.y = -10;
  glow.name = "flame-glow";
  g.add(glow);
  const race = new THREE.Mesh(new THREE.BoxGeometry(0.22, BOOSTER_H - 14, 0.28), metal);
  race.position.set(0, 16, RADIUS + 0.12);
  g.add(race);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, BOOSTER_H - 16, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xe7b15a, metalness: 0.45, roughness: 0.35 }),
  );
  stripe.position.set(RADIUS * 0.78, 18, RADIUS * 0.58);
  g.add(stripe);

  const legs = new THREE.Group();
  legs.name = "legs";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * (RADIUS - 0.05), 2.4, Math.sin(a) * (RADIUS - 0.05));
    pivot.rotation.y = -a + Math.PI / 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.8, 0.32), metal);
    leg.position.set(0.4, -0.4, 0);
    leg.rotation.z = -0.4;
    pivot.add(leg);
    legs.add(pivot);
  }
  g.add(legs);
  g.add(wordmark("NL-9", 0, 18, RADIUS + 0.04));
  return g;
}

function buildUpper(): THREE.Group {
  const g = new THREE.Group();
  g.name = "upper";
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 10.5, 28), white);
  stage.position.y = 5.25;
  g.add(stage);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS * 0.96, RADIUS, 2.6, 24), white);
  skirt.position.y = 11.8;
  g.add(skirt);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(RADIUS * 0.96, 3.8, 24, 1, true), white);
  cap.position.y = 15.0;
  g.add(cap);
  const heat = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS * 0.84, RADIUS * 0.84, 0.35, 24), black);
  heat.position.y = 10.7;
  g.add(heat);
  const win = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 16),
    new THREE.MeshBasicMaterial({ color: 0xb9e4ff }),
  );
  win.position.set(0, 13.6, RADIUS * 0.97);
  g.add(win);
  const nose = new THREE.Object3D();
  nose.name = "nose";
  nose.position.y = UPPER_H;
  g.add(nose);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 8, 14), flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = -4;
  flame.name = "upper-flame";
  flame.visible = false;
  g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 5, 10), flameCoreMat);
  core.rotation.x = Math.PI;
  core.position.y = -2.4;
  core.name = "upper-core";
  core.visible = false;
  g.add(core);
  g.add(wordmark("SKIFF", 0, 13.2, RADIUS * 0.98));
  return g;
}

function buildCabinFrame(): THREE.Group {
  const g = new THREE.Group();
  g.name = "cabin";
  // Inward faces: the eye sits inside this bay. Front faces would be culled.
  const wall = new THREE.MeshStandardMaterial({
    color: 0x2a3038,
    roughness: 0.78,
    metalness: 0.22,
    side: THREE.BackSide,
  });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.22, 3.15, 28, 1, true), wall);
  shell.position.y = 11.95;
  g.add(shell);

  const liner = new THREE.MeshStandardMaterial({ color: 0x12161b, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 1.22, 36), liner);
  ring.position.y = 13.22;
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  const strut = new THREE.MeshStandardMaterial({ color: 0x3a414a, metalness: 0.45, roughness: 0.42 });
  for (const x of [-0.58, 0.58]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.85), strut);
    bar.position.set(x, 13.28, 0.2);
    g.add(bar);
  }

  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.07, 0.5), strut);
  dash.position.set(0, CABIN_PANEL.y + 0.06, CABIN_PANEL.z);
  g.add(dash);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.28, 0.36),
    new THREE.MeshBasicMaterial({ map: panelTexture(["SKIFF-1", "CABIN B   14.72"]) }),
  );
  screen.position.set(CABIN_PANEL.x, CABIN_PANEL.y, CABIN_PANEL.z);
  orientCabinPanel(screen);
  g.add(screen);

  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1c2127, roughness: 0.7, metalness: 0.2 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x9a9388, roughness: 0.85 });
  for (const x of [-0.5, 0.5]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.42), seatMat);
    seat.position.set(x, 12.05, -0.22);
    g.add(seat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), cloth);
    head.position.set(x, 12.28, 0.02);
    g.add(head);
  }

  const lamp = new THREE.PointLight(0xffe6c4, 1.4, 4.5);
  lamp.position.set(0, 12.4, 0.55);
  g.add(lamp);
  return g;
}

function panelTexture(lines: string[]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#0c1a14";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#1e4a38";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = "#8ee0b2";
  ctx.font = "600 44px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, 28, 52 + i * 56));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildPad(): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(28, 30, 1.2, 40), concrete);
  slab.position.y = 0.4;
  g.add(slab);
  const tower = new THREE.Group();
  tower.position.set(0, 0, 15);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(3.2, 72, 3.2), towerMat);
  mast.position.y = 36;
  tower.add(mast);
  for (let y = 8; y <= 64; y += 8) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 3.4), towerMat);
    deck.position.y = y;
    tower.add(deck);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 9), towerMat);
  arm.position.set(6, 28, -6);
  tower.add(arm);
  g.add(tower);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 14, 10), metal);
  pipe.position.set(-10, 7, 8);
  g.add(pipe);
  for (const [x, z] of [[-16, -8], [-16, 8], [18, -12]] as [number, number][]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 9, 16), metal);
    tank.position.set(x, 5, z);
    g.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 10), metal);
    cap.position.set(x, 9.4, z);
    g.add(cap);
  }
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.35, 26),
    new THREE.MeshStandardMaterial({ color: 0x2c312c, roughness: 0.92 }),
  );
  trench.position.set(0, 0.25, -10);
  g.add(trench);
  const lamp = new THREE.PointLight(0xffe2b0, 18, 90);
  lamp.position.set(6, 58, 10);
  g.add(lamp);
  return g;
}

function buildBarge(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(92, 6, 52), new THREE.MeshStandardMaterial({ color: 0xb9c4c8, metalness: 0.4, roughness: 0.45 }));
  hull.position.y = DECK_Y - 3;
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(86, 0.4, 46), new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.8 }));
  deck.position.y = DECK_Y;
  g.add(deck);
  const mark = wordmark("BAY ONE", 0, DECK_Y + 0.3, 0);
  mark.rotation.x = -Math.PI / 2;
  g.add(mark);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.28, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xe7b15a, metalness: 0.5, roughness: 0.35 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = DECK_Y + 0.35;
  g.add(ring);
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.35, roughness: 0.45 }),
  );
  house.position.set(-30, DECK_Y + 2.7, 16);
  g.add(house);
  return g;
}

function buildRoom(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090c);
  scene.add(new THREE.HemisphereLight(0x9eb6d4, 0x2a241c, 0.85));
  const key = new THREE.PointLight(0xffe1b0, 22, 26);
  key.position.set(0, 3.2, 2);
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 18), roomMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 18), roomMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.2;
  scene.add(ceiling);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.2), roomMat);
  back.position.set(0, 2.1, -7.2);
  scene.add(back);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(9.2, 3.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  wall.name = "wall";
  wall.position.set(0, 2.15, -7.05);
  scene.add(wall);
  const sign = wordmark("NORTHLINE", 0, 4.02, -6.9);
  sign.scale.set(0.32, 0.28, 1);
  scene.add(sign);
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 3.8, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x0c0e12, metalness: 0.5, roughness: 0.4 }),
  );
  bezel.position.set(0, 2.15, -7.18);
  scene.add(bezel);

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x1b2128, metalness: 0.3, roughness: 0.6 });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x14352c });
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.72, 0.7), deskMat);
      desk.position.set(-3 + col * 2, 0.7, 1.2 + row * 2.1);
      scene.add(desk);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), screenMat);
      screen.position.set(-3 + col * 2, 1.25, 0.9 + row * 2.1);
      scene.add(screen);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.28), new THREE.MeshStandardMaterial({ color: 0x243038, roughness: 0.7 }));
      torso.position.set(-3 + col * 2, 1.12, 1.4 + row * 2.1);
      scene.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshStandardMaterial({ color: 0xcbbba6, roughness: 0.7 }));
      head.position.set(-3 + col * 2, 1.42, 1.32 + row * 2.1);
      scene.add(head);
    }
  }
  return scene;
}

function wordmark(text: string, x: number, y: number, z: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "#14181d";
  ctx.fillRect(16, 28, 480, 72);
  ctx.fillStyle = "#f4f1ea";
  ctx.font = "700 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(text.length > 6 ? 10 : 4.2, 1.05),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}
