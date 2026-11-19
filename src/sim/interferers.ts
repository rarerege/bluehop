import {
  HOPS_PER_SECOND,
  MAINS_HZ,
  MICROWAVE_BAND_MHZ,
  NUM_CHANNELS,
  WIFI_CHANNEL_WIDTH_MHZ,
  freqToChannel,
  wifiCenterMHz,
} from './constants';
import { HopGenerator } from './hop';
import { hash2, Rng, unit } from './rng';

/**
 * Sources of interference in the 2.4 GHz band. Each one answers a single
 * question for the link simulator: "is channel k occupied in slot n?".
 * All are deterministic functions of (seed, slot), so runs are reproducible.
 */
export interface Interferer {
  readonly id: string;
  readonly kind: 'wifi' | 'microwave' | 'rival';
  readonly label: string;
  /** Is the interferer transmitting on BT channel k during this slot? */
  jams(channel: number, slot: number): boolean;
  /** BT channels the interferer can ever occupy (for drawing bands). */
  channelRange(): [number, number];
  /** Is the interferer on (anywhere) during this slot? */
  activeAt(slot: number): boolean;
}

/**
 * Wi-Fi access point (802.11b/g, DSSS/OFDM): a fixed 22 MHz block of spectrum.
 * Channel 1 = 2401–2423 MHz → BT channels 0–21; channel 6 → 24–46; channel 11 → 49–71.
 * Traffic is bursty: time is split into bursts of `burstSlots`; each burst is
 * on with probability `dutyCycle`.
 */
export class WifiInterferer implements Interferer {
  readonly kind = 'wifi' as const;
  readonly label: string;
  readonly lo: number;
  readonly hi: number;

  constructor(
    readonly id: string,
    readonly wifiChannel: number,
    public dutyCycle = 0.5,
    readonly seed = 1,
    /** 4 slots = 2.5 ms, roughly one Wi-Fi frame + ACK. */
    readonly burstSlots = 4,
  ) {
    const c = wifiCenterMHz(wifiChannel);
    const half = WIFI_CHANNEL_WIDTH_MHZ / 2;
    // Band [c − 11, c + 11] MHz; BT channel k sits at 2402 + k MHz.
    this.lo = Math.max(0, freqToChannel(c - half));
    this.hi = Math.min(NUM_CHANNELS - 1, freqToChannel(c + half));
    this.label = `Wi-Fi ch ${wifiChannel} (${c - half}–${c + half} MHz)`;
  }

  activeAt(slot: number): boolean {
    const burst = Math.floor(slot / this.burstSlots);
    return unit(hash2(this.seed, burst)) < this.dutyCycle;
  }

  jams(channel: number, slot: number): boolean {
    return channel >= this.lo && channel <= this.hi && this.activeAt(slot);
  }

  channelRange(): [number, number] {
    return [this.lo, this.hi];
  }
}

/**
 * Microwave oven: the magnetron radiates around 2450–2460 MHz, but only during
 * one half-cycle of the mains (50 Hz → 20 ms period = 32 slots, on for 16).
 */
export class MicrowaveInterferer implements Interferer {
  readonly kind = 'microwave' as const;
  readonly label = 'Microwave oven (2450–2460 MHz, 50 Hz)';
  readonly lo = freqToChannel(MICROWAVE_BAND_MHZ[0]);
  readonly hi = freqToChannel(MICROWAVE_BAND_MHZ[1]);
  readonly periodSlots: number;

  constructor(
    readonly id = 'microwave',
    mainsHz = MAINS_HZ,
    /** Fraction of each mains cycle the magnetron is on. */
    public onFraction = 0.5,
  ) {
    this.periodSlots = Math.round(HOPS_PER_SECOND / mainsHz); // 32 at 50 Hz
  }

  activeAt(slot: number): boolean {
    return slot % this.periodSlots < this.periodSlots * this.onFraction;
  }

  jams(channel: number, slot: number): boolean {
    return channel >= this.lo && channel <= this.hi && this.activeAt(slot);
  }

  channelRange(): [number, number] {
    return [this.lo, this.hi];
  }
}

/**
 * Another, independent piconet nearby. It hops on its own pattern (its own
 * master address + clock). `load` is the fraction of slots it transmits in.
 * SIMPLIFICATION: piconets are assumed slot-aligned.
 */
export class RivalPiconet implements Interferer {
  readonly kind = 'rival' as const;
  readonly label: string;
  readonly hop: HopGenerator;

  constructor(
    readonly id: string,
    masterAddress: number,
    clockOffset = 0,
    public load = 1,
  ) {
    this.hop = new HopGenerator(masterAddress, clockOffset);
    this.label = `Rival piconet ${id}`;
  }

  activeAt(slot: number): boolean {
    return this.load >= 1 || unit(hash2(this.hop.seed ^ 0x5bd1e995, slot)) < this.load;
  }

  /** Channel the rival uses in this slot (for drawing its packets). */
  channelAt(slot: number): number {
    return this.hop.channelAt(slot);
  }

  jams(channel: number, slot: number): boolean {
    return this.activeAt(slot) && this.hop.channelAt(slot) === channel;
  }

  channelRange(): [number, number] {
    return [0, NUM_CHANNELS - 1];
  }
}

// ── Co-located piconets: collision probability ──────────────────────────

/**
 * Theory: with n piconets hopping independently over 79 channels, the chance
 * that a given piconet's slot collides with at least one other is
 *
 *     P_collision(n) = 1 − (78/79)^(n − 1)
 */
export function collisionProbabilityAnalytic(n: number): number {
  return 1 - Math.pow((NUM_CHANNELS - 1) / NUM_CHANNELS, n - 1);
}

/** Monte-Carlo: fraction of slots in which piconet 0 shares a channel with any other piconet. */
export function simulateCollisionRate(n: number, slots: number, seed = 1): number {
  if (n < 2) return 0;
  const rng = new Rng(seed);
  const hops = Array.from({ length: n }, () => new HopGenerator(rng.bdAddr(), rng.int(2 ** 20)));
  let hits = 0;
  for (let s = 0; s < slots; s++) {
    const mine = hops[0]!.channelAt(s);
    for (let i = 1; i < n; i++) {
      if (hops[i]!.channelAt(s) === mine) {
        hits++;
        break;
      }
    }
  }
  return hits / slots;
}
