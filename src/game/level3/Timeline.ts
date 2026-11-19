import { Container, Graphics, Text } from 'pixi.js';
import type { Transmission } from '../../sim/link';

/**
 * Slot timeline: the last N slots of the link, one box per 625 µs slot.
 * A DH5 shows as one 5-slot block on a single frequency followed by the
 * headset's 1-slot NULL (ACK) — so the 5 + 1 = 6-slot rhythm behind
 * 723.2 kbit/s is visible.
 */

const COLORS = { master: 0x00e5ff, slave: 0xff2bd6, bad: 0xff3b5c, grid: 0x93a6c9, white: 0xffffff };

export class Timeline {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly texts = new Container();
  private pool: Text[] = [];
  private used = 0;
  private x = 0;
  private y = 0;
  private w = 300;
  private h = 80;

  constructor(readonly slots = 24) {
    this.root.addChild(this.g, this.texts);
  }

  layout(x: number, y: number, w: number, h: number): void {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  private text(s: string, x: number, y: number, color: number, size: number, anchorX = 0.5): void {
    let t = this.pool[this.used];
    if (!t) {
      t = new Text({ text: '', style: { fontFamily: 'Consolas, monospace', fontSize: size, fill: color, fontWeight: '700' } });
      this.pool.push(t);
      this.texts.addChild(t);
    }
    this.used++;
    t.visible = true;
    t.text = s;
    t.style.fill = color;
    t.style.fontSize = size;
    t.anchor.set(anchorX, 0.5);
    t.position.set(x, y);
  }

  /** endSlot: the slot just after the newest packet. */
  draw(history: readonly Transmission[], endSlot: number): void {
    const g = this.g;
    g.clear();
    this.used = 0;
    const N = this.slots;
    const start = endSlot - N;
    const sw = this.w / N;
    const top = this.y + 16;
    const bh = Math.max(24, this.h - 40);
    const small = sw < 26;
    const fs = small ? 9 : 11;

    g.roundRect(this.x - 6, this.y - 4, this.w + 12, this.h + 8, 10).fill({ color: 0x070a1c, alpha: 0.85 });
    this.text('SLOT TIMELINE · 1 slot = 625 µs · master even / headset odd', this.x, this.y + 4, COLORS.grid, small ? 9 : 11, 0);

    // Slot grid
    for (let i = 0; i <= N; i++) {
      const sx = this.x + i * sw;
      g.rect(sx, top, 1, bh).fill({ color: COLORS.grid, alpha: 0.18 });
      const slot = start + i;
      if (i < N && slot >= 0 && (slot % (small ? 4 : 2) === 0)) this.text(String(slot), sx + sw / 2, top + bh + 10, COLORS.grid, small ? 8 : 10);
    }

    for (const t of history) {
      const s0 = Math.max(t.slot, start);
      const s1 = Math.min(t.slot + t.slots, endSlot);
      if (s1 <= s0) continue;
      const x0 = this.x + (s0 - start) * sw + 1.5;
      const x1 = this.x + (s1 - start) * sw - 1.5;
      const color = t.from === 'master' ? COLORS.master : COLORS.slave;
      const failed = t.outcome !== 'ok';
      const isNull = t.type === 'NULL';
      const y0 = top + (isNull ? bh * 0.35 : 4);
      const hh = isNull ? bh * 0.4 : bh - 8;
      g.roundRect(x0, y0, Math.max(2, x1 - x0), hh, 4).fill({ color: failed ? COLORS.bad : color, alpha: failed ? 0.35 : isNull ? 0.55 : 0.85 });
      if (failed) g.roundRect(x0, y0, Math.max(2, x1 - x0), hh, 4).stroke({ width: 1.5, color: COLORS.bad });
      if (t.retransmission) g.roundRect(x0 - 1, y0 - 1, Math.max(2, x1 - x0) + 2, hh + 2, 4).stroke({ width: 1.5, color: COLORS.white });

      const wpx = x1 - x0;
      if (wpx > 28) {
        const label = failed ? (t.outcome === 'lost' ? `${t.type} LOST` : `${t.type} NAK`) : t.retransmission ? `${t.type} RETX` : t.type;
        this.text(label, (x0 + x1) / 2, y0 + hh / 2 - (wpx > 60 && !isNull ? 7 : 0), failed ? COLORS.white : 0x05060f, fs);
        if (wpx > 60 && !isNull) this.text(`${t.freqMHz} MHz`, (x0 + x1) / 2, y0 + hh / 2 + 8, failed ? COLORS.white : 0x05060f, fs - 1);
      }
    }

    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}
