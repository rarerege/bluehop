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
import { Synth } from './audio/Synth';
import { Music } from './audio/Music';
import { Backdrop } from './game/Backdrop';
import { MenuScene } from './game/MenuScene';
import { LevelSelectScene } from './game/LevelSelectScene';
import { Level1Scene } from './game/level1/Level1Scene';
import { StackScene } from './game/stack/StackScene';
import { LabScene } from './game/lab/LabScene';
import { LeaderboardScene } from './game/LeaderboardScene';
import { closeTopModal, isModalOpen } from './ui/Modal';
import { openSettingsPanel } from './ui/SettingsPanel';
import { openQrCard } from './ui/QrCard';
import { mountToolbar, toggleFullscreen } from './ui/Toolbar';
import { installShortcuts } from './ui/shortcuts';

/**
 * Render resolution: sharp on phones (up to 2× DPR) but capped at ~2.2 M
 * device pixels, so a 1080p projector renders at 1× and the bloom filters
 * keep 60 fps (measured: 2× at 1920×1080 dropped an earlier, heavier level to ~23 fps).
 */
const MAX_DEVICE_PIXELS = 2_200_000;
function pickResolution(): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = Math.max(1, window.innerWidth * window.innerHeight);
  return Math.max(1, Math.min(dpr, Math.sqrt(MAX_DEVICE_PIXELS / css)));
}

async function boot(): Promise<void> {
  const settings = new SettingsStore();

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#05060f',
    antialias: true,
    autoDensity: true,
    resolution: pickResolution(),
    preference: 'webgl',
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  // Re-evaluate when the window changes size (e.g. dragged onto the projector).
  window.addEventListener('resize', () => {
    const r = pickResolution();
    if (Math.abs(r - app.renderer.resolution) > 0.01) {
      app.renderer.resolution = r;
      app.renderer.resize(window.innerWidth, window.innerHeight);
    }
  });

  const audio = new Synth(settings);
  const music = new Music(audio, settings);
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
  manager.register('level', (route) => (route.params.n === '2' ? new StackScene() : new Level1Scene()));
  manager.register('lab', () => new LabScene());
  manager.register('leaderboard', () => new LeaderboardScene());

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
  });

  startRouter((route) => void manager.show(route));

  // Handy for debugging in the console during development.
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bluehop = { app, manager, settings, music };
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#ff3b5c;font-family:system-ui">
      BlueHop could not start (WebGL may be disabled).<br/>${String((err as Error)?.message ?? err)}</div>`,
  );
});
