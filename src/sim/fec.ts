import { FEC23_BLOCK_BITS, FEC23_GENERATOR, FEC23_INFO_BITS } from './constants';

/**
 * Bit-exact FEC codecs used by Bluetooth Basic Rate. [CORE "Error correction"]
 *
 *  - 1/3 FEC: every bit repeated three times; receiver takes a majority vote.
 *    Used for the packet header and HV1 payloads. Corrects 1 error per triplet.
 *  - 2/3 FEC: (15,10) shortened Hamming code, g(D) = (D+1)(D^4+D+1).
 *    Used for DM packets, HV2 and FHS. Corrects any single error in a 15-bit
 *    block and detects all double errors (d_min = 4).
 *
 * Bits are packed into numbers, LSB = first bit. These functions prove the
 * error model; the fast simulator uses the matching closed-form probabilities.
 */

// ── 1/3 repetition ────────────────────────────────────────────────────────

/** Repeat each bit 3×. */
export function rep3Encode(bits: readonly number[]): number[] {
  const out: number[] = [];
  for (const b of bits) out.push(b, b, b);
  return out;
}

/** Majority vote over each triplet. */
export function rep3Decode(coded: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < coded.length; i += 3) {
    out.push(coded[i]! + coded[i + 1]! + coded[i + 2]! >= 2 ? 1 : 0);
  }
  return out;
}

// ── (15,10) shortened Hamming ─────────────────────────────────────────────

const PARITY_BITS = FEC23_BLOCK_BITS - FEC23_INFO_BITS; // 5

/** Remainder of polynomial `value` (degree < 15) divided by g(D), over GF(2). */
function polyMod(value: number): number {
  let v = value;
  for (let deg = FEC23_BLOCK_BITS - 1; deg >= PARITY_BITS; deg--) {
    if (v & (1 << deg)) v ^= FEC23_GENERATOR << (deg - PARITY_BITS);
  }
  return v;
}

/**
 * Systematic encode: codeword = message·D^5 + (message·D^5 mod g).
 * Message in bits 5..14, parity in bits 0..4.
 */
export function hammingEncode(message10: number): number {
  if (message10 < 0 || message10 >= 1 << FEC23_INFO_BITS) throw new RangeError('message must be 10 bits');
  const shifted = message10 << PARITY_BITS;
  return shifted | polyMod(shifted);
}

/** Syndrome → error position, for all 15 single-bit error patterns. */
const SYNDROME_TO_POS = (() => {
  const table = new Map<number, number>();
  for (let pos = 0; pos < FEC23_BLOCK_BITS; pos++) table.set(polyMod(1 << pos), pos);
  return table;
})();

export interface HammingResult {
  message: number;
  /** 0 = no error, 1 = single error corrected, 2 = uncorrectable error detected. */
  status: 0 | 1 | 2;
}

export function hammingDecode(codeword15: number): HammingResult {
  const syndrome = polyMod(codeword15);
  if (syndrome === 0) return { message: codeword15 >>> PARITY_BITS, status: 0 };
  const pos = SYNDROME_TO_POS.get(syndrome);
  if (pos === undefined) return { message: codeword15 >>> PARITY_BITS, status: 2 };
  const fixed = codeword15 ^ (1 << pos);
  return { message: fixed >>> PARITY_BITS, status: 1 };
}
