import type { Settings, SettingsStore } from '../app/settings';
import type { Synth } from '../audio/Synth';
import { h } from './dom';
import { openModal, type ModalHandle } from './Modal';
import { SHORTCUTS } from './shortcuts';

type BoolKey = 'sound' | 'music' | 'reducedMotion';

/** Opens the Settings dialog. Controls write straight to the SettingsStore. */
export function openSettingsPanel(settings: SettingsStore, audio: Synth): ModalHandle {
  const s = settings.get();
  const unsubs: (() => void)[] = [];

  const switchField = (key: BoolKey, label: string, hint?: string) => {
    const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
    input.checked = s[key];
    input.addEventListener('change', () => {
      settings.set({ [key]: input.checked } as Partial<Settings>);
      audio.toggle(input.checked);
    });
    // Stay in sync if the value changes from a keyboard shortcut while open.
    unsubs.push(settings.subscribe((st) => (input.checked = st[key])));
    return h(
      'div',
      { class: 'field' },
      h('div', { class: 'field__label' }, h('span', {}, label), hint ? h('span', { class: 'field__hint' }, hint) : null),
      h('label', { class: 'switch' }, input),
    );
  };

  // Volume 0–100 %
  const volume = h('input', { type: 'range', min: 0, max: 100, step: 5, 'aria-label': 'Volume' });
  volume.value = String(Math.round(s.volume * 100));
  const volOut = h('output', {}, `${volume.value}%`);
  volume.addEventListener('input', () => {
    settings.set({ volume: Number(volume.value) / 100 });
    volOut.textContent = `${volume.value}%`;
  });
  volume.addEventListener('change', () => audio.click());

  const kbdRows = SHORTCUTS.map((sc) =>
    h('tr', {}, h('td', {}, ...sc.keys.split(' ').map((k) => h('kbd', {}, k))), h('td', {}, sc.action)),
  );

  const content = h(
    'div',
    {},
    switchField('sound', 'Sound effects'),
    h(
      'div',
      { class: 'field field--stack' },
      h('div', { class: 'field__row' }, h('span', {}, 'Volume'), volOut),
      volume,
    ),
    switchField('music', 'Music', 'Synthwave loop, generated live in your browser'),
    switchField('reducedMotion', 'Reduced motion', 'No screen shake, fewer particles, static background'),
    h('h3', { style: 'margin-top:1.4rem;font-size:1rem' }, 'Keyboard shortcuts'),
    h('table', { class: 'kbd-table' }, h('tbody', {}, ...kbdRows)),
  );

  return openModal({
    title: 'Settings',
    content,
    onClose: () => unsubs.forEach((u) => u()),
  });
}
