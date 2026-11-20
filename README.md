# BlueHop: Command the Piconet

A neon, browser-based game that teaches **Bluetooth (IEEE 802.15.1 / Bluetooth 1.x)** for
*Modern Wireless Communication Systems, Unit 5*. Each level turns one group of lecture slides into
something you do with your hands, and the rules come from a unit-tested Bluetooth engine.

| Level | What you do | Slides it covers |
|---|---|---|
| **1 · Assemble the Piconet** | Run an inquiry, drag gadgets onto your master to page them, park the 8th, bridge into a second piconet | Piconet (1 master + 7), forming a piconet (master's ID + clock), AMA 3-bit, PMA 8-bit, park, standby → inquiry → page → connected, setup time 0.64 s / 2.56 s, scatternet |
| **2 · Stack Builder** | Build the protocol "tower" six apps need, send a packet through it, then run the L2CAP post office | Bluetooth protocol stack, HCI, LMP, SCO vs ACL, RFCOMM / OBEX / SDP / TCS BIN / AT / PPP / BNEP, profiles, L2CAP multiplexing (CIDs), segmentation & reassembly |

See **[VIVA_NOTES.md](VIVA_NOTES.md)** for the mapping from every mechanic to its Bluetooth concept,
the numbers to quote, and the list of simplifications.

Live: **https://rarerege.github.io/bluehop/**

---

## Run it

Requires Node 20+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173 — also prints a Network URL for phones on the same Wi-Fi
npm test           # Vitest (74 tests)
npm run build      # type-check (tsc) + production build into dist/
npm run preview    # serve the production build locally
```

## Deploy

### GitHub Pages (set up)

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`, then a build with
`BASE_PATH=/<repo>/` and `VITE_PUBLIC_URL=https://<owner>.github.io/<repo>/`, and publishes `dist/`.
(One-time setting: *Settings → Pages → Source: GitHub Actions*.) **Scan to play** on the menu shows a
QR code of the live address for classmates' phones.

### Vercel / any static host

Import the repository in Vercel (the Vite preset needs no configuration) or upload `dist/` to any
static host. Set `VITE_PUBLIC_URL` to the public address so the QR code points to it.

No server, database or paid service is used. Progress and settings live in the browser's
`localStorage` (and the game still works if storage is blocked).

---

## Controls

Everything works with touch, mouse or keyboard. The shortcuts are also listed in **Settings**.

| Key | Action |
|---|---|
| `Esc` | Close dialog / pause / go back |
| `P` or `Space` | Pause / resume (Level 1) |
| `R` | Restart level |
| `I` | Inquiry (Level 1) |
| `Tab` + `Enter` | Pick a block or an answer (Level 2) |
| `M` | Mute / unmute |
| `F` | Fullscreen (projector) |
| `O` | Settings |

**Settings:** sound effects, music (a synthwave loop generated live), volume, reduced motion.
Level 1 runs at ½× simulated time so connection setup is visible; the HUD always shows simulated time.

---

## Architecture

```
src/
  sim/        PURE Bluetooth radio engine — no rendering, no DOM. Fully unit-tested.
    constants.ts    every Bluetooth number, with sources
    hop.ts          hop generator (master BD_ADDR + clock), multi-slot rule, AFH remap
    packets.ts      DM/DH/HV/NULL/POLL types, on-air sizes, max-rate table
    fec.ts          bit-exact 1/3 repetition and (15,10) Hamming codecs
    channel.ts      bit-error model: access code, header, payload probabilities
    piconet.ts      membership: AM_ADDR, PM_ADDR, park/unpark, sniff/hold, scatternet
    setup.ts        inquiry/page delay model (mean 0.64 s, max 2.56 s)
    interferers.ts  Wi-Fi, microwave, rival piconet, collision theory
    afh.ts          AFH channel map (≥ 20 channels)
    link.ts         slot-by-slot link simulator: TDD, ACL ARQ, SCO, interference
  game/
    level1/         Piconet level (Pixi canvas) — uses sim/piconet.ts and sim/setup.ts
    stack/          Stack Builder (DOM) — model.ts holds the layers, cards, hints and L2CAP maths
    Backdrop.ts, fx.ts, MenuScene.ts, LevelSelectScene.ts, LeaderboardScene.ts (Trophies)
  ui/         DOM overlay: theme, toolbar, modals, tutorial / pause / end cards, shortcuts
  app/        scene manager, hash router, settings, progress, safe storage
  audio/      procedural Web Audio sound effects and music (no audio files)
  tests/      Vitest
```

**Rule:** the rules of each level live in pure, tested modules (`src/sim`, `src/game/stack/model.ts`,
`src/game/level1/scoring.ts`); the scenes only draw what those modules report.

**Stack:** Vite + TypeScript (strict), PixiJS v8 + pixi-filters (bloom), plain DOM + CSS variables,
Web Audio, `qrcode`, Vitest.

**Performance:** particles are capped, bloom runs only on glowing layers, and render resolution is
capped at ~2.2 M device pixels (1080p projector renders at 1×, 60 fps).

### What the tests cover

`npm test` runs 74 tests, including:

- channel frequencies (k = 0 → 2402 MHz, k = 78 → 2480 MHz); 1600 slots = 1 s; TDD even/odd slots;
  the multi-slot hop rule (3-slot packet on hop *i* → next packet on *i* + 3)
- data rates 723.2 / 57.6 kbit/s and 433.9 kbit/s, from the formula and from the simulator
- piconet: never more than 7 active slaves, the 8th needs a park, unique AM_ADDR 1–7, 255 PM_ADDRs;
  setup-time model mean 0.64 s, max 2.56 s
- two piconets collide on ≈ 1/79 of slots; the (15,10) Hamming code corrects every single error;
  AFH never keeps fewer than 20 channels
- Stack Builder: every tower stands on Radio + Baseband; voice skips L2CAP (SCO); OBEX sits on RFCOMM,
  SDP / TCS / BNEP on L2CAP, PPP on RFCOMM; every wrong block has an explanation; CID 1 = signalling,
  CID 2 = connectionless; a 2,000-byte message (+4-byte L2CAP header) splits into 6 DH5 packets

---

## Credits and licences

- All graphics and audio are generated in code for this project. The logo is an original "hop trail"
  design, **not** the Bluetooth® trademark.
- Libraries (all MIT): PixiJS, pixi-filters, qrcode, Vite, Vitest; TypeScript (Apache-2.0).
- Sources: J. Schiller, *Mobile Communications* (Unit 5 slides, §7.5 Bluetooth); the course textbook
  chapter 9 "Short-range Wireless Networks" (Bluetooth profiles and protocol stack); Bluetooth Core
  Specification v1.1 / v1.2; IEEE 802.15.1-2002.
