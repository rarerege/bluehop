import { channelFreqMHz, JAMMED_BER, SLOT_S, SLOT_US } from './constants';
import { pHeaderReceived, pPayload, samplePacket, type PacketOutcome } from './channel';
import { HopGenerator } from './hop';
import type { AfhChannelMap } from './afh';
import type { Interferer } from './interferers';
import { PACKETS, type AclType, type PacketTypeName, type ScoType } from './packets';
import { Rng } from './rng';

/**
 * Slot-by-slot simulation of one piconet's radio link (TDD, ACL ARQ, SCO,
 * interference). Unit-tested against the Bluetooth rates and rules.
 *
 * Rules implemented:
 *  - TDD: the master starts transmissions in even slots, a slave answers in the
 *    slot right after the master's packet, and only if that packet was
 *    addressed to it (polling). [CORE]
 *  - Multi-slot packets stay on the frequency of their first slot; the next
 *    packet uses the hop for its own start slot (sequence continues as if every
 *    slot hopped). [CORE]
 *  - ACL: CRC + ARQ with alternating-bit SEQN and ARQN acknowledgements.
 *    Header lost → receiver silent → sender retransmits. Payload error → NAK →
 *    retransmit. Duplicates (same SEQN) are ACKed and discarded. [CORE]
 *  - SCO: reserved slot pairs every T_SCO slots, no retransmission. ACL packets
 *    are shortened so they never overlap a reserved SCO slot. [CORE]
 *  - Interference: a packet whose channel is occupied by an interferer in any of
 *    its slots gets BER = JAMMED_BER.
 */

export interface LinkConfig {
  /** Master BD_ADDR (48-bit) — selects the hop pattern. */
  masterAddress: number;
  /** Master clock at slot 0 — phase of the hop pattern. */
  clockOffset?: number;
  /** Packet type the master uses for ACL data. */
  aclType: AclType;
  /** The slave's reply: an ACL type (reverse data) or 'NULL' (ack only). */
  returnType: AclType | 'NULL';
  /** Optional SCO voice link. */
  sco?: ScoType | null;
  /** Background bit error rate, constant or per slot. */
  ber: number | ((slot: number) => number);
  interferers?: Interferer[];
  afh?: AfhChannelMap | null;
  seed?: number;
  /** AM_ADDRs that exchange ACL data (polled round-robin). Default [1]. */
  aclSlaves?: number[];
  /** AM_ADDR of the SCO (voice) slave. Default 2. */
  scoSlave?: number;
}

export type LinkKind = 'acl' | 'sco' | 'control';

/** One packet on the air — what the renderer draws. */
export interface Transmission {
  /** First slot of the packet. */
  slot: number;
  slots: number;
  /** Simulated start time in µs. */
  timeUs: number;
  channel: number;
  freqMHz: number;
  from: 'master' | 'slave';
  amAddr: number;
  type: PacketTypeName;
  link: LinkKind;
  seqn: 0 | 1;
  /** ARQN carried in the header: true = ACK. */
  arqn: boolean;
  /** Re-sending a payload that was already sent. */
  retransmission: boolean;
  outcome: PacketOutcome;
  /** Effective BER the packet experienced. */
  ber: number;
  /** Ids of interferers that hit this packet. */
  jammedBy: string[];
  /** New user bits the receiver accepted from this packet (0 for duplicates / errors). */
  deliveredBits: number;
}

export interface LinkStats {
  slots: number;
  aclSent: number;
  aclRetransmissions: number;
  aclLost: number;
  aclPayloadErrors: number;
  aclDuplicates: number;
  deliveredFwdBits: number;
  deliveredRevBits: number;
  scoSent: number;
  scoBad: number;
  /** Packets hit by any interferer. */
  jammed: number;
  /** Packets hit by a rival piconet (same channel, same slot). */
  rivalCollisions: number;
  /** Per-channel counters (for AFH channel assessment). */
  sentPerChannel: number[];
  badPerChannel: number[];
}

