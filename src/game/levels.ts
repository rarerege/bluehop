/** Level catalogue shown on Level Select (and later used by the results screen). */

export interface LevelInfo {
  n: 1 | 2 | 3;
  title: string;
  pitch: string;
  /** Bluetooth concepts the level demonstrates. */
  concepts: string[];
  /** Accent colour (CSS variable). */
  color: string;
  /** Build phase in which it becomes playable (for "coming soon" tags). */
  phase: number;
  /** Playable now (otherwise shows a "Phase N" tag and a placeholder). */
  ready?: boolean;
}

export const LEVELS: readonly LevelInfo[] = [
  {
    n: 1,
    title: 'Assemble the Piconet',
    pitch: 'Run inquiry, page gadgets into your piconet, hand out AMAs, park the 8th device and bridge a scatternet.',
    concepts: ['Piconet', 'Inquiry / Page', 'AMA 3-bit', 'PMA 8-bit', 'Park', 'Scatternet'],
    color: 'var(--cyan)',
    phase: 4,
    ready: true,
  },
  {
    n: 2,
    title: 'Hop or Drop',
    pitch: 'Ride the 79-lane spectrum highway. Dodge Wi-Fi, a microwave and a rival piconet — then power up AFH.',
    concepts: ['FHSS 1600 hops/s', 'TDD 625 µs', 'ACL vs SCO', 'Collisions', 'AFH'],
    color: 'var(--magenta)',
    phase: 3,
    ready: true,
  },
  {
    n: 3,
    title: 'Gear Shift',
    pitch: 'Stream a 1 MB song through changing noise. Shift between DM/DH 1-3-5 packets and hit the 723.2 kbit/s redline.',
    concepts: ['DM1–DH5', 'FEC 2/3', 'ARQ', '723.2 kbit/s'],
    color: 'var(--yellow)',
    phase: 5,
  },
];
