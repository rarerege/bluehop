# BlueHop — Viva notes

How every mechanic maps to Bluetooth (IEEE 802.15.1 / Bluetooth 1.x), where it lives in the code,
the numbers worth quoting, and what was simplified. Sources: the Unit 5 slides (Schiller, *Mobile
Communications*), the textbook's chapter 9 Bluetooth section (profiles, Fig. 9.8 protocol stack),
and the Bluetooth Core Specification v1.1 / v1.2.

---

## 1. Level 1 — Assemble the Piconet

| Bluetooth concept (slide) | What the player does / sees | Code | Test |
|---|---|---|---|
| **Piconet**: 1 master + up to 7 active slaves | Your core in the centre, 7 orbit slots | `Piconet.connect` in `sim/piconet.ts` | `piconet.test.ts` |
| **AMA, 3 bits** (000 = broadcast, 001–111 = slaves) | Badges AMA 001…111; the 8th gets "Piconet full!" | `freeAmAddr`, `connect` | "cannot exceed 7" test |
| **Park → PMA, 8 bits** (> 200 parked) | Tap a slave → parking lot with a PM_ADDR; tap to unpark | `park`, `unpark` | 255 PM_ADDRs test |
| **States**: standby → inquiry → page → connected | Radar sweep (inquiry), page beam, "syncing", connected; master state in the HUD | `setPhase` + `Level1Scene` | — |
| **Forming a piconet**: master gives slaves its clock and device ID; ID = hop pattern, clock = phase | A paged slave's light locks onto the master's blink; tapping a gadget shows its BD_ADDR | `HopGenerator(masterAddress, clockOffset)` | "clock is the phase" test |
| **Setup time**: average 0.64 s, max 2.56 s | Discovery and page delays; avg page time in the HUD | `sampleSetupTimeS` in `sim/setup.ts` | mean/max test |
| **Scatternet**: a device in two piconets, jumping back and forth | Bonus: drag a slave onto the Smart TV → bridge line switches between masters and shows each piconet's frequency | `Scatternet.bridgePresence / bridgeChannel` | scatternet test |

## 2. Level 2 — Stack Builder

A "tower" is the **data path** one application uses, from the Radio up. Six app cards, one per
profile from the textbook, then the L2CAP "post office".

| Tower (profile) | Correct data path (bottom → top) | Key point to say |
|---|---|---|
| Headset call (Headset) | Radio → Baseband → **Audio** | Voice **skips L2CAP**: SCO link straight from the Baseband (64 kbit/s, reserved slots, no retransmission). Button presses go separately as AT commands over RFCOMM. |
| Find a printer (Service Discovery) | Radio → Baseband → L2CAP → **SDP** | All data uses L2CAP over ACL links; SDP sits directly on L2CAP. |
| Send a vCard (Object Push) | … L2CAP → **RFCOMM → OBEX** → vCard | OBEX (from IrDA) runs over RFCOMM, which emulates a serial cable. |
| Dial-up Internet (Dial-up Networking) | … L2CAP → RFCOMM → **PPP → IP → TCP/UDP** | Bluetooth replaces the modem cable; AT commands dial, PPP carries IP. |
| Cordless call setup (Cordless Telephony) | … L2CAP → **TCS BIN** | TCS BIN = call signalling on L2CAP; the voice then uses SCO. |
| Share a network (PAN) | … L2CAP → **BNEP** → IP → TCP/UDP | BNEP carries network packets on L2CAP (standardised after 1.1). |

Always on screen: **Radio + Baseband (+ LMP beside it)** = the Bluetooth chip (controller); the dashed
**HCI** line separates it from the host software above. **LMP** (link manager) is drawn beside the
tower because it controls the link (setup, authentication, encryption, power modes) but carries no
user data.

**Sending:** the packet goes down your tower gaining one header per layer (encapsulation:
`access code + header | L2CAP length + CID | RFCOMM | OBEX | contact.vcf`), crosses the air, and each
layer on the other device removes its own header.

**L2CAP post office (multiplexing):** six messages, four channels —
CID **0x0001** signalling (open/configure channels), CID **0x0002** connectionless (group messages),
and connection-oriented channels (the game uses **0x0040** for SDP and **0x0041** for RFCOMM; dynamic
CIDs start at 0x0040). The CID in each L2CAP header tells the receiver which protocol gets the data.

**Segmentation & reassembly (quiz):**
- 2,000-byte photo + 4-byte L2CAP header (2-byte length + 2-byte CID) = 2,004 bytes;
  2,004 / 339 = 5.9 → **6 DH5 packets** (5 × 339 + 309); the receiver's L2CAP reassembles them.
