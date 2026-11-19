import { Graphics } from 'pixi.js';

/**
 * Gadget catalogue + original, stylised vector icons (drawn with Pixi
 * Graphics strokes — no image assets). Each icon fits in about ±14 px.
 */

export type GadgetKind =
  | 'phone'
  | 'headset'
  | 'watch'
  | 'speaker'
  | 'laptop'
  | 'mouse'
  | 'keyboard'
  | 'printer'
  | 'coffee'
  | 'gamepad'
  | 'bulb'
  | 'tv'
  | 'soundbar'
  | 'remote';

export interface Gadget {
  id: string;
  name: string;
  kind: GadgetKind;
}

/** The player's neighbourhood: 11 gadgets (only 7 can be active at once). */
export const GADGETS: readonly Gadget[] = [
  { id: 'headset', name: 'Headset', kind: 'headset' },
  { id: 'watch', name: 'Smartwatch', kind: 'watch' },
  { id: 'speaker', name: 'Speaker', kind: 'speaker' },
  { id: 'laptop', name: 'Laptop', kind: 'laptop' },
  { id: 'mouse', name: 'Mouse', kind: 'mouse' },
  { id: 'keyboard', name: 'Keyboard', kind: 'keyboard' },
  { id: 'printer', name: 'Printer', kind: 'printer' },
  { id: 'coffee', name: 'Coffee maker', kind: 'coffee' },
  { id: 'gamepad', name: 'Game pad', kind: 'gamepad' },
  { id: 'bulb', name: 'Smart bulb', kind: 'bulb' },
  { id: 'phone2', name: "Friend's phone", kind: 'phone' },
];

/** Piconet B for the scatternet bonus. */
export const PICONET_B = {
  master: { id: 'tv', name: 'Smart TV', kind: 'tv' as GadgetKind },
  slaves: [
    { id: 'soundbar', name: 'Soundbar', kind: 'soundbar' as GadgetKind },
    { id: 'remote', name: 'Remote', kind: 'remote' as GadgetKind },
  ],
};

/** Draw a gadget icon centred on (0, 0). */
export function drawIcon(g: Graphics, kind: GadgetKind, color = 0xffffff): void {
  const s = { width: 2, color, alpha: 1 } as const;
  const fill = { color, alpha: 1 } as const;
  switch (kind) {
    case 'phone':
      g.roundRect(-7, -12, 14, 24, 3).stroke(s);
      g.circle(0, 8.5, 1.6).fill(fill);
      break;
    case 'headset':
      g.arc(0, 2, 10, Math.PI, 2 * Math.PI).stroke(s);
      g.roundRect(-13, 0, 6, 10, 2).fill(fill);
      g.roundRect(7, 0, 6, 10, 2).fill(fill);
      break;
    case 'watch':
      g.rect(-4, -14, 8, 6).stroke(s);
      g.rect(-4, 8, 8, 6).stroke(s);
      g.circle(0, 0, 8).stroke(s);
      g.moveTo(0, 0).lineTo(0, -4.5).moveTo(0, 0).lineTo(3.5, 0).stroke(s);
      break;
    case 'speaker':
      g.roundRect(-8, -12, 16, 24, 3).stroke(s);
      g.circle(0, 4, 4).stroke(s);
      g.circle(0, -6, 2).fill(fill);
      break;
    case 'laptop':
      g.roundRect(-10, -10, 20, 14, 2).stroke(s);
      g.moveTo(-14, 8).lineTo(14, 8).stroke({ width: 3, color });
      break;
    case 'mouse':
      g.roundRect(-6.5, -11, 13, 22, 6.5).stroke(s);
      g.moveTo(0, -11).lineTo(0, -3).stroke(s);
      break;
    case 'keyboard':
      g.roundRect(-14, -7, 28, 14, 2).stroke(s);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) g.rect(-10 + c * 4.5, -3.5 + r * 4, 2.5, 2).fill(fill);
      g.rect(-6, 4.5, 12, 1.5).fill(fill);
      break;
    case 'printer':
      g.rect(-8, -12, 16, 7).stroke(s);
      g.roundRect(-12, -5, 24, 11, 2).stroke(s);
      g.rect(-8, 6, 16, 6).stroke(s);
      break;
    case 'coffee':
      g.roundRect(-8, -3, 13, 13, 2).stroke(s);
      g.arc(5, 3.5, 3.5, -Math.PI / 2, Math.PI / 2).stroke(s);
      g.moveTo(-4, -6).lineTo(-3, -11).moveTo(1, -6).lineTo(2, -11).stroke({ width: 1.5, color });
      break;
    case 'gamepad':
      g.roundRect(-13, -7, 26, 14, 7).stroke(s);
      g.moveTo(-8, 0).lineTo(-2, 0).moveTo(-5, -3).lineTo(-5, 3).stroke(s);
      g.circle(5, -1.5, 1.6).fill(fill);
      g.circle(8.5, 1.5, 1.6).fill(fill);
      break;
    case 'bulb':
      g.circle(0, -3, 8).stroke(s);
      g.rect(-3.5, 5, 7, 6).stroke(s);
      break;
    case 'tv':
      g.roundRect(-13, -10, 26, 17, 2).stroke(s);
      g.moveTo(-5, 11).lineTo(5, 11).stroke(s);
      break;
    case 'soundbar':
      g.roundRect(-14, -4.5, 28, 9, 4).stroke(s);
      for (let i = -2; i <= 2; i++) g.circle(i * 5, 0, 1.3).fill(fill);
      break;
    case 'remote':
      g.roundRect(-4.5, -13, 9, 26, 3).stroke(s);
      g.circle(0, -7, 2).fill(fill);
      g.circle(0, 0, 1.3).fill(fill);
      g.circle(0, 5, 1.3).fill(fill);
      break;
  }
}
