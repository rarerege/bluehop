import { describe, expect, it } from 'vitest';
import { IDEAL_TIME_TO_7_S, scoreLevel1 } from '../game/level1/scoring';
import { amBits, formatBdAddr, pmHex } from '../game/level1/format';

describe('Level 1 scoring', () => {
  it('full marks: 7 slaves, correct park, scatternet, at the ideal time', () => {
    const s = scoreLevel1({ maxActive: 7, parkedCorrectly: true, scatternet: true, timeTo7S: IDEAL_TIME_TO_7_S });
    expect(s).toEqual({ slaves: 700, park: 150, bonus: 200, speed: 300, total: 1350, stars: 3 });
  });

  it('speed bonus shrinks by 40 per extra simulated second and never goes negative', () => {
    expect(scoreLevel1({ maxActive: 7, parkedCorrectly: false, scatternet: false, timeTo7S: IDEAL_TIME_TO_7_S + 2 }).speed).toBe(220);
    expect(scoreLevel1({ maxActive: 7, parkedCorrectly: false, scatternet: false, timeTo7S: 99 }).speed).toBe(0);
  });

  it('stars: 2 needs 7 active + correct park; 3 adds the scatternet', () => {
    expect(scoreLevel1({ maxActive: 7, parkedCorrectly: true, scatternet: false, timeTo7S: 8 }).stars).toBe(2);
    expect(scoreLevel1({ maxActive: 6, parkedCorrectly: true, scatternet: true, timeTo7S: null }).stars).toBe(1);
  });

  it('formats AM_ADDR as 3 bits and BD_ADDR as 6 hex octets', () => {
    expect(amBits(1)).toBe('001');
    expect(amBits(7)).toBe('111');
    expect(formatBdAddr(0x00a1b2c3d4e5)).toBe('00:A1:B2:C3:D4:E5');
    expect(pmHex(255)).toBe('FF');
  });
});
