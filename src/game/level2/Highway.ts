import { Container, Graphics, Text } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { BASE_FREQ_MHZ, NUM_CHANNELS } from '../../sim/constants';
import type { AfhChannelMap } from '../../sim/afh';
import type { Interferer } from '../../sim/interferers';
import type { Transmission } from '../../sim/link';
import { FloatLabels, ParticleFx } from '../fx';

/**
 * The "neon spectrum highway": a waterfall of the 2.4 GHz band.
 *   x = RF channel (79 lanes, 2402…2480 MHz)
 *   y = time; the NOW line is at the bottom and history scrolls upward.
 * Each slot is one row; a 3- or 5-slot packet is a taller block in one lane.
 *
 * Pure renderer: it only reads engine state passed in each frame.
 */

export const COLORS = {
  master: 0x00e5ff,
  slave: 0xff2bd6,
  voice: 0x3bffb0,
  rival: 0xff8a00,
  wifi: 0x8a4dff,
  microwave: 0xffc23b,
  bad: 0xff3b5c,
  lane: 0x00e5ff,
  white: 0xffffff,
};

export interface HighwayFrame {
  /** Current display time in slots (fractional). */
  displaySlot: number;
  /** How many slots of history fit on screen. */
  visibleSlots: number;
  txs: readonly Transmission[];
  interferers: readonly Interferer[];
  afh: AfhChannelMap | null;
  /** AFH power-up active: lanes are tappable. */
  afhArmed: boolean;
  /** Recent loss ratio per channel, 0..1 (channel assessment heat strip). */
  heat: readonly number[];
  hoverLane: number | null;
}

export class Highway {
  readonly root = new Container();
  private readonly bg = new Graphics();
  private readonly bands = new Graphics();
  private readonly glowLayer = new Container();
  private readonly packets = new Graphics();
  private readonly trail = new Graphics();
  private readonly overlay = new Graphics();
  private readonly labels = new Container();
  readonly particles = new ParticleFx(320);
  readonly floats = new FloatLabels(16);

  // Layout (screen px)
  x = 0;
  y = 0;
  w = 1;
  h = 1;
  private labelH = 24;

  constructor(small: boolean) {
    this.glowLayer.addChild(this.trail, this.packets);
    try {
      this.glowLayer.filters = [
        new AdvancedBloomFilter({ threshold: 0.2, bloomScale: 1.1, brightness: 1, blur: small ? 4 : 7, quality: small ? 3 : 5 }),
      ];
    } catch {
      /* bloom unsupported — still readable */
    }
    this.root.addChild(this.bg, this.bands, this.glowLayer, this.overlay, this.labels, this.particles.g, this.floats.root);
  }

