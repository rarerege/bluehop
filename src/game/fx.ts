import { Container, Graphics, Text } from 'pixi.js';

/**
 * Reusable "juice": particle bursts, floating labels and screen shake.
 * All are capped so a storm of collisions can't tank the frame rate.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

export class ParticleFx {
  readonly g = new Graphics();
  private ps: Particle[] = [];

  constructor(private readonly cap = 300) {}

  burst(x: number, y: number, color: number, n: number, speed = 0.25): void {
    for (let i = 0; i < n && this.ps.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      const max = 350 + Math.random() * 450;
      this.ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color, size: 1.5 + Math.random() * 2.5 });
    }
  }

  /** dy: extra vertical scroll this frame (particles ride along with the waterfall). */
  update(dtMs: number, dy = 0): void {
    const g = this.g;
    g.clear();
    this.ps = this.ps.filter((p) => {
      p.life -= dtMs;
      if (p.life <= 0) return false;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs + dy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      const k = p.life / p.max;
      g.circle(p.x, p.y, p.size * (0.4 + 0.6 * k)).fill({ color: p.color, alpha: k });
      return true;
    });
  }

  clear(): void {
    this.ps = [];
    this.g.clear();
  }
}

interface Floating {
  t: Text;
  life: number;
  max: number;
}

/** Pooled floating text ("NAK", "LOST", "+1 MB"…). */
export class FloatLabels {
  readonly root = new Container();
  private active: Floating[] = [];
  private pool: Text[] = [];

  constructor(private readonly cap = 14) {}

  spawn(text: string, x: number, y: number, color: number, size = 14): void {
    if (this.active.length >= this.cap) {
      const old = this.active.shift()!;
      old.t.visible = false;
      this.pool.push(old.t);
    }
    const t =
      this.pool.pop() ??
      new Text({ text: '', style: { fontFamily: 'Consolas, monospace', fontWeight: '700', fontSize: size, fill: 0xffffff } });
    t.text = text;
    t.style.fill = color;
    t.style.fontSize = size;
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.alpha = 1;
    t.visible = true;
    if (!t.parent) this.root.addChild(t);
    this.active.push({ t, life: 900, max: 900 });
  }

  update(dtMs: number, dy = 0): void {
    this.active = this.active.filter((f) => {
      f.life -= dtMs;
      if (f.life <= 0) {
        f.t.visible = false;
        this.pool.push(f.t);
        return false;
      }
      f.t.y += dy - dtMs * 0.02;
      f.t.alpha = Math.min(1, f.life / (f.max * 0.4));
      return true;
    });
  }

  clear(): void {
    for (const f of this.active) {
      f.t.visible = false;
      this.pool.push(f.t);
    }
    this.active = [];
  }
}

/** Decaying random screen shake. */
export class Shake {
  private amount = 0;

  kick(px: number): void {
    this.amount = Math.min(14, this.amount + px);
  }

  update(dtMs: number): { x: number; y: number } {
    this.amount *= Math.pow(0.0025, dtMs / 1000);
    if (this.amount < 0.2) {
      this.amount = 0;
      return { x: 0, y: 0 };
    }
    return { x: (Math.random() * 2 - 1) * this.amount, y: (Math.random() * 2 - 1) * this.amount };
  }
}
