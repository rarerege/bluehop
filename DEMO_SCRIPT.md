# BlueHop — Demo script (about 8 minutes)

**[Brackets]** = what you do on screen. Normal text = what you say. Times are rough; sections
marked *(optional)* can be cut to fit a 5–6 minute slot.

---

## Before the class (2 minutes)

- Open **https://rarerege.github.io/bluehop/** on the projector laptop and refresh once.
- Press **F** for fullscreen. Turn sound on (speaker icon); music off (Settings) so you can talk.
- Have your phone ready on the same page in case the laptop has trouble.

---

## 1. Opening — main menu (30 s)

**[Main menu on screen.]**

> "This is BlueHop — a game we built to explain Bluetooth from Unit 5. Everything you'll see follows
> the real Bluetooth 1.x rules: the moving trail behind the title is a piconet hopping between the
> 79 channels, from 2402 to 2480 megahertz.
>
> If you want to play along, scan this."

**[Click "Scan to play", leave the QR code up for ~10 seconds, press Esc.]**

> "There are two levels. The first is about *how a piconet is formed*. The second is about the
> *protocol stack* — which layers an app actually uses."

---

## 2. Level 1 — Assemble the Piconet (about 4 minutes)

**[Click Play. The tutorial opens — click Next twice while you say:]**

> "In this level I am the master — the glowing core in the middle. Around me are eleven gadgets:
> a headset, a watch, a laptop, a printer, even a coffee maker. Right now they're in **standby** —
> I don't know they exist. Time runs at half speed so we can actually see connection setup."

**[Click "Let's go".]**

### Inquiry

**[Click Inquiry.]**

> "First I do an **inquiry** — I broadcast 'is anyone there?'. Watch the radar. The gadgets don't
> answer instantly — each one answers after a random delay. In Bluetooth the connection setup
> takes **0.64 seconds on average and at most 2.56 seconds**, and that's exactly the model the
> game uses."

**[Wait until the banner says "Inquiry complete".]**

### Page and AMA

**[Drag the Headset onto the core.]**

> "Now I **page** one device — I connect to it specifically. See the dashed beam: that's paging.
> Then it says **'syncing to hop pattern'**. During paging the master gives the slave two things:
> its **device address**, which decides the hopping pattern, and its **clock**, which decides where
> in the pattern we are. Look at its little light — it now blinks exactly in time with mine.
> That's what *joining a piconet* means: hopping in sync with the master."

**[Point at the badge "AMA 001".]**

> "It gets an **Active Member Address** — AMA 001. It's only **3 bits** long."

**[Drag 2–3 more gadgets quickly onto the core.]**

> "The master can only page one device at a time, so the others wait in a queue. Each one gets the
> next address: 010, 011…"

**[Keep dragging until 7 are active. The banner says "Harald's Rune!"]**

> "Seven active slaves — every 3-bit address from 001 to 111 is used. 000 is reserved for
> broadcast. So a piconet is **one master and at most seven active slaves**."

### Park and PMA

**[Drag an 8th gadget onto the core. The banner says "Piconet full!"]**

> "What if an eighth device wants in? It can't — there's no address left. The answer is to
> **park** someone."

**[Tap one of the active slaves, e.g. the Printer.]**

> "The printer gives up its active address and moves to the parking lot with a **Parked Member
> Address — 8 bits**, so up to 255 devices can be parked. It stays synchronised but doesn't take
> part. And now the waiting device gets the free active address automatically."

> *(If asked: sniff and hold are the other low-power modes — they keep the active address; park
> releases it.)*

### Scatternet *(optional, 45 s)*

**[A second piconet — the Smart TV — appears on the right.]**

> "Now a second piconet shows up: a Smart TV that is the master of its own speaker and remote.
> Each piconet has its **own hopping pattern**. If I drag one of my slaves onto the TV…"

**[Drag an active slave (e.g. the Laptop) onto the TV.]**

> "…it becomes a **bridge**. It's a slave in both piconets and keeps jumping back and forth — see the
> line switching between the two masters and the frequency changing. Linked piconets like this
> form a **scatternet**."

**[Click Finish. The end card appears.]**

> "The end card sums it up: one master, up to seven active slaves with 3-bit addresses, parked
> devices with 8-bit addresses, inquiry then page, and scatternets."

**[Click "Next: Stack Builder".]**

---

## 3. Level 2 — Stack Builder (about 4 minutes)

**[The tutorial opens — click through while you say:]**

