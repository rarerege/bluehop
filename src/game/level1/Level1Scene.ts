import { Circle, Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { Scene } from '../../app/Scene';
import type { BackdropMode } from '../Backdrop';
import { BADGES, recordResult, unlockBadge, type BadgeInfo } from '../../app/progress';
import { channelFreqMHz, MAX_ACTIVE_SLAVES, SETUP_MAX_S, SETUP_MEAN_S, SLOT_S } from '../../sim/constants';
import { Piconet, Scatternet, type Bridge } from '../../sim/piconet';
import { Rng } from '../../sim/rng';
import { sampleSetupTimeS } from '../../sim/setup';
import { button, h } from '../../ui/dom';
import { icons } from '../../ui/icons';
import { showEndCard, showPause, showTutorial, type OverlayHandle } from '../../ui/overlays';
import { FloatLabels, ParticleFx, Shake } from '../fx';
import { amBits, formatBdAddr, pmHex } from './format';
import { drawIcon, GADGETS, PICONET_B, type Gadget } from './gadgets';
import { IDEAL_TIME_TO_7_S, scoreLevel1 } from './scoring';
import { LEVEL1_TUTORIAL } from './tutorial';

/**
 * Level 1 — "Assemble the Piconet".
 *
 * The player is the master. Inquiry discovers nearby gadgets; dragging one onto
 * the master pages it into the piconet, where it gets a 3-bit AM_ADDR. Only 7
 * can be active: an 8th forces the player to park someone (8-bit PM_ADDR).
 * Bonus: a second piconet appears; dragging a slave onto its master makes a
 * bridge that time-shares between the two hop patterns (scatternet).
 *
 * Membership rules come from the engine (sim/piconet.ts); inquiry and page
 * delays come from the setup model (mean 0.64 s, max 2.56 s).
 */

/** Simulated seconds per wall-clock second: ½× slow motion so setup times are visible. */
const SLOWMO = 0.5;
/** Visual "clock" the master blinks at (simulated Hz); synced slaves blink in unison. */
const BLINK_HZ = 2;
/** Bridge dwell time in each piconet (slots): 400 slots = 0.25 s. */
const BRIDGE_DWELL = 400;

const C = {
  cyan: 0x00e5ff,
  magenta: 0xff2bd6,
  yellow: 0xffe45c,
  orange: 0xff8a00,
  grey: 0x5d6a88,
  white: 0xffffff,
  green: 0x3bffb0,
  dim: 0x93a6c9,
};

type DevState = 'hidden' | 'discovered' | 'queued' | 'paging' | 'active' | 'parked' | 'bridge';

interface Dev {
  g: Gadget;
  addr: number;
  state: DevState;
  view: Container;
  ring: Graphics;
  icon: Graphics;
  name: Text;
  badge: Text;
  x: number;
  y: number;
  /** Home position in polar coordinates around master A (angle, fraction of field radius). */
  home: { a: number; r: number };
  drift: number;
  discoverAt: number | null;
  pageStart: number;
  pageDur: number;
  /** Blink phase (radians) and free-running rate (Hz) before sync. */
  phase: number;
  rate: number;
  wantsIn: boolean;
  dragging: boolean;
}

interface Geometry {
  arena: { x: number; y: number; w: number; h: number };
  lot: { x: number; y: number; w: number; h: number; vertical: boolean };
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r1: number;
  field: number;
  scale: number;
}

export class Level1Scene extends Scene {
  override readonly backdrop: BackdropMode = 'none';

  private rng = new Rng(11);
  private pico!: Piconet;
  private picoB!: Piconet;
  private net!: Scatternet;
  private bridge: Bridge | null = null;

  private devs: Dev[] = [];
  private simTime = 0;
  private running = false;
  private paused = false;
  private ended = false;

  private inquiryActive = false;
  private inquiryDone = false;
  private firstInquiryAt: number | null = null;
  private radar: { r: number; life: number }[] = [];
  private radarTimer = 0;

  private queue: Dev[] = [];
  private paging: Dev | null = null;
  private pendingJoin: Dev | null = null;

  private maxActive = 0;
  private parkedCorrectly = false;
  private timeTo7: number | null = null;
  private setupTimes: number[] = [];
  private bonusActive = false;
  private bonusAt: number | null = null;
  private bonusAppear = 0;

  // Pixi layers
  private readonly bg = new Graphics();
  private readonly glow = new Container();
  private readonly beams = new Graphics();
  private readonly cores = new Graphics();
  private readonly devLayer = new Container();
  private readonly bLayer = new Container();
  private readonly labels = new Container();
  private readonly particles = new ParticleFx(220);
  private readonly floats = new FloatLabels(10);
  private readonly shake = new Shake();
  private masterLabel!: Text;
  private masterAddrLabel!: Text;
  private bLabel!: Text;
  private lotLabel!: Text;
  private orbitLabel!: Text;
  private bSlaves: { g: Graphics; icon: Graphics }[] = [];
  private bCoreIcon!: Graphics;

  private geo!: Geometry;
  private drag: { dev: Dev; sx: number; sy: number; moved: boolean } | null = null;

  // DOM
  private overlay: OverlayHandle | null = null;
  private pauseUi: OverlayHandle | null = null;
  private els!: {
    hud: HTMLElement;
    controls: HTMLElement;
    clock: HTMLElement;
    banner: HTMLElement;
    stats: Record<'active' | 'parked' | 'setup' | 'phase', HTMLElement>;
    objectives: HTMLElement;
    lab: HTMLElement;
    inquiry: HTMLButtonElement;
    finish: HTMLButtonElement;
    pauseBtn: HTMLButtonElement;
  };
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  private hudTimer = 0;
  private ro: ResizeObserver | null = null;
  private readonly onWindowUp = () => this.endDrag();

  constructor() {
    super();
    this.glow.addChild(this.beams, this.cores);
    try {
      this.glow.filters = [new AdvancedBloomFilter({ threshold: 0.2, bloomScale: 1.2, brightness: 1, blur: 6, quality: 4 })];
    } catch {
      /* no bloom */
    }
    this.root.addChild(this.bg, this.glow, this.bLayer, this.devLayer, this.labels, this.particles.g, this.floats.root);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  protected enter(): void {
    this.buildDom();
    this.buildStatic();
    this.setupInput();
    this.reset();
    this.overlay = showTutorial(this.dom, LEVEL1_TUTORIAL, () => {
      this.overlay = null;
      this.running = true;
    });
  }

  override destroy(): void {
    clearTimeout(this.bannerTimer);
    this.ro?.disconnect();
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    super.destroy();
  }

  private reset(): void {
    this.rng = new Rng(11);
    this.pico = new Piconet('A', 0x00b1e40b0b00, 4242);
    this.picoB = new Piconet('B', 0x0007e1e7e1e0, 90210);
    this.net = new Scatternet();
    this.net.add(this.pico);
    this.net.add(this.picoB);
    this.bridge = null;
    for (const s of PICONET_B.slaves) {
      this.picoB.addDevice(s.id, s.name, this.rng.bdAddr());
      this.picoB.connect(s.id);
    }

    for (const d of this.devs) d.view.destroy({ children: true });
    this.devs = GADGETS.map((g, i) => this.makeDev(g, i));
    this.simTime = 0;
    this.paused = false;
    this.ended = false;
    this.inquiryActive = false;
    this.inquiryDone = false;
    this.firstInquiryAt = null;
    this.radar = [];
    this.queue = [];
    this.paging = null;
    this.pendingJoin = null;
    this.maxActive = 0;
    this.parkedCorrectly = false;
    this.timeTo7 = null;
    this.setupTimes = [];
    this.bonusActive = false;
    this.bonusAt = null;
    this.bonusAppear = 0;
    this.bLayer.visible = false;
    this.particles.clear();
    this.floats.clear();
    this.els.banner.classList.remove('banner--on');
    this.els.inquiry.disabled = false;
    this.els.inquiry.classList.add('btn--pulse-cyan');
    this.els.finish.classList.remove('btn--pulse-cyan');
    this.layout();
    for (const d of this.devs) {
      const p = this.homePos(d);
      d.x = p.x;
      d.y = p.y;
    }
    this.updateHud();
  }

  restart(): void {
    this.overlay?.close();
    this.overlay = null;
    this.pauseUi?.close();
    this.pauseUi = null;
    this.reset();
    this.running = true;
  }

  override onHidden(): void {
    if (this.running && !this.ended) this.pause();
  }

  private makeDev(g: Gadget, i: number): Dev {
    const pico = this.pico;
    const addr = this.rng.bdAddr();
    pico.addDevice(g.id, g.name, addr);
    const view = new Container();
    const ring = new Graphics();
    const icon = new Graphics();
    drawIcon(icon, g.kind);
    const name = new Text({ text: '?', style: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: 13, fill: C.dim, fontWeight: '600' } });
    name.anchor.set(0.5, 0);
    name.y = 30;
    const badge = new Text({ text: '', style: { fontFamily: 'Consolas, monospace', fontSize: 12, fill: C.cyan, fontWeight: '700' } });
    badge.anchor.set(0.5, 1);
    badge.y = -30;
    view.addChild(ring, icon, name, badge);
    view.eventMode = 'static';
    view.cursor = 'grab';
    view.hitArea = new Circle(0, 0, 32);
    this.devLayer.addChild(view);

    const n = GADGETS.length;
    const dev: Dev = {
      g,
      addr,
      state: 'hidden',
      view,
      ring,
      icon,
      name,
      badge,
      x: 0,
      y: 0,
      home: { a: (i / n) * Math.PI * 2 + (this.rng.next() - 0.5) * 0.35, r: 0.66 + this.rng.next() * 0.3 },
      drift: this.rng.next() * Math.PI * 2,
      discoverAt: null,
      pageStart: 0,
      pageDur: 0,
      phase: this.rng.next() * Math.PI * 2,
      rate: BLINK_HZ * (0.6 + this.rng.next() * 0.8),
      wantsIn: false,
      dragging: false,
    };
    view.on('pointerdown', (e: FederatedPointerEvent) => this.beginDrag(dev, e));
    return dev;
  }

  // ── Static scenery (labels, piconet B) ────────────────────────────────

  private buildStatic(): void {
    const label = (text: string, size: number, fill: number) => {
      const t = new Text({ text, style: { fontFamily: 'Consolas, monospace', fontSize: size, fill, fontWeight: '700' } });
      t.anchor.set(0.5, 0);
      this.labels.addChild(t);
      return t;
    };
    this.masterLabel = label('YOU · MASTER', 13, C.cyan);
    this.masterAddrLabel = label('', 10, C.dim);
    this.lotLabel = label('PARKED · PM_ADDR (8 bits)', 11, C.dim);
    this.orbitLabel = label('ACTIVE · AM_ADDR 1–7 (3 bits)', 10, C.cyan);
    this.orbitLabel.alpha = 0.6;

    // Piconet B: Smart TV master + two slaves.
    this.bCoreIcon = new Graphics();
    drawIcon(this.bCoreIcon, PICONET_B.master.kind, C.white);
    this.bLayer.addChild(this.bCoreIcon);
    for (const s of PICONET_B.slaves) {
      const g = new Graphics();
      const icon = new Graphics();
      drawIcon(icon, s.kind, C.white);
      icon.scale.set(0.8);
      this.bLayer.addChild(g, icon);
      this.bSlaves.push({ g, icon });
    }
    this.bLabel = new Text({ text: 'PICONET B · Smart TV (master)', style: { fontFamily: 'Consolas, monospace', fontSize: 11, fill: C.orange, fontWeight: '700' } });
    this.bLabel.anchor.set(0.5, 0);
    this.bLayer.addChild(this.bLabel);
  }

  // ── Geometry ──────────────────────────────────────────────────────────

  override resize(): void {
    this.layout();
  }

  private layout(): void {
    if (!this.els) return;
    const { width, height } = this.ctx.app.screen;
    const top = this.els.hud.getBoundingClientRect().bottom + 8;
    const bottom = this.els.controls.getBoundingClientRect().top - 8;
    const gut = Math.max(16, width * 0.024);
    const x = gut;
    const w = width - gut * 2;
    const hgt = Math.max(200, bottom - top);
    const vertical = w > hgt * 1.15; // wide screens: parking column on the left
    const lotSize = vertical ? Math.min(150, w * 0.14) : Math.min(96, hgt * 0.16);
    const lot = vertical ? { x, y: top, w: lotSize, h: hgt, vertical } : { x, y: top + hgt - lotSize, w, h: lotSize, vertical };
    const arena = vertical ? { x: x + lotSize + 10, y: top, w: w - lotSize - 10, h: hgt } : { x, y: top, w, h: hgt - lotSize - 8 };
    const minDim = Math.min(arena.w, arena.h);
    const scale = minDim < 420 ? 0.78 : minDim < 640 ? 0.9 : 1.1;

    // Bonus: make room for piconet B.
    const t = this.bonusAppear;
    const wide = arena.w >= arena.h;
    const axFull = arena.x + arena.w / 2;
    const ayFull = arena.y + arena.h / 2;
    const ax = wide ? axFull - arena.w * 0.16 * t : axFull;
    const ay = wide ? ayFull : ayFull - arena.h * 0.16 * t;
    const bx = wide ? arena.x + arena.w * 0.86 : arena.x + arena.w * 0.72;
    const by = wide ? ayFull : arena.y + arena.h * 0.86;
    const field = minDim * (0.47 - 0.07 * t);
    const r1 = Math.max(70, field * 0.48);

    this.geo = { arena, lot, ax, ay, bx, by, r1, field, scale };
    this.root.hitArea = new Rectangle(0, 0, width, height);
  }

  private clampToArena(x: number, y: number): { x: number; y: number } {
    const a = this.geo.arena;
    const m = 34 * this.geo.scale;
    return { x: Math.min(a.x + a.w - m, Math.max(a.x + m, x)), y: Math.min(a.y + a.h - m - 10, Math.max(a.y + m, y)) };
  }

  private homePos(d: Dev): { x: number; y: number } {
    const g = this.geo;
    const wob = Math.sin(this.simTime * 0.9 + d.drift) * 6;
    const r = g.r1 + 30 + (g.field - g.r1 - 30) * d.home.r + wob;
    return this.clampToArena(g.ax + Math.cos(d.home.a) * r * (g.arena.w > g.arena.h ? 1.35 : 1), g.ay + Math.sin(d.home.a) * r);
  }

  private targetPos(d: Dev): { x: number; y: number } {
    const g = this.geo;
    switch (d.state) {
      case 'hidden':
      case 'discovered': {
        if (d.wantsIn) {
          const a = d.home.a;
          const r = g.r1 * 1.55 + Math.sin(this.simTime * 8) * 4;
          return { x: g.ax + Math.cos(a) * r, y: g.ay + Math.sin(a) * r };
        }
        return this.homePos(d);
      }
      case 'queued':
      case 'paging': {
        // Use the home angle: a device dropped right on the core has no useful angle of its own.
        const a = d.home.a;
        const r = g.r1 * (d.state === 'queued' ? 1.45 : 1.2);
        return { x: g.ax + Math.cos(a) * r, y: g.ay + Math.sin(a) * r };
      }
      case 'active': {
        const am = this.pico.get(d.g.id)?.amAddr ?? 1;
        const a = -Math.PI / 2 + ((am - 1) * 2 * Math.PI) / MAX_ACTIVE_SLAVES + this.simTime * 0.12;
        return { x: g.ax + Math.cos(a) * g.r1, y: g.ay + Math.sin(a) * g.r1 };
      }
      case 'parked': {
        const parked = this.devs.filter((x) => x.state === 'parked').sort((p, q) => (this.pmOf(p) ?? 0) - (this.pmOf(q) ?? 0));
        const i = parked.indexOf(d);
        const step = 74 * g.scale;
        return g.lot.vertical
          ? { x: g.lot.x + g.lot.w / 2, y: g.lot.y + 64 * g.scale + i * step }
          : { x: g.lot.x + 50 * g.scale + i * step * 1.2, y: g.lot.y + g.lot.h / 2 + 6 };
      }
      case 'bridge':
        return { x: (g.ax + g.bx) / 2, y: (g.ay + g.by) / 2 + (g.arena.w >= g.arena.h ? -g.r1 * 0.35 : 0) };
    }
  }

  private pmOf(d: Dev): number | null {
    return this.pico.get(d.g.id)?.pmAddr ?? null;
  }

  private activeCount(): number {
    return this.pico.active().length;
  }

  /** Active + already queued/paging = AM_ADDRs that are spoken for. */
  private reservedCount(): number {
    return this.activeCount() + this.queue.length + (this.paging ? 1 : 0);
  }

  // ── Frame loop ───────────────────────────────────────────────────────

  override update(dtMs: number): void {
    const reduced = this.ctx.settings.get().reducedMotion;
    if (this.running && !this.paused && !this.ended) {
      this.simTime += (dtMs / 1000) * SLOWMO;
      this.stepInquiry(dtMs);
      this.stepPaging();
      this.stepBonus(dtMs);
    }
    this.layout();
    this.draw(dtMs);
    this.particles.update(dtMs);
    this.floats.update(dtMs);
    const off = reduced ? { x: 0, y: 0 } : this.shake.update(dtMs);
    this.root.position.set(off.x, off.y);

    this.hudTimer += dtMs;
    if (this.hudTimer > 120) {
      this.hudTimer = 0;
      this.updateHud();
    }
  }

  private stepInquiry(dtMs: number): void {
    if (!this.inquiryActive) return;
    this.radarTimer -= dtMs;
    if (this.radarTimer <= 0) {
      this.radarTimer = 650;
      this.radar.push({ r: 20, life: 1 });
      this.ctx.audio.hop(30);
    }
    let remaining = 0;
    for (const d of this.devs) {
      if (d.state !== 'hidden') continue;
      if (d.discoverAt !== null && this.simTime >= d.discoverAt) {
        d.state = 'discovered';
        this.pico.setPhase(d.g.id, 'standby');
        this.particles.burst(d.x, d.y, C.cyan, this.ctx.settings.get().reducedMotion ? 3 : 10, 0.15);
        this.floats.spawn('found', d.x, d.y - 40, C.cyan, 12);
        this.ctx.audio.hover();
      } else remaining++;
    }
    if (remaining === 0) {
      this.inquiryActive = false;
      this.inquiryDone = true;
      this.showBanner('Inquiry complete', 'All gadgets answered. Drag one onto your core to page it.', 'var(--cyan)');
    }
  }

  private stepPaging(): void {
    if (!this.paging && this.queue.length) {
      const d = this.queue.shift()!;
      d.state = 'paging';
      d.pageStart = this.simTime;
      d.pageDur = Math.max(0.03, sampleSetupTimeS(this.rng));
      this.paging = d;
    }
    const d = this.paging;
    if (!d) return;
    const t = (this.simTime - d.pageStart) / d.pageDur;
    // Last 40 % of the page: the slave locks onto the master's clock (blink phase converges).
    if (t > 0.6) {
      const target = this.masterPhase();
      d.phase += (target - d.phase) * Math.min(1, (t - 0.6) * 2.5);
    }
    if (t >= 1) {
      const r = this.pico.connect(d.g.id);
      this.paging = null;
      if (!r.ok) {
        d.state = 'discovered';
        return;
      }
      d.state = 'active';
      this.setupTimes.push(d.pageDur);
      this.ctx.audio.confirm();
      this.particles.burst(d.x, d.y, C.cyan, this.ctx.settings.get().reducedMotion ? 4 : 16, 0.2);
      this.floats.spawn(`AM_ADDR ${amBits(r.amAddr)}`, d.x, d.y - 44, C.cyan, 13);
      this.onMembershipChange();
    }
  }

  private onMembershipChange(): void {
    const n = this.activeCount();
    if (n > this.maxActive) this.maxActive = n;
    if (n === MAX_ACTIVE_SLAVES && this.timeTo7 === null && this.firstInquiryAt !== null) {
      this.timeTo7 = this.simTime - this.firstInquiryAt;
      this.ctx.audio.success();
      this.showBanner("Harald's Rune!", 'Seven active slaves — every 3-bit AM_ADDR (001–111) is taken.', 'var(--yellow)');
    }
    this.updateHud();
  }

  private stepBonus(dtMs: number): void {
    if (!this.bonusActive && this.maxActive >= MAX_ACTIVE_SLAVES && this.parkedCorrectly) {
      if (this.bonusAt === null) this.bonusAt = this.simTime + 0.6;
      if (this.simTime >= this.bonusAt) {
        this.bonusActive = true;
        this.bLayer.visible = true;
        this.showBanner('Bonus: a second piconet', 'Drag one of your active slaves onto the Smart TV to make it a bridge.', 'var(--orange)');
        this.els.finish.classList.add('btn--pulse-cyan');
      }
    }
    if (this.bonusActive && this.bonusAppear < 1) this.bonusAppear = Math.min(1, this.bonusAppear + dtMs / 700);
  }

  private masterPhase(): number {
    return this.simTime * Math.PI * 2 * BLINK_HZ;
  }

  // ── Drawing ──────────────────────────────────────────────────────────

  private draw(dtMs: number): void {
    const g = this.geo;
    const bg = this.bg;
    bg.clear();

    // Field + orbit
    bg.circle(g.ax, g.ay, g.field).fill({ color: C.cyan, alpha: 0.025 });
    bg.circle(g.ax, g.ay, g.r1).stroke({ width: 1.5, color: C.cyan, alpha: 0.22 });
    this.orbitLabel.position.set(g.ax, g.ay - g.r1 - 16);

    // Parking lot
    const l = g.lot;
    bg.roundRect(l.x, l.y, l.w, l.h, 12).fill({ color: C.grey, alpha: 0.08 }).stroke({ width: 1, color: C.grey, alpha: 0.5 });
    this.lotLabel.style.fontSize = l.vertical ? 10 : 11;
    this.lotLabel.text = l.vertical ? 'PARKED\nPM_ADDR' : 'PARKED · PM_ADDR (8 bits, up to 255)';
    this.lotLabel.position.set(l.x + l.w / 2, l.y + 8);

    // Inquiry radar rings
    this.radar = this.radar.filter((r) => {
      r.r += dtMs * 0.32;
      r.life = 1 - r.r / (g.field * 1.15);
      if (r.life <= 0) return false;
      bg.circle(g.ax, g.ay, r.r).stroke({ width: 3, color: C.cyan, alpha: r.life * 0.6 });
      return true;
    });

    // Master core
    const pulse = 0.5 + 0.5 * Math.sin(this.masterPhase());
    const cores = this.cores;
    cores.clear();
    cores.circle(g.ax, g.ay, 46 * g.scale).fill({ color: C.cyan, alpha: 0.08 + 0.1 * pulse });
    cores.circle(g.ax, g.ay, 32 * g.scale).stroke({ width: 3, color: C.cyan, alpha: 0.9 });
    cores.circle(g.ax, g.ay, 20 * g.scale).fill({ color: C.cyan, alpha: 0.5 + 0.4 * pulse });
    cores.circle(g.ax, g.ay, 7 * g.scale).fill({ color: C.white, alpha: 1 });
    this.masterLabel.position.set(g.ax, g.ay + 40 * g.scale);
    this.masterAddrLabel.text = formatBdAddr(this.pico.masterAddress);
    this.masterAddrLabel.position.set(g.ax, g.ay + 56 * g.scale);

    // Piconet B
    this.beams.clear();
    if (this.bLayer.visible) this.drawPiconetB();

    // Devices
    const freeRun = this.running && !this.paused && !this.ended ? (dtMs / 1000) * SLOWMO : 0;
    for (const d of this.devs) this.drawDev(d, freeRun);
  }

  private drawPiconetB(): void {
    const g = this.geo;
    const a = this.bonusAppear;
    const bPulse = 0.5 + 0.5 * Math.sin(this.simTime * Math.PI * 2 * BLINK_HZ * 1.37);
    const cores = this.cores;
    const rB = Math.max(46, g.r1 * 0.55);
    cores.circle(g.bx, g.by, rB).stroke({ width: 1.5, color: C.orange, alpha: 0.25 * a });
    cores.circle(g.bx, g.by, 40 * g.scale * a).fill({ color: C.orange, alpha: 0.08 + 0.1 * bPulse });
    cores.circle(g.bx, g.by, 28 * g.scale * a).stroke({ width: 3, color: C.orange, alpha: 0.9 * a });
    this.bCoreIcon.position.set(g.bx, g.by);
    this.bCoreIcon.alpha = a;
    this.bLabel.position.set(g.bx, g.by + 36 * g.scale);
    this.bLabel.alpha = a;
    this.bSlaves.forEach((s, i) => {
      const ang = Math.PI * 0.25 + i * Math.PI + this.simTime * 0.3;
      const x = g.bx + Math.cos(ang) * rB;
      const y = g.by + Math.sin(ang) * rB;
      s.g.clear();
      s.g.circle(x, y, 20 * g.scale).fill({ color: 0x1a0f05, alpha: 0.9 * a }).stroke({ width: 2, color: C.orange, alpha: (0.5 + 0.5 * bPulse) * a });
      s.icon.position.set(x, y);
      s.icon.alpha = a;
    });

    // Bridge: a line to whichever piconet it is listening to right now.
    if (this.bridge) {
      const d = this.devs.find((x) => x.g.id === this.bridge!.deviceId)!;
      const slot = Math.floor(this.simTime / SLOT_S);
      const inA = this.net.bridgePresence(this.bridge, slot) === 'A';
      this.beams
        .moveTo(d.x, d.y)
        .lineTo(inA ? g.ax : g.bx, inA ? g.ay : g.by)
        .stroke({ width: 3, color: inA ? C.cyan : C.orange, alpha: 0.85 });
      this.beams
        .moveTo(d.x, d.y)
        .lineTo(inA ? g.bx : g.ax, inA ? g.by : g.ay)
        .stroke({ width: 1, color: inA ? C.orange : C.cyan, alpha: 0.2 });
    }
  }

  /** freeRunS: simulated seconds that passed this frame (0 while paused). */
  private drawDev(d: Dev, freeRunS: number): void {
    const g = this.geo;
    const s = g.scale;
    // Movement
    if (!d.dragging) {
      const t = this.targetPos(d);
      const k = d.state === 'active' ? 0.18 : 0.1;
      d.x += (t.x - d.x) * k;
      d.y += (t.y - d.y) * k;
    }
    d.view.position.set(d.x, d.y);
    d.view.scale.set(s * (d.dragging ? 1.12 : 1));

    // Blink: free-running until synced, then locked to the master clock.
    if (d.state === 'active' || d.state === 'bridge') d.phase = this.masterPhase();
    else if (d.state !== 'paging') d.phase += 2 * Math.PI * d.rate * freeRunS;
    const blink = 0.5 + 0.5 * Math.sin(d.phase);

    const ring = d.ring;
    ring.clear();
    let color = C.cyan;
    let alpha = 1;
    let badge = '';
    let badgeColor = C.cyan;
    switch (d.state) {
      case 'hidden':
        color = C.grey;
        alpha = this.inquiryActive ? 0.35 : 0.22;
        break;
      case 'discovered':
        color = d.wantsIn ? C.yellow : C.white;
        badge = d.wantsIn ? 'WANTS IN' : '';
        badgeColor = C.yellow;
        break;
      case 'queued':
        color = C.yellow;
        badge = 'queued';
        badgeColor = C.yellow;
        break;
      case 'paging': {
        color = C.yellow;
        const t = (this.simTime - d.pageStart) / d.pageDur;
        badge = t < 0.6 ? 'paging…' : 'syncing to hop pattern';
        badgeColor = C.yellow;
        this.drawPageBeam(d, t);
        break;
      }
      case 'active': {
        const am = this.pico.get(d.g.id)?.amAddr ?? 0;
        badge = `AMA ${amBits(am)}`;
        break;
      }
      case 'parked': {
        color = C.grey;
        badge = `PMA ${pmHex(this.pmOf(d) ?? 0)}`;
        badgeColor = C.dim;
        alpha = 0.75;
        break;
      }
      case 'bridge': {
        const slot = Math.floor(this.simTime / SLOT_S);
        const inA = this.bridge ? this.net.bridgePresence(this.bridge, slot) === 'A' : true;
        color = inA ? C.cyan : C.orange;
        const ch = this.bridge ? this.net.bridgeChannel(this.bridge, slot) : 0;
        badge = `BRIDGE · in ${inA ? 'A' : 'B'} · ${channelFreqMHz(ch)} MHz`;
        badgeColor = color;
        break;
      }
    }
    d.view.alpha = alpha;
    const lit = d.state === 'hidden' ? 0.3 : 0.35 + 0.65 * blink;
    ring.circle(0, 0, 26).fill({ color: 0x0a0d22, alpha: 0.92 });
    ring.circle(0, 0, 26).stroke({ width: 2.5, color, alpha: d.state === 'hidden' ? 0.5 : lit });
    // Status light (blinks in time with the master once synced).
    if (d.state !== 'hidden') ring.circle(19, -19, 4.5).fill({ color, alpha: lit });
    d.icon.alpha = d.state === 'hidden' ? 0.35 : d.state === 'parked' ? 0.5 : 1;
    d.name.text = d.state === 'hidden' ? '?' : d.g.name;
    d.name.style.fill = d.state === 'parked' ? C.grey : C.dim;
    d.badge.text = badge;
    d.badge.style.fill = badgeColor;
    d.view.cursor = d.state === 'hidden' ? 'help' : 'grab';
  }

  private drawPageBeam(d: Dev, t: number): void {
    const g = this.geo;
    const dx = d.x - g.ax;
    const dy = d.y - g.ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const seg = 10;
    const off = (this.simTime * 220) % (seg * 2);
    for (let p = 30 + off; p < len - 26; p += seg * 2) {
      const e = Math.min(len - 26, p + seg);
      this.beams
        .moveTo(g.ax + ux * p, g.ay + uy * p)
        .lineTo(g.ax + ux * e, g.ay + uy * e)
        .stroke({ width: 2.5, color: t < 0.6 ? C.yellow : C.cyan, alpha: 0.85 });
    }
  }

  // ── Input ───────────────────────────────────────────────────────────

  private setupInput(): void {
    this.root.eventMode = 'static';
    this.root.on('globalpointermove', (e: FederatedPointerEvent) => {
      const dr = this.drag;
      if (!dr) return;
      if (!dr.moved && Math.hypot(e.global.x - dr.sx, e.global.y - dr.sy) > 10) {
        dr.moved = true;
        if (this.canDrag(dr.dev)) dr.dev.dragging = true;
      }
      if (dr.dev.dragging) {
        dr.dev.x = e.global.x;
        dr.dev.y = e.global.y;
      }
    });
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  }

  private canDrag(d: Dev): boolean {
    return d.state === 'discovered' || (d.state === 'active' && this.bonusActive && !this.bridge);
  }

  private beginDrag(d: Dev, e: FederatedPointerEvent): void {
    if (!this.running || this.paused || this.ended) return;
    this.drag = { dev: d, sx: e.global.x, sy: e.global.y, moved: false };
  }

  private endDrag(): void {
    const dr = this.drag;
    this.drag = null;
    if (!dr) return;
    const d = dr.dev;
    if (!dr.moved) {
      this.tap(d);
      return;
    }
    if (!d.dragging) {
      // Dragged something that can't be dragged: explain instead of acting on it.
      if (d.state === 'active') this.showBanner('Tap to park', 'Active slaves stay in orbit. Tap one to park it.', 'var(--text-dim)');
      return;
    }
    d.dragging = false;
    const g = this.geo;
    const nearA = Math.hypot(d.x - g.ax, d.y - g.ay) < 70 * g.scale;
    const nearB = this.bonusActive && Math.hypot(d.x - g.bx, d.y - g.by) < 70 * g.scale;
    if (d.state === 'discovered' && nearA) this.requestPage(d);
    else if (d.state === 'active' && nearB) this.makeBridge(d);
    else if (d.state === 'discovered' && nearB) this.showBanner('Wrong master', 'Page it into YOUR piconet first.', 'var(--text-dim)');
  }

  private tap(d: Dev): void {
    if (!this.running || this.ended) return;
    switch (d.state) {
      case 'hidden':
        this.showBanner('Unknown device', 'Run an Inquiry first — the master doesn’t know its address yet.', 'var(--text-dim)');
        break;
      case 'discovered':
        if (d.wantsIn) this.showBanner('Piconet full', 'Tap one of your active slaves to park it.', 'var(--yellow)', true);
        else this.showBanner(d.g.name, `BD_ADDR ${formatBdAddr(d.addr)} — drag it onto your core to page it.`, 'var(--cyan)');
        break;
      case 'active':
        this.park(d);
        break;
      case 'parked':
        this.unpark(d);
        break;
      case 'bridge':
        this.showBanner('Bridge device', 'Slave in piconet A and in piconet B, time-sharing between their hop patterns.', 'var(--orange)');
        break;
      default:
        break;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────

  private startInquiry(): void {
    if (!this.running || this.paused || this.ended || this.inquiryActive) return;
    const hidden = this.devs.filter((d) => d.state === 'hidden');
    if (hidden.length === 0) {
      this.showBanner('Nothing new nearby', 'Every gadget in range has already answered.', 'var(--text-dim)');
      return;
    }
    if (this.firstInquiryAt === null) this.firstInquiryAt = this.simTime;
    this.inquiryActive = true;
    this.radarTimer = 0;
    for (const d of hidden) {
      d.discoverAt = this.simTime + sampleSetupTimeS(this.rng);
      this.pico.setPhase(d.g.id, 'inquiry');
    }
    this.els.inquiry.classList.remove('btn--pulse-cyan');
    this.els.inquiry.disabled = true;
    this.ctx.audio.click();
    this.showBanner('Inquiry…', 'Broadcasting on the inquiry hop sequence. Gadgets answer after a random back-off.', 'var(--cyan)');
  }

  private requestPage(d: Dev): void {
    if (this.pendingJoin && this.pendingJoin !== d) {
      this.showBanner('Park someone first', `${this.pendingJoin.g.name} is waiting for a free AM_ADDR.`, 'var(--yellow)', true);
      return;
    }
    if (this.reservedCount() >= MAX_ACTIVE_SLAVES) {
      // The 3-bit AM_ADDR is exhausted (0 = broadcast, 1..7 = slaves).
      this.pendingJoin = d;
      d.wantsIn = true;
      this.ctx.audio.back();
      this.shake.kick(5);
      this.showBanner('Piconet full!', 'AM_ADDR has only 3 bits → 7 active slaves. Tap an active slave to PARK it.', 'var(--yellow)', true);
      return;
    }
    d.wantsIn = false;
    d.state = 'queued';
    this.pico.setPhase(d.g.id, 'page');
    this.queue.push(d);
    this.ctx.audio.click();
  }

  private park(d: Dev): void {
    const wasFull = this.activeCount() >= MAX_ACTIVE_SLAVES;
    const r = this.pico.park(d.g.id);
    if (!r.ok) return;
    d.state = 'parked';
    this.ctx.audio.toggle(false);
    this.floats.spawn(`PM_ADDR ${pmHex(r.pmAddr)}`, d.x, d.y - 44, C.dim, 13);
    if (this.pendingJoin && wasFull) {
      this.parkedCorrectly = true;
      const p = this.pendingJoin;
      this.pendingJoin = null;
      this.showBanner('Parked!', `${d.g.name} gave up its AM_ADDR and holds PM_ADDR ${pmHex(r.pmAddr)}. ${p.g.name} can join.`, 'var(--green)');
      this.requestPage(p);
    } else {
      this.showBanner('Parked', `${d.g.name}: AM_ADDR freed, PM_ADDR ${pmHex(r.pmAddr)}. Tap it to unpark.`, 'var(--text-dim)');
    }
    this.updateHud();
  }

  private unpark(d: Dev): void {
    if (this.reservedCount() >= MAX_ACTIVE_SLAVES) {
      this.showBanner('No free AM_ADDR', 'All 7 active slots are taken — park another slave first.', 'var(--yellow)');
      this.ctx.audio.back();
      return;
    }
    const r = this.pico.unpark(d.g.id);
    if (!r.ok) return;
    d.state = 'active';
    this.ctx.audio.toggle(true);
    this.floats.spawn(`AM_ADDR ${amBits(r.amAddr)}`, d.x, d.y - 44, C.cyan, 13);
    this.onMembershipChange();
  }

  private makeBridge(d: Dev): void {
    if (this.bridge) return;
    this.picoB.addDevice(d.g.id, d.g.name, d.addr);
    const rb = this.picoB.connect(d.g.id);
    if (!rb.ok) return;
    const b: Bridge = { deviceId: d.g.id, piconets: ['A', 'B'], role: 'slave-slave', dwellSlots: BRIDGE_DWELL };
    if (!this.net.addBridge(b).ok) return;
    this.bridge = b;
    d.state = 'bridge';
    this.ctx.audio.success();
    this.particles.burst(d.x, d.y, C.orange, 18, 0.22);
    this.showBanner('Scatternet!', `${d.g.name} is now a slave in both piconets, switching every ${BRIDGE_DWELL} slots (${(BRIDGE_DWELL * SLOT_S * 1000).toFixed(0)} ms).`, 'var(--orange)');
    this.updateHud();
  }

  // ── Pause / keys ────────────────────────────────────────────────────

  private pause(): void {
    if (!this.running || this.ended || this.paused) return;
    this.paused = true;
    this.els.pauseBtn.querySelector('span')!.textContent = 'Resume';
    this.pauseUi = showPause(this.dom, {
      info: `t = ${this.simTime.toFixed(2)} s simulated`,
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onQuit: () => this.ctx.navigate('/levels'),
    });
  }

  private resume(): void {
    this.pauseUi?.close();
    this.pauseUi = null;
    this.paused = false;
    this.els.pauseBtn.querySelector('span')!.textContent = 'Pause';
  }

  override onKey(e: KeyboardEvent): boolean {
    if (this.overlay?.onKey(e)) return true;
    if (this.ended) return false;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (!this.running) return false;
      if (this.paused) this.resume();
      else this.pause();
      return true;
    }
    if (k === 'p' || (e.key === ' ' && !(e.target instanceof HTMLButtonElement))) {
      e.preventDefault();
      if (this.paused) this.resume();
      else this.pause();
      return true;
    }
    if (k === 'r') {
      this.restart();
      return true;
    }
    if (k === 'i') {
      this.startInquiry();
      return true;
    }
    return false;
  }

  // ── End ─────────────────────────────────────────────────────────────

  private finish(): void {
    if (this.ended || !this.running) return;
    this.ended = true;
    this.running = false;
    const result = { maxActive: this.maxActive, parkedCorrectly: this.parkedCorrectly, scatternet: this.bridge !== null, timeTo7S: this.timeTo7 };
    const sc = scoreLevel1(result);
    const newBest = recordResult(1, sc.total, sc.stars);
    const badges: BadgeInfo[] = [];
    if (this.maxActive >= MAX_ACTIVE_SLAVES) {
      unlockBadge('harald');
      badges.push(BADGES.harald!);
    }
    const avg = this.setupTimes.length ? this.setupTimes.reduce((a, b) => a + b, 0) / this.setupTimes.length : null;
    this.ctx.audio.success();

    this.overlay = showEndCard(this.dom, {
      title: 'Assemble the Piconet',
      subtitle: sc.stars === 3 ? 'Scatternet built' : 'Level complete',
      stars: sc.stars,
      score: sc.total,
      newBest,
      stats: [
        ['Most active slaves', `${this.maxActive} / 7  (+${sc.slaves})`],
        ['Correct parking', this.parkedCorrectly ? `yes  (+${sc.park})` : 'no'],
        ['Scatternet bridge', this.bridge ? `yes  (+${sc.bonus})` : 'no'],
        ['Time to 7 slaves', this.timeTo7 === null ? '—' : `${this.timeTo7.toFixed(2)} s  (+${sc.speed})`],
        ['Avg page time', avg === null ? '—' : `${avg.toFixed(2)} s (model mean ${SETUP_MEAN_S} s)`],
        ['Ideal time to 7', `${IDEAL_TIME_TO_7_S.toFixed(2)} s`],
      ],
      badges,
      learned: [
        'A piconet is one master plus up to 7 active slaves. Each active slave has a 3-bit Active Member Address (AM_ADDR 001–111; 000 is broadcast).',
        'More devices can stay synchronised but parked: they give up the AM_ADDR and hold an 8-bit Parked Member Address (up to 255 parked).',
        'Setup is inquiry (find who is around) then page (connect to one). The model here averages 0.64 s and never exceeds 2.56 s.',
        'The master’s 48-bit device address chooses the hop pattern and its clock chooses the phase — paging teaches the slave both, so it hops in lock-step.',
        'A scatternet links piconets through a bridge device that belongs to both (here a slave in each) and time-shares between their hop patterns.',
      ],
      actions: [
        { label: 'Play again', onClick: () => this.restart() },
        { label: 'Next: Hop or Drop', primary: true, onClick: () => this.ctx.navigate('/level/2') },
        { label: 'Level select', onClick: () => this.ctx.navigate('/levels') },
      ],
    });
  }

  // ── DOM / HUD ───────────────────────────────────────────────────────

  private buildDom(): void {
    const stat = (label: string, color = 'var(--cyan)') => {
      const value = h('span', { class: 'stat__value' }, '—');
      const el = h('div', { class: 'stat', style: `--c:${color}` }, h('span', { class: 'stat__label' }, label), value);
      return { el, value };
    };
    const active = stat('Active slaves');
    const parked = stat('Parked', 'var(--text-dim)');
    const setup = stat('Avg page time', 'var(--yellow)');
    const phase = stat('Master state', 'var(--magenta)');
    const clock = h('span', { class: 'hud__clock' }, '');
    const back = button('', { icon: icons.back, className: 'btn--icon btn--small btn--ghost', ariaLabel: 'Back to level select', onClick: () => this.ctx.navigate('/levels') });
    const objectives = h('ul', { class: 'objectives' });
    const lab = h('div', { class: 'lab-box' });
    const hud = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud__title' }, back, h('h2', {}, 'Level 1 · Assemble the Piconet'), clock),
      h('div', { class: 'hud__stats' }, active.el, parked.el, setup.el, phase.el),
      objectives,
      lab,
    );

    const inquiry = button('Inquiry', { className: 'btn--primary', title: 'Discover nearby devices (I)', onClick: () => this.startInquiry() });
    const pauseBtn = button('Pause', { className: 'btn--small', onClick: () => (this.paused ? this.resume() : this.pause()) });
    const restartBtn = button('Restart', { className: 'btn--small btn--ghost', onClick: () => this.restart() });
    const finish = button('Finish', { className: 'btn--small', onClick: () => this.finish() });
    const controls = h('div', { class: 'controls' }, inquiry, pauseBtn, restartBtn, finish);
    const banner = h('div', { class: 'banner banner--top', 'aria-live': 'polite' });
    this.dom.append(hud, controls, banner);
    this.els = {
      hud,
      controls,
      clock,
      banner,
      stats: { active: active.value, parked: parked.value, setup: setup.value, phase: phase.value },
      objectives,
      lab,
      inquiry,
      finish,
      pauseBtn,
    };
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(hud);
    this.ro.observe(controls);
  }

  private showBanner(title: string, detail: string, color: string, sticky = false): void {
    const b = this.els.banner;
    b.style.setProperty('--c', color);
    b.replaceChildren(h('b', {}, title), h('span', {}, detail));
    b.classList.add('banner--on');
    clearTimeout(this.bannerTimer);
    if (!sticky) this.bannerTimer = setTimeout(() => b.classList.remove('banner--on'), 2800);
  }

  private updateHud(): void {
    if (!this.els) return;
    const n = this.activeCount();
    const p = this.pico.parked().length;
    const avg = this.setupTimes.length ? this.setupTimes.reduce((a, b) => a + b, 0) / this.setupTimes.length : null;
    this.els.clock.textContent = `t = ${this.simTime.toFixed(2)} s · ½× slow-mo`;
    this.els.stats.active.textContent = `${n} / 7`;
    this.els.stats.parked.textContent = String(p);
    this.els.stats.setup.textContent = avg === null ? '—' : `${avg.toFixed(2)} s`;
    this.els.stats.phase.textContent = this.inquiryActive ? 'INQUIRY' : this.paging ? 'PAGE' : n ? 'CONNECTED' : 'STANDBY';
    this.els.stats.active.parentElement!.classList.toggle('stat--full', n === MAX_ACTIVE_SLAVES);

    const obj = [
      [this.inquiryDone || this.inquiryActive, 'Run an inquiry'],
      [this.maxActive >= MAX_ACTIVE_SLAVES, `Page devices in (${this.maxActive}/7)`],
      [this.parkedCorrectly, 'Park one so an 8th can join'],
      [this.bridge !== null, 'Bonus: bridge into piconet B'],
    ] as const;
    this.els.objectives.replaceChildren(
      ...obj.map(([done, text]) => h('li', { class: done ? 'done' : '' }, h('span', { class: 'tick' }, done ? '✓' : '○'), text)),
    );

    if (this.ctx.settings.get().labMode) {
      const rows = this.devs
        .filter((d) => d.state === 'active' || d.state === 'parked' || d.state === 'bridge')
        .map((d) => {
          const dev = this.pico.get(d.g.id)!;
          const addr = dev.amAddr !== null ? `AM_ADDR ${amBits(dev.amAddr)}` : `PM_ADDR 0x${pmHex(dev.pmAddr ?? 0)}`;
          return `  ${addr.padEnd(16)} ${d.g.name.padEnd(14)} ${formatBdAddr(d.addr)}  ${dev.state}${d.state === 'bridge' ? ' + slave in B' : ''}`;
        });
      this.els.lab.textContent = [
        `master BD_ADDR ${formatBdAddr(this.pico.masterAddress)}  ·  CLK offset ${this.pico.hop.clockOffset}  ·  hop seed 0x${this.pico.hop.seed.toString(16)}`,
        `hop pattern = f(master BD_ADDR, master CLK)  ·  slot ${Math.floor(this.simTime / SLOT_S)}  ·  current f = ${channelFreqMHz(this.pico.hop.channelAt(Math.floor(this.simTime / SLOT_S)))} MHz`,
        `setup model: T = ${SETUP_MAX_S} s × Beta(1,3) → mean ${SETUP_MEAN_S} s, max ${SETUP_MAX_S} s  ·  samples: ${this.setupTimes.map((t) => t.toFixed(2)).join(', ') || '—'}`,
        ...rows,
      ].join('\n');
    }
  }
}
