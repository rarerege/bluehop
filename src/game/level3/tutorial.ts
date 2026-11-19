import type { TutorialStep } from '../../ui/overlays';

const gaugeArt = `<svg viewBox="0 0 320 144">
  <path d="M 100 120 A 70 70 0 1 1 220 120" fill="none" stroke="#1a2142" stroke-width="10"/>
  <path d="M 100 120 A 70 70 0 0 1 204 46" fill="none" stroke="#00e5ff" stroke-width="10"/>
  <path d="M 214 100 A 70 70 0 0 1 220 120" fill="none" stroke="#ff3b5c" stroke-width="10"/>
  <line x1="160" y1="70" x2="208" y2="52" stroke="#fff" stroke-width="3" class="anim-blink"/>
  <text x="160" y="104" text-anchor="middle" fill="#fff" font-family="Consolas, monospace" font-size="20" font-weight="700">612.4</text>
  <text x="160" y="124" text-anchor="middle" fill="#93a6c9" font-family="Consolas, monospace" font-size="10">kbit/s · redline 723.2</text>
</svg>`;

const gearArt = `<svg viewBox="0 0 320 144">
  ${['DM1', 'DM3', 'DM5']
    .map((t, i) => `<rect x="${70 + i * 64}" y="22" width="56" height="40" rx="8" fill="#0b1029" stroke="#00e5ff"/><text x="${98 + i * 64}" y="47" text-anchor="middle" fill="#e6f7ff" font-family="Consolas, monospace" font-size="13" font-weight="700">${t}</text>`)
    .join('')}
  ${['DH1', 'DH3', 'DH5']
    .map((t, i) => `<rect x="${70 + i * 64}" y="80" width="56" height="40" rx="8" fill="#0b1029" stroke="${i === 2 ? '#ffe45c' : '#ff2bd6'}" stroke-width="${i === 2 ? 3 : 1}"/><text x="${98 + i * 64}" y="105" text-anchor="middle" fill="#e6f7ff" font-family="Consolas, monospace" font-size="13" font-weight="700">${t}</text>`)
    .join('')}
  <text x="10" y="47" fill="#00e5ff" font-family="Consolas, monospace" font-size="9">FEC 2/3</text>
  <text x="10" y="105" fill="#ff2bd6" font-family="Consolas, monospace" font-size="9">no FEC</text>
</svg>`;

const slotArt = `<svg viewBox="0 0 320 144">
  ${Array.from({ length: 12 }, (_, i) => `<rect x="${16 + i * 24}" y="40" width="1" height="60" fill="#93a6c9" opacity="0.3"/>`).join('')}
  <rect x="18" y="44" width="116" height="52" rx="5" fill="#00e5ff"/>
  <text x="76" y="68" text-anchor="middle" fill="#05060f" font-family="Consolas, monospace" font-size="12" font-weight="700">DH5 · 5 slots</text>
  <text x="76" y="84" text-anchor="middle" fill="#05060f" font-family="Consolas, monospace" font-size="10">one frequency</text>
  <rect x="138" y="58" width="20" height="24" rx="4" fill="#ff2bd6" opacity="0.7"/>
  <rect x="162" y="44" width="116" height="52" rx="5" fill="#ff3b5c" opacity="0.4" stroke="#ff3b5c"/>
  <text x="220" y="74" text-anchor="middle" fill="#fff" font-family="Consolas, monospace" font-size="12" font-weight="700">DH5 NAK → resend</text>
  <text x="16" y="122" fill="#93a6c9" font-family="Consolas, monospace" font-size="10">5 + 1 slots = 3.75 ms per exchange</text>
</svg>`;

export const LEVEL3_TUTORIAL: TutorialStep[] = [
  {
    title: 'Stream the song',
    body: 'Send a 1 MB song to the headset as fast as you can. The speedometer shows your goodput — the user data that actually arrives. Its redline is 723.2 kbit/s, the Basic Rate maximum.',
    art: gaugeArt,
  },
  {
    title: 'Shift gears',
    body: 'Pick the packet type with keys 1–6 or the gear stick. DM packets have 2/3 FEC (safer, smaller); DH packets have none (bigger, fragile). 3- and 5-slot packets carry more per header. The yellow tick shows the current gear’s ceiling.',
    art: gearArt,
  },
  {
    title: 'Watch the weather',
    body: 'Noise changes the bit error rate: clear → drizzle → static storm → lightning. The forecast shows what is coming. Errored packets are NAKed and resent, wasting their slots — so shift down before the storm hits.',
    art: slotArt,
  },
];
