import { loadJSON, saveJSON } from './storage';

/**
 * Player progress kept on this device: best score / stars per level and
 * unlocked badges. Best-effort (localStorage may be unavailable).
 */

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
}

export const BADGES: Readonly<Record<string, BadgeInfo>> = {
  harald: { id: 'harald', name: "Harald's Rune", description: 'Seven active slaves in one piconet.' },
  ghost: { id: 'ghost', name: 'Ghost Hopper', description: 'Over 95% delivery during a Wi-Fi attack.' },
  redline: { id: 'redline', name: 'Redline', description: 'Touched 723.2 kbit/s with DH5.' },
};

interface Progress {
  best: Record<string, { score: number; stars: number }>;
  badges: string[];
}

const KEY = 'progress';

function load(): Progress {
  const p = loadJSON<Partial<Progress> | null>(KEY, null);
  return {
    best: typeof p?.best === 'object' && p.best ? p.best : {},
    badges: Array.isArray(p?.badges) ? p.badges.filter((b): b is string => typeof b === 'string') : [],
  };
}

/** Record a level result; returns true if it is a new best score. */
export function recordResult(level: number, score: number, stars: number): boolean {
  const p = load();
  const prev = p.best[level];
  const isBest = !prev || score > prev.score;
  p.best[level] = { score: Math.max(score, prev?.score ?? 0), stars: Math.max(stars, prev?.stars ?? 0) };
  saveJSON(KEY, p);
  return isBest;
}

export function bestFor(level: number): { score: number; stars: number } | null {
  return load().best[level] ?? null;
}

/** Unlock a badge; returns true if it was newly unlocked. */
export function unlockBadge(id: string): boolean {
  const p = load();
  if (p.badges.includes(id)) return false;
  p.badges.push(id);
  saveJSON(KEY, p);
  return true;
}

/** Everything saved on this device (for the leaderboard / badges screen). */
export function allProgress(): { best: Record<string, { score: number; stars: number }>; badges: string[] } {
  return load();
}

export function hasBadge(id: string): boolean {
  return load().badges.includes(id);
}
