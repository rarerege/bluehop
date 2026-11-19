/**
 * Bluetooth Basic Rate ground truth used by the simulation engine.
 *
 * Every number the game uses comes from here, so the viva answer to
 * "where does this come from?" is always this file.
 *
 * Sources:
 *  [CORE]    Bluetooth Core Specification v1.1 (2001), Part B "Baseband" —
 *            physical channel, TDD, packet formats, FEC, ARQ, SCO.
 *  [CORE12]  Bluetooth Core Specification v1.2 (2003), Vol 2 Part B —
 *            Adaptive Frequency Hopping (AFH).
 *  [802151]  IEEE 802.15.1-2002 (adopts Bluetooth 1.1 as the WPAN standard).
 *  [SCH]     J. Schiller, "Mobile Communications", 2nd ed., §7.5 Bluetooth —
 *            piconet/scatternet description, setup times, data-rate table.
 *  [80211]   IEEE 802.11b DSSS channel plan (22 MHz wide channels, 5 MHz apart).
 */

// ── Radio ───────────────────────────────────────────────────────────────

/** Number of RF channels in the 2.4 GHz ISM band (US/Europe). [CORE] */
export const NUM_CHANNELS = 79;
/** Frequency of channel k = 0 in MHz. f(k) = 2402 + k MHz. [CORE] */
export const BASE_FREQ_MHZ = 2402;
/** Channel spacing in MHz. [CORE] */
export const CHANNEL_SPACING_MHZ = 1;
/** Centre frequency of RF channel k (0..78) in MHz. [CORE] */
export function channelFreqMHz(k: number): number {
  if (!Number.isInteger(k) || k < 0 || k >= NUM_CHANNELS) throw new RangeError(`channel ${k} out of 0..78`);
  return BASE_FREQ_MHZ + k * CHANNEL_SPACING_MHZ;
}
/** Inverse of channelFreqMHz: the BT channel whose centre is `mhz` (may be out of range). */
export function freqToChannel(mhz: number): number {
  return Math.round((mhz - BASE_FREQ_MHZ) / CHANNEL_SPACING_MHZ);
}

/** Gross air bit rate with GFSK modulation: 1 Mbit/s → 1 bit per µs. [CORE] */
export const GROSS_BIT_RATE_BPS = 1_000_000;
export const MODULATION = 'GFSK (BT = 0.5, h ≈ 0.32)';
/** Nominal range for a Class 2 device (≈ 2.5 mW). Class 1 reaches ~100 m at 100 mW. [SCH] */
export const RANGE_CLASS2_M = 10;
export const TX_POWER_MW = { class3: 1, class2: 2.5, class1: 100 } as const;

// ── Hopping & timing ────────────────────────────────────────────────────

/** Nominal hop rate: one hop per slot. [CORE] */
export const HOPS_PER_SECOND = 1600;
/** Slot length in µs = 1 s / 1600. [CORE] */
export const SLOT_US = 1_000_000 / HOPS_PER_SECOND; // 625
/** Seconds per slot (for rate maths). */
export const SLOT_S = SLOT_US / 1_000_000; // 625e-6

/** Multi-slot packets may occupy 1, 3 or 5 slots (always odd → TDD alternation is kept). [CORE] */
export const ALLOWED_SLOT_COUNTS = [1, 3, 5] as const;

/**
 * The master clock CLK ticks every 312.5 µs (two ticks per slot) and wraps at
 * 2^28 ticks. We index hops directly by slot number, so the slot counter wraps
 * at 2^27 (≈ 23.3 hours). [CORE]
 */
export const SLOT_COUNTER_WRAP = 2 ** 27;

// ── Piconet ─────────────────────────────────────────────────────────────

/** A piconet has exactly one master and up to 7 active slaves. [CORE][SCH] */
export const MAX_ACTIVE_SLAVES = 7;
/** Active Member Address is 3 bits; 0 is the broadcast address, 1..7 for slaves. [CORE] */
export const AM_ADDR_BITS = 3;
export const AM_ADDR_BROADCAST = 0;
/** Parked Member Address is 8 bits; 0 is reserved, so up to 255 parked devices. [CORE][SCH] */
export const PM_ADDR_BITS = 8;
export const MAX_PARKED = 255;
/** Bluetooth device address (BD_ADDR) length in bits. Master's BD_ADDR selects the hop pattern. [CORE] */
export const BD_ADDR_BITS = 48;

/** Connection setup (inquiry + page) — average and maximum. [SCH] */
export const SETUP_MEAN_S = 0.64;
export const SETUP_MAX_S = 2.56;

// ── Baseband packet format ──────────────────────────────────────────────

/** Access code (preamble 4 + sync word 64 + trailer 4). [CORE] */
export const ACCESS_CODE_BITS = 72;
/** Sync word part of the access code, used by the receiver's correlator. [CORE] */
export const SYNC_WORD_BITS = 64;
/**
 * Correlator threshold used by our model: the sync word is still detected with
 * up to this many bit errors. (The spec leaves the threshold to implementers;
 * values around 6–7 of 64 are typical.) SIMPLIFICATION.
 */
export const SYNC_ERROR_TOLERANCE = 6;

/** Header information bits: AM_ADDR 3 + TYPE 4 + FLOW 1 + ARQN 1 + SEQN 1 + HEC 8 = 18. [CORE] */
export const HEADER_FIELDS = { AM_ADDR: 3, TYPE: 4, FLOW: 1, ARQN: 1, SEQN: 1, HEC: 8 } as const;
export const HEADER_INFO_BITS = 18;
/** Header is protected by 1/3-rate repetition FEC → 54 bits on air. [CORE] */
export const HEADER_BITS = HEADER_INFO_BITS * 3; // 54
/** Largest payload on air (DM5: 228 bytes after 2/3 FEC, padded to whole blocks). [CORE] */
export const MAX_PAYLOAD_BITS = 2745;

/** All ACL payloads carry a 16-bit CRC. [CORE] */
export const CRC_BITS = 16;

/** 2/3 FEC = shortened Hamming (15,10), generator g(D) = (D + 1)(D^4 + D + 1). [CORE] */
export const FEC23_BLOCK_BITS = 15;
export const FEC23_INFO_BITS = 10;
/** g(D) = D^5 + D^4 + D^2 + 1 → binary 110101. */
export const FEC23_GENERATOR = 0b110101;

// ── SCO voice ───────────────────────────────────────────────────────────

/** SCO links carry 64 kbit/s voice (CVSD / PCM). [CORE] */
export const SCO_RATE_BPS = 64_000;

// ── Interference model (game) ───────────────────────────────────────────

/**
 * BER applied to a packet that lands on a channel occupied by an interferer
 * in that slot. High enough that the payload is almost certainly lost.
 * GAME MODEL, not from the spec.
 */
export const JAMMED_BER = 0.05;

/** 802.11b channel n (1..13) centre = 2412 + 5(n − 1) MHz, 22 MHz wide. [80211] */
export const WIFI_CHANNEL_WIDTH_MHZ = 22;
export function wifiCenterMHz(wifiChannel: number): number {
  return 2412 + 5 * (wifiChannel - 1);
}

/** Microwave ovens leak around 2450–2460 MHz, switching with the mains (50 Hz in India/Europe). */
export const MICROWAVE_BAND_MHZ = [2450, 2460] as const;
export const MAINS_HZ = 50;

// ── AFH (Bluetooth 1.2 — later enhancement) ─────────────────────────────

/** AFH must keep at least N_min = 20 channels in the hop set. [CORE12] */
export const AFH_MIN_CHANNELS = 20;
