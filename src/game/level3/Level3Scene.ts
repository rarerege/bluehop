import { Container, Graphics } from 'pixi.js';
import { Scene } from '../../app/Scene';
import type { BackdropMode } from '../Backdrop';
import { BADGES, recordResult, unlockBadge, type BadgeInfo } from '../../app/progress';
import { addLeaderEntry, lastNickname, loadLeaderboard, rememberNickname } from '../../app/leaderboard';
import { ACCESS_CODE_BITS, HEADER_BITS, SLOT_S, SLOT_US } from '../../sim/constants';
import { pHeaderReceived, pPayload } from '../../sim/channel';
import { analyticGoodputBps, type LinkSimulator, type Transmission } from '../../sim/link';
import { ACL_TYPES, maxRateBps, PACKETS, payloadAirBits, type AclType } from '../../sim/packets';
import { button, h } from '../../ui/dom';
import { icons } from '../../ui/icons';
import { showEndCard, showPause, showTutorial, type OverlayHandle } from '../../ui/overlays';
import { REDLINE_KBPS, Speedometer } from './Speedometer';
import { Timeline } from './Timeline';
import { LEVEL3_TUTORIAL } from './tutorial';
import { createLevel3Sim, forecast, SONG_BITS, starsForTime, STAR_TIMES, WEATHER, weatherAt, type WeatherKind } from './weather';

/**
 * Level 3 — "Gear Shift": stream a 1 MB song to the headset as fast as possible.
 * The player picks the ACL packet type (DM1…DH5) while the noise weather
 * changes the BER. Every packet's fate comes from the engine's error model and
 * failed packets are retransmitted (ARQ), costing slots.
 */

/** Throughput window: 480 slots = 300 ms (a multiple of 2, 4 and 6 slots). */
const WINDOW_SLOTS = 480;
const SPEEDS = [1, 0.5, 0.25] as const;

/** Weather visuals: rain for drizzle, rain + static for storms, flashes for lightning. */
class WeatherFx {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly flashG = new Graphics();
  private drops: { x: number; y: number; v: number; len: number }[] = [];
  private flash = 0;
  private nextFlash = 600;

  constructor() {
    this.root.addChild(this.g, this.flashG);
  }

  update(dtMs: number, kind: WeatherKind, x: number, y: number, w: number, hgt: number, reduced: boolean): void {
    const g = this.g;
    g.clear();
    const target = kind === 'clear' ? 0 : kind === 'drizzle' ? 60 : 140;
    const want = reduced ? Math.floor(target / 3) : target;
    while (this.drops.length < want) this.drops.push({ x: x + Math.random() * w, y: y + Math.random() * hgt, v: 0.5 + Math.random() * 0.7, len: 8 + Math.random() * 14 });
    if (this.drops.length > want) this.drops.length = want;
    const slant = kind === 'drizzle' ? 0.15 : 0.35;
    for (const d of this.drops) {
      d.y += d.v * dtMs * (kind === 'drizzle' ? 0.6 : 1.1);
      d.x += d.v * dtMs * slant * 0.5;
      if (d.y > y + hgt) {
        d.y = y - d.len;
        d.x = x + Math.random() * w;
      }
      if (d.x > x + w) d.x = x;
      g.moveTo(d.x, d.y).lineTo(d.x - d.len * slant, d.y - d.len).stroke({ width: 1.2, color: 0x00e5ff, alpha: 0.28 });
    }
    if (kind === 'storm' || kind === 'lightning') {
      const n = reduced ? 10 : 45;
      for (let i = 0; i < n; i++) g.rect(x + Math.random() * w, y + Math.random() * hgt, 1 + Math.random() * 3, 1 + Math.random() * 2).fill({ color: 0xffffff, alpha: 0.12 + Math.random() * 0.25 });
      if (!reduced && Math.random() < 0.3) {
        const gy = y + Math.random() * hgt;
        g.rect(x, gy, w, 1 + Math.random() * 2).fill({ color: 0xff2bd6, alpha: 0.18 });
      }
    }
    // Lightning flashes
    const fg = this.flashG;
    fg.clear();
    if (kind === 'lightning' && !reduced) {
      this.nextFlash -= dtMs;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = 500 + Math.random() * 900;
      }
    }
    if (this.flash > 0) {
      fg.rect(x, y, w, hgt).fill({ color: 0xffffff, alpha: this.flash * 0.22 });
      this.flash = Math.max(0, this.flash - dtMs / 160);
    }
  }
}