interface ArqSender {
  seqn: 0 | 1;
  /** Current payload already sent at least once (next send is a retransmission). */
  inFlight: boolean;
}
interface ArqReceiver {
  lastSeqn: 0 | 1 | -1;
  /** ARQN to put in our next packet header. */
  ackOut: boolean;
}
interface SlaveLink {
  amAddr: number;
  masterTx: ArqSender;
  slaveRx: ArqReceiver;
  slaveTx: ArqSender;
  masterRx: ArqReceiver;
}

const SLOT_FAMILY: Record<'DM' | 'DH', Record<1 | 3 | 5, AclType>> = {
  DM: { 1: 'DM1', 3: 'DM3', 5: 'DM5' },
  DH: { 1: 'DH1', 3: 'DH3', 5: 'DH5' },
};

/** Same FEC family, at most `maxSlots` slots (DH5 → DH3 → DH1). */
export function shrinkType(type: AclType, maxSlots: number): AclType | null {
  const fam = type.slice(0, 2) as 'DM' | 'DH';
  for (const n of [5, 3, 1] as const) {
    if (n <= PACKETS[type].slots && n <= maxSlots) return SLOT_FAMILY[fam][n];
  }
  return null;
}

function emptyStats(): LinkStats {
  return {
    slots: 0,
    aclSent: 0,
    aclRetransmissions: 0,
    aclLost: 0,
    aclPayloadErrors: 0,
    aclDuplicates: 0,
    deliveredFwdBits: 0,
    deliveredRevBits: 0,
    scoSent: 0,
    scoBad: 0,
    jammed: 0,
    rivalCollisions: 0,
    sentPerChannel: new Array(79).fill(0),
    badPerChannel: new Array(79).fill(0),
  };
}

export class LinkSimulator {
  readonly hop: HopGenerator;
  /** Next free slot = master clock (always even when the master is about to send). */
  slot = 0;
  stats: LinkStats = emptyStats();

  // Mutable at runtime (gear shifts, weather, power-ups).
  aclType: AclType;
  returnType: AclType | 'NULL';
  sco: ScoType | null;
  ber: number | ((slot: number) => number);
  interferers: Interferer[];

  private readonly rng: Rng;
  private readonly links: SlaveLink[];
  private readonly scoSlave: number;
  private rr = 0;

  constructor(cfg: LinkConfig) {
    this.hop = new HopGenerator(cfg.masterAddress, cfg.clockOffset ?? 0, cfg.afh ?? null);
    this.aclType = cfg.aclType;
    this.returnType = cfg.returnType;
    this.sco = cfg.sco ?? null;
    this.ber = cfg.ber;
    this.interferers = cfg.interferers ?? [];
    this.rng = new Rng(cfg.seed ?? 1);
    this.scoSlave = cfg.scoSlave ?? 2;
    this.links = (cfg.aclSlaves ?? [1]).map((amAddr) => ({
      amAddr,
      masterTx: { seqn: 0, inFlight: false },
      slaveRx: { lastSeqn: -1, ackOut: false },
      slaveTx: { seqn: 0, inFlight: false },
      masterRx: { lastSeqn: -1, ackOut: false },
    }));
  }

  set afh(map: AfhChannelMap | null) {
    this.hop.afh = map;
  }
  get afh(): AfhChannelMap | null {
    return this.hop.afh;
  }

  resetStats(): void {
    this.stats = emptyStats();
  }

  /** Simulated time elapsed, µs. */
  get timeUs(): number {
    return this.slot * SLOT_US;
  }

  /** Forward (master → slave) goodput so far, bit/s. */
  goodputFwdBps(): number {
    return this.stats.slots ? this.stats.deliveredFwdBits / (this.stats.slots * SLOT_S) : 0;
  }
  goodputRevBps(): number {
    return this.stats.slots ? this.stats.deliveredRevBits / (this.stats.slots * SLOT_S) : 0;
  }
  /** Fraction of SCO voice packets received correctly. */
  voiceQuality(): number {
    return this.stats.scoSent ? 1 - this.stats.scoBad / this.stats.scoSent : 1;
  }

