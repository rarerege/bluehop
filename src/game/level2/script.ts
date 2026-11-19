import { AfhChannelMap } from '../../sim/afh';
import { MicrowaveInterferer, RivalPiconet, TimedInterferer, WifiInterferer } from '../../sim/interferers';
import { LinkSimulator } from '../../sim/link';

/**
 * Level 2 "Hop or Drop" script. The level is exactly ONE simulated second:
 * 1600 slots of 625 µs. Interferers enter at fixed simulated times.
 *
 * Link set-up (the story): your phone is the master. It streams data to a
 * laptop over ACL (DH3 forward, DH1 back) while on a voice call with a headset
 * over SCO (HV3, a reserved slot pair every 6 slots).
 */

export const LEVEL2_SLOTS = 1600;
/** Background BER on a clean channel. */
export const LEVEL2_BASE_BER = 1e-5;
/** When the Wi-Fi attack starts (for the Ghost Hopper badge). */
export const WIFI_START = 200;
export const AFH_UNLOCK = 320;
export const RIVAL_START = 950;
/** Fraction of slots the rival piconet transmits in. */
export const RIVAL_LOAD = 0.7;

export interface ScriptEvent {
  at: number;
  title: string;
  detail: string;
  color: string;
  unlockAfh?: boolean;
}

export const EVENTS: readonly ScriptEvent[] = [
  { at: 0, title: 'Calm skies', detail: 'Watch your piconet hop: a new lane every 625 µs.', color: 'var(--cyan)' },
  { at: WIFI_START, title: 'Wi-Fi monster!', detail: 'Access point on Wi-Fi channel 6 — 2426–2448 MHz, 22 lanes wide.', color: 'var(--violet)' },
  { at: AFH_UNLOCK, title: 'AFH unlocked', detail: 'Tap or drag across lanes to blacklist them (Bluetooth 1.2).', color: 'var(--red)', unlockAfh: true },
  { at: 650, title: 'Microwave on', detail: 'Pulsing at 50 Hz around 2450–2460 MHz.', color: 'var(--yellow)' },
  { at: RIVAL_START, title: 'Rival piconet', detail: 'Another piconet with its own hop pattern — it lands on your lane about 1 slot in 79.', color: 'var(--orange)' },
  { at: 1250, title: 'Wi-Fi moved!', detail: 'The AP switched to channel 1 (2401–2423 MHz). Re-adapt!', color: 'var(--violet)' },
];

export interface Level2World {
  sim: LinkSimulator;
  afh: AfhChannelMap;
}

export function createLevel2World(seed = 7): Level2World {
  const afh = new AfhChannelMap();
  const wifi6 = new TimedInterferer(new WifiInterferer('wifi', 6, 0.75, seed + 1, 6), WIFI_START, 1250);
  const wifi1 = new TimedInterferer(new WifiInterferer('wifi', 1, 0.8, seed + 2, 6), 1250);
  const microwave = new TimedInterferer(new MicrowaveInterferer('microwave'), 650);
  const rival = new TimedInterferer(new RivalPiconet('rival', 0x5eedfacecafe + seed, 777, RIVAL_LOAD), RIVAL_START);

  const sim = new LinkSimulator({
    masterAddress: 0x00b1e40b0b00 + seed, // the player's phone
    clockOffset: 4242,
    aclType: 'DH3',
    returnType: 'DH1',
    sco: 'HV3',
    ber: LEVEL2_BASE_BER,
    interferers: [wifi6, wifi1, microwave, rival],
    afh,
    seed,
    aclSlaves: [1],
    scoSlave: 2,
  });
  return { sim, afh };
}
