import { describe, expect, it } from 'vitest';
import { BINS, CARDS, isHost, LAYERS, MESSAGES, QUIZ, scoreStack, segment, tryPlace, type LayerId } from '../game/stack/model';

describe('Stack Builder cards', () => {
  it('every tower stands on Radio + Baseband', () => {
    for (const c of CARDS) expect(c.stack.slice(0, 2)).toEqual(['radio', 'baseband']);
  });

  it('voice skips L2CAP (SCO); every data app goes through L2CAP (ACL)', () => {
    for (const c of CARDS) {
      if (c.link === 'SCO') expect(c.stack).not.toContain('l2cap');
      else expect(c.stack[2]).toBe('l2cap');
    }
    expect(CARDS.find((c) => c.id === 'headset')!.link).toBe('SCO');
  });

  it('matches the slide stack: OBEX on RFCOMM, SDP and TCS on L2CAP, PPP on RFCOMM, BNEP on L2CAP', () => {
    const above = (id: string, a: LayerId) => {
      const s = CARDS.find((c) => c.id === id)!.stack;
      return s[s.indexOf(a) - 1];
    };
    expect(above('vcard', 'obex')).toBe('rfcomm');
    expect(above('printer', 'sdp')).toBe('l2cap');
    expect(above('cordless', 'tcs')).toBe('l2cap');
    expect(above('dialup', 'ppp')).toBe('rfcomm');
    expect(above('pan', 'bnep')).toBe('l2cap');
  });

  it('every tray offers all missing layers plus at least one distractor, no duplicates', () => {
    for (const c of CARDS) {
      const missing = c.stack.slice(c.prePlaced);
      for (const l of missing) expect(c.tray).toContain(l);
      expect(c.tray.length).toBeGreaterThan(missing.length);
      expect(new Set(c.tray).size).toBe(c.tray.length);
    }
  });

  it('every distractor gets an explanation', () => {
    for (const c of CARDS) {
      for (const l of c.tray) {
        if (c.stack.includes(l)) continue;
        const r = tryPlace(c, c.prePlaced, l);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.hint.length).toBeGreaterThan(10);
      }
    }
  });

  it('placing the layers in order completes the tower; out of order is refused', () => {
    for (const c of CARDS) {
      let placed = c.prePlaced;
      const top = c.stack[c.stack.length - 1]!;
      if (c.stack.length - c.prePlaced > 1) expect(tryPlace(c, placed, top).ok).toBe(false);
      for (const l of c.stack.slice(c.prePlaced)) {
        const r = tryPlace(c, placed, l);
        expect(r.ok).toBe(true);
        placed++;
        if (r.ok) expect(r.done).toBe(placed === c.stack.length);
      }
    }
  });

  it('only Radio and Baseband are below the HCI line', () => {
    const controller = (Object.keys(LAYERS) as LayerId[]).filter((l) => !isHost(l));
    expect(controller.sort()).toEqual(['baseband', 'radio']);
  });
});

describe('L2CAP post office', () => {
  it('signalling is CID 1 and connectionless is CID 2; every message has a bin', () => {
    expect(BINS[0]!.cid).toBe(1);
    expect(BINS[1]!.cid).toBe(2);
    for (const m of MESSAGES) expect(BINS.some((b) => b.cid === m.cid)).toBe(true);
  });

  it('segmentation: a 2,000-byte photo (+4-byte header) needs 6 DH5 packets', () => {
    const s = segment(2000);
    expect(s).toEqual([339, 339, 339, 339, 339, 309]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(2004);
    expect(() => segment(70_000)).toThrow();
  });

  it('quiz answers are consistent with the maths', () => {
    expect(QUIZ[0]!.options[QUIZ[0]!.answer]).toBe(String(segment(2000).length));
    expect(QUIZ[1]!.options[QUIZ[1]!.answer]).toBe('64 kB');
  });
});

describe('Stack Builder scoring', () => {
  it('perfect run = 3 stars and the Master Builder flag', () => {
    const s = scoreStack({ buildMistakes: 0, sortCorrect: MESSAGES.length, quizCorrect: QUIZ.length });
    expect(s.stars).toBe(3);
    expect(s.perfectBuild).toBe(true);
    expect(s.score).toBe(CARDS.length * 100 + MESSAGES.length * 50 + QUIZ.length * 100);
  });

  it('more mistakes, fewer stars', () => {
    expect(scoreStack({ buildMistakes: 4, sortCorrect: MESSAGES.length, quizCorrect: QUIZ.length }).stars).toBe(2);
    expect(scoreStack({ buildMistakes: 8, sortCorrect: 2, quizCorrect: 0 }).stars).toBe(1);
  });
});
