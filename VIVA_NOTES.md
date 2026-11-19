# BlueHop — Viva notes

How every game mechanic maps to Bluetooth Basic Rate (IEEE 802.15.1 / Bluetooth 1.x), where it lives
in the code, the numbers worth quoting, and what was simplified.

All constants are in [`src/sim/constants.ts`](src/sim/constants.ts) with their sources:
Bluetooth Core Spec v1.1 Part B (Baseband) and v1.2 (AFH), IEEE 802.15.1-2002, Schiller *Mobile
Communications* §7.5, and the 802.11b channel plan.

---

## 1. Concept → mechanic → code

| Bluetooth concept | What the player sees | Engine code | Test |
|---|---|---|---|
| **2.4 GHz ISM band, 79 channels × 1 MHz**, f(k) = 2402 + k MHz | Level 2: 79 lanes labelled 2402…2480 MHz | `channelFreqMHz` in `constants.ts` | `radio.test.ts` |
| **FHSS, 1600 hops/s** | A new lane every slot; speed slider up to real-time | `HopGenerator.channelAt` in `hop.ts` | uniformity test |
| **Hop pattern = master's 48-bit address; phase = master clock** | Level 1: a paged slave's light locks onto the master's blink; Lab box shows BD_ADDR, CLK offset, seed | `HopGenerator(masterAddress, clockOffset)` | "clock is the phase" test |
| **TDD, 625 µs slots**: master in even slots, the addressed slave answers in the next odd slot (polling) | Level 2: cyan = master, magenta = slave; Level 3 slot timeline | `LinkSimulator.aclExchange` in `link.ts` | "even/odd slots" test |
| **Multi-slot packets (1/3/5) stay on one frequency**; next packet on f(i + n) | Tall blocks on one lane (L2); 5-slot DH5 block on one frequency (L3 timeline) | `packetChannel`, `nextHopIndex` | "3-slot → i + 3" tests |
| **Piconet = 1 master + up to 7 active slaves, AM_ADDR 3 bits (000 = broadcast)** | Level 1 orbit, badges AMA 001…111, "Piconet full!" on the 8th | `Piconet.connect` in `piconet.ts` | `piconet.test.ts` |
| **Park: give up AM_ADDR, keep 8-bit PM_ADDR (≤ 255)**; sniff/hold keep AM_ADDR | Tap a slave → parking lot with PMA tag; tap again to unpark | `park`, `unpark`, `setLowPower` | 255 PM_ADDRs test |
| **Standby → Inquiry → Page → Connected** | Radar sweep, page beam, "syncing", connected; master state in HUD | `setPhase` + `Level1Scene` | — |
| **Setup time ≈ 0.64 s average, ≤ 2.56 s** | Discovery and page delays; Lab panel 4 histogram | `sampleSetupTimeS` in `setup.ts` | mean/max test |
| **Scatternet**: a bridge in two piconets, time-sharing their hop patterns | Level 1 bonus: bridge line switches between masters, shows each piconet's frequency | `Scatternet.bridgePresence/bridgeChannel` | scatternet test |
| **Packet = access code 72 + header 54 + payload 0–2745 bits** | Level 3 Lab box and end card | `packetAirBits` in `packets.ts` | "DM5 = 2745" test |
| **Header: 18 bits × 1/3 FEC; header error ⇒ packet lost** | "LOST" label; slave doesn't answer | `pHeaderReceived` in `channel.ts` | — |
| **ACL: CRC + ARQ (SEQN alternating bit, ARQN ACK/NAK)** | "NAK" then a white-outlined retransmission | `ArqSender/ArqReceiver` in `link.ts` | "each payload delivered once" |
| **SCO: reserved slots, 64 kbit/s, no retransmission** | Green voice packets; loss = crackle, never resent | `scoExchange`, `scoRateBps` | 64 kbit/s test |
| **FEC 2/3 = (15,10) shortened Hamming, g(D) = (D+1)(D⁴+D+1)** | DM gears survive drizzle and storms | `hammingEncode/Decode` in `fec.ts`, `pFec23` | exhaustive single-error test |
| **DM vs DH trade-off** | Level 3 gear stick; best gear changes with the weather | `analyticGoodputBps` | best-gear test |
| **Max rates 723.2 / 57.6 / 433.9 kbit/s** | Speedometer redline; Lab panel 5 | `maxRateBps`, `rateTable` | formula **and** simulator tests |
| **Wi-Fi coexistence**: 22 MHz-wide APs on channels 1/6/11 | Purple 22-lane bands | `WifiInterferer` in `interferers.ts` | channel-range test |
| **Microwave oven** ≈ 2450–2460 MHz, pulsing with 50 Hz mains | Flickering yellow band, on half of every 20 ms | `MicrowaveInterferer` | 32-slot period test |
| **FH-CDMA / co-located piconets**: P = 1 − (78/79)^(n−1) | Orange rival piconet packets; Lab panel 2 | `RivalPiconet`, `collisionProbabilityAnalytic` | 1/79 over 100k slots |
| **AFH (Bluetooth 1.2, coexistence per IEEE 802.15.2)**: remap hops away from bad channels, keep ≥ 20 | Tap/drag lanes dark red; hop trail re-routes; "AFH floor" warning | `AfhChannelMap` in `afh.ts` | "never < 20, never on blacklisted" |