  /** Place the highway in the rectangle (x, y, w, h); lane labels sit below it. */
  layout(x: number, y: number, w: number, h: number): void {
    this.labelH = w < 600 ? 20 : 26;
    this.x = x;
    this.y = y;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h - this.labelH);
    this.drawLabels();
  }

  get laneW(): number {
    return this.w / NUM_CHANNELS;
  }
  get nowY(): number {
    return this.y + this.h;
  }
  laneX(k: number): number {
    return this.x + k * this.laneW;
  }
  laneCenter(k: number): number {
    return this.laneX(k) + this.laneW / 2;
  }
  /** Lane under a screen x, or null when outside the highway. */
  laneAt(px: number, py: number): number | null {
    if (px < this.x || px >= this.x + this.w || py < this.y || py > this.nowY + this.labelH) return null;
    return Math.min(NUM_CHANNELS - 1, Math.floor((px - this.x) / this.laneW));
  }
  pxPerSlot(visibleSlots: number): number {
    return this.h / visibleSlots;
  }

  private drawLabels(): void {
    this.labels.removeChildren().forEach((c) => c.destroy());
    const size = this.w < 600 ? 9 : this.w < 1100 ? 11 : 13;
    const every = this.w < 420 ? 20 : 10;
    for (let k = 0; k < NUM_CHANNELS; k += every) this.addLabel(k, size);
    if ((NUM_CHANNELS - 1) % every !== 0 && this.w >= 420) this.addLabel(NUM_CHANNELS - 1, size);
  }

  private addLabel(k: number, size: number): void {
    const t = new Text({ text: String(BASE_FREQ_MHZ + k), style: { fontFamily: 'Consolas, monospace', fontSize: size, fill: 0x93a6c9 } });
    t.anchor.set(0.5, 0);
    t.position.set(this.laneCenter(k), this.nowY + 8);
    this.labels.addChild(t);
  }

  draw(f: HighwayFrame): void {
    const pps = this.pxPerSlot(f.visibleSlots);
    const D = f.displaySlot;
    const yOf = (slot: number) => this.nowY - (D - slot) * pps;
    const lw = this.laneW;
    const first = D - f.visibleSlots;

    // ── Background lanes, AFH blacklist, heat strip ───────────────────
    const bg = this.bg;
    bg.clear();
    bg.rect(this.x, this.y, this.w, this.h).fill({ color: 0x070a1c, alpha: 0.9 });
    for (let k = 0; k < NUM_CHANNELS; k++) {
      const lx = this.laneX(k);
      if (f.afh?.isBlacklisted(k)) {
        bg.rect(lx, this.y, lw, this.h).fill({ color: 0x5a0a1c, alpha: 0.75 });
      } else if (k % 2 === 0) {
        bg.rect(lx, this.y, lw, this.h).fill({ color: COLORS.lane, alpha: 0.025 });
      }
      if (k % 10 === 0) bg.rect(lx, this.y, 1, this.h).fill({ color: COLORS.lane, alpha: 0.12 });
      // Heat strip just above the labels (channel assessment).
      const heat = f.heat[k] ?? 0;
      if (heat > 0.02) bg.rect(lx, this.nowY + 1, lw, 5).fill({ color: COLORS.bad, alpha: Math.min(1, 0.25 + heat) });
      if (f.afh?.isBlacklisted(k)) bg.rect(lx, this.nowY + 1, lw, 5).fill({ color: 0x5a0a1c, alpha: 1 });
    }
    if (f.afhArmed && f.hoverLane !== null) {
      bg.rect(this.laneX(f.hoverLane), this.y, lw, this.h + 6).fill({ color: COLORS.white, alpha: 0.12 });
    }

    // ── Interferers ───────────────────────────────────────────────────
    const bands = this.bands;
    bands.clear();
    const s0 = Math.max(0, Math.floor(first));
    const s1 = Math.floor(D);
    for (const it of f.interferers) {
      if (it.kind === 'rival' && it.channelAt) {
        for (let s = s0; s <= s1; s++) {
          if (!it.activeAt(s)) continue;
          const top = yOf(s);
          const bot = Math.min(this.nowY, yOf(s + 1));
          if (bot <= top) continue;
          bands.roundRect(this.laneX(it.channelAt(s)) + 1, top + 1, Math.max(1, lw - 2), Math.max(1, bot - top - 2), 2).fill({ color: COLORS.rival, alpha: 0.85 });
        }
        continue;
      }
      const [lo, hi] = it.channelRange();
      const color = it.kind === 'wifi' ? COLORS.wifi : COLORS.microwave;
      const bx = this.laneX(lo);
      const bw = (hi - lo + 1) * lw;
      let runStart = -1;
      const flush = (end: number) => {
        if (runStart < 0) return;
        const top = Math.max(this.y, yOf(runStart));
        const bot = Math.min(this.nowY, yOf(end));
        if (bot > top) {
          const flicker = it.kind === 'microwave' ? 0.18 + Math.random() * 0.14 : 0.26;
          bands.rect(bx, top, bw, bot - top).fill({ color, alpha: flicker });
          bands.rect(bx, top, 2, bot - top).fill({ color, alpha: 0.8 });
          bands.rect(bx + bw - 2, top, 2, bot - top).fill({ color, alpha: 0.8 });
        }
        runStart = -1;
      };
      for (let s = s0; s <= s1; s++) {
        if (it.activeAt(s)) {
          if (runStart < 0) runStart = s;
        } else flush(s);
      }
      flush(D);
    }

    // ── Packets + hop trail ───────────────────────────────────────────
    const g = this.packets;
    g.clear();
    const tr = this.trail;
    tr.clear();
    let prev: { x: number; y: number } | null = null;
    let current: Transmission | null = null;

    for (const t of f.txs) {
      const end = t.slot + t.slots;
      if (end < first) continue;
      if (t.slot > D) break;
      const inFlight = D < end;
      if (inFlight) current = t;
      const top = Math.max(this.y, yOf(t.slot));
      const bot = Math.min(this.nowY, yOf(end));
      if (bot <= top) continue;
      const lx = this.laneX(t.channel);
      const color =
        t.link === 'sco' ? COLORS.voice : t.from === 'master' ? COLORS.master : COLORS.slave;
      const failed = !inFlight && t.outcome !== 'ok';
      const isControl = t.link === 'control';
      const pad = Math.min(2, pps * 0.12);
      const bx = lx + (isControl ? lw * 0.25 : 0.5);
      const bw = Math.max(1, isControl ? lw * 0.5 : lw - 1);
      const bh = Math.max(1, bot - top - pad);

      if (failed) {
        g.rect(bx, top, bw, bh).stroke({ width: 1, color: COLORS.bad, alpha: 0.9 });
        g.rect(bx, top, bw, bh).fill({ color: COLORS.bad, alpha: 0.18 });
      } else {
        g.roundRect(bx, top, bw, bh, Math.min(3, lw / 3)).fill({ color, alpha: isControl ? 0.55 : 0.95 });
        if (t.retransmission) g.roundRect(bx - 1, top - 1, bw + 2, bh + 2, 3).stroke({ width: 1.5, color: COLORS.white, alpha: 0.95 });
      }

      // Hop trail through master packets — shows hopping (and AFH re-routing).
      if (t.from === 'master') {
        const p = { x: lx + lw / 2, y: top };
        if (prev) tr.moveTo(prev.x, prev.y).lineTo(p.x, p.y).stroke({ width: 1.2, color: COLORS.master, alpha: 0.35 });
        prev = p;
      }
    }

    // ── NOW line and current channel ──────────────────────────────────
    const o = this.overlay;
    o.clear();
    o.rect(this.x, this.nowY - 1, this.w, 2).fill({ color: COLORS.master, alpha: 0.9 });
    if (current) {
      const cx = this.laneX(current.channel);
      const c = current.link === 'sco' ? COLORS.voice : current.from === 'master' ? COLORS.master : COLORS.slave;
      o.rect(cx - 1, this.nowY - 3, lw + 2, 9).fill({ color: c, alpha: 1 });
    }
  }

  /** Particle burst at a packet that just failed. */
  explode(t: Transmission, f: HighwayFrame, particles: number): void {
    const pps = this.pxPerSlot(f.visibleSlots);
    const x = this.laneCenter(t.channel);
    const y = this.nowY - (f.displaySlot - (t.slot + t.slots / 2)) * pps;
    const color = t.link === 'sco' ? COLORS.voice : t.from === 'master' ? COLORS.master : COLORS.slave;
    this.particles.burst(x, y, color, particles, 0.22);
    this.particles.burst(x, y, COLORS.bad, Math.ceil(particles / 2), 0.3);
  }

  label(t: Transmission, f: HighwayFrame, text: string, color: number): void {
    const pps = this.pxPerSlot(f.visibleSlots);
    const x = Math.min(this.x + this.w - 24, Math.max(this.x + 24, this.laneCenter(t.channel)));
    const y = this.nowY - (f.displaySlot - (t.slot + t.slots / 2)) * pps - 14;
    this.floats.spawn(text, x, y, color, this.w < 600 ? 11 : 14);
  }

  /** dy = how far the waterfall scrolled this frame, so effects ride along. */
  updateFx(dtMs: number, dy: number): void {
    this.particles.update(dtMs, -dy);
    this.floats.update(dtMs, -dy);
  }

  clearFx(): void {
    this.particles.clear();
    this.floats.clear();
  }
}
