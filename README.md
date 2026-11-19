# BlueHop: Command the Piconet

A neon, browser-based game that teaches **Bluetooth Basic Rate (IEEE 802.15.1 / Bluetooth 1.x)** for
*Modern Wireless Communication Systems, Unit 5*. It looks like an indie game, but every rule —
hopping, slots, packet types, errors, retransmissions, piconet limits, interference, AFH — comes
from a pure, unit-tested simulation engine. **Lab Mode** shows the real numbers and graphs for
examiners.

| Level | What you do | What it teaches |
|---|---|---|
| **1 · Assemble the Piconet** | Run an inquiry, drag gadgets onto your master to page them, park the 8th, bridge into a second piconet | Piconet (1 + 7), AM_ADDR (3 bits), PM_ADDR (8 bits), park, inquiry/page timing, scatternet |
| **2 · Hop or Drop** | Survive one simulated second on a 79-lane spectrum highway while Wi-Fi, a microwave and a rival piconet attack; blacklist lanes with AFH | FHSS 1600 hops/s, TDD 625 µs slots, multi-slot packets, ACL ARQ vs SCO voice, collisions, AFH |
| **3 · Gear Shift** | Stream a 1 MB song through changing noise by shifting between DM1…DH5 | Packet format, FEC vs no FEC, ARQ, the 723.2 / 57.6 / 433.9 kbit/s maximums |
| **Lab Mode** | Run the experiments yourself, export CSV | Throughput vs BER, collision probability, Wi-Fi loss with/without AFH, setup-time distribution, rate table |

See **[VIVA_NOTES.md](VIVA_NOTES.md)** for the mapping from every mechanic to its Bluetooth concept,
the derivations, and the list of simplifications.

---

## Run it

Requires Node 20+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173 — also prints a Network URL for phones on the same Wi-Fi
npm test           # Vitest: engine + level logic (77 tests)
npm run build      # type-check (tsc) + production build into dist/
npm run preview    # serve the production build locally
```

On a slow or unstable network, if `npm install` fails with `ECONNRESET`, retry or switch networks —
packages are cached between attempts.

## Deploy

### GitHub Pages (workflow included)

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`, then a build with
   `BASE_PATH=/<repo>/` and `VITE_PUBLIC_URL=https://<owner>.github.io/<repo>/`, and publishes `dist/`.

The game is then at `https://<owner>.github.io/<repo>/`, and **Scan to play** on the menu shows a QR
code of that address for classmates' phones.

### Vercel / any static host

Import the repository in Vercel (the Vite preset needs no configuration) or upload `dist/` to any
static host. Set `VITE_PUBLIC_URL` to the public address so the QR code points to it.

No server, database or paid service is used. Progress, settings and the leaderboard live in the
browser's `localStorage` (and the game still works if storage is blocked).

---

## Controls

Everything works with touch, mouse or keyboard. The shortcuts are also listed in **Settings**.

| Key | Action |
|---|---|
| `Esc` | Close dialog / pause / go back |
| `P` or `Space` | Pause / resume (levels) |
| `R` | Restart level |
| `M` | Mute / unmute |
| `L` | Toggle Lab Mode overlay (live numbers in every level) |
| `F` | Fullscreen (projector) |
| `O` | Settings |
| `[` `]` | Slower / faster simulation (Level 2) |
| `I` | Inquiry (Level 1) |
| `A` | AFH channel assessment (Level 2) |
| `1`–`6` | Shift to DM1, DH1, DM3, DH3, DM5, DH5 (Level 3) |

**Settings:** sound effects, music, volume, reduced motion (no screen shake, fewer particles, static
background), simulation speed (1 hop per 0.5 s … real-time 1600 hops/s) and Lab Mode.

**Time scaling:** real Bluetooth is too fast to watch, so time is slowed — Level 2 follows the speed
setting (default 10 hops/s), Level 1 runs at a fixed ½×, Level 3 runs in real time (½× / ¼× optional).
Every HUD shows the *simulated* time, so the protocol timing is never misrepresented.

---

## Architecture

