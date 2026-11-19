import type { TutorialStep } from '../../ui/overlays';

const blk = (x: number, y: number, w: number, label: string, fill: string, text = '#05060f') =>
  `<rect x="${x}" y="${y}" width="${w}" height="20" rx="4" fill="${fill}"/><text x="${x + w / 2}" y="${y + 14}" text-anchor="middle" fill="${text}" font-family="Consolas, monospace" font-size="10" font-weight="700">${label}</text>`;

const towerArt = `<svg viewBox="0 0 320 144">
  ${blk(40, 112, 110, 'Radio', '#00e5ff')}
  ${blk(40, 88, 110, 'Baseband', '#00e5ff')}
  <line x1="34" y1="83" x2="156" y2="83" stroke="#ffe45c" stroke-dasharray="4 3"/>
  <text x="160" y="86" fill="#ffe45c" font-family="Consolas, monospace" font-size="8">HCI</text>
  ${blk(40, 60, 110, 'L2CAP', '#ff2bd6')}
  ${blk(40, 36, 110, 'RFCOMM', '#ffe45c')}
  ${blk(40, 12, 110, 'OBEX', '#ffe45c')}
  <text x="190" y="40" fill="#e6f7ff" font-family="Segoe UI, sans-serif" font-size="11">Every app needs</text>
  <text x="190" y="56" fill="#e6f7ff" font-family="Segoe UI, sans-serif" font-size="11">its own tower of</text>
  <text x="190" y="72" fill="#e6f7ff" font-family="Segoe UI, sans-serif" font-size="11">protocol layers</text>
</svg>`;

const buildArt = `<svg viewBox="0 0 320 144">
  ${blk(30, 112, 100, 'Radio', '#00e5ff')}
  ${blk(30, 88, 100, 'Baseband', '#00e5ff')}
  <rect x="30" y="62" width="100" height="20" rx="4" fill="none" stroke="#00e5ff" stroke-dasharray="4 3"/>
  <text x="80" y="76" text-anchor="middle" fill="#00e5ff" font-family="Consolas, monospace" font-size="11">?</text>
  <g class="anim-blink">${blk(190, 30, 100, 'L2CAP', '#ff2bd6')}</g>
  ${blk(190, 62, 100, 'OBEX', '#ffe45c')}
  ${blk(190, 94, 100, 'Audio', '#ff8a00')}
  <path d="M188 40 C 150 40, 150 72, 134 72" fill="none" stroke="#fff" stroke-width="1.5" marker-end="url(#a)"/>
  <defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#fff"/></marker></defs>
  <text x="190" y="135" fill="#93a6c9" font-family="Consolas, monospace" font-size="9">tap or drag a block</text>
</svg>`;

const sendArt = `<svg viewBox="0 0 320 144">
  ${blk(20, 100, 70, 'Baseband', '#00e5ff')}
  ${blk(20, 76, 70, 'L2CAP', '#ff2bd6')}
  ${blk(20, 52, 70, 'OBEX', '#ffe45c')}
  ${blk(230, 100, 70, 'Baseband', '#00e5ff')}
  ${blk(230, 76, 70, 'L2CAP', '#ff2bd6')}
  ${blk(230, 52, 70, 'OBEX', '#ffe45c')}
  <path d="M90 110 Q 160 70 230 110" fill="none" stroke="#00e5ff" stroke-width="1.5" stroke-dasharray="5 4" class="anim-blink"/>
  <g transform="translate(110 20)">
    <rect width="34" height="16" rx="3" fill="#00e5ff"/><rect x="36" width="30" height="16" rx="3" fill="#ff2bd6"/><rect x="68" width="28" height="16" rx="3" fill="#ffe45c"/><rect x="98" width="20" height="16" rx="3" fill="#3bffb0"/>
  </g>
  <text x="104" y="50" fill="#93a6c9" font-family="Consolas, monospace" font-size="9">headers added on the way down</text>
</svg>`;

export const STACK_TUTORIAL: TutorialStep[] = [
  {
    title: 'Every app needs a tower',
    body: 'A headset, a file transfer, dial-up Internet — each uses a different "tower" of protocol layers. At the bottom are always the Radio and the Baseband (the Bluetooth chip); the HCI line separates the chip from the host software above.',
    art: towerArt,
  },
  {
    title: 'Build it bottom-up',
    body: 'Read the app card, then tap (or drag) the right block onto your tower — one layer at a time, from the bottom up. Pick a wrong block and you get a hint explaining why. No timer: take your time.',
    art: buildArt,
  },
  {
    title: 'Send it, then sort the mail',
    body: 'When the tower is complete, send the data: watch each layer add its header on the way down, cross the radio, and get unwrapped on the other side. After six towers, run the L2CAP post office: channels and splitting big messages.',
    art: sendArt,
  },
];