---

## 2. Derivations to quote

**Slot length.** 1 s / 1600 hops = **625 µs**. At 1 Mbit/s (GFSK) that is 625 bits per slot; a DH1
(72 + 54 + 240 = 366 bits) fits in one slot with time left for the synthesiser to retune.

**Maximum data rates.** Rate = user payload × 8 / (slots per exchange × 625 µs).

- DH5 forward + DH1 return: 339 × 8 / (6 × 625 µs) = 2712 / 3.75 ms = **723.2 kbit/s**; reverse
  27 × 8 / 3.75 ms = **57.6 kbit/s**.
- DH5 both ways: 339 × 8 / (10 × 625 µs) = **433.9 kbit/s** each way.
- DM1 symmetric 17 × 8 / (2 × 625 µs) = 108.8 kbit/s; DH1 172.8; DM3 258.1; DH3 390.4; DM5 286.7.
  (DM5 asymmetric is 477.87 — textbooks print 477.8.)

**SCO = 64 kbit/s for every HV type.** HV1: 10 bytes every 2 slots; HV2: 20 every 4; HV3: 30 every 6
→ 80 bits / 1.25 ms = 64 kbit/s each way. HV1 leaves no slots for ACL (that's why Level 2 uses HV3).

**Payload sizes on air.** DH5: (2 + 339 + 2) bytes × 8 = 2744 bits. DM5: 228 bytes = 1824 bits →
183 Hamming blocks × 15 = **2745 bits** (the maximum). HV1/2/3 all carry 240 bits on air.

**Error model (independent bit errors, probability p).**
- uncoded n bits: (1 − p)ⁿ — DH5 at p = 10⁻⁴: (1 − 10⁻⁴)²⁷⁴⁴ ≈ 0.76;
- 1/3 repetition, per bit: (1 − p)³ + 3p(1 − p)² — header at p = 10⁻³ ≈ 0.99995;
- (15,10) Hamming, per block: (1 − p)¹⁵ + 15p(1 − p)¹⁴ — DM5 at p = 10⁻³: 183 blocks ≈ 0.98.

So at p = 10⁻³ a DH5 almost always fails (≈ 6 % success) while a DM5 almost always succeeds — the
heart of Level 3.

**Goodput with ARQ (Lab panel 1).** G = bits × p_H × p_P × p_H / (625 µs × (n_f + p_H·n_r + (1 − p_H)))
— the slave must hear the header (p_H), the payload must pass CRC (p_P) and the master must hear the
ACK (p_H). The simulator matches this within 3 %.

**Collisions between piconets.** Each other piconet is on my channel with probability 1/79 per slot,
independently, so P(no collision) = (78/79)^(n−1). n = 2 → 1.27 %; n = 10 → 10.8 %.

**Wi-Fi loss without AFH (Lab panel 3).** Channel 6 covers 23 Bluetooth channels: loss ≈ (23/79) ×
duty cycle → 29 % at 100 %. With those 23 channels blacklisted (56 left ≥ 20) the loss is 0.

**Setup-time model.** T = 2.56 s × X with X ~ Beta(1, 3) (density 3(1 − x)²): mean = 2.56/4 =
**0.64 s**, maximum **2.56 s**, CDF 1 − (1 − t/2.56)³.

---

## 3. Simplifications (be upfront about these)

1. **Hop generator.** The real hop-selection kernel (adders, XORs, permutation on 28 address bits and
   the clock) is replaced by a seeded hash of (master address, clock + slot) mod 79. It keeps the
   properties that matter — same inputs ⇒ same sequence, different masters ⇒ independent sequences,
   uniform use of all channels, one hop per slot. The clock is counted in slots (real CLK ticks every
   312.5 µs) and wraps at 2²⁷ slots. The UI labels it "simplified hop generator".
2. **AFH remapping** uses a second hash onto the list of good channels instead of the spec's remapping
   function; the 20-channel minimum is enforced exactly. Level 2's "assess" button is a simple
   loss-rate heuristic, not the spec's channel classification.
3. **Error model.** Bit errors are independent (binary symmetric channel). CRC and HEC are assumed to
   detect every residual error. The access code is detected if ≤ 6 of its 64 sync bits are wrong (the
   spec leaves the correlator threshold to the implementer). A packet hit by interference gets a fixed
   BER of 0.05; there is no capture effect and no adjacent-channel leakage.
4. **Time alignment.** All piconets and interferers are slot-aligned; collisions are "same channel,
   same slot". Real piconets drift relative to each other.
5. **Interferer models.** Wi-Fi is on/off in bursts of 4–6 slots with a given duty cycle; the
   microwave is a 50 % square wave at 50 Hz over 2450–2460 MHz. Both are game models.
6. **Connection setup.** Inquiry and page delays are drawn from a distribution calibrated to the
   textbook 0.64 s / 2.56 s figures; inquiry trains, scan windows and FHS packets are not simulated.
   The master pages one device at a time.
7. **Low-power modes.** Park/unpark is instantaneous (no beacon train); sniff and hold exist only as
   states that keep the AM_ADDR.
8. **Scatternet.** The bridge switches piconets every 400 slots with no guard time or switching cost.
9. **SCO.** HV packets have no CRC in reality, so errors degrade audio; the game counts any residual
   error as a lost (crackling) frame. The SCO slave answers in its reserved slot regardless.
10. **Throughput.** Traffic is saturated; there is no L2CAP or upper-layer overhead. Level 3 and Lab
    panel 1 use an ACK-only (NULL) return, which gives the same forward rate as the DH1-return case.
11. **Time scaling.** Level 1 runs at ½×, Level 2 at the speed setting, Level 3 in real time. The HUD
    always shows simulated time.
12. **Level 3 weather** (BER 10⁻⁵ / 5·10⁻⁴ / 10⁻² / 2.5·10⁻²) is invented, chosen so a different packet
    type is best in each.

---

## 4. Likely questions — short answers

- **Why does hopping make the link robust?** A narrowband interferer hits only the hops that land on
  it — e.g. one bad channel affects ≈ 1 slot in 79 — and ARQ resends those packets on a new frequency.
- **How do several piconets share the band?** Each master's address picks a different pattern, so they
  collide only by chance (≈ 1/79 per slot per neighbour) — frequency-hopping CDMA.
- **Why only 7 active slaves?** AM_ADDR is 3 bits: 8 values, and 000 is reserved for broadcast.
- **Why do multi-slot packets give higher throughput?** One access code + header (126 bits) and one
  turnaround per packet instead of per slot, and fewer return slots per payload byte.
- **Why is DH5 bad in noise?** No FEC: one bit error in 2744 kills the packet, and the retransmission
  costs 6 more slots. DM5's Hamming code fixes one error in every 15 bits.
- **Why isn't voice retransmitted?** SCO has reserved slots and a 64 kbit/s real-time deadline; a late
  sample is useless, so it relies on FEC (HV1/HV2) and accepts losses.
- **What does AFH change?** The hop set: bad channels are replaced by good ones, so a Wi-Fi AP no longer
  costs ≈ 29 % of packets. It came with Bluetooth 1.2 and needs ≥ 20 channels.
- **Where does 0.64 s come from?** Average inquiry + page delay (scan intervals of 1.28 s); the maximum
  2.56 s is two full scan intervals. We sample a distribution with exactly that mean and maximum.

---

## 5. Five-minute projector demo

1. **Menu** → press `F` for fullscreen, show **Scan to play** so classmates join on their phones.
2. **Level 1** (1 min): Inquiry, page 3–4 gadgets, point at the AMA badges; page until 7, show
   "Piconet full!", park one, show the PM_ADDR.
3. **Level 2** (2 min): let Wi-Fi hit, point at the NAKs/retransmissions and the voice crackle; drag
   across the purple lanes for AFH and watch the loss drop. Press `L` to show live numbers.
4. **Level 3** (1 min): start in DH5, hit the redline card (723.2), shift to DM5/DM3 when the storm comes.
5. **Lab Mode** (1 min): throughput vs BER and the collision graph — dots on the theory lines.
