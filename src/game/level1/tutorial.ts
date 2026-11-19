import type { TutorialStep } from '../../ui/overlays';

const core = (x: number, y: number, c = '#00e5ff') =>
  `<circle cx="${x}" cy="${y}" r="20" fill="${c}" opacity="0.15"/><circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${c}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="5" fill="#fff"/>`;
const gadget = (x: number, y: number, stroke: string, extra = '') =>
  `<g ${extra}><circle cx="${x}" cy="${y}" r="12" fill="#0a0d22" stroke="${stroke}" stroke-width="2"/><rect x="${x - 4}" y="${y - 6}" width="8" height="12" rx="2" fill="none" stroke="#fff" stroke-width="1.5"/></g>`;

const inquiryArt = `<svg viewBox="0 0 320 144">
  <circle cx="160" cy="72" r="30" fill="none" stroke="#00e5ff" stroke-width="2" class="anim-blink"/>
  <circle cx="160" cy="72" r="56" fill="none" stroke="#00e5ff" stroke-width="1.5" opacity="0.5" class="anim-blink"/>
  ${core(160, 72)}
  ${gadget(60, 40, '#fff')}${gadget(258, 50, '#fff')}${gadget(90, 112, '#5d6a88', 'opacity="0.4"')}${gadget(236, 112, '#5d6a88', 'opacity="0.4"')}
  <text x="44" y="22" fill="#00e5ff" font-family="Consolas, monospace" font-size="9">found</text>
</svg>`;

const pageArt = `<svg viewBox="0 0 320 144">
  ${core(110, 72)}
  <line x1="132" y1="72" x2="206" y2="72" stroke="#ffe45c" stroke-width="2.5" stroke-dasharray="8 8"/>
  ${gadget(222, 72, '#ffe45c', 'class="anim-blink"')}
  <text x="190" y="46" fill="#00e5ff" font-family="Consolas, monospace" font-size="11" font-weight="700">AMA 011</text>
  <text x="70" y="124" fill="#93a6c9" font-family="Consolas, monospace" font-size="9">hop pattern = master address + clock</text>
</svg>`;

const parkArt = `<svg viewBox="0 0 320 144">
  ${core(130, 72)}
  <circle cx="130" cy="72" r="48" fill="none" stroke="#00e5ff" stroke-width="1" opacity="0.4"/>
  ${[0, 1, 2, 3, 4, 5, 6]
    .map((i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
      return gadget(130 + Math.cos(a) * 48, 72 + Math.sin(a) * 48, '#00e5ff');
    })
    .join('')}
  <rect x="236" y="20" width="64" height="104" rx="8" fill="#5d6a88" opacity="0.12" stroke="#5d6a88"/>
  ${gadget(268, 56, '#5d6a88')}
  <text x="250" y="88" fill="#93a6c9" font-family="Consolas, monospace" font-size="9">PMA 01</text>
</svg>`;

export const LEVEL1_TUTORIAL: TutorialStep[] = [
  {
    title: 'You are the master',
    body: 'Press Inquiry to find gadgets nearby. Each answers after a random back-off — connection setup averages 0.64 s and never takes more than 2.56 s. Time runs at ½× so you can watch it.',
    art: inquiryArt,
  },
  {
    title: 'Page them in',
    body: 'Drag a discovered gadget onto your core to page it. It learns your address and clock, syncs to your hop pattern (its light starts blinking with yours) and gets a 3-bit AM_ADDR, 001–111.',
    art: pageArt,
  },
  {
    title: 'Seven is the limit',
    body: 'Only 7 slaves can be active. To let an 8th in, tap an active slave to park it — it keeps an 8-bit PM_ADDR. Tap a parked one to unpark it. Bonus: bridge into a second piconet.',
    art: parkArt,
  },
];
