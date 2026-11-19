/**
 * Safe localStorage wrapper.
 *
 * Storage can be unavailable (private browsing, blocked cookies, embedded
 * previews) or full, and every access may throw. The game must keep working
 * without it, so every read falls back to a default and every write is
 * best-effort.
 */

const PREFIX = 'bluehop:';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: ignore, the game still works */
  }
}
