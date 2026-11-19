import { Container, type Application } from 'pixi.js';
import type { SettingsStore } from './settings';
import type { Synth } from '../audio/Synth';
import type { Route } from './router';
import type { Backdrop, BackdropMode } from '../game/Backdrop';

/** Shared services every scene can use. */
export interface AppContext {
  app: Application;
  settings: SettingsStore;
  audio: Synth;
  backdrop: Backdrop;
  navigate(path: string): void;
  /** Go to the parent screen (Esc / Back button). */
  back(): void;
  openSettings(): void;
  openQr(): void;
}

/**
 * A screen of the game. Each scene owns:
 *  - `root`: a Pixi container on the canvas (game visuals), and
 *  - `dom`:  an HTML element in the UI overlay (menus, HUD, cards).
 * The SceneManager attaches/detaches both and drives `update()` every frame.
 */
export abstract class Scene {
  readonly root = new Container();
  readonly dom: HTMLElement = document.createElement('div');
  /** How the shared animated background should look behind this scene. */
  readonly backdrop: BackdropMode = 'full';
  protected ctx!: AppContext;
  protected route!: Route;

  constructor() {
    this.dom.className = 'screen';
  }

  /** Called once by the manager after both layers are attached. */
  mount(ctx: AppContext, route: Route): void {
    this.ctx = ctx;
    this.route = route;
    this.enter();
  }

  protected abstract enter(): void;
  /** Per-frame update; dtMs is wall-clock milliseconds since last frame. */
  update(_dtMs: number): void {}
  resize(_width: number, _height: number): void {}
  /** Return true if the scene handled the key (stops global shortcuts). */
  onKey(_e: KeyboardEvent): boolean {
    return false;
  }
  /** Called when the browser tab is hidden, so levels can auto-pause. */
  onHidden(): void {}

  /** Override to release timers/listeners; always call super.destroy(). */
  destroy(): void {
    this.root.destroy({ children: true });
    this.dom.remove();
  }
}