```
src/
  sim/        PURE simulation engine — no rendering, no DOM. Fully unit-tested.
    constants.ts    every Bluetooth number, with sources
    hop.ts          hop generator (master BD_ADDR + clock), multi-slot rule, AFH remap
    packets.ts      DM/DH/HV/NULL/POLL types, on-air sizes, max-rate table
    fec.ts          bit-exact 1/3 repetition and (15,10) Hamming codecs
    channel.ts      BER error model: access code, header, payload probabilities
    piconet.ts      membership: AM_ADDR, PM_ADDR, park/unpark, sniff/hold, scatternet
    setup.ts        inquiry/page delay model (mean 0.64 s, max 2.56 s)
    interferers.ts  Wi-Fi, microwave, rival piconet, collision theory
    afh.ts          AFH channel map (≥ 20 channels)
    link.ts         slot-by-slot link simulator: TDD, ACL ARQ, SCO, interference
    experiments.ts  Lab Mode experiments (analytic + simulated)
  game/       Pixi scenes — they only READ engine state
    level1/ level2/ level3/ lab/   one folder per screen
    Backdrop.ts, fx.ts             shared animated background and particle / shake effects
  ui/         DOM overlay: theme, menus, HUD, modals, tutorial / pause / end cards, shortcuts
  app/        scene manager, hash router, settings, progress, leaderboard, safe storage
  audio/      procedural Web Audio sound effects and synthwave music (no audio files)
  lab/        Web Worker + protocol for Lab simulations, CSV export
  tests/      Vitest
```

**Rule:** `src/sim` never imports Pixi or touches the DOM. The levels and Lab Mode create a
`LinkSimulator` / `Piconet` / `HopGenerator`, step it, and draw what it reports. The same seeded
engine runs headless in tests, so balance tests replay a level exactly: the browser run and the test
produce identical numbers.

**Stack:** Vite + TypeScript (strict), PixiJS v8 + pixi-filters (bloom), plain DOM + CSS variables,
Chart.js (loaded only on the Lab screen), Web Audio, `qrcode`, Vitest.

**Performance:** particles are capped, effects are throttled at high hop rates, bloom runs only on the
layers that glow, and the render resolution is capped at ~2.2 M device pixels so a 1080p projector
renders at 1× (measured 60 fps; 2× had dropped to 23 fps). Lab simulations run in a Web Worker.

### What the tests cover

`npm test` runs 77 tests, including every item in the brief:

- channel frequencies (k = 0 → 2402 MHz, k = 78 → 2480 MHz); 1600 slots = 1 s; TDD even/odd slots
- multi-slot hop rule (after a 3-slot packet on hop index *i*, the next packet uses *i* + 3)
- data rates 723.2 / 57.6 kbit/s and 433.9 kbit/s — from the formula **and** from the simulator
- BER = 0 → every packet succeeds; the (15,10) Hamming code corrects every single error
  (exhaustive: 1024 messages × 15 positions) and detects every double error
- piconet: never more than 7 active slaves, the 8th needs a park, unique AM_ADDR 1–7, 255 PM_ADDRs
- two piconets collide on ≈ 1/79 of 100 000 slots; more piconets follow 1 − (78/79)^(n−1)
- AFH never keeps fewer than 20 channels and never hops onto a blacklisted one
- ARQ delivers each payload once; simulated goodput matches the analytic curve within 3 %
- level balance: Level 2 and Level 3 star thresholds and badges are reachable with good play and
  not without; Level 1 scoring

---

## Credits and licences

- All graphics (icons, logo, effects) and all audio (effects and music) are generated in code for
  this project. The logo is an original "hop trail" design, **not** the Bluetooth® trademark.
- Libraries (all MIT): PixiJS, pixi-filters, Chart.js, qrcode, Vite, Vitest, TypeScript (Apache-2.0).
- Sources for the numbers: Bluetooth Core Specification v1.1 (Part B, Baseband) and v1.2 (AFH);
  IEEE 802.15.1-2002; J. Schiller, *Mobile Communications*, 2nd ed., §7.5; IEEE 802.11b channel plan.