export class Level3Scene extends Scene {
  override readonly backdrop: BackdropMode = 'none';

  private sim!: LinkSimulator;
  private gear: AclType = 'DH1';
  private speedIdx = 0;
  private targetSlot = 0;
  private history: Transmission[] = [];
  private win: { end: number; bits: number; failed: boolean }[] = [];
  private running = false;
  private paused = false;
  private done = false;
  private finishS = 0;
  private c = { fwdSent: 0, fwdFailed: 0, retx: 0, shifts: 0 };
  private gearTime: Record<AclType, number> = { DM1: 0, DH1: 0, DM3: 0, DH3: 0, DM5: 0, DH5: 0 };
  private redline = false;
  private lastWeather: WeatherKind = 'clear';
  private lastErrSfx = 0;
  private hudTimer = 0;

  private readonly weatherFx = new WeatherFx();
  private readonly speedo = new Speedometer();
  private readonly timeline = new Timeline(24);

  private overlay: OverlayHandle | null = null;
  private pauseUi: OverlayHandle | null = null;
  private els!: {
    hud: HTMLElement;
    controls: HTMLElement;
    clock: HTMLElement;
    banner: HTMLElement;
    info: HTMLElement;
    stats: Record<'song' | 'avg' | 'retx' | 'err' | 'shifts', HTMLElement>;
    weatherName: HTMLElement;
    weatherBer: HTMLElement;
    forecast: HTMLElement;
    progress: HTMLElement;
    lab: HTMLElement;
    gears: Map<AclType, HTMLButtonElement>;
    pauseBtn: HTMLButtonElement;
    speedBtn: HTMLButtonElement;
  };
  private area = { x: 0, y: 0, w: 1, h: 1 };
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  private infoTimer: ReturnType<typeof setTimeout> | undefined;
  private ro: ResizeObserver | null = null;

