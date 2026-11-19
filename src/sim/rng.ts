/**
 * Deterministic random numbers.
 *
 * Every random choice in the engine goes through a seeded generator so that a
 * simulation run (or a unit test) is exactly reproducible.
 */

/** "lowbias32" integer hash (Chris Wellons) — good avalanche, cheap. */
export function hash32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash two 32-bit values into one (order matters). */
export function hash2(a: number, b: number): number {
  return hash32(hash32(a) ^ Math.imul((b >>> 0) + 0x632be5ab, 0x9e3779b9));
}

/** Map a 32-bit hash to [0, 1). */
export function unit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** Seeded PRNG (mulberry32). Fast and plenty good for simulation. */
export class Rng {
  private state: number;

  constructor(seed = 1) {
    this.state = hash32(seed) || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Random 48-bit Bluetooth device address (as a safe JS integer). */
  bdAddr(): number {
    return this.int(2 ** 24) * 2 ** 24 + this.int(2 ** 24);
  }
}
