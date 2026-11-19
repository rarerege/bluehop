/**
 * BlueHop entry point.
 *
 * Boot order: settings → Pixi canvas → audio → shared backdrop → scene manager
 * → routes → toolbar + shortcuts → start the hash router.
 */
import './ui/theme.css';
import './ui/game.css';
import { Application } from 'pixi.js';
import { SettingsStore } from './app/settings';
import { SceneManager } from './app/SceneManager';
import type { AppContext } from './app/Scene';
import { navigate, parentPath, startRouter } from './app/router';
import { SPEED_STEPS } from './app/speed';
import { Synth } from './audio/Synth';
import { Backdrop } from './game/Backdrop';
import { MenuScene } from './game/MenuScene';
import { LevelSelectScene } from './game/LevelSelectScene';
import { PlaceholderScene } from './game/PlaceholderScene';
import { LEVELS } from './game/levels';
import { Level1Scene } from './game/level1/Level1Scene';
import { Level2Scene } from './game/level2/Level2Scene';
import { Level3Scene } from './game/level3/Level3Scene';
import { closeTopModal, isModalOpen } from './ui/Modal';
import { openSettingsPanel } from './ui/SettingsPanel';
import { openQrCard } from './ui/QrCard';
import { mountToolbar, toggleFullscreen } from './ui/Toolbar';
import { installShortcuts } from './ui/shortcuts';

async function boot(): Promise<void> {
  const settings = new SettingsStore();

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#05060f',
    antialias: true,
    autoDensity: true,
    // Cap DPR at 2: sharper than 1 on phones, without 3× fill cost.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  const audio = new Synth(settings);
  const backdrop = new Backdrop(settings);
  backdrop.resize(app.screen.width, app.screen.height);

  // Only one settings / QR dialog at a time.
  let settingsOpen = false;
  let qrOpen = false;

  const ctx: AppContext = {
    app,
    settings,
    audio,
    backdrop,
    navigate,
    back: () => {
      const route = manager.route;
      const parent = route ? parentPath(route) : null;
      if (parent) {
        audio.back();
        navigate(parent);
      }
    },
    openSettings: () => {
      if (settingsOpen) return;
      settingsOpen = true;
      const m = openSettingsPanel(settings, audio);
      const close = m.close;
      m.close = () => {
        settingsOpen = false;
        close();
      };
    },
    openQr: () => {
      if (qrOpen) return;
      qrOpen = true;
      const m = openQrCard();
      const close = m.close;
      m.close = () => {
        qrOpen = false;
        close();
      };
    },
  };

  const manager = new SceneManager(ctx, document.getElementById('ui')!);

  manager.register('menu', () => new MenuScene());
  manager.register('levels', () => new LevelSelectScene());
  manager.register('level', (route) => {
    if (route.params.n === '1') return new Level1Scene();
    if (route.params.n === '2') return new Level2Scene();
    if (route.params.n === '3') return new Level3Scene();
    const lv = LEVELS.find((l) => String(l.n) === route.params.n) ?? LEVELS[0]!;
    return new PlaceholderScene({
      title: `Level ${lv.n} — ${lv.title}`,
      eyebrow: lv.concepts.join(' · '),
      phase: lv.phase,
      bullets: [lv.pitch],
    });
  });
  manager.register(
    'lab',
    () =>
      new PlaceholderScene({
        title: 'Lab Mode',
        eyebrow: 'For examiners · real numbers',
        phase: 6,
        bullets: [
          'Throughput vs BER for DM1/DH1/DM3/DH3/DM5/DH5 — analytic curve + simulated points',
          'Collision probability vs number of piconets: 1 − (78/79)^(n−1)',
          'Packet loss vs Wi-Fi duty cycle, AFH off vs on',
          'Connection setup time histogram (mean ≈ 0.64 s, max ≈ 2.56 s)',
          'Max data-rate table (723.2 / 57.6 / 433.9 kbit/s) and CSV export',
        ],
      }),
  );
  manager.register(
    'leaderboard',
    () =>
      new PlaceholderScene({
        title: 'Leaderboard',
        eyebrow: 'Fastest 1 MB transfers',
        phase: 7,
        bullets: ['Local leaderboard stored on this device', 'Optional shared live board for the projector (asks first)'],
      }),
  );

  mountToolbar(settings, {
    toggleSound: () => {
      settings.toggle('sound');
      audio.toggle(settings.get().sound);
    },
    toggleLab: () => {
      settings.toggle('labMode');
      audio.toggle(settings.get().labMode);
    },
    toggleFullscreen: () => void toggleFullscreen(),
    openSettings: () => ctx.openSettings(),
  });

  installShortcuts({
    sceneKey: (e) => !isModalOpen() && manager.handleKey(e),
    escape: (e) => {
      if (closeTopModal()) return;
      // Scenes get first refusal (close tutorial, pause a level…).
      if (manager.handleKey(e)) return;
      ctx.back();
    },
    toggleSound: () => {
      settings.toggle('sound');
      audio.toggle(settings.get().sound);
    },
    toggleLab: () => settings.toggle('labMode'),
    toggleFullscreen: () => void toggleFullscreen(),
    openSettings: () => ctx.openSettings(),
    speed: (d) => {
      const i = Math.min(SPEED_STEPS.length - 1, Math.max(0, settings.get().speedIndex + d));
      settings.set({ speedIndex: i });
    },
  });

  startRouter((route) => void manager.show(route));

  // Handy for debugging in the console during development.
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bluehop = { app, manager, settings };
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#ff3b5c;font-family:system-ui">
      BlueHop could not start (WebGL may be disabled).<br/>${String((err as Error)?.message ?? err)}</div>`,
  );
});