- Largest L2CAP payload: 16-bit length → **65,535 bytes ≈ 64 kB** (slide: "up to 64 kbyte user data").
- Each baseband packet is checked by the **Baseband's 16-bit CRC** (slide: "16 bit CRC used from
  baseband"); L2CAP adds none of its own.

Code: `src/game/stack/model.ts` (layers, cards, `tryPlace` hints, `segment`, scoring);
tests: `src/tests/stack.test.ts`.

## 3. Numbers to quote (checked by the engine's tests)

| Topic | Value | Where it's tested |
|---|---|---|
| Co-located piconets (FH-CDMA, "each piconet has a unique hopping pattern") | P(collision) = 1 − (78/79)^(n−1): n = 2 → 1.27 %, n = 10 → 10.8 % | `interference.test.ts` |
| Connection setup time | mean 0.64 s, max 2.56 s | `piconet.test.ts` |
| Max data rates | 433.9 symmetric; 723.2 / 57.6 asymmetric; SCO 64 kbit/s | `packets.test.ts` |

Rate derivation to quote: DH5 carries 339 bytes in 5 slots + 1 return slot →
339 × 8 / (6 × 625 µs) = **723.2 kbit/s**; return DH1 27 × 8 / 3.75 ms = **57.6 kbit/s**;
DH5 both ways 339 × 8 / (10 × 625 µs) = **433.9 kbit/s**. Slot = 1 s / 1600 hops = **625 µs**.

---

## 4. Simplifications (be upfront about these)

**Level 1**
1. Inquiry and page delays are drawn from a distribution calibrated to the textbook 0.64 s / 2.56 s
   (T = 2.56 s × Beta(1, 3)); inquiry trains and scan windows are not simulated. Paging is one device
   at a time.
2. The "blink in sync" is a visual stand-in for clock synchronisation; the hop generator itself is a
   seeded hash of (master address, clock) instead of the spec's hop-selection kernel.
3. Park/unpark is instantaneous (no beacon train); the scatternet bridge switches every 400 slots
   with no switching overhead. Level 1 runs at ½× simulated time.

**Level 2**
4. A tower shows the *data path* only. LMP is drawn beside it (control plane), and HCI as a line.
   Real headsets also use RFCOMM for AT commands; that is mentioned, not built.
5. Connection-oriented CIDs 0x0040 / 0x0041 are example values (real ones are allocated at run time
   from 0x0040 upwards). Segmentation assumes DH5 packets of 339 bytes; real links may use other
   packet types.
6. BNEP and the PAN profile came after Bluetooth 1.1 (the game says so). In 1.1, LAN access used
   PPP over RFCOMM.

**Engine**
7. Bit errors are independent; CRC and HEC detect all residual errors; piconets are slot-aligned;
   interferer models (Wi-Fi bursts, microwave at 50 Hz) are game models.

---

## 5. Likely questions — short answers

- **Why only 7 active slaves?** AM_ADDR is 3 bits: 8 values, and 000 is broadcast.
- **How do slaves join the master's hopping?** During paging the master gives them its device
  address (which picks the hop pattern) and its clock (where in the pattern it is).
- **Park vs sniff vs hold?** Park: give up the AMA, keep a PMA, stay synchronised. Sniff: listen
  only periodically. Hold: stop ACL for a while (SCO can continue). Sniff and hold keep the AMA.
- **Why does voice skip L2CAP?** It is real-time: SCO gives reserved slots at 64 kbit/s with no
  retransmission. L2CAP is for packet data over ACL (multiplexing, segmentation, retransmission via
  the baseband's ARQ).
- **What does L2CAP do?** Multiplexes protocols on one link (channel IDs), segments up to 64 kB
  messages into baseband packets and reassembles them, offers connection-oriented, connectionless
  and signalling channels, and carries QoS and group information.
- **What is RFCOMM for?** It emulates a serial cable, so existing cable-based protocols (AT
  commands, PPP, OBEX) run over Bluetooth unchanged.
- **What is a profile?** A recipe of protocol layers and settings for one use case (Headset,
  Object Push, Dial-up Networking…), so devices from different vendors interoperate.
- **Where is the HCI?** Between the Bluetooth chip (Radio, Baseband, LMP) and the host software
  (L2CAP and above), e.g. over USB or UART.

---

## 6. Five-minute projector demo

1. **Menu** → `F` for fullscreen, **Scan to play** so classmates join on their phones.
2. **Level 1** (2 min): Inquiry; page 3–4 gadgets and point at the AMA badges; page to 7, show
   "Piconet full!", park one, show the PMA; if time, the scatternet bridge.
3. **Level 2** (2–3 min): build the headset tower (voice skips L2CAP), then the vCard tower and send
   it — point at the headers being added on the way down; sort one message in the post office.

The full spoken script is in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
