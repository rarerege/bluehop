/**
 * Global keyboard shortcuts. The list is also rendered in the Settings panel,
 * so the table and the behaviour can't drift apart.
 */

export interface Shortcut {
  keys: string;
  action: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Esc', action: 'Close dialog / go back' },
  { keys: 'M', action: 'Mute / unmute sound' },
  { keys: 'L', action: 'Toggle Lab Mode (real numbers)' },
  { keys: 'F', action: 'Toggle fullscreen' },
  { keys: 'O', action: 'Open settings' },
  { keys: 'P', action: 'Pause / resume (in levels)' },
  { keys: 'R', action: 'Restart level' },
  { keys: '[ ]', action: 'Slower / faster simulation (Level 2)' },
  { keys: 'I', action: 'Inquiry (Level 1)' },
  { keys: 'A', action: 'AFH channel assessment (Level 2)' },
  { keys: '1 – 6', action: 'Shift packet type (Level 3)' },
];

export interface ShortcutHandlers {
  /** Give the active scene first refusal (levels use P, R, 1–6…). */
  sceneKey(e: KeyboardEvent): boolean;
  escape(e: KeyboardEvent): void;
  toggleSound(): void;
  toggleLab(): void;
  toggleFullscreen(): void;
  openSettings(): void;
  speed(delta: number): void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function installShortcuts(hd: ShortcutHandlers): void {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      hd.escape(e);
      return;
    }
    // Don't steal letters while the player types a nickname etc.
    // (Range sliders are fine: they don't use letter keys.)
    if (isTyping(e.target) && !(e.target instanceof HTMLInputElement && e.target.type === 'range')) return;
    if (hd.sceneKey(e)) return;

    switch (e.key.toLowerCase()) {
      case 'm':
        hd.toggleSound();
        break;
      case 'l':
        hd.toggleLab();
        break;
      case 'f':
        hd.toggleFullscreen();
        break;
      case 'o':
        hd.openSettings();
        break;
      case '[':
        hd.speed(-1);
        break;
      case ']':
        hd.speed(1);
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}
