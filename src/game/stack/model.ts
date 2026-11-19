/**
 * Level 2 "Stack Builder" — pure data and rules (no DOM), unit-tested.
 *
 * Source: the "Bluetooth protocol stack" and L2CAP slides (Schiller, Unit 5)
 * and the profiles section of the textbook (Fig. 9.8). A "tower" is the DATA
 * PATH an application uses, bottom (Radio) to top. The Link Manager (LMP) is
 * drawn beside the tower: it controls the link but does not carry user data.
 * The Host Controller Interface (HCI) is the line between the Bluetooth chip
 * (Radio, Baseband, LMP) and the host software above it.
 */

export type LayerId =
  | 'radio'
  | 'baseband'
  | 'audio'
  | 'l2cap'
  | 'rfcomm'
  | 'sdp'
  | 'tcs'
  | 'obex'
  | 'vcard'
  | 'ppp'
  | 'ip'
  | 'tcpudp'
  | 'bnep'
  | 'at';

export type LayerGroup = 'controller' | 'l2cap' | 'middleware' | 'internet' | 'app' | 'audio';

export interface LayerInfo {
  id: LayerId;
  name: string;
  /** One-line description shown on the block and in hints. */
  short: string;
  group: LayerGroup;
  /** What this layer adds to a packet on the way down (shown in the animation). */
  header: string | null;
}

export const LAYERS: Readonly<Record<LayerId, LayerInfo>> = {
  radio: { id: 'radio', name: 'Radio', short: '2.4 GHz transceiver, frequency hopping', group: 'controller', header: null },
  baseband: { id: 'baseband', name: 'Baseband', short: 'packets, SCO & ACL links, hopping, polling', group: 'controller', header: 'access code + header' },
  audio: { id: 'audio', name: 'Audio', short: 'voice samples over SCO links', group: 'audio', header: null },
  l2cap: { id: 'l2cap', name: 'L2CAP', short: 'multiplexing, segmentation & reassembly', group: 'l2cap', header: 'L2CAP: length + CID' },
  rfcomm: { id: 'rfcomm', name: 'RFCOMM', short: 'emulates a serial cable', group: 'middleware', header: 'RFCOMM' },
  sdp: { id: 'sdp', name: 'SDP', short: 'service discovery: "what can you do?"', group: 'middleware', header: 'SDP request' },
  tcs: { id: 'tcs', name: 'TCS BIN', short: 'telephony control: set up / end calls', group: 'middleware', header: 'TCS message' },
  obex: { id: 'obex', name: 'OBEX', short: 'object exchange: send files & cards', group: 'middleware', header: 'OBEX' },
  vcard: { id: 'vcard', name: 'vCard / vCal', short: 'contact & calendar formats', group: 'app', header: null },
  ppp: { id: 'ppp', name: 'PPP', short: 'point-to-point link for IP', group: 'internet', header: 'PPP' },
  ip: { id: 'ip', name: 'IP', short: 'Internet addressing & routing', group: 'internet', header: 'IP' },
  tcpudp: { id: 'tcpudp', name: 'TCP / UDP', short: 'Internet transport', group: 'internet', header: 'TCP' },
  bnep: { id: 'bnep', name: 'BNEP', short: 'carries network (Ethernet) packets', group: 'middleware', header: 'BNEP' },
  at: { id: 'at', name: 'AT commands', short: 'modem control: dial, answer, hang up', group: 'middleware', header: null },
};

export interface AppCard {
  id: string;
  title: string;
  story: string;
  /** Textbook profile this card corresponds to. */
  profile: string;
  /** Baseband link type the data uses. */
  link: 'SCO' | 'ACL';
  /** Correct data path, bottom → top. */
  stack: LayerId[];
  /** How many bottom layers are already in place (the first card teaches the base). */
  prePlaced: number;
  /** Blocks offered in the tray: every missing layer plus distractors. */
  tray: LayerId[];
  /** Label of the data that travels up and down. */
  payload: string;
  /** Sender and receiver shown above the two towers. */
  devices: [string, string];
  /** The key idea shown when the tower is finished. */
  aha: string;
  /** Specific explanations for tempting wrong blocks. */
  wrongHints: Partial<Record<LayerId, string>>;
}

