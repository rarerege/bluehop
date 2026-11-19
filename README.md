# BlueHop: Command the Piconet

A neon, browser-based game that teaches Bluetooth (IEEE 802.15.1 / Bluetooth 1.x Basic Rate):
piconets, frequency hopping, TDD slots, ACL/SCO links, packet types, FEC/ARQ, scatternets and AFH.
Every game rule is driven by a pure, unit-tested simulation engine, and **Lab Mode** shows the real
numbers for examiners.

> Status: **Levels 1 and 2 are playable** (Phase 4). Engine and level logic have 65 Vitest tests.
> Level 3 and Lab Mode follow.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (also prints a Network URL for phones on the same Wi-Fi)
npm test           # Vitest
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Deploy

- **GitHub Pages:** push to `main`. `.github/workflows/deploy.yml` runs the tests, builds with the
  right base path (`/<repo>/`) and publishes. One-time setup: *Settings → Pages → Source: GitHub Actions*.
- **Vercel:** import the repo; the Vite preset works with no extra config.

Set `VITE_PUBLIC_URL` at build time to control the URL in the "Scan to play" QR code
(the Pages workflow sets it automatically).

## Architecture

```
src/
  app/     scene manager, hash router, settings store, safe localStorage, speed steps
  sim/     pure TypeScript Bluetooth engine — no rendering (Phase 2)
  game/    Pixi scenes (menu backdrop, levels) — only *read* engine state
  ui/      DOM overlay: menus, modals, settings, QR card, toolbar, shortcuts, neon theme
  audio/   procedural Web Audio sound effects (no audio files)
  tests/   Vitest
```

Full architecture notes and `VIVA_NOTES.md` arrive in Phase 8.

## Credits

All visuals and sounds are generated in code. The logo is an original design and is not the
Bluetooth® trademark.
