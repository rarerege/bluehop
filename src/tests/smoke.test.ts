import { describe, expect, it } from 'vitest';
import { parentPath, parseHash } from '../app/router';
import { clampSpeedIndex, DEFAULT_SPEED_INDEX, SLOT_US, SPEED_STEPS, simMicrosPerWallMs } from '../app/speed';

/*
 * Phase 1 smoke tests: routing and the speed slider maths.
 * The Bluetooth engine tests (src/sim) are added in Phase 2.
 */

describe('router', () => {
  it('maps empty and unknown hashes to the menu', () => {
    expect(parseHash('').name).toBe('menu');
    expect(parseHash('#/').name).toBe('menu');
    expect(parseHash('#/nope').name).toBe('menu');
  });

  it('parses level numbers 1–3 only', () => {
    expect(parseHash('#/level/2')).toMatchObject({ name: 'level', params: { n: '2' } });
    expect(parseHash('#/level/9').name).toBe('menu');
  });

  it('tolerates trailing slashes', () => {
    expect(parseHash('#/lab/').name).toBe('lab');
  });

  it('sends Back from a level to Level Select, and from elsewhere to the menu', () => {
    expect(parentPath(parseHash('#/level/1'))).toBe('/levels');
    expect(parentPath(parseHash('#/lab'))).toBe('/menu');
    expect(parentPath(parseHash('#/menu'))).toBeNull();
  });
});

describe('simulation speed', () => {
  it('uses 625 µs slots (1600 slots = 1 s)', () => {
    expect(SLOT_US).toBe(625);
    expect(SLOT_US * 1600).toBe(1_000_000);
  });

  it('real-time step advances 1000 µs of sim time per wall-clock ms', () => {
    const last = SPEED_STEPS.length - 1;
    expect(simMicrosPerWallMs(last)).toBeCloseTo(1000, 9);
  });

  it('"1 hop / 0.25 s" shows one 625 µs slot per 250 ms', () => {
    const i = SPEED_STEPS.findIndex((s) => s.hopsPerSecond === 4);
    expect(simMicrosPerWallMs(i) * 250).toBeCloseTo(SLOT_US, 9);
  });

  it('clamps out-of-range indices', () => {
    expect(clampSpeedIndex(-3)).toBe(0);
    expect(clampSpeedIndex(99)).toBe(SPEED_STEPS.length - 1);
    expect(clampSpeedIndex(Number.NaN)).toBe(DEFAULT_SPEED_INDEX);
  });
});
