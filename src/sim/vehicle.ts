/** Game model in the public ballpark of a crewed two-stage orbital rocket. Not a flight prediction. */

export const S1_DRY = 25_000;
export const S1_PROP = 400_000;
export const S2_DRY = 4_000;
export const S2_PROP = 107_000;
export const CAPSULE = 13_000;

export const MERLIN_SL = 845e3;
export const MERLIN_VAC = 981e3;
export const MERLIN_ISP_SL = 282;
export const MERLIN_ISP_VAC = 311;
export const MVAC_THRUST = 934e3;
export const MVAC_ISP = 348;

export const RADIUS = 1.83;
export const BOOSTER_H = 47;
export const UPPER_H = 18;
export const AREA = Math.PI * RADIUS * RADIUS;

/** Propellant left in the booster at main-engine cutoff. The rest is the ascent burn. */
export const MECO_PROP = 48_000;
/** Held back from boostback so entry and landing still have a tank. */
export const ENTRY_KEEP = 7_000;
export const LANDING_KEEP = 11_000;

/** Downrange station of the landing ship Bay One, meters. Tuned to the nominal ground track. */
export const BAY_ONE_X = 309_260;
export const DECK_Y = 8;

export const G0 = 9.80665;
export const R_EARTH = 6_371_000;

export function gravity(alt: number): number {
  const r = R_EARTH + Math.max(0, alt);
  return G0 * (R_EARTH / r) ** 2;
}

export function density(alt: number): number {
  if (alt < 0) return 1.225;
  if (alt > 140_000) return 0;
  return 1.225 * Math.exp(-alt / 8500);
}
