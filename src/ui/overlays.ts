import type { BadgeInfo } from '../app/progress';
import { button, h, html } from './dom';

/**
 * In-scene overlays shared by all levels:
 *  - a skippable 3-step tutorial,
 *  - the end-of-level card ("What just happened?").
 * They live inside the scene's DOM, so they vanish with the scene.
 */

export interface TutorialStep {
  title: string;
  body: string;
  /** Trusted, hard-coded SVG/HTML illustration (animated with CSS). */
  art?: string;
}

export interface OverlayHandle {
  close(): void;
  /** Lets the scene route keys (Enter, arrows, Esc) to the overlay. */
  onKey(e: KeyboardEvent): boolean;
}

export function showTutorial(parent: HTMLElement, steps: TutorialStep[], onDone: () => void): OverlayHandle {
  let i = 0;
  const art = h('div', { class: 'tut__art', 'aria-hidden': 'true' });
  const title = h('h2', {});
  const body = h('p', {});
  const dots = h('div', { class: 'tut__dots' }, ...steps.map(() => h('span', {})));
  const nextBtn = button('Next', { className: 'btn--primary' });
  const skipBtn = button('Skip', { className: 'btn--ghost btn--small' });
  const card = h(
    'div',
    { class: 'tut panel', role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' },
    h('div', { class: 'eyebrow' }, 'How to play'),
    art,
    title,
    body,
    h('div', { class: 'tut__foot' }, dots, h('div', { class: 'tut__btns' }, skipBtn, nextBtn)),
  );
  const root = h('div', { class: 'overlay' }, card);

  const render = () => {
    const s = steps[i]!;
    title.textContent = s.title;
    body.textContent = s.body;
    art.replaceChildren(s.art ? html(s.art) : '');
    // Restart the entry animation for each step.
    card.classList.remove('tut--enter');
    void card.offsetWidth;
    card.classList.add('tut--enter');
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
    nextBtn.querySelector('span')!.textContent = i === steps.length - 1 ? "Let's go" : 'Next';
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.remove();
    onDone();
  };
  const next = () => {
    if (i < steps.length - 1) {
      i++;
      render();
    } else close();
  };
  const prev = () => {
    if (i > 0) {
      i--;
      render();
    }
  };

  nextBtn.addEventListener('click', next);
  skipBtn.addEventListener('click', close);
  parent.appendChild(root);
  render();
  nextBtn.focus({ preventScroll: true });

  return {
    close,
    onKey(e) {
      if (closed) return false;
      // A focused button already handles Enter/Space natively — don't advance twice.
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return true;
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else return true; // swallow other keys while the tutorial is up
      e.preventDefault();
      return true;
    },
  };
}

export interface EndCardOpts {
  title: string;
  subtitle?: string;
  stars: number; // 0..3
  score: number;
  newBest: boolean;
  stats: [string, string][];
  badges: BadgeInfo[];
  learned: string[];
  actions: { label: string; primary?: boolean; onClick: () => void }[];
}

export function showEndCard(parent: HTMLElement, o: EndCardOpts): OverlayHandle {
  const stars = h(
    'div',
    { class: 'stars', 'aria-label': `${o.stars} of 3 stars` },
    ...[0, 1, 2].map((i) =>
      h('span', { class: `star ${i < o.stars ? 'star--on' : ''}`, style: `animation-delay:${200 + i * 180}ms` }, '★'),
    ),
  );
  const stats = h(
    'dl',
    { class: 'end__stats' },
    ...o.stats.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
  );
  const badges = o.badges.length
    ? h(
        'div',
        { class: 'end__badges' },
        ...o.badges.map((b) =>
          h('div', { class: 'badge' }, h('span', { class: 'badge__icon' }, '✦'), h('div', {}, h('b', {}, b.name), h('div', { class: 'dim' }, b.description))),
        ),
      )
    : null;
  const learned = h(
    'section',
    { class: 'end__learn' },
    h('h3', {}, 'What just happened?'),
    h('ul', {}, ...o.learned.map((l) => h('li', {}, l))),
  );
  const actions = h(
    'div',
    { class: 'end__actions' },
    ...o.actions.map((a) => button(a.label, { className: a.primary ? 'btn--primary' : 'btn--ghost', onClick: a.onClick })),
  );

  const card = h(
    'div',
    { class: 'end panel', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'eyebrow' }, o.subtitle ?? 'Level complete'),
    h('h2', {}, o.title),
    stars,
    h('div', { class: 'end__score' }, h('span', { class: 'mono' }, String(o.score)), h('span', { class: 'dim' }, o.newBest ? ' points · new best!' : ' points')),
    stats,
    badges,
    learned,
    actions,
  );
  const root = h('div', { class: 'overlay overlay--end' }, card);
  parent.appendChild(root);
  (actions.querySelector('.btn--primary') as HTMLElement | null)?.focus({ preventScroll: true });

  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      root.remove();
    },
    onKey() {
      return false;
    },
  };
}
