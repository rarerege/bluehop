import { describe, expect, it } from 'vitest';
import {
  bestGear,
  berAt,
  createLevel3Sim,
  forecast,
  LOOP_S,
  simulateTransfer,
  starsForTime,
  weatherAt,
} from '../game/level3/weather';
import { sanitizeName } from '../app/leaderboard';

describe('Level 3 weather', () => {
  it('each kind of weather has a different best gear', () => {
    expect(bestGear(1e-5)).toBe('DH5');
    expect(bestGear(5e-4)).toBe('DM5');
    expect(bestGear(1e-2)).toBe('DM3');
    expect(bestGear(2.5e-2)).toBe('DM1');
  });

  it('schedule loops every 16 s', () => {
    expect(LOOP_S).toBe(16);
    expect(weatherAt(0).kind).toBe('clear');
    expect(weatherAt(7).kind).toBe('storm');
    expect(weatherAt(16 + 7).kind).toBe('storm');
    expect(berAt(10)).toBe(2.5e-2);
  });

  it('forecast covers the horizon without gaps', () => {
    const f = forecast(2, 6);
    expect(f[0]!.from).toBe(2);
    expect(f[f.length - 1]!.to).toBe(8);
    for (let i = 1; i < f.length; i++) expect(f[i]!.from).toBeCloseTo(f[i - 1]!.to, 9);
  });

  it('balance: shifting gears beats sitting in DH5', () => {
    const optimal = simulateTransfer((t) => bestGear(berAt(t)));
    const dh5 = simulateTransfer(() => 'DH5');
    const dm5 = simulateTransfer(() => 'DM5');
    const late = simulateTransfer((t) => bestGear(berAt(Math.max(0, t - 0.6)))); // reacts 0.6 s late
    expect(optimal).toBeLessThan(dh5);
    expect(optimal).toBeLessThan(dm5);
    // Sensible shifting earns 3 stars; staying in one gear earns 1.
    expect(starsForTime(optimal)).toBe(3);
    expect(starsForTime(late)).toBe(3);
    expect(starsForTime(dh5)).toBe(1);
    expect(starsForTime(dm5)).toBe(1);
    // Nobody beats the physics: 8 Mbit at 723.2 kbit/s.
    expect(optimal).toBeGreaterThan(8e6 / 723_200);
  });

  it('DH5 on a clean channel runs at exactly the 723.2 kbit/s redline', () => {
    const sim = createLevel3Sim('DH5');
    sim.ber = 0;
    sim.runQuiet(480);
    expect(sim.goodputFwdBps()).toBeCloseTo(723_200, 6);
  });
});

describe('leaderboard names', () => {
  it('trims, strips control characters and caps at 16 characters', () => {
    expect(sanitizeName('  Ada\u0007 Lovelace the Great  ')).toBe('Ada Lovelace the');
    expect(sanitizeName('   ')).toBe('Anonymous');
  });
});