> "Level two asks a different question: when an app uses Bluetooth, **which protocol layers does its
> data go through?** Every app needs its own tower. At the bottom is always the **Radio** and the
> **Baseband** — that's the Bluetooth chip. The yellow dashed line is the **Host Controller
> Interface**: below it is the chip, above it is software on the phone. And next to the baseband
> you'll always see **LMP**, the link manager — it sets up and secures the link but doesn't carry
> our data."

**[Click "Let's go".]**

### Tower 1 — Headset

> "First app: take a call on a headset."

**[Tap L2CAP on purpose.]**

> "Let me try L2CAP… and the game stops me: *voice does not go through L2CAP.*"

**[Tap Radio, Baseband, Audio.]**

> "Radio, Baseband, Audio — that's it. Voice goes straight from the baseband on an **SCO link**:
> reserved slots, 64 kilobits per second, and **no retransmission**, because a late voice sample is
> useless."

**[Click "Send 🎤 voice" and watch the packet travel.]**

**[Click Next tower.]**

### Tower 2 — Find a printer *(fast)*

**[Tap L2CAP, SDP. Send. Next.]**

> "To find a printer we use the **Service Discovery Protocol**. Every *data* app goes through
> **L2CAP** over an **ACL** link — that's the big difference from voice."

### Tower 3 — Send a contact card (the main one)

**[Tap L2CAP, RFCOMM, OBEX, vCard.]**

> "To beam a business card: L2CAP, then **RFCOMM**, which pretends to be a serial cable, then
> **OBEX**, object exchange — borrowed from infrared — and the vCard file on top."

**[Click Send and narrate as the packet goes down.]**

> "Watch the packet. On the way down every layer adds its own header — OBEX, RFCOMM, L2CAP with its
> length and channel ID, and finally the baseband's access code and header. That's
> **encapsulation**. On the other laptop each layer peels its header off again."

**[Next tower.]**

### Towers 4–6 *(fast, ~15 s each)*

**[Dial-up: tap L2CAP, RFCOMM, PPP, IP, TCP/UDP. Send. Next.]**

> "Dial-up Internet: the phone acts as a modem. RFCOMM is the cable, **AT commands** dial, and
> **PPP** carries our IP traffic."

**[Cordless: tap L2CAP, TCS BIN. Send. Next.]**

> "A cordless phone: **TCS BIN** is the call signalling — ringing, answering. The voice itself then
> uses SCO, like the headset."

**[Network: tap L2CAP, BNEP, IP, TCP/UDP. Send.]**

> "And sharing a network uses **BNEP**, which carries network packets directly on L2CAP — that one
> came a bit after Bluetooth 1.1."

> "Each of these recipes is called a **profile** — headset profile, object push, dial-up
> networking… — so devices from different makers work together."

**[Click "On to the L2CAP post office".]**

### L2CAP post office

> "Many protocols share one Bluetooth link, so how does the other side know which one a message
> is for? L2CAP writes a **channel ID** into every header. That's **multiplexing**."

**[Sort the first two messages: "open a channel" → CID 0x0001; "SDP: printer?" → CID 0x0040.]**

> "Opening a channel is signalling, always channel 1. The SDP question goes on SDP's own channel."

**[Sort the rest quickly. Click "Next: cut it into packets".]**

> "Last part: a 2,000-byte photo. L2CAP adds a 4-byte header, and one DH5 radio packet carries
> 339 bytes. So how many packets?"

**[Answer 6.]**

> "Six — five full ones and a last one of 309 bytes. L2CAP **segments** the message and the other
> side **reassembles** it. L2CAP can take up to **64 kilobytes**, and each piece is checked by the
> **baseband's 16-bit CRC**."

**[Answer the last two questions (64 kB, Baseband). Click Finish.]**

> "And that's the stack: chip at the bottom, HCI in the middle, L2CAP as the hub for all data,
> voice going around it on SCO."

---

## 4. Closing (20 s)

> "So in two short games: Level 1 is the *network* — piconet, addresses, parking, scatternet. Level 2
> is the *software* — the protocol stack, L2CAP and the profiles. Everything follows the Bluetooth
> rules from the lecture. Thank you — happy to take questions."

---

### If something goes wrong

- **A gadget won't drag:** drag from the middle of its circle; in Level 1 only *discovered* gadgets can
  be paged (run Inquiry first).
- **Stuck on a tower:** read the red hint — it names the missing layer. Order matters (bottom-up).
- **Want to restart a level:** press **R**, or Esc → Level Select.
- **Projector looks old:** refresh the page.