export const CARDS: readonly AppCard[] = [
  {
    id: 'headset',
    title: 'Take a call on your headset',
    story: 'Your voice has to reach the wireless headset many times a second, on time, every time.',
    profile: 'Headset profile',
    link: 'SCO',
    stack: ['radio', 'baseband', 'audio'],
    prePlaced: 0,
    tray: ['l2cap', 'audio', 'radio', 'rfcomm', 'baseband', 'sdp'],
    payload: '🎤 voice',
    devices: ['Phone', 'Headset'],
    aha: 'Voice skips L2CAP completely: it goes straight from Audio to the Baseband on a reserved SCO link (64 kbit/s, no retransmission). (Button presses such as "answer" travel separately as AT commands over RFCOMM.)',
    wrongHints: {
      l2cap: 'Voice does not go through L2CAP — audio uses SCO links straight from the Baseband.',
      rfcomm: 'RFCOMM carries data such as AT commands for the "answer" button, not the voice itself.',
      sdp: 'SDP finds services before connecting; it does not carry your voice.',
    },
  },
  {
    id: 'printer',
    title: 'Find a printer nearby',
    story: 'Before you can print, your phone asks nearby devices what services they offer.',
    profile: 'Service Discovery Application profile',
    link: 'ACL',
    stack: ['radio', 'baseband', 'l2cap', 'sdp'],
    prePlaced: 2,
    tray: ['rfcomm', 'sdp', 'l2cap', 'obex', 'audio'],
    payload: '❓ "Can you print?"',
    devices: ['Phone', 'Printer'],
    aha: 'Every data application (not voice) goes through L2CAP over an ACL link. SDP sits directly on L2CAP and lets devices ask each other "what can you do?".',
    wrongHints: {
      rfcomm: 'No serial cable is needed just to ask a question — SDP talks to L2CAP directly.',
      obex: 'OBEX would send a file; first you have to discover the printer.',
      audio: 'Audio is for voice over SCO links. Asking about services is data, so it uses L2CAP.',
    },
  },
  {
    id: 'vcard',
    title: 'Send your contact card',
    story: 'Beam your vCard to a friend\'s laptop — the classic Bluetooth "business card" swap.',
    profile: 'Object Push profile',
    link: 'ACL',
    stack: ['radio', 'baseband', 'l2cap', 'rfcomm', 'obex', 'vcard'],
    prePlaced: 2,
    tray: ['obex', 'sdp', 'vcard', 'l2cap', 'ppp', 'rfcomm', 'audio'],
    payload: '📇 contact.vcf',
    devices: ['Phone', "Friend's laptop"],
    aha: 'OBEX (object exchange, borrowed from IrDA) runs over RFCOMM, which pretends to be a serial cable, which runs over L2CAP. The vCard is just the file format on top.',
    wrongHints: {
      sdp: 'SDP finds services; it does not carry your file.',
      ppp: 'PPP is for Internet traffic. Swapping a contact card uses OBEX.',
    },
  },
  {
    id: 'dialup',
    title: 'Get online through your phone',
    story: 'Your laptop uses the phone as a wireless modem to reach the Internet (dial-up networking).',
    profile: 'Dial-up Networking profile',
    link: 'ACL',
    stack: ['radio', 'baseband', 'l2cap', 'rfcomm', 'ppp', 'ip', 'tcpudp'],
    prePlaced: 2,
    tray: ['ip', 'at', 'rfcomm', 'tcpudp', 'obex', 'l2cap', 'ppp', 'bnep'],
    payload: '🌐 web page',
    devices: ['Laptop', 'Phone (modem)'],
    aha: 'Bluetooth replaces the modem cable: RFCOMM emulates the serial port, AT commands dial the number, and then your Internet traffic (TCP/IP) flows over PPP.',
    wrongHints: {
      at: 'AT commands dial the number (they also run over RFCOMM), but your web data then flows through PPP.',
      obex: 'OBEX swaps objects like vCards, not web traffic.',
      bnep: 'BNEP is the newer PAN way. Dial-up uses PPP over RFCOMM, like a modem cable.',
    },
  },
  {
    id: 'cordless',
    title: 'Set up a cordless phone call',
    story: 'Your phone acts as a cordless handset for the base station at home — first the call must be set up.',
    profile: 'Cordless Telephony profile',
    link: 'ACL',
    stack: ['radio', 'baseband', 'l2cap', 'tcs'],
    prePlaced: 2,
    tray: ['audio', 'tcs', 'rfcomm', 'l2cap', 'sdp'],
    payload: '📞 call setup',
    devices: ['Handset', 'Home base'],
    aha: 'TCS BIN is the call signalling (ring, answer, hang up) and runs on L2CAP. Once the call is up, the voice itself travels over SCO, exactly like the headset.',
    wrongHints: {
      audio: 'The voice will use Audio over SCO, but setting up the call is signalling: TCS BIN over L2CAP.',
      rfcomm: 'Telephony control (TCS BIN) sits directly on L2CAP — no serial cable emulation.',
      sdp: 'SDP finds the phone service first, but ringing and answering is TCS BIN.',
    },
  },
  {
    id: 'pan',
    title: 'Share a network connection',
    story: 'Join a small Bluetooth network and exchange ordinary Internet packets with the other devices.',
    profile: 'PAN profile (after Bluetooth 1.1)',
    link: 'ACL',
    stack: ['radio', 'baseband', 'l2cap', 'bnep', 'ip', 'tcpudp'],
    prePlaced: 2,
    tray: ['ppp', 'ip', 'bnep', 'rfcomm', 'tcpudp', 'l2cap', 'obex'],
    payload: '🌐 IP packet',
    devices: ['Laptop', 'Access point'],
    aha: 'BNEP carries network packets directly over L2CAP. It (and the PAN profile) arrived after Bluetooth 1.1; in 1.1, LAN access used PPP over RFCOMM like dial-up.',
    wrongHints: {
      ppp: 'PPP over RFCOMM was the older Bluetooth 1.1 LAN-access way; PAN uses BNEP directly on L2CAP.',
      rfcomm: 'BNEP needs no serial-cable emulation — it sits directly on L2CAP.',
      obex: 'OBEX exchanges files; this card is about general network traffic.',
    },
  },
];

