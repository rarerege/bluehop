import type { SettingsStore } from '../app/settings';
import { button, html } from './dom';
import { icons } from './icons';

interface ToolbarActions {
  toggleSound(): void;
  toggleFullscreen(): void;
  openSettings(): void;
}

export function fullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === 'function';
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* not allowed (e.g. iOS Safari) — ignore */
  }
}

/** Persistent top-right controls: sound, fullscreen, settings. */
export function mountToolbar(settings: SettingsStore, actions: ToolbarActions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  const sound = button('', { className: 'btn--icon', onClick: () => actions.toggleSound() });

  const fs = button('', {
    icon: icons.fullscreen,
    className: 'btn--icon',
    title: 'Fullscreen (F)',
    ariaLabel: 'Toggle fullscreen',
    onClick: () => actions.toggleFullscreen(),
  });

  const gear = button('', {
    icon: icons.gear,
    className: 'btn--icon',
    title: 'Settings (O)',
    ariaLabel: 'Settings',
    onClick: () => actions.openSettings(),
  });

  const sync = () => {
    const s = settings.get();
    sound.replaceChildren(html(s.sound ? icons.soundOn : icons.soundOff));
    sound.title = s.sound ? 'Mute (M)' : 'Unmute (M)';
    sound.setAttribute('aria-label', s.sound ? 'Mute sound' : 'Unmute sound');
  };
  sync();
  settings.subscribe(sync);

  bar.append(sound);
  if (fullscreenSupported()) bar.append(fs);
  bar.append(gear);
  document.body.appendChild(bar);
  return bar;
}
