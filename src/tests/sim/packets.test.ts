import { describe, expect, it } from 'vitest';
import {
  maxRateBps,
  packetAirBits,
  PACKETS,
  payloadAirBits,
  rateTable,
  SCO_TYPES,
  scoRateBps,
} from '../../sim/packets';
import { LinkSimulator } from '../../sim/link';
import { HEADER_BITS, MAX_PAYLOAD_BITS } from '../../sim/constants';

describe('packet format', () => {
  it('header = 18 info bits × 3 = 54 bits', () => {
    expect(HEADER_BITS).toBe(54);
  });

  it('payload sizes on air match the spec (DH5 2744, DM5 2745 = max, HV 240)', () => {
    expect(payloadAirBits(PACKETS.DH5)).toBe(2744);
    expect(payloadAirBits(PACKETS.DM5)).toBe(MAX_PAYLOAD_BITS);
    expect(payloadAirBits(PACKETS.DH1)).toBe(240);
    expect(payloadAirBits(PACKETS.DM1)).toBe(240);
    for (const t of SCO_TYPES) expect(payloadAirBits(PACKETS[t])).toBe(240);
  });

  it('every packet fits in its slots (≤ slots × 625 µs at 1 bit/µs)', () => {
    for (const p of Object.values(PACKETS)) expect(packetAirBits(p)).toBeLessThanOrEqual(p.slots * 625);
  });
});

describe('maximum data rates', () => {
  it('DH5 forward + DH1 return: 723.2 / 57.6 kbit/s', () => {
    expect(maxRateBps('DH5', 'DH1')).toBeCloseTo(723_200, 6);
    expect(maxRateBps('DH1', 'DH5')).toBeCloseTo(57_600, 6);
  });

  it('DH5 both directions: 433.9 kbit/s', () => {
    expect(maxRateBps('DH5', 'DH5') / 1000).toBeCloseTo(433.9, 1);
    expect(Math.abs(maxRateBps('DH5', 'DH5') / 1000 - 433.9)).toBeLessThanOrEqual(0.1);
  });

  it('textbook table values', () => {
    const t = Object.fromEntries(rateTable().map((r) => [r.type, r]));
    expect(t.DM1!.symmetricKbps).toBeCloseTo(108.8, 1);
    expect(t.DH1!.symmetricKbps).toBeCloseTo(172.8, 1);
    expect(t.DM3!.symmetricKbps).toBeCloseTo(258.1, 1);
    expect(t.DH3!.symmetricKbps).toBeCloseTo(390.4, 1);
    expect(t.DM5!.symmetricKbps).toBeCloseTo(286.7, 1);
    // 224·8 / (6·625 µs) = 477.87 kbit/s; textbooks truncate it to 477.8.
    expect(Math.abs(t.DM5!.asymForwardKbps - 477.8)).toBeLessThan(0.1);
    expect(t.DM5!.asymReturnKbps).toBeCloseTo(36.3, 1);
    expect(t.DH3!.asymForwardKbps).toBeCloseTo(585.6, 1);
    expect(t.DH3!.asymReturnKbps).toBeCloseTo(86.4, 1);
  });

  it('the simulator reproduces 723.2 / 57.6 kbit/s exactly on an error-free channel', () => {
    const sim = new LinkSimulator({ masterAddress: 0x0a0b0c0d0e0f, aclType: 'DH5', returnType: 'DH1', ber: 0 });
    sim.runQuiet(1600 * 6); // 6 s
    expect(sim.goodputFwdBps()).toBeCloseTo(723_200, 6);
    expect(sim.goodputRevBps()).toBeCloseTo(57_600, 6);
    expect(sim.stats.aclRetransmissions).toBe(0);
  });

  it('the simulator reproduces 433.9 kbit/s for DH5 both ways', () => {
    const sim = new LinkSimulator({ masterAddress: 0x0a0b0c0d0e0f, aclType: 'DH5', returnType: 'DH5', ber: 0 });
    sim.runQuiet(16_000);
    expect(Math.abs(sim.goodputFwdBps() / 1000 - 433.9)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(sim.goodputRevBps() / 1000 - 433.9)).toBeLessThanOrEqual(0.1);
  });
});

describe('SCO voice', () => {
  it('HV1, HV2 and HV3 all carry exactly 64 kbit/s', () => {
    for (const t of SCO_TYPES) expect(scoRateBps(t)).toBeCloseTo(64_000, 6);
  });

  it('ACL packets never overlap reserved SCO slots and are shortened to fit', () => {
    const sim = new LinkSimulator({ masterAddress: 42, aclType: 'DH5', returnType: 'DH1', sco: 'HV3', ber: 0 });
    const tx = sim.run(6000);
    const sco = new Set<number>();
    for (const t of tx) if (t.link === 'sco') sco.add(t.slot);
    for (const t of tx) {
      if (t.link === 'sco') continue;
      for (let s = t.slot; s < t.slot + t.slots; s++) expect(sco.has(s)).toBe(false);
    }
    // With HV3 only 4 slots are free between voice pairs → DH5 is shrunk to DH3.
    expect(tx.some((t) => t.type === 'DH5')).toBe(false);
    expect(tx.some((t) => t.type === 'DH3')).toBe(true);
    expect(sim.voiceQuality()).toBe(1);
  });

  it('HV1 uses every slot pair: no room left for ACL', () => {
    const sim = new LinkSimulator({ masterAddress: 42, aclType: 'DH1', returnType: 'DH1', sco: 'HV1', ber: 0 });
    const tx = sim.run(1000);
    expect(tx.every((t) => t.link === 'sco')).toBe(true);
  });
});
