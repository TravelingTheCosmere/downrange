import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BOOSTER_H } from "../src/sim/vehicle";
import {
  CABIN_EYE,
  CABIN_PANEL,
  orientCabinPanel,
  placeCabinCamera,
  placePadCamera,
  poseTail,
  rocketRotationZ,
} from "../src/render/frames";

describe("vehicle frame", () => {
  it("pitches the nose downrange", () => {
    const rocket = new THREE.Object3D();
    const nose = new THREE.Object3D();
    nose.name = "nose";
    nose.position.set(0, BOOSTER_H, 0);
    rocket.add(nose);
    const pitch = 0.5;
    expect(rocketRotationZ(pitch)).toBe(-pitch);
    poseTail(rocket, { x: 10, y: 4, pitch }, 0);
    const world = new THREE.Vector3();
    nose.getWorldPosition(world);
    expect(world.x).toBeGreaterThan(10 + 20);
    expect(world.y).toBeGreaterThan(4);
    expect(Math.abs(world.z)).toBeLessThan(1e-6);
  });

  it("looks out of the cabin along the nose", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const pitch = 0.6;
    placeCabinCamera(camera, { x: 0, y: 0, pitch }, 50, 0);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const nose = new THREE.Vector3(Math.sin(pitch), Math.cos(pitch), 0);
    expect(dir.dot(nose)).toBeGreaterThan(0.99);
    expect(dir.z).toBeCloseTo(0, 5);
  });

  it("shows the cabin display right side up in the lower view", () => {
    const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 500);
    const pose = { x: 80, y: 30, pitch: 0.45 };
    const upper = new THREE.Object3D();
    poseTail(upper, pose, 0);
    const panel = new THREE.Object3D();
    panel.position.set(CABIN_PANEL.x, CABIN_PANEL.y, CABIN_PANEL.z);
    orientCabinPanel(panel);
    upper.add(panel);
    upper.updateMatrixWorld(true);
    placeCabinCamera(camera, pose, CABIN_EYE, 0);

    const top = new THREE.Vector3(0, 0.16, 0.02);
    const bottom = new THREE.Vector3(0, -0.16, 0.02);
    panel.localToWorld(top);
    panel.localToWorld(bottom);
    top.project(camera);
    bottom.project(camera);

    expect(top.y).toBeGreaterThan(bottom.y);
    expect(bottom.y).toBeLessThan(0);
    expect(top.y).toBeLessThan(0.35);
    expect(Math.abs(top.x)).toBeLessThan(0.7);
    expect(top.z).toBeLessThan(1);
    expect(bottom.z).toBeLessThan(1);
  });

  it("watches the pad from uprange", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    placePadCamera(camera);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    expect(dir.x).toBeGreaterThan(0.4);
    expect(dir.z).toBeLessThan(-0.2);
    expect(camera.position.x).toBeLessThan(0);
  });
});
