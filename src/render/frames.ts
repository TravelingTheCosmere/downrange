import * as THREE from "three";

const cabinLook = new THREE.Vector3();

/** Eye point along the upper-stage axis, in the cabin bay under the nose. */
export const CABIN_EYE = 11.35;

/** Crew display in upper-stage coordinates. Local +Y on the panel is cabin up. */
export const CABIN_PANEL = { x: 0, y: 12.95, z: 0.02 };

/**
 * A panel whose geometry lies in local XY (PlaneGeometry).
 * After this, local +Y is cabin up (+Z) and local +Z faces the crew (vehicle −Y).
 * Check: local (0,1,0) → world +Z, local (0,0,1) → world −Y, at pitch 0.
 */
export function orientCabinPanel(obj: THREE.Object3D): void {
  obj.rotation.set(Math.PI / 2, 0, 0);
}

/**
 * Vehicle pitch is radians from vertical, positive toward +x (downrange).
 * The mesh is built with its nose along local +Y, tail at the origin.
 * rotation.z = -pitch sends local +Y toward +x.
 * Check: pitch 0.5, local (0,1,0) → world x = sin(0.5) > 0.
 */
export function rocketRotationZ(pitch: number): number {
  return -pitch;
}

export interface TailPose {
  x: number;
  y: number;
  pitch: number;
}

/** Place a tail-origin vehicle. originX is the view-space rebase. */
export function poseTail(obj: THREE.Object3D, pose: TailPose, originX: number): void {
  obj.position.set(pose.x - originX, pose.y, 0);
  obj.rotation.set(0, 0, rocketRotationZ(pose.pitch));
  obj.updateMatrixWorld(true);
}

/**
 * Cabin camera sits in the capsule looking along the nose.
 * Seat "up" (top of the head) is world +Z after the pitch rotation,
 * because pitch is a rotation about Z and the crew lie on their backs.
 */
export function placeCabinCamera(
  camera: THREE.PerspectiveCamera,
  pose: TailPose,
  along: number,
  originX: number,
): void {
  const noseX = Math.sin(pose.pitch);
  const noseY = Math.cos(pose.pitch);
  // Top of the head stays +Z. Pitch is a rotation about Z, so this up does not tilt.
  camera.up.set(0, 0, 1);
  camera.position.set(pose.x - originX + noseX * along, pose.y + noseY * along, 0.42);
  cabinLook.set(camera.position.x + noseX * 40, camera.position.y + noseY * 40, camera.position.z);
  camera.lookAt(cabinLook);
  camera.updateMatrixWorld(true);
}

/** Pad camera sits uprange and to the side, looking at the stack. */
export function placePadCamera(camera: THREE.PerspectiveCamera): void {
  camera.up.set(0, 1, 0);
  camera.position.set(-78, 18, 62);
  camera.lookAt(4, 34, 0);
  camera.updateMatrixWorld(true);
}

export function placeTrackCamera(
  camera: THREE.PerspectiveCamera,
  pose: TailPose,
  originX: number,
  pull: number,
): void {
  camera.up.set(0, 1, 0);
  const back = 48 + pull;
  const side = 36 + pull * 0.45;
  const up = 16 + pull * 0.2;
  camera.position.set(pose.x - originX - back, pose.y + up, side);
  camera.lookAt(pose.x - originX, pose.y + 28, 0);
  camera.updateMatrixWorld(true);
}

export function placeRoomCamera(camera: THREE.PerspectiveCamera): void {
  camera.up.set(0, 1, 0);
  camera.position.set(0.35, 1.62, 6.4);
  camera.lookAt(0, 2.15, -6);
  camera.updateMatrixWorld(true);
}
