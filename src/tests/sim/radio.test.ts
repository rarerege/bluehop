import { describe, expect, it } from 'vitest';
import { channelFreqMHz, HOPS_PER_SECOND, NUM_CHANNELS, SLOT_US } from '../../sim/constants';
import { HopGenerator } from '../../sim/hop';
import { LinkSimulator } from '../../sim/link';

describe('RF channels', () => {
  it('k = 0 → 2402 MHz and k = 78 → 2480 MHz, 1 MHz apart', () => {
    expect(NUM_CHANNELS).toBe(79);
    expect(channelFreqMHz(0)).toBe(2402);
    expect(channelFreqMHz(78)).toBe(2480);
    expect(channelFreqMHz(40) - channelFreqMHz(39)).toBe(1);
  });

  it('rejects channels outside 0..78', () => {
    expect(() => channelFreqMHz(79)).toThrow();
    expect(() => channelFreqMHz(-1)).toThrow();
  });
});

describe('slot timing', () => {
  it('slot = 625 µs and 1600 slots = 1 s', () => {
    expect(SLOT_US).toBe(625);
    expect(HOPS_PER_SECOND * SLOT_US).toBe(1_000_000);
  });

  it('the simulator clock reads 1 s after 1600 slots', () => {
    const sim = new LinkSimulator({ masterAddress: 0x0123456789ab, aclType: 'DH1', returnType: 'DH1', ber: 0 });
    sim.runQuiet(1600);
    expect(sim.slot).toBe(1600);
    expect(sim.timeUs).toBe(1_000_000);
  });
});

describe('hop generator', () => {
  const addr = 0x00a1b2c3d4e5;

  it('is deterministic for the same master address and clock', () => {
    const a = new HopGenerator(addr, 1000);
    const b = new HopGenerator(addr, 1000);
    for (let s = 0; s < 500; s++) expect(a.channelAt(s)).toBe(b.channelAt(s));
  });

  it('clock is the phase: offset by 10 slots = same sequence shifted by 10', () => {
    const a = new HopGenerator(addr, 0);
    const b = new HopGenerator(addr, 10);
    for (let s = 0; s < 200; s++) expect(b.channelAt(s)).toBe(a.channelAt(s + 10));
  });

  it('different masters give different sequences', () => {
    const a = new HopGenerator(addr);
    const b = new HopGenerator(addr + 1);
    let same = 0;
    for (let s = 0; s < 1000; s++) if (a.channelAt(s) === b.channelAt(s)) same++;
    expect(same).toBeLessThan(40); // ≈ 1000/79 ≈ 13 by chance
  });

  it('visits all 79 channels roughly uniformly', () => {
    const h = new HopGenerator(addr);
    const counts = new Array(79).fill(0);
    const N = 79_000;
    for (let s = 0; s < N; s++) counts[h.channelAt(s)]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(800); // expected 1000 each
      expect(c).toBeLessThan(1200);
    }
  });
});

describe('multi-slot hop rule', () => {
  it('after a 3-slot packet on hop index i, the next packet uses hop index i + 3', () => {
    expect(HopGenerator.nextHopIndex(10, 3)).toBe(13);
    expect(HopGenerator.nextHopIndex(10, 5)).toBe(15);
  });

  it('in the simulator, a 3-slot packet stays on f(i) and the reply is on f(i + 3)', () => {
    const sim = new LinkSimulator({ masterAddress: addrOf(7), aclType: 'DH3', returnType: 'DH1', ber: 0 });
    const tx = sim.run(400);
    for (let i = 0; i < tx.length; i++) {
      const t = tx[i]!;
      // Every packet is on the hop for its own start slot …
      expect(t.channel).toBe(sim.hop.channelAt(t.slot));
      // … and the following packet starts exactly `slots` later.
      const next = tx[i + 1];
      if (next) expect(next.slot).toBe(t.slot + t.slots);
    }
    const three = tx.find((t) => t.slots === 3)!;
    expect(three).toBeDefined();
  });

  it('master transmits only in even slots, slaves reply in odd slots (TDD)', () => {
    const sim = new LinkSimulator({ masterAddress: addrOf(3), aclType: 'DH5', returnType: 'DH3', ber: 0 });
    for (const t of sim.run(2000)) {
      expect(t.slot % 2).toBe(t.from === 'master' ? 0 : 1);
    }
  });
});

function addrOf(n: number): number {
  return 0x001122330000 + n;
}
