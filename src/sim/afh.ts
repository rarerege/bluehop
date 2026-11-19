import { AFH_MIN_CHANNELS, NUM_CHANNELS } from './constants';

/**
 * Adaptive Frequency Hopping channel map — a LATER ENHANCEMENT (Bluetooth 1.2),
 * standardised for coexistence with Wi-Fi alongside IEEE 802.15.2.
 *
 * Channels can be marked "bad" (blacklisted). The hop generator still computes
 * the basic hop, but if it lands on a bad channel it is remapped onto the set
 * of used (good) channels. At least N_min = 20 channels must stay in use.
 * [CORE12]
 */
export class AfhChannelMap {
  private readonly bad = new Set<number>();
  /** Sorted list of used channels, rebuilt on change. */
  private usedList: number[] = Array.from({ length: NUM_CHANNELS }, (_, k) => k);

  isUsed(k: number): boolean {
    return !this.bad.has(k);
  }

  isBlacklisted(k: number): boolean {
    return this.bad.has(k);
  }

  usedCount(): number {
    return this.usedList.length;
  }

  used(): readonly number[] {
    return this.usedList;
  }

  blacklisted(): number[] {
    return [...this.bad].sort((a, b) => a - b);
  }

  /** Could channel k be blacklisted without dropping below 20 used channels? */
  canBlacklist(k: number): boolean {
    return this.isUsed(k) && this.usedList.length > AFH_MIN_CHANNELS;
  }

  /** Blacklist k. Refused (returns false) if it would leave fewer than 20 channels. */
  blacklist(k: number): boolean {
    if (k < 0 || k >= NUM_CHANNELS || !this.canBlacklist(k)) return false;
    this.bad.add(k);
    this.rebuild();
    return true;
  }

  whitelist(k: number): void {
    if (this.bad.delete(k)) this.rebuild();
  }

  /** Flip a channel; returns its new blacklisted state. */
  toggle(k: number): boolean {
    if (this.bad.has(k)) this.whitelist(k);
    else this.blacklist(k);
    return this.bad.has(k);
  }

  /** Blacklist a list of channels, stopping at the 20-channel floor. Returns how many were added. */
  blacklistMany(ks: Iterable<number>): number {
    let n = 0;
    for (const k of ks) if (this.blacklist(k)) n++;
    return n;
  }

  clear(): void {
    this.bad.clear();
    this.rebuild();
  }

  /** Map a 32-bit hash onto one of the used channels. */
  remap(hash: number): number {
    return this.usedList[(hash >>> 0) % this.usedList.length]!;
  }

  private rebuild(): void {
    this.usedList = [];
    for (let k = 0; k < NUM_CHANNELS; k++) if (!this.bad.has(k)) this.usedList.push(k);
  }
}

/**
 * Channel assessment helper: suggest channels whose observed loss rate exceeds
 * `threshold` (needs at least `minSamples` packets on the channel).
 */
export function suggestBlacklist(
  sent: readonly number[],
  lost: readonly number[],
  threshold = 0.3,
  minSamples = 3,
): number[] {
  const out: number[] = [];
  for (let k = 0; k < NUM_CHANNELS; k++) {
    const s = sent[k] ?? 0;
    if (s >= minSamples && (lost[k] ?? 0) / s > threshold) out.push(k);
  }
  return out;
}
