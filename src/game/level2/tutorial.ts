import type { TutorialStep } from '../../ui/overlays';

/** Lanes background shared by the illustrations: 40 thin lanes standing in for the 79. */
const lanes = Array.from({ length: 40 }, (_, i) => `<rect x="${i * 8}" y="0" width="7" height="144" fill="#00e5ff" opacity="${i % 5 === 0 ? 0.1 : 0.035}"/>`).join('');

const hopArt = `<svg viewBox="0 0 320 144" preserveAspectRatio="xMidYMid slice">
  ${lanes}
  <rect x="0" y="118" width="320" height="2" fill="#00e5ff"/>
  <g class="anim-hop"><rect x="40" y="96" width="7" height="20" rx="2" fill="#00e5ff"/><circle cx="43.5" cy="124" r="4" fill="#fff"/></g>
  <text x="6" y="138" fill="#93a6c9" font-family="Consolas, monospace" font-size="9">2402 MHz</text>
  <text x="270" y="138" fill="#93a6c9" font-family="Consolas, monospace" font-size="9">2480 MHz</text>
</svg>`;

const tddArt = `<svg viewBox="0 0 320 144" preserveAspectRatio="xMidYMid slice">
  ${lanes}
  <g class="anim-rise">
    <rect x="48" y="100" width="7" height="12" rx="2" fill="#00e5ff"/>
    <rect x="200" y="86" width="7" height="12" rx="2" fill="#ff2bd6"/>
    <rect x="120" y="44" width="7" height="38" rx="2" fill="#00e5ff"/>
    <rect x="264" y="30" width="7" height="12" rx="2" fill="#ff2bd6"/>
    <rect x="16" y="16" width="7" height="12" rx="2" fill="#3bffb0"/>
    <rect x="232" y="2" width="7" height="12" rx="2" fill="#3bffb0"/>
  </g>
  <rect x="0" y="118" width="320" height="2" fill="#00e5ff"/>
  <text x="136" y="64" fill="#e6f7ff" font-family="Consolas, monospace" font-size="9">3-slot packet: one lane</text>
</svg>`;

const afhArt = `<svg viewBox="0 0 320 144" preserveAspectRatio="xMidYMid slice">
  ${lanes}
  <rect x="96" y="0" width="92" height="118" fill="#8a4dff" opacity="0.28" class="anim-blink"/>
  <rect x="96" y="0" width="2" height="118" fill="#8a4dff"/><rect x="186" y="0" width="2" height="118" fill="#8a4dff"/>
  <rect x="104" y="0" width="7" height="118" fill="#5a0a1c" opacity="0.9"/>
  <rect x="112" y="0" width="7" height="118" fill="#5a0a1c" opacity="0.9"/>
  <rect x="120" y="0" width="7" height="118" fill="#5a0a1c" opacity="0.9"/>
  <polyline points="40,100 72,80 216,60 248,40 24,20" fill="none" stroke="#00e5ff" stroke-width="1.5" opacity="0.7"/>
  <rect x="0" y="118" width="320" height="2" fill="#00e5ff"/>
  <text x="110" y="134" fill="#ff3b5c" font-family="Consolas, monospace" font-size="9">tap / drag = blacklist</text>
</svg>`;

export const LEVEL2_TUTORIAL: TutorialStep[] = [
  {
    title: 'The spectrum highway',
    body: 'Each vertical lane is one of the 79 Bluetooth channels, 1 MHz apart (2402–2480 MHz). Your piconet jumps to a new lane every 625 µs — 1600 hops per second. Time flows upward from the NOW line.',
    art: hopArt,
  },
  {
    title: 'Who talks when (TDD)',
    body: 'Cyan = your phone (master) in even slots. Magenta = the laptop replying in the next odd slot. Green = the voice call (SCO) in reserved slots. Tall blocks are 3-slot packets: they stay on one lane.',
    art: tddArt,
  },
  {
    title: 'Survive the interference',
    body: 'Wi-Fi, a microwave and a rival piconet will show up. Lost data packets (ACL) are retransmitted; voice (SCO) never is — it crackles. When AFH unlocks (a later enhancement, Bluetooth 1.2), tap or drag across noisy lanes to blacklist them. P pauses, [ ] changes speed.',
    art: afhArt,
  },
];
