import { NUM_CHANNELS, SLOT_COUNTER_WRAP } from './constants';
import { hash2, hash32 } from './rng';
import type { AfhChannelMap } from './afh';

/**
 * SIMPLIFIED HOP GENERATOR.
 *
 * Real Bluetooth uses the "hop selection kernel": a chain of adders, XORs and a
 * permutation driven by 28 bits of the master's BD_ADDR (which pattern) and
 * the master's clock CLK (where in the pattern). We keep exactly those two
 * inputs but replace the kernel with a seeded hash:
 *
 *     channel(slot) = H(seed(BD_ADDR), clockOffset + slot) mod 79
 *
 * Properties that matter for the course are preserved:
 *  - every device that knows the master's address + clock computes the same
 *    sequence (that is how slaves stay in sync),
 *  - different masters → different, independent-looking sequences, so co-located
 *    piconets collide on ~1/79 of slots (FH-CDMA),
 *  - channels are visited uniformly over time,
 *  - the hop index advances every slot, even during multi-slot packets
 *    (a 3-slot packet on index i is followed by a packet on index i + 3).
 */
export class HopGenerator {
  /** 32-bit seed derived from the 48-bit master address. */
  readonly seed: number;

  constructor(
    /** Master's 48-bit BD_ADDR (pattern). */
    readonly masterAddress: number,
    /** Master clock value (in slots) at our slot 0 — the phase of the pattern. */
    readonly clockOffset = 0,
    /** Optional AFH channel map (Bluetooth 1.2). */
    public afh: AfhChannelMap | null = null,
  ) {
    const lo = masterAddress % 2 ** 32;
    const hi = Math.floor(masterAddress / 2 ** 32);
    this.seed = hash2(hash32(lo), hi);
  }

  /** Basic (non-adaptive) channel for a slot index: 0..78. */
  basicChannel(slot: number): number {
    const clk = (this.clockOffset + slot) % SLOT_COUNTER_WRAP;
    return hash2(this.seed, clk) % NUM_CHANNELS;
  }

  /**
   * Channel actually used in `slot`. With AFH enabled, a hop that lands on a
   * blacklisted channel is remapped onto the used-channel set.
   */
  channelAt(slot: number): number {
    const k = this.basicChannel(slot);
    if (!this.afh || this.afh.isUsed(k)) return k;
    // Remap with a second hash of the same inputs → spread evenly over good channels.
    const clk = (this.clockOffset + slot) % SLOT_COUNTER_WRAP;
    return this.afh.remap(hash2(this.seed ^ 0xafafafaf, clk));
  }

  /**
   * Channel for a packet that starts in `startSlot`. A multi-slot packet stays
   * on this frequency for all of its slots; the next packet uses
   * channelAt(startSlot + slots), i.e. the sequence continued as if every slot
   * had hopped.
   */
  packetChannel(startSlot: number): number {
    return this.channelAt(startSlot);
  }

  /** The next packet's hop index after a packet of `slots` slots at `startSlot`. */
  static nextHopIndex(startSlot: number, slots: number): number {
    return startSlot + slots;
  }
}
