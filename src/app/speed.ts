/**
 * Simulation speed steps.
 *
 * Real Bluetooth hops 1600 times per second (one 625 µs slot per hop), far too
 * fast to see. The speed slider slows simulated time down so one hop can take
 * up to half a second of wall-clock time. The HUD always shows the *real*
 * simulated time in µs/ms, so the slow-motion never misrepresents the protocol.
 *
 * Pure module (no DOM) so it can be unit-tested.
 */

/** Real hop rate of Bluetooth Basic Rate FHSS (hops per second). */
export const REAL_HOPS_PER_SECOND = 1600;
/** Slot length in microseconds: 1 s / 1600 = 625 µs. */
export const SLOT_US = 1_000_000 / REAL_HOPS_PER_SECOND;

export interface SpeedStep {
  /** Short label shown on the slider. */
  readonly label: string;
  /** How many hops are shown per wall-clock second. */
  readonly hopsPerSecond: number;
}

export const SPEED_STEPS: readonly SpeedStep[] = [
  { label: '1 hop / 0.5 s', hopsPerSecond: 2 },
  { label: '1 hop / 0.25 s', hopsPerSecond: 4 },
  { label: '1 hop / 0.1 s', hopsPerSecond: 10 },
  { label: '20 hops / s', hopsPerSecond: 20 },
  { label: '50 hops / s', hopsPerSecond: 50 },
  { label: '200 hops / s', hopsPerSecond: 200 },
  { label: 'Real-time · 1600 hops / s', hopsPerSecond: REAL_HOPS_PER_SECOND },
];

/** 10 hops/s: one simulated second (1600 slots) plays in about 2½ minutes. */
export const DEFAULT_SPEED_INDEX = 2;

/** Wall-clock hops per second at a speed step. */
export function hopsPerSecondAt(index: number): number {
  return SPEED_STEPS[clampSpeedIndex(index)]!.hopsPerSecond;
}

export function clampSpeedIndex(i: number): number {
  if (!Number.isFinite(i)) return DEFAULT_SPEED_INDEX;
  return Math.min(SPEED_STEPS.length - 1, Math.max(0, Math.round(i)));
}

/**
 * Simulated microseconds that pass per wall-clock millisecond at a speed step.
 * Example: real-time → 1000 µs per ms; 4 hops/s → 4 × 625 / 1000 = 2.5 µs per ms.
 */
export function simMicrosPerWallMs(index: number): number {
  const step = SPEED_STEPS[clampSpeedIndex(index)]!;
  return (step.hopsPerSecond * SLOT_US) / 1000;
}
