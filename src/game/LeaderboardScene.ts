import { Scene } from '../app/Scene';
import type { BackdropMode } from './Backdrop';
import { allProgress, BADGES } from '../app/progress';
import { button, h } from '../ui/dom';
import { icons } from '../ui/icons';
import { LEVELS } from './levels';

/**
 * Trophies: best stars / score per level and the badges, stored on this
 * device (localStorage), so it works offline on the projector and on phones.
 */
export class LeaderboardScene extends Scene {
  override readonly backdrop: BackdropMode = 'dim';

  protected enter(): void {
    this.dom.classList.add('screen--blocking');
    const back = button('Back', { icon: icons.back, className: 'btn--ghost btn--small', onClick: () => this.ctx.back() });
    back.dataset.autofocus = '';
    const prog = allProgress();

    const levels = h(
      'div',
      { class: 'lb-levels' },
      ...LEVELS.map((lv) => {
        const b = prog.best[lv.n];
        const el = h(
          'button',
          { type: 'button', class: 'lb-level panel', style: `--c:${lv.color}` },
          h('span', { class: 'level-card__num' }, `0${lv.n}`),
          h('b', {}, lv.title),
          h('span', { class: 'lb-stars', 'aria-label': `${b?.stars ?? 0} of 3 stars` }, '★★★'.slice(0, b?.stars ?? 0), h('span', { class: 'dim' }, '★★★'.slice(b?.stars ?? 0))),
          h('span', { class: 'mono dim' }, b ? `best ${b.score} pts` : 'not played yet'),
        );
        el.addEventListener('click', () => {
          this.ctx.audio.click();
          this.ctx.navigate(`/level/${lv.n}`);
        });
        return el;
      }),
    );

    const badges = h(
      'div',
      { class: 'lb-badges' },
      ...Object.values(BADGES).map((b) => {
        const got = prog.badges.includes(b.id);
        return h(
          'div',
          { class: `badge ${got ? '' : 'badge--locked'}` },
          h('span', { class: 'badge__icon' }, got ? '✦' : '◇'),
          h('div', {}, h('b', {}, b.name), h('div', { class: 'dim' }, got ? b.description : `Locked — ${b.description}`)),
        );
      }),
    );

    this.dom.append(
      h(
        'div',
        { class: 'wrap' },
        h('div', { class: 'screen-head' }, back, h('h2', {}, 'Trophies')),
        h(
          'div',
          { class: 'lb-grid' },
          h('section', { class: 'panel lb-card' }, h('h3', {}, 'Your levels'), levels),
          h(
            'section',
            { class: 'panel lb-card' },
            h('h3', {}, 'Badges'),
            badges,
            h('p', { class: 'dim lb-sub', style: 'margin-top:1rem' }, 'Saved on this device only.'),
          ),
        ),
      ),
    );
  }
}
