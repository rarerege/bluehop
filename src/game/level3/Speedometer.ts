import { Container, Graphics, Text } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';

/**
 * Throughput speedometer, 0…800 kbit/s, with a redline from 723.2 kbit/s
 * (the DH5-forward / 1-slot-return maximum). A yellow marker shows the
 * current gear's theoretical ceiling; in Lab Mode a dashed marker shows the
 * analytic expected goodput at the current BER.
 */

const MAX_KBPS = 800;
export const REDLINE_KBPS = 723.2;
const A0 = Math.PI * 0.75; // 135° (bottom-left)
const SWEEP = Math.PI * 1.5; // 270°

const angleFor = (kbps: number) => A0 + (Math.min(MAX_KBPS, Math.max(0, kbps)) / MAX_KBPS) * SWEEP;

export interface SpeedoFrame {
  kbps: number;
  gear: string;
  gearMaxKbps: number;
  expectedKbps: number | null;
  redline: boolean;
}

export class Speedometer {
  readonly root = new Container();
  private readonly dial = new Graphics();
  private readonly glow = new Graphics();
  private readonly needle = new Graphics();
  private readonly tickLabels = new Container();
  private readonly value: Text;
  private readonly unit: Text;
  private readonly gear: Text;
  private readonly sub: Text;
  private cx = 0;
  private cy = 0;
  private r = 100;
  private shown = 0;

  constructor() {
    try {
      this.glow.filters = [new AdvancedBloomFilter({ threshold: 0.15, bloomScale: 1.4, brightness: 1, blur: 8, quality: 4 })];
    } catch {
      /* no bloom */
    }
    const mono = (size: number, fill: number, weight: '400' | '700' | '800' = '700') =>
      new Text({ text: '', style: { fontFamily: 'Consolas, monospace', fontSize: size, fill, fontWeight: weight } });
    this.value = mono(40, 0xffffff, '800');
    this.unit = mono(14, 0x93a6c9);
    this.gear = mono(22, 0x00e5ff, '800');
    this.sub = mono(12, 0xffe45c);
    for (const t of [this.value, this.unit, this.gear, this.sub]) t.anchor.set(0.5);
    this.root.addChild(this.dial, this.glow, this.tickLabels, this.needle, this.value, this.unit, this.gear, this.sub);
  }

  layout(cx: number, cy: number, r: number): void {
    this.cx = cx;
    this.cy = cy;
    this.r = Math.max(60, r);
    this.drawDial();
  }

  private drawDial(): void {
    const { cx, cy, r } = this;
    const g = this.dial;
    g.clear();
    g.circle(cx, cy, r * 1.06).fill({ color: 0x070a1c, alpha: 0.9 });
    g.arc(cx, cy, r, A0, A0 + SWEEP).stroke({ width: r * 0.06, color: 0x1a2142 });
    // Redline zone 723.2 → 800
    g.arc(cx, cy, r, angleFor(REDLINE_KBPS), A0 + SWEEP).stroke({ width: r * 0.06, color: 0xff3b5c, alpha: 0.9 });

    this.tickLabels.removeChildren().forEach((c) => c.destroy());
    const fs = Math.max(10, r * 0.09);
    for (let v = 0; v <= MAX_KBPS; v += 50) {
      const a = angleFor(v);
      const major = v % 100 === 0;
      const r0 = r * (major ? 0.84 : 0.89);
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
        .lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95)
        .stroke({ width: major ? 2.5 : 1.2, color: v >= REDLINE_KBPS ? 0xff3b5c : 0x93a6c9, alpha: major ? 0.9 : 0.5 });
      if (major) {
        const t = new Text({ text: String(v), style: { fontFamily: 'Consolas, monospace', fontSize: fs, fill: 0x93a6c9 } });
        t.anchor.set(0.5);
        t.position.set(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
        this.tickLabels.addChild(t);
      }
    }
    // 723.2 label
    const a = angleFor(REDLINE_KBPS);
    const rl = new Text({ text: '723.2', style: { fontFamily: 'Consolas, monospace', fontSize: fs, fill: 0xff3b5c, fontWeight: '700' } });
    rl.anchor.set(0.5);
    rl.position.set(cx + Math.cos(a) * r * 1.16, cy + Math.sin(a) * r * 1.16);
    this.tickLabels.addChild(rl);

    this.value.style.fontSize = r * 0.32;
    this.unit.style.fontSize = Math.max(11, r * 0.1);
    this.gear.style.fontSize = Math.max(14, r * 0.17);
    this.sub.style.fontSize = Math.max(10, r * 0.085);
    this.value.position.set(cx, cy + r * 0.12);
    this.unit.position.set(cx, cy + r * 0.34);
    this.gear.position.set(cx, cy + r * 0.62);
    this.sub.position.set(cx, cy + r * 0.82);
  }

  update(dtMs: number, f: SpeedoFrame): void {
    // Smooth the needle (critically damped-ish).
    this.shown += (f.kbps - this.shown) * Math.min(1, dtMs / 120);
    const { cx, cy, r } = this;
    const hot = this.shown >= REDLINE_KBPS * 0.995;

    const g = this.glow;
    g.clear();
    g.arc(cx, cy, r, A0, angleFor(this.shown)).stroke({ width: r * 0.06, color: hot ? 0xff3b5c : 0x00e5ff, alpha: 0.95 });
    // Gear ceiling marker
    const am = angleFor(f.gearMaxKbps);
    g.moveTo(cx + Math.cos(am) * r * 0.78, cy + Math.sin(am) * r * 0.78)
      .lineTo(cx + Math.cos(am) * r * 1.08, cy + Math.sin(am) * r * 1.08)
      .stroke({ width: 3, color: 0xffe45c, alpha: 0.95 });
    if (f.expectedKbps !== null) {
      const ae = angleFor(f.expectedKbps);
      for (let k = 0; k < 4; k++) {
        const r0 = r * (0.8 + k * 0.07);
        g.moveTo(cx + Math.cos(ae) * r0, cy + Math.sin(ae) * r0)
          .lineTo(cx + Math.cos(ae) * (r0 + r * 0.035), cy + Math.sin(ae) * (r0 + r * 0.035))
          .stroke({ width: 2, color: 0x3bffb0, alpha: 0.9 });
      }
    }

    const n = this.needle;
    n.clear();
    const a = angleFor(this.shown);
    n.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12)
      .lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9)
      .stroke({ width: Math.max(3, r * 0.03), color: 0xffffff });
    n.circle(cx, cy, r * 0.07).fill({ color: hot ? 0xff3b5c : 0x00e5ff });

    this.value.text = this.shown.toFixed(1);
    this.value.style.fill = hot ? 0xff3b5c : 0xffffff;
    this.unit.text = 'kbit/s goodput';
    this.gear.text = f.gear;
    this.sub.text = `gear max ${f.gearMaxKbps.toFixed(1)} kbit/s`;
  }
}
