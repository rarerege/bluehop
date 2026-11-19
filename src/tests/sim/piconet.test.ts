import { describe, expect, it } from 'vitest';
import { Piconet, Scatternet } from '../../sim/piconet';
import { sampleSetupTimeS, setupTimeCdf } from '../../sim/setup';
import { Rng } from '../../sim/rng';

function fullPiconet(n = 8): Piconet {
  const p = new Piconet('A', 0x0000aabbccdd);
  for (let i = 1; i <= n; i++) p.addDevice(`d${i}`, `Device ${i}`, 0x100000 + i);
  return p;
}

describe('piconet membership', () => {
  it('accepts up to 7 active slaves with unique AM_ADDRs 1–7', () => {
    const p = fullPiconet();
    const addrs: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const r = p.connect(`d${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) addrs.push(r.amAddr);
    }
    expect(new Set(addrs).size).toBe(7);
    expect([...addrs].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.active()).toHaveLength(7);
  });

  it('cannot exceed 7 active slaves: the 8th request needs a park first', () => {
    const p = fullPiconet();
    for (let i = 1; i <= 7; i++) p.connect(`d${i}`);
    expect(p.connect('d8')).toEqual({ ok: false, reason: 'piconet-full' });
    expect(p.active()).toHaveLength(7);

    const parked = p.park('d3');
    expect(parked).toEqual({ ok: true, pmAddr: 1 });
    expect(p.get('d3')!.amAddr).toBeNull();

    const r = p.connect('d8');
    expect(r).toEqual({ ok: true, amAddr: 3 }); // reuses the freed AM_ADDR
    expect(p.active()).toHaveLength(7);
  });

  it('unpark fails while 7 are active, works once a slot frees up', () => {
    const p = fullPiconet();
    for (let i = 1; i <= 7; i++) p.connect(`d${i}`);
    p.park('d1');
    p.connect('d8');
    expect(p.unpark('d1')).toEqual({ ok: false, reason: 'piconet-full' });
    p.park('d2');
    expect(p.unpark('d1').ok).toBe(true);
    expect(p.parked().map((d) => d.id)).toEqual(['d2']);
  });

  it('parked devices get unique PM_ADDRs (8-bit, up to 255)', () => {
    const p = new Piconet('B', 1);
    for (let i = 0; i < 260; i++) p.addDevice(`x${i}`, 'x', i);
    const pms = new Set<number>();
    let parkedOk = 0;
    for (let i = 0; i < 260; i++) {
      if (!p.connect(`x${i}`).ok) continue;
      const r = p.park(`x${i}`);
      if (r.ok) {
        parkedOk++;
        pms.add(r.pmAddr);
        expect(r.pmAddr).toBeGreaterThanOrEqual(1);
        expect(r.pmAddr).toBeLessThanOrEqual(255);
      }
    }
    expect(parkedOk).toBe(255);
    expect(pms.size).toBe(255);
  });

  it('sniff and hold keep the AM_ADDR', () => {
    const p = fullPiconet(1);
    p.connect('d1');
    p.setLowPower('d1', 'sniff');
    expect(p.get('d1')!.amAddr).toBe(1);
    expect(p.active()).toHaveLength(1);
  });
});

describe('scatternet', () => {
  it('a bridge alternates between the two piconets and follows each hop pattern', () => {
    const net = new Scatternet();
    const a = new Piconet('A', 111);
    const b = new Piconet('B', 222);
    net.add(a);
    net.add(b);
    const bridge = { deviceId: 'phone', piconets: ['A', 'B'] as [string, string], role: 'slave-slave' as const, dwellSlots: 4 };
    expect(net.addBridge(bridge)).toEqual({ ok: true });
    expect(net.bridgePresence(bridge, 0)).toBe('A');
    expect(net.bridgePresence(bridge, 4)).toBe('B');
    expect(net.bridgeChannel(bridge, 5)).toBe(b.hop.channelAt(5));
    expect(net.bridgeChannel(bridge, 9)).toBe(a.hop.channelAt(9));
  });

  it('rejects linking a piconet to itself', () => {
    const net = new Scatternet();
    net.add(new Piconet('A', 1));
    expect(net.addBridge({ deviceId: 'x', piconets: ['A', 'A'], role: 'slave-slave', dwellSlots: 2 }).ok).toBe(false);
  });
});

describe('connection setup time model', () => {
  it('mean ≈ 0.64 s and never above 2.56 s', () => {
    const rng = new Rng(2024);
    let sum = 0;
    let max = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const t = sampleSetupTimeS(rng);
      sum += t;
      max = Math.max(max, t);
      expect(t).toBeGreaterThanOrEqual(0);
    }
    expect(sum / N).toBeCloseTo(0.64, 2);
    expect(max).toBeLessThanOrEqual(2.56);
    expect(max).toBeGreaterThan(2.2);
    expect(setupTimeCdf(2.56)).toBe(1);
  });
});
