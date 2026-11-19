/**
 * Hash router: #/menu, #/levels, #/level/2, #/lab, #/leaderboard.
 *
 * Hash routes work on GitHub Pages without any server rewrite rules.
 * `parseHash` is pure so it can be unit-tested; only `startRouter` touches `window`.
 */

export type RouteName = 'menu' | 'levels' | 'level' | 'lab' | 'leaderboard';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
  /** Normalised path, e.g. "/level/2". */
  path: string;
}

interface RouteDef {
  pattern: RegExp;
  name: RouteName;
  keys?: string[];
}

const ROUTES: RouteDef[] = [
  { pattern: /^\/?$/, name: 'menu' },
  { pattern: /^\/menu$/, name: 'menu' },
  { pattern: /^\/levels$/, name: 'levels' },
  { pattern: /^\/level\/([1-2])$/, name: 'level', keys: ['n'] },
  { pattern: /^\/lab$/, name: 'lab' },
  { pattern: /^\/leaderboard$/, name: 'leaderboard' },
];

export const MENU_ROUTE: Route = { name: 'menu', params: {}, path: '/menu' };

export function parseHash(hash: string): Route {
  const path = (hash.startsWith('#') ? hash.slice(1) : hash).replace(/\/+$/, '') || '/';
  for (const def of ROUTES) {
    const m = def.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    def.keys?.forEach((k, i) => {
      params[k] = m[i + 1] ?? '';
    });
    return { name: def.name, params, path: def.name === 'menu' ? '/menu' : path };
  }
  return MENU_ROUTE; // unknown routes fall back to the menu
}

/** Where "Back" / Esc goes from each screen. */
export function parentPath(route: Route): string | null {
  switch (route.name) {
    case 'menu':
      return null;
    case 'level':
      return '/levels';
    default:
      return '/menu';
  }
}

export function startRouter(onRoute: (r: Route) => void): void {
  window.addEventListener('hashchange', () => onRoute(parseHash(window.location.hash)));
  onRoute(parseHash(window.location.hash));
}

export function navigate(path: string): void {
  const target = '#' + path;
  if (window.location.hash === target) return;
  window.location.hash = target;
}
