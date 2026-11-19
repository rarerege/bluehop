import { Scene } from '../app/Scene';
import type { BackdropMode } from './Backdrop';
import { button, h } from '../ui/dom';
import { icons } from '../ui/icons';
import { LEVELS } from './levels';

export class LevelSelectScene extends Scene {
  override readonly backdrop: BackdropMode = 'dim';

  protected enter(): void {
    const { ctx } = this;
    const back = button('Back', { icon: icons.back, className: 'btn--ghost btn--small', onClick: () => ctx.back() });

    const cards = LEVELS.map((lv, i) => {
      const card = h(
        'button',
        { type: 'button', class: 'level-card panel', style: `--c:${lv.color}`, 'aria-label': `Level ${lv.n}: ${lv.title}` },
        h('span', { class: 'level-card__num' }, `0${lv.n}`),
        h('h3', {}, lv.title),
        h('p', {}, lv.pitch),
        h(
          'div',
          { class: 'chips' },
          ...lv.concepts.map((c) => h('span', { class: 'chip' }, c)),
          h('span', { class: 'chip chip--ready' }, 'Play ▸'),
        ),
      );
      if (i === 0) card.dataset.autofocus = '';
      card.addEventListener('pointerenter', () => ctx.audio.hover());
      card.addEventListener('click', () => {
        ctx.audio.click();
        ctx.navigate(`/level/${lv.n}`);
      });
      return card;
    });

    this.dom.classList.add('screen--blocking');
    this.dom.append(
      h(
        'div',
        { class: 'wrap' },
        h('div', { class: 'screen-head' }, back, h('h2', {}, 'Level Select')),
        h('div', { class: 'level-grid' }, ...cards),
      ),
    );
  }
}
