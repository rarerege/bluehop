import { Scene } from '../app/Scene';
import type { BackdropMode } from './Backdrop';
import { button, h } from '../ui/dom';
import { icons } from '../ui/icons';

export interface PlaceholderInfo {
  title: string;
  eyebrow: string;
  phase: number;
  bullets: string[];
}

/** Stand-in for screens that later phases will build. */
export class PlaceholderScene extends Scene {
  override readonly backdrop: BackdropMode = 'dim';

  constructor(private readonly info: PlaceholderInfo) {
    super();
  }

  protected enter(): void {
    const { ctx, info } = this;
    const back = button('Back', { icon: icons.back, className: 'btn--ghost btn--small', onClick: () => ctx.back() });
    back.dataset.autofocus = '';

    this.dom.classList.add('screen--blocking');
    this.dom.append(
      h(
        'div',
        { class: 'wrap' },
        h('div', { class: 'screen-head' }, back, h('h2', {}, info.title)),
        h(
          'section',
          { class: 'placeholder panel' },
          h('div', { class: 'eyebrow' }, info.eyebrow),
          h('p', {}, `Under construction — this screen arrives in Phase ${info.phase}. It will cover:`),
          h('ul', {}, ...info.bullets.map((b) => h('li', {}, b))),
        ),
      ),
    );
  }
}
