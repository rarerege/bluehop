import { Container, Graphics, Text } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import type { SettingsStore } from '../app/settings';

/**
 * Shared animated background for menu-type screens:
 *  - a starfield,
 *  - a time–frequency "hop trail" (the classic FHSS diagram): x = time,
 *    y = RF channel 0..78 (2402..2480 MHz). Each hop is a short glowing block on
 *    one channel, and the trail jumps to a new channel every slot. Occasionally
 *    the trail dwells for 3 or 5 slots — a nod to multi-slot packets staying on
 *    one frequency. A dim second trail is a rival piconet with its own pattern.
 *  - a synthwave perspective grid floor.
 *
 * This is decoration only; the real hop generator lives in src/sim (Phase 2).
 */

export type BackdropMode = 'full' | 'dim' | 'none';

const CHANNELS = 79;
const COLORS = {
  cyan: 0x00e5ff,
  magenta: 0xff2bd6,
  violet: 0x7a2bff,
  white: 0xffffff,
  label: 0x93a6c9,
};

/** Small deterministic PRNG (mulberry32) for the decorative trails. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Hop {
  channel: number;
  /** Wall-clock ms when this hop started. */
  t: number;
  /** Number of slots it occupies (1, 3 or 5). */
  slots: number;
}

class HopTrail {
  readonly hops: Hop[] = [];
  private readonly rand: () => number;
  private nextAt = 0;

  constructor(
    seed: number,
    readonly color: number,
    readonly slotMs: number,
    readonly alpha: number,
  ) {
    this.rand = mulberry32(seed);
  }

  /** Advance to time `now`; returns the newly started hop, if any. */
  tick(now: number): Hop | null {
    if (now < this.nextAt) return null;
    const r = this.rand();
    const slots = r < 0.08 ? 5 : r < 0.2 ? 3 : 1;
    const hop: Hop = { channel: Math.floor(this.rand() * CHANNELS), t: now, slots };
    this.hops.push(hop);
    this.nextAt = now + slots * this.slotMs;
    if (this.hops.length > 120) this.hops.shift();
    return hop;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
}

const MAX_PARTICLES = 160;

export class Backdrop {
  readonly root = new Container();
  private readonly stars = new Graphics();
  private readonly lanes = new Graphics();
  private readonly labels = new Container();
  private readonly trailLayer = new Container();
  private readonly trailG = new Graphics();
  private readonly particlesG = new Graphics();
  private readonly floor = new Graphics();

  private w = 1;
  private h = 1;
  private now = 0;
  private floorPhase = 0;
  private mode: BackdropMode = 'full';
  private targetAlpha = 1;
  private particles: Particle[] = [];
  private starField: { x: number; y: number; r: number; p: number }[] = [];

  private readonly master = new HopTrail(0x9e3779b9, COLORS.cyan, 190, 1);
  private readonly rival = new HopTrail(0x1234567, COLORS.magenta, 190, 0.35);

  constructor(private readonly settings: SettingsStore) {
    this.trailLayer.addChild(this.trailG, this.particlesG);
    try {
      // Bloom only on the trail layer keeps the cost low on phones.
      this.trailLayer.filters = [new AdvancedBloomFilter({ threshold: 0.15, bloomScale: 1.3, brightness: 1.1, blur: 6, quality: 5 })];
    } catch {
      /* filter unsupported: plain lines still look fine */
    }
    this.root.addChild(this.stars, this.lanes, this.labels, this.floor, this.trailLayer);
    const rand = mulberry32(42);
    for (let i = 0; i < 90; i++) this.starField.push({ x: rand(), y: rand(), r: 0.5 + rand() * 1.3, p: rand() * Math.PI * 2 });
  }

  setMode(mode: BackdropMode): void {
    this.mode = mode;
    this.targetAlpha = mode === 'full' ? 1 : mode === 'dim' ? 0.35 : 0;
    if (mode !== 'none') this.root.visible = true;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawLanes();
  }

  // Layout helpers ---------------------------------------------------------
  private get bandTop() {
    return this.h * 0.09;
  }
  private get horizon() {
    return this.h * 0.66;
  }
  private laneY(ch: number): number {
    const top = this.bandTop;
    const bottom = this.horizon - this.h * 0.04;
    // Channel 78 (2480 MHz) at the top, channel 0 (2402 MHz) at the bottom.
    return bottom - ((ch + 0.5) / CHANNELS) * (bottom - top);
  }
  private get laneH(): number {
    return ((this.horizon - this.h * 0.04 - this.bandTop) / CHANNELS) * 1.4;
  }
  /** px per wall-clock ms: the visible trail spans ~7 s. */
  private get pxPerMs(): number {
    return (this.w * 0.86) / 7000;
  }
  private get headX(): number {
    return this.w * 0.86;
  }

  /** Static: faint lane grid and MHz labels every 10 channels. */
  private drawLanes(): void {
    const g = this.lanes;
    g.clear();
    this.labels.removeChildren().forEach((c) => c.destroy());
    const small = this.w < 640;
    for (let ch = 0; ch < CHANNELS; ch += 1) {
      const major = ch % 10 === 0 || ch === CHANNELS - 1;
      if (!major && small) continue;
      const y = this.laneY(ch);
      g.moveTo(0, y).lineTo(this.w, y).stroke({ width: 1, color: COLORS.cyan, alpha: major ? 0.09 : 0.025 });
      if (major) {
        const t = new Text({
          text: `${2402 + ch} MHz`,
          style: { fontFamily: 'Consolas, monospace', fontSize: small ? 10 : 12, fill: COLORS.label },
        });
        t.alpha = 0.55;
        t.position.set(8, y - (small ? 12 : 15));
        this.labels.addChild(t);
      }
    }
  }