  /** Run one master→slave exchange (plus reply) and return the packets sent. */
  next(): Transmission[] {
    const s = this.slot;
    const tsco = this.sco ? PACKETS[this.sco].tsco! : 0;

    if (tsco && s % tsco === 0) return this.scoExchange(s);

    const gap = tsco ? tsco - (s % tsco) : Infinity;
    const link = this.links[this.rr % this.links.length]!;
    this.rr++;

    // Fit forward + reply into the gap before the next reserved SCO slot.
    const replySlotsWanted = this.returnType === 'NULL' ? 1 : PACKETS[this.returnType].slots;
    const fwd = shrinkType(this.aclType, gap - 1);
    if (!fwd) {
      // HV1 reserves every pair of slots: no room for ACL at all.
      this.advance(gap);
      return [];
    }
    const fwdSlots = PACKETS[fwd].slots;
    const reply: AclType | 'NULL' =
      this.returnType === 'NULL' ? 'NULL' : (shrinkType(this.returnType, Math.min(replySlotsWanted, gap - fwdSlots)) ?? 'NULL');

    return this.aclExchange(s, link, fwd, reply);
  }

  /** Run exchanges until at least `slots` more slots have elapsed. Returns all transmissions. */
  run(slots: number): Transmission[] {
    const end = this.slot + slots;
    const out: Transmission[] = [];
    while (this.slot < end) out.push(...this.next());
    return out;
  }

  /** Run without collecting transmissions (fast path for tests). */
  runQuiet(slots: number): void {
    const end = this.slot + slots;
    while (this.slot < end) this.next();
  }

  // ── internals ─────────────────────────────────────────────────────────

  private advance(n: number): void {
    this.slot += n;
    this.stats.slots += n;
  }

  private baseBer(slot: number): number {
    return typeof this.ber === 'function' ? this.ber(slot) : this.ber;
  }

  /** Build a transmission and draw its outcome. */
  private transmit(
    slot: number,
    type: PacketTypeName,
    from: 'master' | 'slave',
    amAddr: number,
    seqn: 0 | 1,
    arqn: boolean,
    retransmission: boolean,
  ): Transmission {
    const spec = PACKETS[type];
    const channel = this.hop.packetChannel(slot);
    const jammedBy: string[] = [];
    for (const it of this.interferers) {
      for (let t = slot; t < slot + spec.slots; t++) {
        if (it.jams(channel, t)) {
          jammedBy.push(it.id);
          break;
        }
      }
    }
    const base = this.baseBer(slot);
    const ber = jammedBy.length ? Math.max(base, JAMMED_BER) : base;
    const outcome = samplePacket(spec, ber, this.rng);

    const st = this.stats;
    if (jammedBy.length) st.jammed++;
    if (this.interferers.some((i) => i.kind === 'rival' && jammedBy.includes(i.id))) st.rivalCollisions++;
    if (spec.kind === 'acl') {
      st.sentPerChannel[channel]!++;
      if (outcome !== 'ok') st.badPerChannel[channel]!++;
    }

    return {
      slot,
      slots: spec.slots,
      timeUs: slot * SLOT_US,
      channel,
      freqMHz: channelFreqMHz(channel),
      from,
      amAddr,
      type,
      link: spec.kind,
      seqn,
      arqn,
      retransmission,
      outcome,
      ber,
      jammedBy,
      deliveredBits: 0,
    };
  }

