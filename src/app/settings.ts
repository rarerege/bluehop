import { loadJSON, saveJSON } from './storage';
import { clampSpeedIndex, DEFAULT_SPEED_INDEX } from './speed';

/** Everything the player can configure. Persisted to localStorage. */
export interface Settings {
  sound: boolean;
  music: boolean;
  /** Master volume 0..1. */
  volume: number;
  /** Disables screen shake, heavy particles and background scrolling. */
  reducedMotion: boolean;
  /** Index into SPEED_STEPS. */
  speedIndex: number;
  /** Shows the real numbers / graphs overlay for examiners. */
  labMode: boolean;
}

const STORAGE_KEY = 'settings';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaults(): Settings {
  return {
    sound: true,
    music: false,
    volume: 0.6,
    reducedMotion: prefersReducedMotion(),
    speedIndex: DEFAULT_SPEED_INDEX,
    labMode: false,
  };
}

/** Merge stored values over defaults, ignoring anything of the wrong type. */
function sanitize(raw: unknown): Settings {
  const d = defaults();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof Settings, fb: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : fb);
  const vol = typeof r.volume === 'number' ? Math.min(1, Math.max(0, r.volume)) : d.volume;
  return {
    sound: bool('sound', d.sound),
    music: bool('music', d.music),
    volume: vol,
    reducedMotion: bool('reducedMotion', d.reducedMotion),
    speedIndex: typeof r.speedIndex === 'number' ? clampSpeedIndex(r.speedIndex) : d.speedIndex,
    labMode: bool('labMode', d.labMode),
  };
}

type Listener = (s: Readonly<Settings>, changed: ReadonlySet<keyof Settings>) => void;

/** Tiny observable settings store. */
export class SettingsStore {
  private state: Settings = sanitize(loadJSON<unknown>(STORAGE_KEY, null));
  private listeners = new Set<Listener>();

  constructor() {
    this.reflectOnDocument();
  }

  get(): Readonly<Settings> {
    return this.state;
  }

  set(patch: Partial<Settings>): void {
    const next = sanitize({ ...this.state, ...patch });
    const changed = new Set<keyof Settings>();
    for (const k of Object.keys(next) as (keyof Settings)[]) {
      if (next[k] !== this.state[k]) changed.add(k);
    }
    if (changed.size === 0) return;
    this.state = next;
    saveJSON(STORAGE_KEY, this.state);
    this.reflectOnDocument();
    for (const l of this.listeners) l(this.state, changed);
  }

  toggle(key: 'sound' | 'music' | 'reducedMotion' | 'labMode'): void {
    this.set({ [key]: !this.state[key] });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Expose flags as data attributes so CSS can react (e.g. disable animations). */
  private reflectOnDocument(): void {
    const el = document.documentElement;
    el.dataset.reducedMotion = String(this.state.reducedMotion);
    el.dataset.lab = String(this.state.labMode);
  }
}
