import { AfhChannelMap } from './afh';
import { NUM_CHANNELS, SETUP_MAX_S } from './constants';
import { collisionProbabilityAnalytic, simulateCollisionRate, WifiInterferer } from './interferers';
import { analyticGoodputBps, LinkSimulator } from './link';
import type { AclType } from './packets';
import { Rng } from './rng';
import { sampleSetupTimeS } from './setup';

/**
 * Lab Mode experiments: each returns the analytic (theory) values and the
 * simulated values produced by the same engine the game uses.
 * Pure functions — they run in a Web Worker in the browser and in Vitest.
 */

// ── 1. Throughput vs BER ────────────────────────────────────────────────

/** BER points (log-spaced) where the simulator is sampled. */
export const BER_SIM_POINTS = [1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2];

/** Log-spaced BER values for smooth analytic curves. */
export function logSpace(lo: number, hi: number, n: number): number[] {
  const a = Math.log10(lo);
  const b = Math.log10(hi);
  return Array.from({ length: n }, (_, i) => Math.pow(10, a + ((b - a) * i) / (n - 1)));
}

/**
 * Forward goodput (kbit/s) with a 1-slot ACK return (NULL), i.e. the
 * asymmetric case — DH5 tops out at 723.2 kbit/s.
 */
export function analyticThroughputKbps(type: AclType, ber: number): number {
  return analyticGoodputBps(type, 'NULL', ber) / 1000;
}

export function simulatedThroughputKbps(type: AclType, ber: number, slots: number, seed: number): number {
  const sim = new LinkSimulator({ masterAddress: 0x00ab1e000000 + seed, aclType: type, returnType: 'NULL', ber, seed });
  sim.runQuiet(slots);
  return sim.goodputFwdBps() / 1000;
}

// ── 2. Collision probability vs number of piconets ──────────────────────

export function analyticCollisionPct(n: number): number {
  return collisionProbabilityAnalytic(n) * 100;
}

export function simulatedCollisionPct(n: number, slots: number, seed: number): number {
  return simulateCollisionRate(n, slots, seed) * 100;
}

// ── 3. Packet loss vs Wi-Fi duty cycle, AFH off / on ────────────────────

/** Wi-Fi channel used in the experiment and the BT channels it covers. */
export const WIFI_EXPERIMENT_CHANNEL = 6;

export function wifiBand(): [number, number] {
  return new WifiInterferer('w', WIFI_EXPERIMENT_CHANNEL).channelRange();
}

/**
 * Theory without AFH: a 1-slot packet is hit when its hop lands in the Wi-Fi
 * band (lanes/79) while the AP is on (duty). With JAMMED_BER = 0.05 a hit
 * packet is practically always lost. With AFH the band is never used → 0.
 */
export function analyticWifiLossPct(duty: number, afh: boolean): number {
  if (afh) return 0;
  const [lo, hi] = wifiBand();
  return ((hi - lo + 1) / NUM_CHANNELS) * duty * 100;
}

/** Simulated ACL packet loss (%) for DH1 ↔ DH1 traffic next to a Wi-Fi AP. */
export function simulatedWifiLossPct(duty: number, afh: boolean, slots: number, seed: number): number {
  const map = new AfhChannelMap();
  if (afh) {
    const [lo, hi] = wifiBand();
    for (let k = lo; k <= hi; k++) map.blacklist(k);
  }
  const sim = new LinkSimulator({
    masterAddress: 0x00af00000000 + seed,
    aclType: 'DH1',
    returnType: 'DH1',
    ber: 0,
    interferers: [new WifiInterferer('wifi', WIFI_EXPERIMENT_CHANNEL, duty, seed)],
    afh: afh ? map : null,
    seed,
  });
  sim.runQuiet(slots);
  const s = sim.stats;
  return s.aclSent ? ((s.aclLost + s.aclPayloadErrors) / s.aclSent) * 100 : 0;
}

// ── 4. Connection setup time histogram ──────────────────────────────────

export interface Histogram {
  /** Left edge of each bin, seconds. */
  edges: number[];
  counts: number[];
  binWidth: number;
  mean: number;
  max: number;
  n: number;
}

export function setupHistogram(n: number, seed: number, binWidth = 0.1): Histogram {
  const rng = new Rng(seed);
  const bins = Math.ceil(SETUP_MAX_S / binWidth);
  const counts = new Array<number>(bins).fill(0);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const t = sampleSetupTimeS(rng);
    sum += t;
    if (t > max) max = t;
    counts[Math.min(bins - 1, Math.floor(t / binWidth))]!++;
  }
  return { edges: counts.map((_, i) => i * binWidth), counts, binWidth, mean: n ? sum / n : 0, max, n };
}

/** Expected count in a bin [a, a + w) for n samples: n × (CDF(a + w) − CDF(a)). */
export function analyticSetupBin(a: number, w: number, n: number): number {
  const cdf = (t: number) => (t <= 0 ? 0 : t >= SETUP_MAX_S ? 1 : 1 - Math.pow(1 - t / SETUP_MAX_S, 3));
  return n * (cdf(a + w) - cdf(a));
}
