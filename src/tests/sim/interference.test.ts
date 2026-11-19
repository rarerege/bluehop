import { describe, expect, it } from 'vitest';
import { AfhChannelMap } from '../../sim/afh';
import { HopGenerator } from '../../sim/hop';
import {
  collisionProbabilityAnalytic,
  MicrowaveInterferer,
  RivalPiconet,
  simulateCollisionRate,
  WifiInterferer,
} from '../../sim/interferers';
import { LinkSimulator } from '../../sim/link';

describe('co-located piconets', () => {
  it('analytic P = 1 − (78/79)^(n−1)', () => {
    expect(collisionProbabilityAnalytic(1)).toBe(0);
    expect(collisionProbabilityAnalytic(2)).toBeCloseTo(1 / 79, 12);
    expect(collisionProbabilityAnalytic(10)).toBeCloseTo(1 - (78 / 79) ** 9, 12);
  });

  it('2 piconets: simulated collision rate ≈ 1/79 over 100k slots', () => {
    const p = simulateCollisionRate(2, 100_000, 7);
    expect(Math.abs(p - 1 / 79)).toBeLessThan(0.0015);
  });

  it('more piconets follow the formula too', () => {
    for (const n of [5, 20]) {
      const p = simulateCollisionRate(n, 50_000, n);
      expect(Math.abs(p - collisionProbabilityAnalytic(n))).toBeLessThan(0.01);
    }
  });

  it('a rival piconet in the link simulator collides on ≈ 1/79 of packets', () => {
    const rival = new RivalPiconet('R', 0x777777777777, 12345);
    const sim = new LinkSimulator({ masterAddress: 0x123456789abc, aclType: 'DH1', returnType: 'DH1', ber: 0, interferers: [rival] });
    const tx = sim.run(200_000);
    const rate = sim.stats.rivalCollisions / tx.length;
    expect(Math.abs(rate - 1 / 79)).toBeLessThan(0.002);
  });
});

describe('Wi-Fi and microwave', () => {
  it('Wi-Fi channels 1 / 6 / 11 cover the right Bluetooth channels', () => {
    expect(new WifiInterferer('w1', 1).channelRange()).toEqual([0, 21]);
    expect(new WifiInterferer('w6', 6).channelRange()).toEqual([24, 46]);
    expect(new WifiInterferer('w11', 11).channelRange()).toEqual([49, 71]);
  });

  it('Wi-Fi duty cycle controls how often it is on', () => {
    const w = new WifiInterferer('w', 6, 0.3, 9);
    let on = 0;
    for (let s = 0; s < 80_000; s++) if (w.activeAt(s)) on++;
    expect(on / 80_000).toBeCloseTo(0.3, 1);
    expect(w.jams(30, 0) || !w.activeAt(0)).toBe(true);
    expect(w.jams(70, 0)).toBe(false);
  });

  it('microwave covers 2450–2460 MHz and is on half of each 20 ms mains cycle', () => {
    const m = new MicrowaveInterferer();
    expect(m.channelRange()).toEqual([48, 58]);
    expect(m.periodSlots).toBe(32);
    let on = 0;
    for (let s = 0; s < 3200; s++) if (m.activeAt(s)) on++;
    expect(on / 3200).toBe(0.5);
  });

  it('a busy Wi-Fi AP causes losses that AFH removes', () => {
    const wifi = new WifiInterferer('w', 6, 1);
    const base = { masterAddress: 0x00ab00cd00ef, aclType: 'DH1' as const, returnType: 'DH1' as const, ber: 0, interferers: [wifi], seed: 4 };
    const plain = new LinkSimulator(base);
    plain.runQuiet(40_000);
    const lossPlain = plain.stats.jammed / (plain.stats.aclSent || 1);
    expect(lossPlain).toBeGreaterThan(0.2); // ~23/79 of hops land in the Wi-Fi band

    const afh = new AfhChannelMap();
    for (let k = 24; k <= 46; k++) afh.blacklist(k);
    const adaptive = new LinkSimulator({ ...base, afh });
    adaptive.runQuiet(40_000);
    expect(adaptive.stats.jammed).toBe(0);
    expect(adaptive.goodputFwdBps()).toBeGreaterThan(plain.goodputFwdBps());
  });
});

describe('AFH (Bluetooth 1.2)', () => {
  it('never leaves fewer than 20 channels in use', () => {
    const afh = new AfhChannelMap();
    let added = 0;
    for (let k = 0; k < 79; k++) if (afh.blacklist(k)) added++;
    expect(added).toBe(59);
    expect(afh.usedCount()).toBe(20);
    expect(afh.blacklist(78)).toBe(false);
    expect(afh.canBlacklist(78)).toBe(false);
    afh.whitelist(0);
    expect(afh.usedCount()).toBe(21);
  });

  it('never hops onto a blacklisted channel', () => {
    const afh = new AfhChannelMap();
    afh.blacklistMany([...Array(60).keys()].map((i) => (i * 7) % 79)); // scattered, stops at 20 used
    expect(afh.usedCount()).toBe(20);
    const h = new HopGenerator(0x0badc0ffee00, 5, afh);
    const seen = new Set<number>();
    for (let s = 0; s < 100_000; s++) {
      const k = h.channelAt(s);
      expect(afh.isBlacklisted(k)).toBe(false);
      seen.add(k);
    }
    expect(seen.size).toBe(20); // all good channels still get used
  });

  it('hops that were already on good channels are unchanged', () => {
    const afh = new AfhChannelMap();
    afh.blacklist(10);
    const plain = new HopGenerator(555);
    const adaptive = new HopGenerator(555, 0, afh);
    for (let s = 0; s < 5000; s++) {
      const k = plain.channelAt(s);
      if (k !== 10) expect(adaptive.channelAt(s)).toBe(k);
    }
  });
});
