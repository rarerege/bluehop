import { MAX_ACTIVE_SLAVES, MAX_PARKED } from './constants';
import { HopGenerator } from './hop';

/**
 * Piconet membership: one master, up to 7 active slaves with a 3-bit Active
 * Member Address (AM_ADDR 1..7, 0 = broadcast), and up to 255 parked slaves
 * with an 8-bit Parked Member Address (PM_ADDR 1..255). [CORE][SCH]
 *
 * Device states [CORE "Link controller states"]:
 *   standby → inquiry → page → connected
 *   connected low-power modes: sniff, hold (keep AM_ADDR), park (give up AM_ADDR, get PM_ADDR)
 */

export type DeviceState = 'standby' | 'inquiry' | 'page' | 'connected' | 'sniff' | 'hold' | 'park';

export interface Device {
  id: string;
  name: string;
  /** 48-bit BD_ADDR. */
  address: number;
  state: DeviceState;
  /** Active Member Address 1..7 while connected / sniff / hold. */
  amAddr: number | null;
  /** Parked Member Address 1..255 while parked. */
  pmAddr: number | null;
}

export type ConnectResult =
  | { ok: true; amAddr: number }
  | { ok: false; reason: 'piconet-full' | 'already-member' | 'unknown-device' };

export type ParkResult = { ok: true; pmAddr: number } | { ok: false; reason: 'not-active' | 'park-full' };
export type UnparkResult = { ok: true; amAddr: number } | { ok: false; reason: 'not-parked' | 'piconet-full' };

const ACTIVE_STATES: ReadonlySet<DeviceState> = new Set(['connected', 'sniff', 'hold']);

export function isActive(d: Device): boolean {
  return ACTIVE_STATES.has(d.state);
}

export class Piconet {
  /** The master's address + clock define the piconet's hop pattern. */
  readonly hop: HopGenerator;
  private readonly devices = new Map<string, Device>();

  constructor(
    readonly id: string,
    readonly masterAddress: number,
    clockOffset = 0,
  ) {
    this.hop = new HopGenerator(masterAddress, clockOffset);
  }

  /** A device enters radio range (state: standby, not a member yet). */
  addDevice(id: string, name: string, address: number): Device {
    const d: Device = { id, name, address, state: 'standby', amAddr: null, pmAddr: null };
    this.devices.set(id, d);
    return d;
  }

  get(id: string): Device | undefined {
    return this.devices.get(id);
  }

  all(): Device[] {
    return [...this.devices.values()];
  }

  active(): Device[] {
    return this.all().filter(isActive);
  }

  parked(): Device[] {
    return this.all().filter((d) => d.state === 'park');
  }

  /** The device is being discovered / paged (purely a state label). */
  setPhase(id: string, state: 'inquiry' | 'page' | 'standby'): void {
    const d = this.devices.get(id);
    if (d && !isActive(d) && d.state !== 'park') d.state = state;
  }

  /** Lowest free AM_ADDR in 1..7, or null when 7 slaves are already active. */
  freeAmAddr(): number | null {
    const used = new Set(this.active().map((d) => d.amAddr));
    for (let a = 1; a <= MAX_ACTIVE_SLAVES; a++) if (!used.has(a)) return a;
    return null;
  }

  private freePmAddr(): number | null {
    const used = new Set(this.parked().map((d) => d.pmAddr));
    for (let p = 1; p <= MAX_PARKED; p++) if (!used.has(p)) return p;
    return null;
  }

  /**
   * Page completes: the device joins as an active slave and gets an AM_ADDR.
   * Fails with 'piconet-full' when 7 are active — the caller must park one first.
   */
  connect(id: string): ConnectResult {
    const d = this.devices.get(id);
    if (!d) return { ok: false, reason: 'unknown-device' };
    if (isActive(d) || d.state === 'park') return { ok: false, reason: 'already-member' };
    const am = this.freeAmAddr();
    if (am === null) return { ok: false, reason: 'piconet-full' };
    d.state = 'connected';
    d.amAddr = am;
    d.pmAddr = null;
    return { ok: true, amAddr: am };
  }

  /** Park an active slave: it releases its AM_ADDR and gets a PM_ADDR. */
  park(id: string): ParkResult {
    const d = this.devices.get(id);
    if (!d || !isActive(d)) return { ok: false, reason: 'not-active' };
    const pm = this.freePmAddr();
    if (pm === null) return { ok: false, reason: 'park-full' };
    d.state = 'park';
    d.amAddr = null;
    d.pmAddr = pm;
    return { ok: true, pmAddr: pm };
  }

  /** Unpark: needs a free AM_ADDR. */
  unpark(id: string): UnparkResult {
    const d = this.devices.get(id);
    if (!d || d.state !== 'park') return { ok: false, reason: 'not-parked' };
    const am = this.freeAmAddr();
    if (am === null) return { ok: false, reason: 'piconet-full' };
    d.state = 'connected';
    d.amAddr = am;
    d.pmAddr = null;
    return { ok: true, amAddr: am };
  }

  /** Sniff / hold keep the AM_ADDR (low power while staying active). */
  setLowPower(id: string, mode: 'sniff' | 'hold' | 'connected'): boolean {
    const d = this.devices.get(id);
    if (!d || !isActive(d)) return false;
    d.state = mode;
    return true;
  }

  disconnect(id: string): void {
    const d = this.devices.get(id);
    if (!d) return;
    d.state = 'standby';
    d.amAddr = null;
    d.pmAddr = null;
  }
}

// ── Scatternet ──────────────────────────────────────────────────────────

export type BridgeRole = 'slave-slave' | 'master-slave';

export interface Bridge {
  deviceId: string;
  piconets: [string, string];
  role: BridgeRole;
  /** Slots spent in each piconet before switching (time-sharing). */
  dwellSlots: number;
}

/**
 * A scatternet = piconets linked by bridge devices. A bridge belongs to two
 * piconets (slave in both, or master in one and slave in the other) and
 * time-shares between them; in each it follows that piconet's own hop
 * pattern. A device can never be master of two piconets (same master address
 * + clock would make them the same piconet). [CORE][SCH]
 */
export class Scatternet {
  readonly piconets = new Map<string, Piconet>();
  readonly bridges: Bridge[] = [];

  add(p: Piconet): void {
    this.piconets.set(p.id, p);
  }

  addBridge(b: Bridge): { ok: true } | { ok: false; reason: string } {
    const [a, c] = b.piconets;
    if (a === c) return { ok: false, reason: 'a bridge links two different piconets' };
    if (!this.piconets.has(a) || !this.piconets.has(c)) return { ok: false, reason: 'unknown piconet' };
    if (this.bridges.some((x) => x.deviceId === b.deviceId)) return { ok: false, reason: 'device is already a bridge' };
    this.bridges.push(b);
    return { ok: true };
  }

  /** Which piconet the bridge listens to in `slot` (alternating every dwellSlots). */
  bridgePresence(b: Bridge, slot: number): string {
    return b.piconets[Math.floor(slot / b.dwellSlots) % 2]!;
  }

  /** Channel the bridge is tuned to in `slot`: the current piconet's hop. */
  bridgeChannel(b: Bridge, slot: number): number {
    return this.piconets.get(this.bridgePresence(b, slot))!.hop.channelAt(slot);
  }
}
