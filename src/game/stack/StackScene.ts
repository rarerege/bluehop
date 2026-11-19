import { Scene } from '../../app/Scene';
import type { BackdropMode } from '../Backdrop';
import { BADGES, recordResult, unlockBadge, type BadgeInfo } from '../../app/progress';
import { button, h } from '../../ui/dom';
import { icons } from '../../ui/icons';
import { showEndCard, showTutorial, type OverlayHandle } from '../../ui/overlays';
import {
  BINS,
  CARDS,
  isHost,
  L2CAP_HEADER_BYTES,
  LAYERS,
  MESSAGES,
  QUIZ,
  scoreStack,
  segment,
  tryPlace,
  type AppCard,
  type LayerId,
} from './model';
import { STACK_TUTORIAL } from './tutorial';

/**
 * Level 2 — "Stack Builder".
 *
 * Part 1: for each application card, build its protocol tower bottom-up by
 * tapping (or dragging) layer blocks; then watch a packet go down your tower
 * (gaining headers), across the radio, and up the other device's tower.
 * Part 2: the L2CAP "post office" — sort messages into channel IDs
 * (multiplexing), then three questions on segmentation / reassembly.
 *
 * Pure DOM: the content is text-heavy, so crisp HTML beats canvas here.
 */

type Phase = 'build' | 'send' | 'sent' | 'sort' | 'quiz' | 'done';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class StackScene extends Scene {
  override readonly backdrop: BackdropMode = 'none';

  private cardIdx = 0;
  private placed = 0;
  private phase: Phase = 'build';
  private mistakes = 0;
  private cardMistakes = 0;
  private sortIdx = 0;
  private sortCorrect = 0;
  private quizIdx = 0;
  private quizCorrect = 0;
  private answered = false;
  private alive = true;

  private overlay: OverlayHandle | null = null;
  private main!: HTMLElement;
  private progress!: HTMLElement;
  private scoreEl!: HTMLElement;
  private lab!: HTMLElement;
  private drag: { layer: LayerId; ghost: HTMLElement; sx: number; sy: number; moved: boolean; src: HTMLElement } | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  protected enter(): void {
    this.dom.classList.add('screen--blocking');
    const back = button('', { icon: icons.back, className: 'btn--icon btn--small btn--ghost', ariaLabel: 'Back to level select', onClick: () => this.ctx.navigate('/levels') });
    this.progress = h('span', { class: 'hud__clock' });
    this.scoreEl = h('span', { class: 'sb-score mono' });
    this.lab = h('div', { class: 'lab-box' });
    this.main = h('div', { class: 'sb-main' });
    this.dom.append(
      h(
        'div',
        { class: 'wrap sb' },
        h('div', { class: 'sb-head' }, back, h('h2', {}, 'Level 2 · Stack Builder'), this.progress, this.scoreEl),
        this.lab,
        this.main,
      ),
    );
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.render();
    this.overlay = showTutorial(this.dom, STACK_TUTORIAL, () => {
      this.overlay = null;
      this.focusFirst();
    });
  }

  override destroy(): void {
    this.alive = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.drag?.ghost.remove();
    super.destroy();
  }

  private restart(): void {
    this.overlay?.close();
    this.overlay = null;
    this.cardIdx = 0;
    this.placed = 0;
    this.phase = 'build';
    this.mistakes = 0;
    this.cardMistakes = 0;
    this.sortIdx = 0;
    this.sortCorrect = 0;
    this.quizIdx = 0;
    this.quizCorrect = 0;
    this.answered = false;
    this.render();
  }

  override onKey(e: KeyboardEvent): boolean {
    if (this.overlay?.onKey(e)) return true;
    if (e.key.toLowerCase() === 'r' && this.phase !== 'done') {
      this.restart();
      return true;
    }
    return false;
  }

  private get card(): AppCard {
    return CARDS[this.cardIdx]!;
  }

  private focusFirst(): void {
    this.main.querySelector<HTMLElement>('.sb-block, .sb-bin, .sb-option, .btn--primary')?.focus({ preventScroll: true });
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  private render(): void {
    const total = CARDS.length;
    if (this.phase === 'sort' || this.phase === 'quiz') this.progress.textContent = 'L2CAP post office';
    else this.progress.textContent = `Tower ${Math.min(this.cardIdx + 1, total)} of ${total}`;
    const { score } = scoreStack({ buildMistakes: this.mistakes, sortCorrect: this.sortCorrect, quizCorrect: this.quizCorrect });
    this.scoreEl.textContent = `${score} pts`;
    this.renderLab();

    if (this.phase === 'sort') return this.renderSort();
    if (this.phase === 'quiz') return this.renderQuiz();
    this.renderBuild();
  }

  private renderLab(): void {
    if (!this.ctx.settings.get().labMode) return;
    const c = this.card;
    this.lab.textContent = [
      `${c.profile}  ·  link: ${c.link}${c.link === 'SCO' ? ' (reserved slots, 64 kbit/s, no ARQ)' : ' (packet-switched, ARQ)'}`,
      `data path: ${c.stack.map((l) => LAYERS[l].name).join(' → ')}`,
      `controller (chip): Radio, Baseband, LMP  ·  HCI  ·  host: L2CAP and above`,
      `L2CAP header ${L2CAP_HEADER_BYTES} bytes (length + CID) · max payload 65 535 bytes · default MTU 672 bytes`,
    ].join('\n');
  }

  private renderBuild(): void {
    const c = this.card;
    const done = this.placed === c.stack.length;

    const cardEl = h(
      'section',
      { class: 'sb-card panel' },
      h('div', { class: 'eyebrow' }, c.profile),
      h('h3', {}, c.title),
      h('p', { class: 'dim' }, c.story),
      h(
        'div',
        { class: 'chips' },
        h('span', { class: 'chip' }, `${c.stack.length - c.prePlaced} layers to place`),
        done ? h('span', { class: `chip chip--link chip--${c.link.toLowerCase()}` }, `${c.link} link`) : null,
      ),
    );

    const towers = h(
      'div',
      { class: 'sb-towers' },
      this.tower(c, c.devices[0], false),
      h('div', { class: 'sb-air', 'aria-hidden': 'true' }, h('span', {}, '2.4 GHz'), h('i', {})),
      this.tower(c, c.devices[1], true),
    );

    const feedback = h('div', { class: 'sb-feedback', 'aria-live': 'polite' });
    let bottom: HTMLElement;
    if (!done) {
      const placedSet = new Set(c.stack.slice(0, this.placed));
      bottom = h(
        'div',
        { class: 'sb-tray' },
        h('div', { class: 'sb-tray__label dim' }, 'Tap a block to put it on top of your tower — or drag it there. Build from the bottom up.'),
        h(
          'div',
          { class: 'sb-tray__blocks' },
          ...c.tray.filter((l) => !placedSet.has(l)).map((l) => this.trayBlock(l, feedback)),
        ),
      );
    } else if (this.phase === 'build') {
      this.phase = 'send';
      bottom = h('div', { class: 'sb-actions' }, button(`Send ${c.payload}`, { icon: icons.play, className: 'btn--primary', onClick: () => void this.send() }));
    } else {
      bottom = this.afterSend();
    }

    this.main.replaceChildren(h('div', { class: 'sb-left' }, cardEl, feedback), h('div', { class: 'sb-right' }, towers, bottom));
  }

  /** One device's tower. `mirror` = the receiving device (fills in as you build). */
  private tower(c: AppCard, device: string, mirror: boolean): HTMLElement {
    const rows: HTMLElement[] = [];
    for (let i = 0; i < c.stack.length; i++) {
      const id = c.stack[i]!;
      const placed = i < this.placed;
      const info = LAYERS[id];
      const isNext = i === this.placed && !mirror;
      const block = placed
        ? h(
            'div',
            { class: `sb-slot sb-blk sb-blk--${info.group}`, 'data-layer': id },
            h('b', {}, info.name),
            mirror ? null : h('small', {}, info.short),
          )
        : h('div', { class: `sb-slot sb-empty${isNext ? ' sb-empty--next' : ''}`, 'data-index': String(i) }, isNext ? '?' : '');
      const row = h('div', { class: 'sb-row' }, block);
      if (id === 'baseband') row.append(h('div', { class: 'sb-lmp', title: 'Link Manager Protocol: sets up, secures and manages the link. Control only — it carries no user data.' }, 'LMP'));
      rows.push(row);
      // The Host Controller Interface sits between the chip (Radio, Baseband) and the host.
      const nextId = c.stack[i + 1];
      if (!isHost(id) && nextId && isHost(nextId)) rows.push(h('div', { class: 'sb-hci' }, h('span', {}, 'HCI · host ↑ / chip ↓')));
    }
    return h(
      'div',
      { class: `sb-tower${mirror ? ' sb-tower--mirror' : ''}` },
      h('div', { class: 'sb-device' }, device),
      h('div', { class: 'sb-stack' }, h('div', { class: 'sb-app' }, c.payload), ...rows.reverse()),
    );
  }

  private trayBlock(layer: LayerId, feedback: HTMLElement): HTMLElement {
    const info = LAYERS[layer];
    const b = h(
      'button',
      { type: 'button', class: `sb-block sb-blk--${info.group}`, 'aria-label': `${info.name}: ${info.short}` },
      h('b', {}, info.name),
      h('small', {}, info.short),
    );
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = { layer, ghost: b, sx: e.clientX, sy: e.clientY, moved: false, src: b };
    });
    // Keyboard / plain click (pointer taps are handled in onPointerUp to avoid double placing).
    b.addEventListener('click', (e) => {
      if ((e as PointerEvent).pointerType === '' || e.detail === 0) this.place(layer, b, feedback);
    });
    b.dataset.layer = layer;
    return b;
  }

  // ── Drag & drop (with tap fallback) ──────────────────────────────────

  private readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) {
      d.moved = true;
      const ghost = d.src.cloneNode(true) as HTMLElement;
      ghost.classList.add('sb-ghost');
      const r = d.src.getBoundingClientRect();
      ghost.style.width = `${r.width}px`;
      document.body.appendChild(ghost);
      d.ghost = ghost;
      d.src.classList.add('sb-block--lifted');
    }
    if (d.moved) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      const over = this.overMyTower(e.clientX, e.clientY);
      this.main.querySelector('.sb-tower:not(.sb-tower--mirror)')?.classList.toggle('sb-tower--hot', over);
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const feedback = this.main.querySelector<HTMLElement>('.sb-feedback')!;
    this.main.querySelector('.sb-tower--hot')?.classList.remove('sb-tower--hot');
    if (d.moved) {
      d.ghost.remove();
      d.src.classList.remove('sb-block--lifted');
      if (this.overMyTower(e.clientX, e.clientY)) this.place(d.layer, d.src, feedback);
    } else if (d.src.contains(e.target as Node)) {
      this.place(d.layer, d.src, feedback); // a tap
    }
  };

  private overMyTower(x: number, y: number): boolean {
    const t = this.main.querySelector('.sb-tower:not(.sb-tower--mirror)');
    if (!t) return false;
    const r = t.getBoundingClientRect();
    return x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 20 && y <= r.bottom + 20;
  }

  private place(layer: LayerId, src: HTMLElement, feedback: HTMLElement): void {
    if (this.phase !== 'build') return;
    const r = tryPlace(this.card, this.placed, layer);
    if (!r.ok) {
      this.mistakes++;
      this.cardMistakes++;
      this.ctx.audio.back();
      src.classList.remove('sb-wobble');
      void src.offsetWidth;
      src.classList.add('sb-wobble');
      feedback.replaceChildren(h('div', { class: 'sb-hint' }, h('b', {}, 'Not quite. '), r.hint));
      this.scoreEl.textContent = `${scoreStack({ buildMistakes: this.mistakes, sortCorrect: this.sortCorrect, quizCorrect: this.quizCorrect }).score} pts`;
      return;
    }
    this.placed++;
    this.ctx.audio.confirm();
    this.render();
    const fb = this.main.querySelector<HTMLElement>('.sb-feedback')!;
    const info = LAYERS[layer];
    fb.replaceChildren(h('div', { class: 'sb-good' }, h('b', {}, `${info.name} ✓ `), info.short));
    if (r.done) this.ctx.audio.success();
    else this.focusFirst();
  }

  // ── Sending the packet ───────────────────────────────────────────────

  private async send(): Promise<void> {
    if (this.phase !== 'send') return;
    this.phase = 'sent';
    const c = this.card;
    const reduced = this.ctx.settings.get().reducedMotion;
    const step = reduced ? 120 : 520;
    const right = this.main.querySelector<HTMLElement>('.sb-right')!;
    right.querySelector('.sb-actions')?.remove();
    const towers = [...right.querySelectorAll<HTMLElement>('.sb-tower')];
    const packet = h('div', { class: 'sb-packet' }, h('span', { class: 'sb-payload' }, c.payload));
    right.querySelector('.sb-towers')!.append(packet);

    const moveTo = (el: Element) => {
      const host = right.querySelector('.sb-towers')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      packet.style.left = `${r.left - host.left + r.width / 2}px`;
      packet.style.top = `${r.top - host.top + r.height / 2}px`;
    };
    const blocksOf = (tower: HTMLElement) => c.stack.map((id) => tower.querySelector(`[data-layer="${id}"]`)!);
    const mine = blocksOf(towers[0]!);
    const theirs = blocksOf(towers[1]!);

    moveTo(towers[0]!.querySelector('.sb-app')!);
    await sleep(step);
    // Down: each layer adds its header in front of the data (encapsulation).
    for (let i = c.stack.length - 1; i >= 0 && this.alive; i--) {
      const id = c.stack[i]!;
      moveTo(mine[i]!);
      mine[i]!.classList.add('sb-lit');
      const hd = LAYERS[id].header;
      if (hd) packet.prepend(h('span', { class: `sb-hdr sb-blk--${LAYERS[id].group}` }, hd));
      this.ctx.audio.hop(10 + i * 8);
      await sleep(step);
    }
    // Across the air
    right.querySelector('.sb-air')?.classList.add('sb-air--on');
    moveTo(theirs[0]!);
    await sleep(step * 1.4);
    // Up: each layer reads and removes its own header.
    for (let i = 0; i < c.stack.length && this.alive; i++) {
      const id = c.stack[i]!;
      moveTo(theirs[i]!);
      theirs[i]!.classList.add('sb-lit');
      if (LAYERS[id].header) packet.querySelector('.sb-hdr')?.remove();
      this.ctx.audio.hop(40 + i * 8);
      await sleep(step);
    }
    if (!this.alive) return;
    moveTo(towers[1]!.querySelector('.sb-app')!);
    packet.classList.add('sb-packet--done');
    this.ctx.audio.success();
    right.append(this.afterSend());
    right.querySelector<HTMLElement>('.btn--primary')?.focus({ preventScroll: true });
  }

  private afterSend(): HTMLElement {
    const c = this.card;
    const last = this.cardIdx === CARDS.length - 1;
    const next = button(last ? 'On to the L2CAP post office' : 'Next tower', {
      className: 'btn--primary',
      onClick: () => {
        this.ctx.audio.click();
        if (last) {
          this.phase = 'sort';
        } else {
          this.cardIdx++;
          this.placed = CARDS[this.cardIdx]!.prePlaced;
          this.cardMistakes = 0;
          this.phase = 'build';
        }
        this.render();
        this.focusFirst();
      },
    });
    return h(
      'div',
      { class: 'sb-aha panel' },
      h('div', { class: 'eyebrow' }, this.cardMistakes === 0 ? 'Delivered · built first try!' : 'Delivered'),
      h('p', {}, c.aha),
      h('div', { class: 'sb-actions' }, next),
    );
  }

  // ── Part 2: L2CAP post office ────────────────────────────────────────

  private renderSort(): void {
    const m = MESSAGES[this.sortIdx]!;
    const feedback = h('div', { class: 'sb-feedback', 'aria-live': 'polite' });
    const bins = BINS.map((b) => {
      const el = h('button', { type: 'button', class: 'sb-bin' }, h('b', { class: 'mono' }, b.label), h('span', {}, b.detail));
      el.addEventListener('click', () => {
        if (this.answered) return;
        this.answered = true;
        const ok = b.cid === m.cid;
        if (ok) this.sortCorrect++;
        this.ctx.audio[ok ? 'confirm' : 'back']();
        el.classList.add(ok ? 'sb-bin--ok' : 'sb-bin--bad');
        if (!ok) binsWrap.querySelectorAll('.sb-bin')[BINS.findIndex((x) => x.cid === m.cid)]?.classList.add('sb-bin--ok');
        letter.classList.add('sb-letter--sent');
        feedback.replaceChildren(h('div', { class: ok ? 'sb-good' : 'sb-hint' }, h('b', {}, ok ? 'Right channel. ' : 'Not that one. '), m.why));
        const last = this.sortIdx === MESSAGES.length - 1;
        feedback.append(
          h(
            'div',
            { class: 'sb-actions' },
            button(last ? 'Next: cut it into packets' : 'Next message', {
              className: 'btn--primary',
              onClick: () => {
                this.answered = false;
                if (last) this.phase = 'quiz';
                else this.sortIdx++;
                this.render();
                this.focusFirst();
              },
            }),
          ),
        );
        feedback.querySelector<HTMLElement>('.btn--primary')?.focus({ preventScroll: true });
        this.scoreEl.textContent = `${scoreStack({ buildMistakes: this.mistakes, sortCorrect: this.sortCorrect, quizCorrect: this.quizCorrect }).score} pts`;
      });
      return el;
    });
    const binsWrap = h('div', { class: 'sb-bins' }, ...bins);
    const letter = h('div', { class: 'sb-letter panel' }, h('span', { class: 'dim mono' }, `Message ${this.sortIdx + 1} of ${MESSAGES.length}`), h('b', {}, m.text));

    this.main.replaceChildren(
      h(
        'div',
        { class: 'sb-left' },
        h(
          'section',
          { class: 'sb-card panel' },
          h('div', { class: 'eyebrow' }, 'Part 2 · Multiplexing'),
          h('h3', {}, 'Sort the mail into channels'),
          h(
            'p',
            { class: 'dim' },
            'Many protocols share one Bluetooth link. L2CAP puts a channel ID (CID) in every header so the other side knows which protocol each message is for. Pick the right CID.',
          ),
        ),
        feedback,
      ),
      h('div', { class: 'sb-right' }, letter, binsWrap),
    );
  }

  private renderQuiz(): void {
    const q = QUIZ[this.quizIdx]!;
    const feedback = h('div', { class: 'sb-feedback', 'aria-live': 'polite' });
    const opts = q.options.map((o, i) => {
      const el = h('button', { type: 'button', class: 'sb-option' }, o);
      el.addEventListener('click', () => {
        if (this.answered) return;
        this.answered = true;
        const ok = i === q.answer;
        if (ok) this.quizCorrect++;
        this.ctx.audio[ok ? 'confirm' : 'back']();
        el.classList.add(ok ? 'sb-bin--ok' : 'sb-bin--bad');
        if (!ok) optWrap.children[q.answer]?.classList.add('sb-bin--ok');
        feedback.replaceChildren(h('div', { class: ok ? 'sb-good' : 'sb-hint' }, h('b', {}, ok ? 'Correct. ' : 'Not quite. '), q.why));
        if (this.quizIdx === 0) right.append(this.segmentBar());
        const last = this.quizIdx === QUIZ.length - 1;
        feedback.append(
          h(
            'div',
            { class: 'sb-actions' },
            button(last ? 'Finish' : 'Next question', {
              className: 'btn--primary',
              onClick: () => {
                this.answered = false;
                if (last) this.finish();
                else {
                  this.quizIdx++;
                  this.render();
                  this.focusFirst();
                }
              },
            }),
          ),
        );
        feedback.querySelector<HTMLElement>('.btn--primary')?.focus({ preventScroll: true });
        this.scoreEl.textContent = `${scoreStack({ buildMistakes: this.mistakes, sortCorrect: this.sortCorrect, quizCorrect: this.quizCorrect }).score} pts`;
      });
      return el;
    });
    const optWrap = h('div', { class: 'sb-options' }, ...opts);
    const right = h('div', { class: 'sb-right' }, optWrap);
    this.main.replaceChildren(
      h(
        'div',
        { class: 'sb-left' },
        h(
          'section',
          { class: 'sb-card panel' },
          h('div', { class: 'eyebrow' }, `Part 2 · Segmentation & reassembly · ${this.quizIdx + 1} of ${QUIZ.length}`),
          h('h3', {}, 'Too big for one radio packet'),
          h('p', {}, q.q),
        ),
        feedback,
      ),
      right,
    );
  }

  /** Visual of the 2,000-byte photo cut into DH5 pieces. */
  private segmentBar(): HTMLElement {
    const parts = segment(2000);
    const total = parts.reduce((a, b) => a + b, 0);
    return h(
      'div',
      { class: 'sb-seg' },
      h('div', { class: 'sb-seg__label mono dim' }, `L2CAP message: ${L2CAP_HEADER_BYTES} B header + 2000 B photo = ${total} B`),
      h(
        'div',
        { class: 'sb-seg__bar' },
        ...parts.map((p, i) => {
          const el = h('span', { style: `flex:${p}` }, `${p} B`);
          el.style.animationDelay = `${i * 120}ms`;
          return el;
        }),
      ),
      h('div', { class: 'sb-seg__label mono dim' }, `→ ${parts.length} DH5 baseband packets, each with its own 16-bit CRC`),
    );
  }

  // ── End ──────────────────────────────────────────────────────────────

  private finish(): void {
    this.phase = 'done';
    const r = scoreStack({ buildMistakes: this.mistakes, sortCorrect: this.sortCorrect, quizCorrect: this.quizCorrect });
    const newBest = recordResult(2, r.score, r.stars);
    const badges: BadgeInfo[] = [];
    if (r.perfectBuild) {
      unlockBadge('builder');
      badges.push(BADGES.builder!);
    }
    this.ctx.audio.success();
    this.overlay = showEndCard(this.dom, {
      title: 'Stack Builder',
      subtitle: 'All six towers built',
      stars: r.stars,
      score: r.score,
      newBest,
      stats: [
        ['Towers built', `${CARDS.length} / ${CARDS.length}`],
        ['Wrong blocks', String(this.mistakes)],
        ['Messages sorted', `${this.sortCorrect} / ${MESSAGES.length}`],
        ['Questions right', `${this.quizCorrect} / ${QUIZ.length}`],
      ],
      badges,
      learned: [
        'The Bluetooth chip (controller) holds the Radio, the Baseband and the Link Manager (LMP). Everything above the Host Controller Interface (HCI) is host software.',
        'Voice skips L2CAP: audio goes straight to the Baseband on a reserved SCO link. All data goes through L2CAP over ACL links.',
        'RFCOMM emulates a serial cable, so old cable protocols run unchanged on top: OBEX (files, vCards), AT commands and PPP (dial-up). SDP and TCS BIN sit directly on L2CAP.',
        'A profile is a recipe of layers for one job — Headset, Object Push, Dial-up Networking, Cordless Telephony…',
        'L2CAP multiplexes many protocols on one link using channel IDs (CID 1 = signalling, CID 2 = connectionless), and segments messages of up to 64 kB into baseband packets, which the other side reassembles. The 16-bit CRC comes from the Baseband.',
      ],
      actions: [
        { label: 'Play again', onClick: () => this.restart() },
        { label: 'Trophies', primary: true, onClick: () => this.ctx.navigate('/leaderboard') },
        { label: 'Level select', onClick: () => this.ctx.navigate('/levels') },
      ],
    });
  }
}
