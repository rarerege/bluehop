import {
  ACCESS_CODE_BITS,
  FEC23_BLOCK_BITS,
  HEADER_INFO_BITS,
  SYNC_ERROR_TOLERANCE,
  SYNC_WORD_BITS,
} from './constants';
import { fec23Blocks, payloadInfoBits, type PacketSpec } from './packets';
import type { Rng } from './rng';

/**
 * Channel / error model.
 *
 * Bit errors are independent with probability BER (binary symmetric channel).
 * From that we derive closed-form success probabilities for each part of a
 * packet:
 *
 *   uncoded n bits:       P_ok = (1 − p)^n
 *   1/3 repetition:       per info bit  (1 − p)^3 + 3p(1 − p)^2   (majority vote)
 *   2/3 Hamming (15,10):  per block     (1 − p)^15 + 15p(1 − p)^14 (≤ 1 error)
 *
 * Outcome of a packet:
 *   - access code not detected or header (HEC) fails → packet LOST (receiver
 *     doesn't even know it was addressed; no reply);
 *   - header OK but payload has residual errors → CRC fails → NAK (ACL) or a
 *     bad voice frame (SCO);
 *   - otherwise OK.
 * SIMPLIFICATION: the CRC and HEC are assumed to detect every residual error.
 */

/** P(all n bits correct). */
export function pUncoded(n: number, ber: number): number {
  return Math.pow(1 - ber, n);
}

/** P(one info bit survives 3× repetition + majority vote). */
export function pRep3Bit(ber: number): number {
  const q = 1 - ber;
  return q * q * q + 3 * ber * q * q;
}

/** P(n info bits all survive 1/3 FEC). */
export function pRep3(nInfoBits: number, ber: number): number {
  return Math.pow(pRep3Bit(ber), nInfoBits);
}

/** P(a 15-bit Hamming block decodes correctly) = P(≤ 1 error). */
export function pFec23Block(ber: number): number {
  const q = 1 - ber;
  return Math.pow(q, FEC23_BLOCK_BITS) + FEC23_BLOCK_BITS * ber * Math.pow(q, FEC23_BLOCK_BITS - 1);
}

/** P(nBlocks Hamming blocks all decode correctly). */
export function pFec23(nBlocks: number, ber: number): number {
  return Math.pow(pFec23Block(ber), nBlocks);
}

/** P(at most k errors in n bits) — binomial CDF. */
export function pAtMostErrors(n: number, k: number, ber: number): number {
  let sum = 0;
  let term = Math.pow(1 - ber, n); // C(n,0) p^0 q^n
  for (let i = 0; i <= k && i <= n; i++) {
    sum += term;
    // C(n,i+1) p^(i+1) q^(n-i-1) = term × (n-i)/(i+1) × p/q
    term = ber >= 1 ? 0 : (term * (n - i)) / (i + 1) * (ber / (1 - ber));
  }
  return Math.min(1, sum);
}

/** P(access code detected): sync-word correlator tolerates a few bit errors. */
export function pAccessCode(ber: number): number {
  return pAtMostErrors(SYNC_WORD_BITS, SYNC_ERROR_TOLERANCE, ber);
}

/** P(header OK): 18 info bits, 1/3 repetition. */
export function pHeader(ber: number): number {
  return pRep3(HEADER_INFO_BITS, ber);
}

/** P(the receiver locks on and reads the header) = access code × header. */
export function pHeaderReceived(ber: number): number {
  return pAccessCode(ber) * pHeader(ber);
}

/** P(payload error-free after FEC). */
export function pPayload(spec: PacketSpec, ber: number): number {
  const info = payloadInfoBits(spec);
  if (info === 0) return 1;
  switch (spec.fec) {
    case 'none':
      return pUncoded(info, ber);
    case '1/3':
      return pRep3(info, ber);
    case '2/3':
      return pFec23(fec23Blocks(info), ber);
  }
}

/** P(whole packet received correctly). */
export function pPacketOk(spec: PacketSpec, ber: number): number {
  return pHeaderReceived(ber) * pPayload(spec, ber);
}

export type PacketOutcome = 'ok' | 'payload-error' | 'lost';

/** Draw an outcome for one transmission. */
export function samplePacket(spec: PacketSpec, ber: number, rng: Rng): PacketOutcome {
  if (ber <= 0) return 'ok';
  if (!rng.chance(pHeaderReceived(ber))) return 'lost';
  return rng.chance(pPayload(spec, ber)) ? 'ok' : 'payload-error';
}

/** Expected number of bit errors in a packet. */
export function expectedBitErrors(spec: PacketSpec, ber: number): number {
  return ber * (ACCESS_CODE_BITS + HEADER_INFO_BITS * 3 + payloadInfoBits(spec));
}
