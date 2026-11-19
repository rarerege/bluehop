import { describe, expect, it } from 'vitest';
import {
  analyticSetupBin,
  analyticThroughputKbps,
  analyticWifiLossPct,
  logSpace,
  setupHistogram,
  simulatedCollisionPct,
  simulatedThroughputKbps,
  simulatedWifiLossPct,
  wifiBand,
} from '../../sim/experiments';
import { toCsv } from '../../lab/csv';

describe('CSV export', () => {
  it('quotes cells with commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y'], ['say "hi"', 2.5]])).toBe('a,b\r\n1,"x,y"\r\n"say ""hi""",2.5\r\n');
  });
});

describe('Lab experiments', () => {
  it('logSpace spans 1e-5 … 1e-2', () => {
    const xs = logSpace(1e-5, 1e-2, 4);
    expect(xs[0]).toBeCloseTo(1e-5, 12);
    expect(xs[3]).toBeCloseTo(1e-2, 12);
    expect(xs[1]).toBeCloseTo(1e-4, 12);
  });

  it('throughput: simulated points sit on the analytic curve', () => {
    for (const [t, ber] of [
      ['DH5', 1e-5],
      ['DM3', 1e-3],
    ] as const) {
      const sim = simulatedThroughputKbps(t, ber, 200_000, 3);
      const th = analyticThroughputKbps(t, ber);
      expect(Math.abs(sim - th) / th).toBeLessThan(0.04);
    }
    expect(analyticThroughputKbps('DH5', 0)).toBeCloseTo(723.2, 6);
  });

  it('collisions: simulated ≈ analytic for 2 piconets', () => {
    expect(simulatedCollisionPct(2, 100_000, 1)).toBeCloseTo(100 / 79, 0);
  });

  it('Wi-Fi: loss ≈ (23/79) × duty without AFH, ≈ 0 with AFH', () => {
    const [lo, hi] = wifiBand();
    expect(hi - lo + 1).toBe(23);
    const off = simulatedWifiLossPct(1, false, 40_000, 5);
    expect(Math.abs(off - analyticWifiLossPct(1, false))).toBeLessThan(3);
    const half = simulatedWifiLossPct(0.5, false, 40_000, 5);
    expect(Math.abs(half - analyticWifiLossPct(0.5, false))).toBeLessThan(3);
    expect(simulatedWifiLossPct(1, true, 40_000, 5)).toBe(0);
  });

  it('setup histogram: counts add up, mean ≈ 0.64 s, max ≤ 2.56 s, matches theory', () => {
    const h = setupHistogram(50_000, 9);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(50_000);
    expect(h.mean).toBeCloseTo(0.64, 1);
    expect(h.max).toBeLessThanOrEqual(2.56);
    const theoryFirst = analyticSetupBin(0, h.binWidth, h.n);
    expect(Math.abs(h.counts[0]! - theoryFirst) / theoryFirst).toBeLessThan(0.05);
  });
});
