import { describe, expect, it } from 'vitest';
import { hammingDecode, hammingEncode, rep3Decode, rep3Encode } from '../../sim/fec';
import { pFec23Block, pPacketOk, pPayload, pRep3Bit, pUncoded, samplePacket } from '../../sim/channel';
import { ACL_TYPES, PACKETS, SCO_TYPES } from '../../sim/packets';
import { analyticGoodputBps, LinkSimulator } from '../../sim/link';
import { Rng } from '../../sim/rng';

describe('error model', () => {
  it('BER = 0 → every packet type always succeeds', () => {
    const rng = new Rng(5);
    for (const t of [...ACL_TYPES, ...SCO_TYPES]) {
      expect(pPacketOk(PACKETS[t], 0)).toBe(1);
      for (let i = 0; i < 1000; i++) expect(samplePacket(PACKETS[t], 0, rng)).toBe('ok');
    }
  });

  it('uncoded success is (1 − BER)^n', () => {
    expect(pUncoded(240, 1e-3)).toBeCloseTo(Math.pow(0.999, 240), 12);
  });

  it('FEC lowers the payload error rate at the cost of capacity (DM vs DH)', () => {
    const ber = 1e-3;
    expect(pPayload(PACKETS.DM5, ber)).toBeGreaterThan(pPayload(PACKETS.DH5, ber));
    expect(pPayload(PACKETS.DM1, ber)).toBeGreaterThan(pPayload(PACKETS.DH1, ber));
  });

  it('closed forms: 1/3 rep = q³ + 3pq², (15,10) block = q¹⁵ + 15pq¹⁴', () => {
    const p = 0.01;
    const q = 1 - p;
    expect(pRep3Bit(p)).toBeCloseTo(q ** 3 + 3 * p * q ** 2, 12);
    expect(pFec23Block(p)).toBeCloseTo(q ** 15 + 15 * p * q ** 14, 12);
  });
});

describe('2/3 FEC: (15,10) shortened Hamming code', () => {
  it('corrects every single-bit error in every 15-bit block (exhaustive)', () => {
    for (let msg = 0; msg < 1024; msg++) {
      const cw = hammingEncode(msg);
      expect(hammingDecode(cw)).toEqual({ message: msg, status: 0 });
      for (let pos = 0; pos < 15; pos++) {
        const r = hammingDecode(cw ^ (1 << pos));
        expect(r.status).toBe(1);
        expect(r.message).toBe(msg);
      }
    }
  });

  it('detects (but cannot correct) every double-bit error', () => {
    for (const msg of [0, 1, 0x155, 0x2aa, 0x3ff]) {
      const cw = hammingEncode(msg);
      for (let i = 0; i < 15; i++)
        for (let j = i + 1; j < 15; j++) expect(hammingDecode(cw ^ (1 << i) ^ (1 << j)).status).toBe(2);
    }
  });
});

describe('1/3 FEC: repetition with majority vote', () => {
  it('corrects one error per triplet, fails on two', () => {
    const bits = [1, 0, 1, 1, 0];
    const coded = rep3Encode(bits);
    const oneErr = coded.map((b, i) => (i % 3 === 1 ? b ^ 1 : b));
    expect(rep3Decode(oneErr)).toEqual(bits);
    const twoErr = coded.map((b, i) => (i < 2 ? b ^ 1 : b));
    expect(rep3Decode(twoErr)[0]).toBe(bits[0]! ^ 1);
  });
});

describe('ARQ', () => {
  it('payload errors trigger retransmissions and each payload is delivered once', () => {
    const sim = new LinkSimulator({ masterAddress: 99, aclType: 'DH5', returnType: 'NULL', ber: 2e-4, seed: 3 });
    const tx = sim.run(40_000);
    expect(sim.stats.aclRetransmissions).toBeGreaterThan(0);
    // Delivered bits come in whole DH5 payloads and never exceed the error-free maximum.
    expect(sim.stats.deliveredFwdBits % (339 * 8)).toBe(0);
    const master = tx.filter((t) => t.from === 'master');
    const newPayloads = master.filter((t) => !t.retransmission).length;
    expect(sim.stats.deliveredFwdBits / (339 * 8)).toBeLessThanOrEqual(newPayloads);
  });

  it('simulated goodput converges to the analytic curve', () => {
    for (const [type, ber] of [
      ['DH5', 1e-4],
      ['DM3', 1e-3],
      ['DH1', 3e-3],
    ] as const) {
      const sim = new LinkSimulator({ masterAddress: 1234, aclType: type, returnType: 'NULL', ber, seed: 11 });
      sim.runQuiet(400_000);
      const theory = analyticGoodputBps(type, 'NULL', ber);
      expect(Math.abs(sim.goodputFwdBps() - theory) / theory).toBeLessThan(0.03);
    }
  });
});
