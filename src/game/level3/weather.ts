import { SLOT_S } from '../../sim/constants';
import { analyticGoodputBps, LinkSimulator } from '../../sim/link';
import { ACL_TYPES, type AclType } from '../../sim/packets';

/**
 * Level 3 "noise weather": the channel BER changes over simulated time.
 * Pure module (no rendering) so the balance can be unit-tested.
 *
 * The four kinds of weather were chosen so that a different packet type is
 * the best choice in each (see analyticGoodputBps):
 *   clear 1e-5 → DH5, drizzle 5e-4 → DM5, static storm 1e-2 → DM3, lightning 2.5e-2 → DM1
 */

export type WeatherKind = 'clear' | 'drizzle' | 'storm' | 'lightning';

export interface WeatherInfo {
  kind: WeatherKind;
  label: string;
  ber: number;
  color: string;
}

export const WEATHER: Readonly<Record<WeatherKind, WeatherInfo>> = {
  clear: { kind: 'clear', label: 'Clear', ber: 1e-5, color: '#3bffb0' },
  drizzle: { kind: 'drizzle', label: 'Drizzle', ber: 5e-4, color: '#00e5ff' },
  storm: { kind: 'storm', label: 'Static storm', ber: 1e-2, color: '#ff2bd6' },
  lightning: { kind: 'lightning', label: 'Lightning', ber: 2.5e-2, color: '#ffe45c' },
};

/** One loop of weather, in simulated seconds. Repeats until the song is sent. */
export const SCHEDULE: readonly { kind: WeatherKind; dur: number }[] = [
  { kind: 'clear', dur: 3 },
  { kind: 'drizzle', dur: 3 },
  { kind: 'storm', dur: 3 },
  { kind: 'lightning', dur: 1.5 },
  { kind: 'drizzle', dur: 2 },
  { kind: 'clear', dur: 3.5 },
];
export const LOOP_S = SCHEDULE.reduce((a, s) => a + s.dur, 0); // 16 s

export function weatherAt(tS: number): WeatherInfo {
  let t = ((tS % LOOP_S) + LOOP_S) % LOOP_S;
  for (const s of SCHEDULE) {
    if (t < s.dur) return WEATHER[s.kind];
    t -= s.dur;
  }
  return WEATHER.clear;
}

export function berAt(tS: number): number {
  return weatherAt(tS).ber;
}

/** Upcoming weather segments from tS over `horizonS` seconds (for the forecast strip). */
export function forecast(tS: number, horizonS: number): { kind: WeatherKind; from: number; to: number }[] {
  const out: { kind: WeatherKind; from: number; to: number }[] = [];
  const loopStart = Math.floor(tS / LOOP_S) * LOOP_S;
  let t = loopStart;
  for (let loop = 0; loop < 3 && t < tS + horizonS; loop++) {
    for (const s of SCHEDULE) {
      const from = t;
      const to = t + s.dur;
      t = to;
      if (to <= tS) continue;
      if (from >= tS + horizonS) break;
      out.push({ kind: s.kind, from: Math.max(from, tS), to: Math.min(to, tS + horizonS) });
    }
  }
  return out;
}

/** The song: 1 MB = 1 000 000 bytes = 8 000 000 bits. */
export const SONG_BITS = 8_000_000;

/** Best packet type for a BER (highest analytic goodput, ACK-only return). */
export function bestGear(ber: number): AclType {
  let best: AclType = 'DM1';
  let bestG = -1;
  for (const t of ACL_TYPES) {
    const g = analyticGoodputBps(t, 'NULL', ber);
    if (g > bestG) {
      bestG = g;
      best = t;
    }
  }
  return best;
}

export const LEVEL3_MASTER = 0x00b1e40b0b03;
export const LEVEL3_SEED = 33;

export function createLevel3Sim(gear: AclType): LinkSimulator {
  return new LinkSimulator({
    masterAddress: LEVEL3_MASTER,
    clockOffset: 1234,
    aclType: gear,
    returnType: 'NULL', // the headset only acknowledges (ARQN in a NULL packet)
    ber: (slot) => berAt(slot * SLOT_S),
    seed: LEVEL3_SEED,
  });
}

/** Run the whole level headless with a gear strategy; returns the transfer time in seconds. */
export function simulateTransfer(strategy: (tS: number) => AclType, maxS = 120): number {
  const sim = createLevel3Sim(strategy(0));
  const maxSlots = maxS / SLOT_S;
  while (sim.stats.deliveredFwdBits < SONG_BITS && sim.slot < maxSlots) {
    sim.aclType = strategy(sim.slot * SLOT_S);
    sim.next();
  }
  return sim.slot * SLOT_S;
}

/**
 * Star thresholds (simulated seconds), set from the balance test:
 * perfect shifting ≈ 16.8 s, shifting 0.6 s late ≈ 17.6 s, DH5 only ≈ 20.5 s, DM5 only ≈ 20.7 s.
 */
export const STAR_TIMES = { three: 18, two: 19.5 };

export function starsForTime(tS: number): number {
  return tS <= STAR_TIMES.three ? 3 : tS <= STAR_TIMES.two ? 2 : 1;
}