  update(dtMs: number): void {
    // Fade between modes.
    this.root.alpha += (this.targetAlpha - this.root.alpha) * Math.min(1, dtMs / 160);
    if (this.mode === 'none' && this.root.alpha < 0.01) {
      this.root.visible = false;
      return;
    }

    const reduced = this.settings.get().reducedMotion;
    this.now += dtMs;

    this.drawStars();

    const hop = this.master.tick(this.now);
    this.rival.tick(this.now);
    if (hop && !reduced) this.burst(this.headX, this.laneY(hop.channel), COLORS.cyan, 7);

    this.trailG.clear();
    this.drawTrail(this.rival);
    this.drawTrail(this.master);
    this.drawHead();
    this.updateParticles(dtMs);

    if (!reduced) this.floorPhase = (this.floorPhase + dtMs / 2600) % 1;
    this.drawFloor();
  }

  private drawStars(): void {
    const g = this.stars;
    g.clear();
    for (const s of this.starField) {
      const tw = 0.35 + 0.35 * Math.sin(this.now / 900 + s.p);
      g.circle(s.x * this.w, s.y * this.horizon, s.r).fill({ color: COLORS.white, alpha: tw * 0.6 });
    }
  }

  private drawTrail(trail: HopTrail): void {
    const g = this.trailG;
    const span = this.headX / this.pxPerMs;
    const hops = trail.hops;
    for (let i = 0; i < hops.length; i++) {
      const hp = hops[i]!;
      const age = this.now - hp.t;
      if (age > span) continue;
      const x0 = this.headX - age * this.pxPerMs;
      const dur = Math.min(hp.slots * trail.slotMs, age);
      const x1 = x0 + dur * this.pxPerMs;
      const y = this.laneY(hp.channel);
      const fade = (1 - age / span) * trail.alpha;
      const bh = this.laneH * (hp.slots > 1 ? 1.4 : 1);

      // Packet block (gap between slots, like real slot boundaries).
      g.roundRect(x0 + 1, y - bh / 2, Math.max(1, x1 - x0 - 2), bh, Math.min(3, bh / 2)).fill({ color: trail.color, alpha: fade * 0.9 });

      // Vertical jump to the next hop.
      const next = hops[i + 1];
      if (next) {
        const xn = this.headX - (this.now - next.t) * this.pxPerMs;
        g.moveTo(xn, y).lineTo(xn, this.laneY(next.channel)).stroke({ width: 1.5, color: trail.color, alpha: fade * 0.45 });
      }
    }
  }

  private drawHead(): void {
    const last = this.master.hops[this.master.hops.length - 1];
    if (!last) return;
    const y = this.laneY(last.channel);
    const pulse = 1 + 0.25 * Math.sin(this.now / 120);
    this.trailG.circle(this.headX, y, 9 * pulse).fill({ color: COLORS.cyan, alpha: 0.25 });
    this.trailG.circle(this.headX, y, 4.5).fill({ color: COLORS.white, alpha: 1 });
  }

  private burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.03 + Math.random() * 0.09;
      const max = 380 + Math.random() * 380;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color });
    }
  }

  private updateParticles(dtMs: number): void {
    const g = this.particlesG;
    g.clear();
    const drift = this.pxPerMs; // particles drift left with the trail
    this.particles = this.particles.filter((p) => {
      p.life -= dtMs;
      if (p.life <= 0) return false;
      p.x += (p.vx - drift) * dtMs;
      p.y += p.vy * dtMs;
      const k = p.life / p.max;
      g.circle(p.x, p.y, 1 + 2 * k).fill({ color: p.color, alpha: k });
      return true;
    });
  }

  /** Synthwave perspective grid converging on the horizon. */
  private drawFloor(): void {
    const g = this.floor;
    g.clear();
    const hz = this.horizon;
    const depth = this.h - hz;
    const cx = this.w / 2;

    // Horizon glow (stacked translucent bands).
    for (let i = 0; i < 6; i++) {
      g.rect(0, hz - i * 3, this.w, 3).fill({ color: COLORS.magenta, alpha: 0.05 * (6 - i) * 0.4 });
    }
    g.moveTo(0, hz).lineTo(this.w, hz).stroke({ width: 2, color: COLORS.magenta, alpha: 0.75 });

    // Receding horizontal lines.
    const rows = 14;
    for (let k = 0; k < rows; k++) {
      const z = (k + this.floorPhase) / rows;
      const y = hz + depth * Math.pow(z, 2.1);
      g.moveTo(0, y).lineTo(this.w, y).stroke({ width: 1 + z, color: COLORS.violet, alpha: 0.08 + 0.45 * z });
    }

    // Lines converging to the vanishing point.
    const cols = 22;
    const spread = this.w * 1.6;
    for (let i = -cols / 2; i <= cols / 2; i++) {
      const xb = cx + (i / (cols / 2)) * spread;
      g.moveTo(cx + (xb - cx) * 0.04, hz).lineTo(xb, this.h).stroke({ width: 1, color: COLORS.violet, alpha: 0.35 });
    }
  }
}
