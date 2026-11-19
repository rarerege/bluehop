import { Container } from 'pixi.js';
import type { AppContext, Scene } from './Scene';
import type { Route, RouteName } from './router';

type SceneFactory = (route: Route) => Scene;

const FADE_MS = 180;

/**
 * Owns the current scene, swaps scenes with a short fade, and forwards
 * frame ticks, resizes and key presses to it.
 */
export class SceneManager {
  private current: Scene | null = null;
  private currentRoute: Route | null = null;
  private readonly factories = new Map<RouteName, SceneFactory>();
  private readonly sceneLayer = new Container();
  private readonly fadeEl: HTMLElement;
  /** Serialises transitions so rapid clicks can't interleave two swaps. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ctx: AppContext,
    private readonly uiRoot: HTMLElement,
  ) {
    const { app, backdrop } = ctx;
    app.stage.addChild(backdrop.root, this.sceneLayer);

    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    document.body.appendChild(this.fadeEl);

    app.ticker.add((ticker) => {
      // Clamp huge gaps (tab switch, breakpoint) so animations don't jump.
      const dt = Math.min(ticker.deltaMS, 100);
      backdrop.update(dt);
      this.current?.update(dt);
    });

    app.renderer.on('resize', (w: number, h: number) => this.resize(w, h));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.current?.onHidden();
    });
  }

  register(name: RouteName, factory: SceneFactory): void {
    this.factories.set(name, factory);
  }

  get route(): Route | null {
    return this.currentRoute;
  }

  get scene(): Scene | null {
    return this.current;
  }

  show(route: Route): Promise<void> {
    this.queue = this.queue.then(() => this.swap(route)).catch((err) => console.error('[scene]', err));
    return this.queue;
  }

  handleKey(e: KeyboardEvent): boolean {
    return this.current?.onKey(e) ?? false;
  }

  private async swap(route: Route): Promise<void> {
    if (this.currentRoute?.path === route.path && this.current) return;
    const factory = this.factories.get(route.name);
    if (!factory) throw new Error(`No scene registered for "${route.name}"`);

    const hadScene = this.current !== null;
    if (hadScene) await this.fade(true);

    if (this.current) {
      this.sceneLayer.removeChild(this.current.root);
      this.current.destroy();
    }

    const next = factory(route);
    this.current = next;
    this.currentRoute = route;
    this.sceneLayer.addChild(next.root);
    this.uiRoot.appendChild(next.dom);
    this.ctx.backdrop.setMode(next.backdrop);
    next.mount(this.ctx, route);
    const { width, height } = this.ctx.app.screen;
    next.resize(width, height);

    // Move keyboard focus into the new screen for keyboard / screen-reader users.
    const focusTarget = next.dom.querySelector<HTMLElement>('[data-autofocus]') ?? next.dom.querySelector<HTMLElement>('button');
    focusTarget?.focus({ preventScroll: true });

    if (hadScene) await this.fade(false);
  }

  private resize(w: number, h: number): void {
    this.ctx.backdrop.resize(w, h);
    this.current?.resize(w, h);
  }

  private fade(out: boolean): Promise<void> {
    this.fadeEl.classList.toggle('fade--on', out);
    return new Promise((r) => setTimeout(r, FADE_MS));
  }
}
