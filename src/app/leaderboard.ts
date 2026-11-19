import { loadJSON, saveJSON } from './storage';

/**
 * Local leaderboard for Level 3 (fastest 1 MB transfer), stored on this
 * device. A shared online board can be added later behind a config flag.
 */

export interface LeaderEntry {
  name: string;
  /** Simulated transfer time in seconds (lower is better). */
  timeS: number;
  /** ISO date string. */
  at: string;
}

const KEY = 'leaderboard-l3';
const MAX_ENTRIES = 50;

/** Clean a nickname: no control characters, single spaces, max 16 chars. */
export function sanitizeName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  return clean || 'Anonymous';
}

export function loadLeaderboard(): LeaderEntry[] {
  const raw = loadJSON<unknown>(KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is LeaderEntry => typeof e?.name === 'string' && typeof e?.timeS === 'number' && Number.isFinite(e.timeS))
    .map((e) => ({ name: sanitizeName(e.name), timeS: e.timeS, at: typeof e.at === 'string' ? e.at : '' }))
    .sort((a, b) => a.timeS - b.timeS);
}

/** Add an entry; returns the updated, sorted list and the new entry's rank (1-based). */
export function addLeaderEntry(name: string, timeS: number): { list: LeaderEntry[]; rank: number; entry: LeaderEntry } {
  const entry: LeaderEntry = { name: sanitizeName(name), timeS, at: new Date().toISOString() };
  const list = [...loadLeaderboard(), entry].sort((a, b) => a.timeS - b.timeS).slice(0, MAX_ENTRIES);
  saveJSON(KEY, list);
  return { list, rank: list.indexOf(entry) + 1, entry };
}

const NAME_KEY = 'nickname';
export function lastNickname(): string {
  return loadJSON<string>(NAME_KEY, '');
}
export function rememberNickname(name: string): void {
  saveJSON(NAME_KEY, name);
}