export type PlaceResult = { ok: true; done: boolean } | { ok: false; hint: string };

/** Try to put `layer` on top of a tower that already holds `placed` layers. */
export function tryPlace(card: AppCard, placed: number, layer: LayerId): PlaceResult {
  const expected = card.stack[placed];
  if (expected === undefined) return { ok: false, hint: 'This tower is already complete.' };
  if (layer === expected) return { ok: true, done: placed + 1 === card.stack.length };
  const specific = card.wrongHints[layer];
  if (specific) return { ok: false, hint: specific };
  const info = LAYERS[layer];
  const pos = card.stack.indexOf(layer);
  if (pos > placed) return { ok: false, hint: `${info.name} is part of this tower, but it sits higher up. Build the layer underneath first.` };
  if (pos >= 0) return { ok: false, hint: `${info.name} is already in the tower.` };
  return { ok: false, hint: `${info.name} isn't used here — ${info.short}.` };
}

/** Is the layer above the Host Controller Interface (host software)? */
export function isHost(layer: LayerId): boolean {
  return LAYERS[layer].group !== 'controller';
}

// ── L2CAP post office ───────────────────────────────────────────────────

/** L2CAP channel identifiers used in the game (CID 1 and 2 are fixed by the spec). */
export interface ChannelBin {
  cid: number;
  label: string;
  detail: string;
}

export const BINS: readonly ChannelBin[] = [
  { cid: 0x0001, label: 'CID 0x0001', detail: 'Signalling' },
  { cid: 0x0002, label: 'CID 0x0002', detail: 'Connectionless (group)' },
  { cid: 0x0040, label: 'CID 0x0040', detail: 'SDP channel' },
  { cid: 0x0041, label: 'CID 0x0041', detail: 'RFCOMM channel' },
];

export interface SortMessage {
  text: string;
  cid: number;
  why: string;
}

