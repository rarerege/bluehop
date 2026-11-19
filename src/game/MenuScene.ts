import { Scene } from '../app/Scene';
import { button, h, html } from '../ui/dom';
import { icons, logoSvg } from '../ui/icons';

/**
 * Main menu. All controls are DOM (crisp text, accessible, touch-friendly);
 * the animated hop trail behind it is the shared Backdrop in 'full' mode.
 */
export class MenuScene extends Scene {
  protected enter(): void {
    const { ctx } = this;
    const go = (path: string) => () => {
      ctx.audio.click();
      ctx.navigate(path);
    };

    const play = button('Play', { icon: icons.play, className: 'btn--primary', onClick: go('/level/1') });
    play.dataset.autofocus = '';

    const buttons = [
      play,
      button('Level Select', { icon: icons.grid, onClick: go('/levels') }),
      button('Lab Mode', { icon: icons.lab, className: 'btn--magenta', onClick: go('/lab') }),
      button('Leaderboard', { icon: icons.trophy, onClick: go('/leaderboard') }),
      button('Settings', {
        icon: icons.gear,
        className: 'btn--ghost',
        onClick: () => {
          ctx.audio.click();
          ctx.openSettings();
        },
      }),
      button('Scan to play', {
        icon: icons.qr,
        className: 'btn--ghost',
        onClick: () => {
          ctx.audio.click();
          ctx.openQr();
        },
      }),
    ];
    for (const b of buttons) b.addEventListener('pointerenter', () => ctx.audio.hover());

    this.dom.classList.add('screen--blocking');
    this.dom.append(
      h(
        'main',
        { class: 'menu' },
        h(
          'header',
          { class: 'menu__title' },
          html(logoSvg),
          h('h1', { class: 'neon-title' }, 'BLUEHOP'),
          h('p', { class: 'menu__tagline' }, 'Command the Piconet'),
        ),
        h('nav', { class: 'menu__buttons panel', 'aria-label': 'Main menu' }, ...buttons),
        h('footer', { class: 'menu__foot' }, 'IEEE 802.15.1 · Bluetooth Basic Rate · 79 ch × 1 MHz · 1600 hops/s'),
      ),
    );
  }
}