  private aclExchange(s: number, L: SlaveLink, fwd: AclType, reply: AclType | 'NULL'): Transmission[] {
    const st = this.stats;
    const out: Transmission[] = [];

    // 1) Master → slave (even slot).
    const mRetx = L.masterTx.inFlight;
    const m = this.transmit(s, fwd, 'master', L.amAddr, L.masterTx.seqn, L.masterRx.ackOut, mRetx);
    L.masterTx.inFlight = true;
    st.aclSent++;
    if (mRetx) st.aclRetransmissions++;
    out.push(m);
    const fwdSlots = PACKETS[fwd].slots;

    if (m.outcome === 'lost') {
      // Slave never saw a header addressed to it → stays silent. Master waits one slot.
      st.aclLost++;
      this.advance(fwdSlots + 1);
      return out;
    }

    // Slave read the header: ARQN acknowledges the slave's previous data packet.
    if (m.arqn && L.slaveTx.inFlight) {
      L.slaveTx.seqn = (L.slaveTx.seqn ^ 1) as 0 | 1;
      L.slaveTx.inFlight = false;
    }
    // Payload check (CRC).
    if (m.outcome === 'ok') {
      if (m.seqn !== L.slaveRx.lastSeqn) {
        m.deliveredBits = PACKETS[fwd].payloadBytes * 8;
        st.deliveredFwdBits += m.deliveredBits;
        L.slaveRx.lastSeqn = m.seqn;
      } else {
        st.aclDuplicates++;
      }
      L.slaveRx.ackOut = true;
    } else {
      st.aclPayloadErrors++;
      L.slaveRx.ackOut = false;
    }

    // 2) Slave → master, in the slot right after the master's packet (odd slot).
    const rs = s + fwdSlots;
    const hasData = reply !== 'NULL';
    const sRetx = hasData && L.slaveTx.inFlight;
    const r = this.transmit(rs, reply, 'slave', L.amAddr, L.slaveTx.seqn, L.slaveRx.ackOut, sRetx);
    if (hasData) {
      L.slaveTx.inFlight = true;
      st.aclSent++;
      if (sRetx) st.aclRetransmissions++;
    }
    out.push(r);

    if (r.outcome === 'lost') {
      // No ACK heard → master will retransmit; slave's data wasn't received.
      if (hasData) st.aclLost++;
      L.masterRx.ackOut = false;
    } else {
      if (r.arqn) {
        L.masterTx.seqn = (L.masterTx.seqn ^ 1) as 0 | 1;
        L.masterTx.inFlight = false;
      }
      if (hasData) {
        if (r.outcome === 'ok') {
          if (r.seqn !== L.masterRx.lastSeqn) {
            r.deliveredBits = PACKETS[reply].payloadBytes * 8;
            st.deliveredRevBits += r.deliveredBits;
            L.masterRx.lastSeqn = r.seqn;
          } else {
            st.aclDuplicates++;
          }
          L.masterRx.ackOut = true;
        } else {
          st.aclPayloadErrors++;
          L.masterRx.ackOut = false;
        }
      }
    }

    this.advance(fwdSlots + PACKETS[reply].slots);
    return out;
  }

  private scoExchange(s: number): Transmission[] {
    const type = this.sco!;
    const st = this.stats;
    const m = this.transmit(s, type, 'master', this.scoSlave, 0, false, false);
    // The SCO slave owns the next slot by reservation, so it answers regardless.
    const r = this.transmit(s + 1, type, 'slave', this.scoSlave, 0, false, false);
    for (const t of [m, r]) {
      st.scoSent++;
      if (t.outcome !== 'ok') st.scoBad++;
      else t.deliveredBits = PACKETS[type].payloadBytes * 8;
    }
    this.advance(2);
    return [m, r];
  }
}

// ── Analytic throughput ─────────────────────────────────────────────────

/**
 * Expected forward goodput (bit/s) of saturated ACL traffic with ARQ, for a
 * forward type + return type at a given BER (no interferers, no SCO).
 *
 * A payload advances when: slave receives the header (pH) AND the payload is
 * error-free (pP) AND the master receives the reply header carrying the ACK
 * (pH). If the master's header is lost the exchange lasts fwd + 1 slots.
 *
 *     G = bits · pH · pP · pH / (625 µs · (n_f + pH·n_r + (1 − pH)·1))
 */
export function analyticGoodputBps(fwd: AclType, ret: AclType | 'NULL', ber: number): number {
  const f = PACKETS[fwd];
  const nR = PACKETS[ret].slots;
  const pH = pHeaderReceived(ber);
  const pP = pPayload(f, ber);
  const expectedSlots = f.slots + pH * nR + (1 - pH) * 1;
  return (f.payloadBytes * 8 * pH * pP * pH) / (expectedSlots * SLOT_S);
}
