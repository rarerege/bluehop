import { describe, expect, it } from 'vitest';
import { createLevel2World, LEVEL2_SLOTS, WIFI_START } from '../game/level2/script';
import type { Transmission } from '../sim/link';

/**
 * Balance checks for Level 2, run headless on the same engine the game uses.
 * A player who reacts with AFH ~40 slots after each interferer appears should
 * reach 3 stars; a player who ignores AFH should not.
 */

function play(react: boolean, delay = 40) {
  const { sim, afh } = createLevel2World(7);
  const blacklist = (lo: number, hi: number) => {
    for (let k = lo; k <= hi; k++) afh.blacklist(k);
  };
  const actions: [number, () => void][] = react
    ? [
        [WIFI_START + 120 + delay, () => blacklist(24, 46)], // Wi-Fi ch 6 (AFH unlocks at 320)
        [650 + delay, () => blacklist(48, 58)], // microwave
        [
          1250 + delay,
          () => {
            for (let k = 24; k <= 46; k++) afh.whitelist(k);
            blacklist(0, 21); // Wi-Fi moved to ch 1
          },
        ],
      ]
    : [];

  const txs: Transmission[] = [];
  while (sim.slot < LEVEL2_SLOTS) {
    while (actions.length && sim.slot >= actions[0]![0]) actions.shift()![1]();
    txs.push(...sim.next());
  }
  const acl = txs.filter((t) => t.link === 'acl');
  const sco = txs.filter((t) => t.link === 'sco');
  const wifi = acl.filter((t) => t.slot >= WIFI_START);
  const ratio = (xs: Transmission[]) => xs.filter((t) => t.outcome === 'ok').length / xs.length;
  return { delivery: ratio(acl), voice: ratio(sco), wifi: ratio(wifi) };
}

describe('Level 2 balance', () => {
  it('reacting with AFH earns 3 stars (≥ 95 % data and voice)', () => {
    const r = play(true);
    expect(r.delivery).toBeGreaterThanOrEqual(0.95);
    expect(r.voice).toBeGreaterThanOrEqual(0.95);
  });

  it('Ghost Hopper (> 95 % during the Wi-Fi attack) is reachable', () => {
    expect(play(true).wifi).toBeGreaterThan(0.95);
  });

  it('ignoring AFH does not', () => {
    const r = play(false);
    expect(r.delivery).toBeLessThan(0.9);
  });
});