export const MESSAGES: readonly SortMessage[] = [
  { text: '"Please open a channel for RFCOMM"', cid: 0x0001, why: 'Opening and configuring channels is signalling, always on CID 0x0001.' },
  { text: 'SDP: "Do you offer a printer service?"', cid: 0x0040, why: 'SDP got its own connection-oriented channel (dynamic CIDs start at 0x0040).' },
  { text: 'OBEX: contact.vcf, part 1', cid: 0x0041, why: 'OBEX rides on RFCOMM, so it goes to the RFCOMM channel.' },
  { text: '"Hello, everyone in my group!"', cid: 0x0002, why: 'Group messages without a connection use the connectionless channel, CID 0x0002.' },
  { text: '"Configure: max message size 672 bytes"', cid: 0x0001, why: 'Configuration is signalling too (672 bytes is L2CAP\'s default MTU).' },
  { text: 'OBEX: contact.vcf, part 2', cid: 0x0041, why: 'Same RFCOMM channel — the CID in each L2CAP header tells the receiver where the data belongs.' },
];

/** L2CAP basic header: 2-byte length + 2-byte channel ID. */
export const L2CAP_HEADER_BYTES = 4;
/** Largest L2CAP payload: 16-bit length field → 65 535 bytes (≈ 64 kB). */
export const L2CAP_MAX_PAYLOAD = 65_535;
/** User payload of one DH5 baseband packet. */
export const DH5_PAYLOAD_BYTES = 339;

/** Split an L2CAP message into baseband payload sizes (segmentation). */
export function segment(messageBytes: number, perPacket = DH5_PAYLOAD_BYTES): number[] {
  if (messageBytes > L2CAP_MAX_PAYLOAD) throw new RangeError('L2CAP payload is limited to 65 535 bytes');
  let left = messageBytes + L2CAP_HEADER_BYTES;
  const out: number[] = [];
  while (left > 0) {
    const n = Math.min(perPacket, left);
    out.push(n);
    left -= n;
  }
  return out;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

const photo = segment(2000);

export const QUIZ: readonly QuizQuestion[] = [
  {
    q: `A 2,000-byte photo goes down L2CAP, which adds a ${L2CAP_HEADER_BYTES}-byte header. Each DH5 baseband packet carries up to ${DH5_PAYLOAD_BYTES} bytes. How many DH5 packets are needed?`,
    options: ['5', String(photo.length), '7'],
    answer: 1,
    why: `2,004 bytes ÷ 339 = 5.9, so ${photo.length} packets: ${photo.length - 1} full ones of 339 bytes and a last one of ${photo[photo.length - 1]} bytes. The receiver's L2CAP glues them back together (reassembly).`,
  },
  {
    q: 'What is the biggest message L2CAP accepts in one go?',
    options: ['339 bytes', '64 kB', '1 MB'],
    answer: 1,
    why: 'L2CAP\'s 16-bit length field allows up to 65,535 bytes (about 64 kB). Anything larger must be split by the application.',
  },
  {
    q: 'Each piece crosses the air separately. Which layer checks it with a 16-bit CRC?',
    options: ['L2CAP', 'Baseband', 'Radio'],
    answer: 1,
    why: 'L2CAP relies on the Baseband\'s 16-bit CRC (and ARQ) for each packet, so it adds no checksum of its own.',
  },
];

// ── Scoring ─────────────────────────────────────────────────────────────

export interface StackResult {
  buildMistakes: number;
  sortCorrect: number;
  quizCorrect: number;
}

export function scoreStack(r: StackResult): { score: number; stars: number; perfectBuild: boolean } {
  const build = Math.max(0, CARDS.length * 100 - r.buildMistakes * 25);
  const score = build + r.sortCorrect * 50 + r.quizCorrect * 100;
  const sortMiss = MESSAGES.length - r.sortCorrect;
  const quizMiss = QUIZ.length - r.quizCorrect;
  const misses = r.buildMistakes + sortMiss + quizMiss;
  const stars = misses <= 2 ? 3 : misses <= 6 ? 2 : 1;
  return { score, stars, perfectBuild: r.buildMistakes === 0 };
}
