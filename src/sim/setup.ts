import { SETUP_MAX_S, SETUP_MEAN_S, SLOT_S } from './constants';
import type { Rng } from './rng';

/**
 * Connection setup (inquiry + page) delay model.
 *
 * Textbook figures [SCH]: average ≈ 0.64 s, maximum ≈ 2.56 s. They come from
 * scan intervals of 1.28 s and the page trains needed to find the slave's
 * scan frequency. We don't simulate the trains; we draw the delay from a
 * distribution on [0, 2.56 s] with mean exactly 0.64 s = 2.56 / 4:
 *
 *     T = 2.56 s × X,   X ~ Beta(1, 3)   (density 3(1 − x)^2)
 *
 * Mostly short waits with a long tail up to the maximum. Sampling by inverse
 * CDF: X = 1 − (1 − U)^(1/3). Rounded to whole slots (625 µs). GAME MODEL.
 */

export function sampleSetupTimeS(rng: Rng): number {
  const x = 1 - Math.cbrt(1 - rng.next());
  const t = SETUP_MAX_S * x;
  return Math.round(t / SLOT_S) * SLOT_S;
}

/** Analytic mean of the model (= 0.64 s). */
export const SETUP_MODEL_MEAN_S = SETUP_MAX_S / 4;

/** CDF of the model, P(T ≤ t). */
export function setupTimeCdf(tS: number): number {
  if (tS <= 0) return 0;
  if (tS >= SETUP_MAX_S) return 1;
  return 1 - Math.pow(1 - tS / SETUP_MAX_S, 3);
}

// Compile-time-ish sanity: keep the model tied to the spec constant.
if (Math.abs(SETUP_MODEL_MEAN_S - SETUP_MEAN_S) > 1e-9) {
  throw new Error('setup model mean drifted from SETUP_MEAN_S');
}