  constructor() {
    super();
    this.root.addChild(this.weatherFx.root, this.speedo.root, this.timeline.root);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  protected enter(): void {
    this.buildDom();
    this.reset();
    this.overlay = showTutorial(this.dom, LEVEL3_TUTORIAL, () => {
      this.overlay = null;
      this.running = true;
    });
  }

  override destroy(): void {
    clearTimeout(this.bannerTimer);
    clearTimeout(this.infoTimer);
    this.ro?.disconnect();
    super.destroy();
  }

  private reset(): void {
    this.gear = 'DH1';
    this.sim = createLevel3Sim(this.gear);
    this.targetSlot = 0;
    this.history = [];
    this.win = [];
    this.done = false;
    this.paused = false;
    this.finishS = 0;
    this.c = { fwdSent: 0, fwdFailed: 0, retx: 0, shifts: 0 };
    this.gearTime = { DM1: 0, DH1: 0, DM3: 0, DH3: 0, DM5: 0, DH5: 0 };
    this.redline = false;
    this.lastWeather = 'clear';
    this.els.info.classList.remove('info-card--on');
    this.syncGears();
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
    if (this.running && !this.done) this.pause();
  }

  // ── Simulation pump ─────────────────────────────────────────────────

  override update(dtMs: number): void {
    if (this.running && !this.paused && !this.done) {
      this.targetSlot += (dtMs / 1000) * 1600 * SPEEDS[this.speedIdx]!;
      while (this.sim.slot < this.targetSlot && !this.done) this.step();
    }
    const tS = this.sim.slot * SLOT_S;
    const w = weatherAt(tS);
    if (w.kind !== this.lastWeather && this.running) {
      this.lastWeather = w.kind;
      this.showBanner(w.label, `BER ${w.ber.toExponential(0)} — consider a different gear`, w.color);
    }

    const reduced = this.ctx.settings.get().reducedMotion;
    this.weatherFx.update(dtMs, w.kind, this.area.x, this.area.y, this.area.w, this.area.h, reduced);
    this.speedo.update(dtMs, {
      kbps: this.windowKbps(),
      gear: this.gear,
      gearMaxKbps: maxRateBps(this.gear, 'NULL') / 1000,
      expectedKbps: this.ctx.settings.get().labMode ? analyticGoodputBps(this.gear, 'NULL', w.ber) / 1000 : null,
      redline: this.redline,
    });
    this.timeline.draw(this.history, this.sim.slot);

    this.hudTimer += dtMs;
    if (this.hudTimer > 120) {
      this.hudTimer = 0;
      this.updateHud();
    }
  }

  private step(): void {
    const sim = this.sim;
    sim.aclType = this.gear;
    const before = sim.slot;
    const txs = sim.next();
    const slots = sim.slot - before;
    this.gearTime[this.gear] += slots * SLOT_S;

    let bits = 0;
    let failed = false;
    for (const t of txs) {
      this.history.push(t);
      if (t.from === 'master') {
        this.c.fwdSent++;
        if (t.retransmission) this.c.retx++;
        if (t.outcome !== 'ok') {
          this.c.fwdFailed++;
          failed = true;
        }
        bits += t.deliveredBits;
      }
    }
    if (this.history.length > 80) this.history.splice(0, this.history.length - 80);
    this.win.push({ end: sim.slot, bits, failed });
    while (this.win.length && this.win[0]!.end <= sim.slot - WINDOW_SLOTS) this.win.shift();

    if (failed) {
      const now = performance.now();
      if (now - this.lastErrSfx > 140) {
        this.lastErrSfx = now;
        this.ctx.audio.crackle();
      }
    }

    // Redline: a full 300 ms window at the DH5 maximum.
    if (!this.redline && sim.slot >= WINDOW_SLOTS && this.windowKbps() >= REDLINE_KBPS * 0.995) {
      this.redline = true;
      this.ctx.audio.success();
      this.showRedlineCard();
    }

    if (sim.stats.deliveredFwdBits >= SONG_BITS) {
      this.done = true;
      this.finishS = sim.slot * SLOT_S;
      this.finish();
    }
  }

  private windowKbps(): number {
    const span = Math.min(WINDOW_SLOTS, Math.max(1, this.sim.slot));
    let bits = 0;
    for (const e of this.win) bits += e.bits;
    return bits / (span * SLOT_S) / 1000;
  }

  // ── Gears ───────────────────────────────────────────────────────────

  private shift(g: AclType): void {
    if (g === this.gear || this.done) return;
    this.gear = g;
    if (this.running) this.c.shifts++;
    this.ctx.audio.toggle(true);
    this.syncGears();
  }

  private syncGears(): void {
    for (const [t, b] of this.els.gears) {
      b.classList.toggle('gear--on', t === this.gear);
      b.setAttribute('aria-pressed', String(t === this.gear));
    }
  }

  // ── Pause / keys ────────────────────────────────────────────────────

  private pause(): void {
    if (!this.running || this.done || this.paused) return;
    this.paused = true;
    this.els.pauseBtn.querySelector('span')!.textContent = 'Resume';
    this.pauseUi = showPause(this.dom, {
      info: `t = ${(this.sim.slot * SLOT_S).toFixed(3)} s · ${((this.sim.stats.deliveredFwdBits / SONG_BITS) * 100).toFixed(1)} % sent`,
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
    if (this.done) return false;
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
    const n = Number(e.key);
    if (n >= 1 && n <= 6) {
      this.shift(ACL_TYPES[n - 1]!);
      return true;
    }
    return false;
  }

  // ── End ─────────────────────────────────────────────────────────────

  private finish(): void {
    this.running = false;
    const t = this.finishS;
    const stars = starsForTime(t);
    const points = Math.round(100_000 / t);
    const newBest = recordResult(3, points, stars);
    const badges: BadgeInfo[] = [];
    if (this.redline) {
      unlockBadge('redline');
      badges.push(BADGES.redline!);
    }
    this.ctx.audio.success();
    const errPct = this.c.fwdSent ? (this.c.fwdFailed / this.c.fwdSent) * 100 : 0;
    const topGears = ACL_TYPES.filter((g) => this.gearTime[g] > 0.05)
      .sort((a, b) => this.gearTime[b] - this.gearTime[a])
      .slice(0, 3)
      .map((g) => `${g} ${this.gearTime[g].toFixed(1)} s`)
      .join(' · ');

    this.overlay = showEndCard(this.dom, {
      title: 'Gear Shift',
      subtitle: 'Song delivered',
      stars,
      score: points,
      scoreText: `${t.toFixed(2)} s`,
      scoreUnit: ` simulated · ${points} points`,
      newBest,
      stats: [
        ['Average goodput', `${(SONG_BITS / t / 1000).toFixed(1)} kbit/s`],
        ['Retransmissions', String(this.c.retx)],
        ['Packet errors', `${errPct.toFixed(1)} %`],
        ['Gear shifts', String(this.c.shifts)],
        ['Time per gear', topGears || '—'],
        ['Stars at', `≤ ${STAR_TIMES.three} s ★★★ · ≤ ${STAR_TIMES.two} s ★★`],
      ],
      badges,
      extra: this.leaderboardForm(t),
      learned: [
        `A packet is access code (${ACCESS_CODE_BITS} bits) + header (${HEADER_BITS} bits: 18 bits × 1/3 FEC) + payload (0–2745 bits). DH5 carries 339 bytes = ${payloadAirBits(PACKETS.DH5)} payload bits on air.`,
        'DM packets protect the payload with 2/3 FEC (Hamming 15,10: fixes 1 error per 15 bits) but carry less; DH packets carry more but any bit error kills them. Noisy channel → DM, clean channel → DH.',
        'ACL uses ARQ: the headset answers with ARQN = ACK/NAK; a NAKed or unanswered packet is sent again, costing its slots. That is why the wrong gear in a storm is slower than a "smaller" packet.',
        'DH5 forward + 1-slot return: 339 × 8 bits / (6 × 625 µs) = 723.2 kbit/s, and 27 × 8 / (6 × 625 µs) = 57.6 kbit/s back with DH1. DH5 both ways: 339 × 8 / (10 × 625 µs) = 433.9 kbit/s each.',
        `Even perfect play can’t beat physics: 8 Mbit at 723.2 kbit/s takes ${(SONG_BITS / 723_200).toFixed(2)} s.`,
      ],
      actions: [
        { label: 'Play again', onClick: () => this.restart() },
        { label: 'Lab Mode', primary: true, onClick: () => this.ctx.navigate('/lab') },
        { label: 'Level select', onClick: () => this.ctx.navigate('/levels') },
      ],
    });
  }

  private leaderboardForm(t: number): HTMLElement {
    const input = h('input', { type: 'text', maxlength: 16, placeholder: 'Nickname', 'aria-label': 'Nickname', class: 'nick' });
    input.value = lastNickname();
    const list = h('ol', { class: 'board' });
    const save = button('Save time', { className: 'btn--small btn--primary' });
    const form = h('form', { class: 'nick-form' }, input, save);
    const renderList = (highlight: number | null) => {
      const top = loadLeaderboard().slice(0, 5);
      list.replaceChildren(
        ...top.map((e, i) => h('li', { class: i + 1 === highlight ? 'me' : '' }, h('span', {}, e.name), h('span', { class: 'mono' }, `${e.timeS.toFixed(2)} s`))),
      );
      if (top.length === 0) list.append(h('li', { class: 'dim' }, 'No times yet on this device'));
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = addLeaderEntry(input.value, t);
      rememberNickname(r.entry.name);
      form.replaceChildren(h('span', { class: 'dim' }, `Saved as ${r.entry.name} — rank #${r.rank} on this device`));
      renderList(r.rank);
      this.ctx.audio.confirm();
    });
    save.type = 'submit';
    renderList(null);
    return h('section', { class: 'end__board' }, h('h3', {}, 'Leaderboard (this device)'), form, list);
  }

  // ── DOM ─────────────────────────────────────────────────────────────

  private buildDom(): void {
    const stat = (label: string, color = 'var(--cyan)') => {
      const value = h('span', { class: 'stat__value' }, '—');
      const el = h('div', { class: 'stat', style: `--c:${color}` }, h('span', { class: 'stat__label' }, label), value);
      return { el, value };
    };
    const song = stat('Song sent');
    const avg = stat('Average', 'var(--green)');
    const retx = stat('Retransmits', 'var(--magenta)');
    const err = stat('Errors (300 ms)', 'var(--red)');
    const shifts = stat('Shifts', 'var(--yellow)');
    const clock = h('span', { class: 'hud__clock' }, '');
    const back = button('', { icon: icons.back, className: 'btn--icon btn--small btn--ghost', ariaLabel: 'Back to level select', onClick: () => this.ctx.navigate('/levels') });
    const weatherName = h('b', {}, '');
    const weatherBer = h('span', { class: 'mono' }, '');
    const fc = h('div', { class: 'forecast', 'aria-label': 'Weather forecast, next 6 seconds' });
    const progress = h('div', { class: 'song__fill' });
    const lab = h('div', { class: 'lab-box' });

    const hud = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud__title' }, back, h('h2', {}, 'Level 3 · Gear Shift'), clock),
      h('div', { class: 'hud__stats' }, song.el, avg.el, retx.el, err.el, shifts.el),
      h(
        'div',
        { class: 'weather' },
        h('div', { class: 'weather__now' }, h('span', { class: 'dim' }, 'Weather'), weatherName, weatherBer),
        h('div', { class: 'weather__fc' }, h('span', { class: 'dim' }, 'next 6 s'), fc),
      ),
      h('div', { class: 'song' }, h('span', { class: 'mono dim' }, 'song.mp3 · 1 MB → Headset'), h('div', { class: 'song__bar' }, progress)),
      lab,
    );

    const gears = new Map<AclType, HTMLButtonElement>();
    const gearBtn = (t: AclType, key: number) => {
      const p = PACKETS[t];
      const b = h(
        'button',
        { type: 'button', class: `gear gear--${t.slice(0, 2).toLowerCase()}`, title: `${t}: ${p.payloadBytes} bytes, ${p.slots} slot${p.slots > 1 ? 's' : ''}, FEC ${p.fec} (key ${key})` },
        h('span', { class: 'gear__key' }, String(key)),
        h('b', {}, t),
        h('small', {}, `${p.payloadBytes} B · ${p.slots} slot${p.slots > 1 ? 's' : ''}`),
      );
      b.addEventListener('click', () => this.shift(t));
      gears.set(t, b);
      return b;
    };
    // H-pattern: top row DM (2/3 FEC), bottom row DH (no FEC); columns = 1, 3, 5 slots.
    const gearbox = h(
      'div',
      { class: 'gearbox', role: 'group', 'aria-label': 'Packet type gears' },
      h('span', { class: 'gearbox__row-label' }, 'DM · FEC 2/3'),
      gearBtn('DM1', 1),
      gearBtn('DM3', 3),
      gearBtn('DM5', 5),
      h('span', { class: 'gearbox__row-label' }, 'DH · no FEC'),
      gearBtn('DH1', 2),
      gearBtn('DH3', 4),
      gearBtn('DH5', 6),
    );

    const pauseBtn = button('Pause', { className: 'btn--small', onClick: () => (this.paused ? this.resume() : this.pause()) });
    const restartBtn = button('Restart', { className: 'btn--small btn--ghost', onClick: () => this.restart() });
    const speedBtn = button('Speed 1×', {
      className: 'btn--small btn--ghost',
      title: 'Real-time, ½× or ¼× simulated time',
      onClick: () => {
        this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
        speedBtn.querySelector('span')!.textContent = `Speed ${['1×', '½×', '¼×'][this.speedIdx]}`;
        this.ctx.audio.click();
      },
    });
    const controls = h('div', { class: 'controls controls--l3' }, gearbox, h('div', { class: 'controls__side' }, pauseBtn, restartBtn, speedBtn));

    const banner = h('div', { class: 'banner banner--free', 'aria-live': 'polite' });
    const info = h('div', { class: 'info-card panel', role: 'status' });

    this.dom.append(hud, controls, banner, info);
    this.els = {
      hud,
      controls,
      clock,
      banner,
      info,
      stats: { song: song.value, avg: avg.value, retx: retx.value, err: err.value, shifts: shifts.value },
      weatherName,
      weatherBer,
      forecast: fc,
      progress,
      lab,
      gears,
      pauseBtn,
      speedBtn,
    };
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(hud);
    this.ro.observe(controls);
  }

  override resize(): void {
    this.layout();
  }

  private layout(): void {
    if (!this.els) return;
    const { width } = this.ctx.app.screen;
    const top = this.els.hud.getBoundingClientRect().bottom + 8;
    const bottom = this.els.controls.getBoundingClientRect().top - 8;
    const gut = Math.max(16, width * 0.024);
    const w = width - gut * 2;
    const hgt = Math.max(180, bottom - top);
    this.area = { x: gut, y: top, w, h: hgt };
    const tlH = Math.min(130, Math.max(84, hgt * 0.28));
    const tlW = Math.min(w, 980);
    this.timeline.layout(gut + (w - tlW) / 2, top + hgt - tlH, tlW, tlH - 6);
    const speedoH = hgt - tlH - 10;
    const r = Math.max(60, Math.min(w * 0.32, speedoH * 0.5));
    this.speedo.layout(gut + w / 2, top + speedoH / 2 + r * 0.08, r);
    this.els.banner.style.top = `${top + 10}px`;
    this.els.info.style.top = `${top + 10}px`;
  }

  private showBanner(title: string, detail: string, color: string): void {
    const b = this.els.banner;
    b.style.setProperty('--c', color);
    b.replaceChildren(h('b', {}, title), h('span', {}, detail));
    b.classList.add('banner--on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('banner--on'), 2200);
  }

  private showRedlineCard(): void {
    const el = this.els.info;
    const close = button('', { icon: icons.close, className: 'btn--icon btn--small btn--ghost', ariaLabel: 'Close' });
    close.addEventListener('click', () => el.classList.remove('info-card--on'));
    el.replaceChildren(
      h('div', { class: 'info-card__head' }, h('b', {}, 'REDLINE · 723.2 kbit/s'), close),
      h('div', { class: 'formula' }, '339 bytes × 8 = 2712 bits per DH5'),
      h('div', { class: 'formula' }, 'DH5 (5 slots) + ACK (1 slot) = 6 × 625 µs = 3.75 ms'),
      h('div', { class: 'formula formula--big' }, '2712 bits / 3.75 ms = 723.2 kbit/s'),
      h('p', { class: 'dim' }, 'That is the Basic Rate ceiling for one direction. Badge unlocked: Redline.'),
    );
    el.classList.add('info-card--on');
    clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => el.classList.remove('info-card--on'), 9000);
  }

  private updateHud(): void {
    if (!this.els) return;
    const sim = this.sim;
    const tS = sim.slot * SLOT_S;
    const sent = sim.stats.deliveredFwdBits;
    const pct = Math.min(100, (sent / SONG_BITS) * 100);
    const winSent = this.win.length;
    const winFail = this.win.filter((e) => e.failed).length;
    const w = weatherAt(tS);

    this.els.clock.textContent = `t = ${tS.toFixed(3)} s · speed ${['1×', '½×', '¼×'][this.speedIdx]}`;
    this.els.stats.song.textContent = `${pct.toFixed(1)} %`;
    this.els.stats.avg.textContent = tS > 0 ? `${(sent / tS / 1000).toFixed(0)} kbit/s` : '—';
    this.els.stats.retx.textContent = String(this.c.retx);
    this.els.stats.err.textContent = winSent ? `${((winFail / winSent) * 100).toFixed(0)} %` : '0 %';
    this.els.stats.shifts.textContent = String(this.c.shifts);
    this.els.progress.style.width = `${pct}%`;
    this.els.weatherName.textContent = w.label;
    this.els.weatherName.style.color = w.color;
    this.els.weatherBer.textContent = `BER ${w.ber.toExponential(0)}`;

    const fc = forecast(tS, 6);
    this.els.forecast.replaceChildren(
      ...fc.map((s) => {
        const seg = h('span', { title: `${WEATHER[s.kind].label} (BER ${WEATHER[s.kind].ber.toExponential(0)})` });
        seg.style.flexGrow = String(s.to - s.from);
        seg.style.background = WEATHER[s.kind].color;
        seg.textContent = s.to - s.from > 0.9 ? WEATHER[s.kind].label : '';
        return seg;
      }),
    );

    if (this.ctx.settings.get().labMode) {
      const spec = PACKETS[this.gear];
      const pH = pHeaderReceived(w.ber);
      const pP = pPayload(spec, w.ber);
      this.els.lab.textContent = [
        `slot ${sim.slot}  ·  t = ${(sim.slot * SLOT_US).toFixed(0)} µs  ·  BER ${w.ber.toExponential(1)} (${w.label})`,
        `${this.gear}: ${ACCESS_CODE_BITS} + ${HEADER_BITS} + ${payloadAirBits(spec)} payload bits (${spec.payloadBytes} B user, FEC ${spec.fec}), ${spec.slots} slot${spec.slots > 1 ? 's' : ''} + 1-slot NULL ACK`,
        `P(header ok) = ${pH.toFixed(4)}  ·  P(payload ok) = ${pP.toFixed(4)}  ·  expected ${(analyticGoodputBps(this.gear, 'NULL', w.ber) / 1000).toFixed(1)} kbit/s (green marker)`,
        `ceiling ${(maxRateBps(this.gear, 'NULL') / 1000).toFixed(1)} kbit/s (yellow marker)  ·  window ${WINDOW_SLOTS} slots = ${(WINDOW_SLOTS * SLOT_S * 1000).toFixed(0)} ms`,
      ].join('\n');
    }
  }
}
