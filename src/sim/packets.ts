import {
  ACCESS_CODE_BITS,
  CRC_BITS,
  FEC23_BLOCK_BITS,
  FEC23_INFO_BITS,
  HEADER_BITS,
  SLOT_S,
} from './constants';

/**
 * Baseband packet types (Bluetooth Basic Rate). [CORE packet type tables]
 *
 *  ACL (asynchronous, data):  DM1 DH1 DM3 DH3 DM5 DH5  — CRC + ARQ
 *  SCO (synchronous, voice):  HV1 HV2 HV3              — no CRC, no retransmission
 *  Link control:              NULL POLL               — header only
 */

export type FecType = 'none' | '2/3' | '1/3';
export type AclType = 'DM1' | 'DH1' | 'DM3' | 'DH3' | 'DM5' | 'DH5';
export type ScoType = 'HV1' | 'HV2' | 'HV3';
export type ControlType = 'NULL' | 'POLL';
export type PacketTypeName = AclType | ScoType | ControlType;

export interface PacketSpec {
  name: PacketTypeName;
  kind: 'acl' | 'sco' | 'control';
  /** Slots occupied (1, 3 or 5). */
  slots: 1 | 3 | 5;
  /** Maximum user payload in bytes. */
  payloadBytes: number;
  /** Payload header length in bytes (1 for single-slot ACL, 2 for multi-slot ACL). */
  payloadHeaderBytes: number;
  /** Whether the payload carries a 16-bit CRC. */
  crc: boolean;
  fec: FecType;
  /** SCO only: reserved interval T_SCO in slots. */
  tsco?: number;
}

export const PACKETS: Readonly<Record<PacketTypeName, PacketSpec>> = {
  // ACL: "M" = Medium rate (2/3 FEC), "H" = High rate (no FEC)
  DM1: { name: 'DM1', kind: 'acl', slots: 1, payloadBytes: 17, payloadHeaderBytes: 1, crc: true, fec: '2/3' },
  DH1: { name: 'DH1', kind: 'acl', slots: 1, payloadBytes: 27, payloadHeaderBytes: 1, crc: true, fec: 'none' },
  DM3: { name: 'DM3', kind: 'acl', slots: 3, payloadBytes: 121, payloadHeaderBytes: 2, crc: true, fec: '2/3' },
  DH3: { name: 'DH3', kind: 'acl', slots: 3, payloadBytes: 183, payloadHeaderBytes: 2, crc: true, fec: 'none' },
  DM5: { name: 'DM5', kind: 'acl', slots: 5, payloadBytes: 224, payloadHeaderBytes: 2, crc: true, fec: '2/3' },
  DH5: { name: 'DH5', kind: 'acl', slots: 5, payloadBytes: 339, payloadHeaderBytes: 2, crc: true, fec: 'none' },
  // SCO: "HV" = High-quality Voice; one packet every T_SCO slots in each direction → 64 kbit/s
  HV1: { name: 'HV1', kind: 'sco', slots: 1, payloadBytes: 10, payloadHeaderBytes: 0, crc: false, fec: '1/3', tsco: 2 },
  HV2: { name: 'HV2', kind: 'sco', slots: 1, payloadBytes: 20, payloadHeaderBytes: 0, crc: false, fec: '2/3', tsco: 4 },
  HV3: { name: 'HV3', kind: 'sco', slots: 1, payloadBytes: 30, payloadHeaderBytes: 0, crc: false, fec: 'none', tsco: 6 },
  // Control: access code + header only
  NULL: { name: 'NULL', kind: 'control', slots: 1, payloadBytes: 0, payloadHeaderBytes: 0, crc: false, fec: 'none' },
  POLL: { name: 'POLL', kind: 'control', slots: 1, payloadBytes: 0, payloadHeaderBytes: 0, crc: false, fec: 'none' },
};

export const ACL_TYPES: readonly AclType[] = ['DM1', 'DH1', 'DM3', 'DH3', 'DM5', 'DH5'];
export const SCO_TYPES: readonly ScoType[] = ['HV1', 'HV2', 'HV3'];

/** Payload bits *before* FEC: payload header + user data + CRC. */
export function payloadInfoBits(spec: PacketSpec): number {
  return (spec.payloadHeaderBytes + spec.payloadBytes) * 8 + (spec.crc ? CRC_BITS : 0);
}

/** Number of 15-bit FEC blocks for a 2/3-coded payload (last block zero-padded). */
export function fec23Blocks(infoBits: number): number {
  return Math.ceil(infoBits / FEC23_INFO_BITS);
}

/** Payload bits on air (after FEC). E.g. DH5 → 2744, DM5 → 2745, HV1/2/3 → 240. */
export function payloadAirBits(spec: PacketSpec): number {
  const info = payloadInfoBits(spec);
  switch (spec.fec) {
    case 'none':
      return info;
    case '1/3':
      return info * 3;
    case '2/3':
      return fec23Blocks(info) * FEC23_BLOCK_BITS;
  }
}

/** Total packet length on air: access code (72) + header (54) + payload. */
export function packetAirBits(spec: PacketSpec): number {
  return ACCESS_CODE_BITS + HEADER_BITS + payloadAirBits(spec);
}

/** Packet duration on air in µs at 1 Mbit/s (always ≤ slots × 625 µs, the rest is turnaround/hop time). */
export function packetAirTimeUs(spec: PacketSpec): number {
  return packetAirBits(spec);
}

// ── Data rates ──────────────────────────────────────────────────────────

/** The 1-slot return packet that pairs with an ACL type in the asymmetric case (DMx→DM1, DHx→DH1). */
export function returnTypeFor(type: AclType): AclType {
  return type.startsWith('DM') ? 'DM1' : 'DH1';
}

/**
 * Maximum user data rate (bit/s) for `forward` when one exchange is
 * forward packet + return packet:
 *
 *   rate = payloadBytes × 8 / ((slots_fwd + slots_ret) × 625 µs)
 *
 * e.g. DH5 + DH1: 339 × 8 / (6 × 625 µs) = 723 200 bit/s.
 */
export function maxRateBps(forward: PacketTypeName, ret: PacketTypeName): number {
  const f = PACKETS[forward];
  const r = PACKETS[ret];
  return (f.payloadBytes * 8) / ((f.slots + r.slots) * SLOT_S);
}

export interface RateRow {
  type: AclType;
  slots: number;
  payloadBytes: number;
  fec: FecType;
  symmetricKbps: number;
  asymForwardKbps: number;
  asymReturnKbps: number;
}

/** The classic max-data-rate table (symmetric and asymmetric), in kbit/s. */
export function rateTable(): RateRow[] {
  return ACL_TYPES.map((t) => {
    const s = PACKETS[t];
    const ret = returnTypeFor(t);
    return {
      type: t,
      slots: s.slots,
      payloadBytes: s.payloadBytes,
      fec: s.fec,
      symmetricKbps: maxRateBps(t, t) / 1000,
      asymForwardKbps: maxRateBps(t, ret) / 1000,
      asymReturnKbps: maxRateBps(ret, t) / 1000,
    };
  });
}

/** SCO voice rate: payloadBytes × 8 per T_SCO slots, in each direction. Always 64 kbit/s. */
export function scoRateBps(type: ScoType): number {
  const s = PACKETS[type];
  return (s.payloadBytes * 8) / (s.tsco! * SLOT_S);
}
