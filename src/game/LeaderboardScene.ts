import { Scene } from '../app/Scene';
import type { BackdropMode } from './Backdrop';
import { allProgress, BADGES } from '../app/progress';
import { loadLeaderboard } from '../app/leaderboard';
import { button, h } from '../ui/dom';
import { icons } from '../ui/icons';
import { LEVELS } from './levels';

/**
 * Leaderboard + trophy room. Everything here is stored on this device
 * (localStorage), so it works offline on the projector laptop and on phones.
 */
export class LeaderboardScene extends Scene {
  override readonly backdrop: BackdropMode = 'dim';

  protected enter(): void {
    this.dom.classList.add('screen--blocking');
    const back = button('Back', { icon: icons.back, className: 'btn--ghost btn--small', onClick: () => this.ctx.back() });
    back.dataset.autofocus = '';

    const entries = loadLeaderboard().slice(0, 20);
    const board = entries.length
      ? h(
          'ol',
          { class: 'lb-list' },
          ...entries.map((e, i) =>
            h(
              'li',
              { class: i < 3 ? `lb-top lb-top--${i + 1}` : '' },
              h('span', { class: 'lb-rank mono' }, `#${i + 1}`),
              h('span', { class: 'lb-name' }, e.name),
              h('span', { class: 'lb-time mono' }, `${e.timeS.toFixed(2)} s`),
              h('span', { class: 'lb-rate mono dim' }, `${(8_000_000 / e.timeS / 1000).toFixed(0)} kbit/s`),
            ),
          ),
        )
      : h('p', { class: 'dim' }, 'No times yet. Finish Level 3 “Gear Shift” and save your nickname to appear here.');

    const prog = allProgress();
    const bests = h(
      'div',
      { class: 'lb-levels' },
      ...LEVELS.map((lv) => {
        const b = prog.best[lv.n];
        return h(
          'button',
          { type: 'button', class: 'lb-level panel', style: `--c:${lv.color}` },
          h('span', { class: 'level-card__num' }, `0${lv.n}`),
          h('b', {}, lv.title),
          h('span', { class: 'lb-stars', 'aria-label': `${b?.stars ?? 0} of 3 stars` }, '★★★'.slice(0, b?.stars ?? 0), h('span', { class: 'dim' }, '★★★'.slice(b?.stars ?? 0))),
          h('span', { class: 'mono dim' }, b ? `best ${b.score} pts` : 'not played yet'),
        );
      }),
    );
    bests.querySelectorAll<HTMLButtonElement>('.lb-level').forEach((el, i) =>
      el.addEventListener('click', () => {
        this.ctx.audio.click();
        this.ctx.navigate(`/level/${LEVELS[i]!.n}`);
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
        h('div', { class: 'screen-head' }, back, h('h2', {}, 'Leaderboard')),
        h(
          'div',
          { class: 'lb-grid' },
          h(
            'section',
            { class: 'panel lb-card' },
            h('h3', {}, 'Fastest 1 MB transfer · Gear Shift'),
            h('p', { class: 'dim lb-sub' }, 'Simulated time to stream the song. Physics floor: 11.06 s (8 Mbit at 723.2 kbit/s).'),
            board,
          ),
          h(
            'section',
            { class: 'panel lb-card' },
            h('h3', {}, 'Your levels'),
            bests,
            h('h3', { style: 'margin-top:1.2rem' }, 'Badges'),
            badges,
            h('p', { class: 'dim lb-sub', style: 'margin-top:1rem' }, 'Saved on this device only. A shared live board for the projector is not enabled.'),
          ),
        ),
      ),
    );
  }
}
