import { MAX_ACTIVE_SLAVES, SETUP_MEAN_S } from '../../sim/constants';

/**
 * Level 1 scoring (pure, unit-tested).
 *
 *  +100 per active slave (best simultaneous count, max 7)
 *  +150 for parking correctly: parking when the piconet was full so an 8th device could join
 *  +200 scatternet bonus (a bridge between two piconets)
 *  +0…300 speed bonus: simulated time to reach 7 active slaves vs the ideal
 *         of 7 average setups (7 × 0.64 s) + 1 s for inquiry; −40 per extra second.
 */

export const IDEAL_TIME_TO_7_S = MAX_ACTIVE_SLAVES * SETUP_MEAN_S + 1; // 5.48 s

export interface Level1Result {
  maxActive: number;
  parkedCorrectly: boolean;
  scatternet: boolean;
  /** Simulated seconds from the first inquiry until 7 slaves were active (null if never). */
  timeTo7S: number | null;
}

export interface Level1Score {
  slaves: number;
  park: number;
  bonus: number;
  speed: number;
  total: number;
  stars: number;
}

export function scoreLevel1(r: Level1Result): Level1Score {
  const slaves = 100 * Math.min(MAX_ACTIVE_SLAVES, r.maxActive);
  const park = r.parkedCorrectly ? 150 : 0;
  const bonus = r.scatternet ? 200 : 0;
  const speed =
    r.timeTo7S === null ? 0 : Math.max(0, Math.min(300, Math.round(300 - 40 * Math.max(0, r.timeTo7S - IDEAL_TIME_TO_7_S))));
  const full = r.maxActive >= MAX_ACTIVE_SLAVES;
  const stars = full && r.parkedCorrectly && r.scatternet ? 3 : full && r.parkedCorrectly ? 2 : 1;
  return { slaves, park, bonus, speed, total: slaves + park + bonus + speed, stars };
}
