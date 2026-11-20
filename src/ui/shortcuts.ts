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
  { keys: 'F', action: 'Toggle fullscreen' },
  { keys: 'O', action: 'Open settings' },
  { keys: 'P', action: 'Pause / resume (Level 1)' },
  { keys: 'R', action: 'Restart level' },
  { keys: 'I', action: 'Inquiry (Level 1)' },
  { keys: 'Tab ↵', action: 'Pick a block / answer (Level 2)' },
];

export interface ShortcutHandlers {
  /** Give the active scene first refusal (levels use P, R, I…). */
  sceneKey(e: KeyboardEvent): boolean;
  escape(e: KeyboardEvent): void;
  toggleSound(): void;
  toggleFullscreen(): void;
  openSettings(): void;
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
      case 'f':
        hd.toggleFullscreen();
        break;
      case 'o':
        hd.openSettings();
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}
