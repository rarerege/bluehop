/** Level catalogue shown on Level Select and the Trophies screen. */

export interface LevelInfo {
  n: 1 | 2;
  title: string;
  pitch: string;
  /** Bluetooth concepts the level demonstrates. */
  concepts: string[];
  /** Accent colour (CSS variable). */
  color: string;
}

export const LEVELS: readonly LevelInfo[] = [
  {
    n: 1,
    title: 'Assemble the Piconet',
    pitch: 'Run inquiry, page gadgets into your piconet, hand out AMAs, park the 8th device and bridge a scatternet.',
    concepts: ['Piconet', 'Inquiry / Page', 'AMA 3-bit', 'PMA 8-bit', 'Park', 'Scatternet'],
    color: 'var(--cyan)',
  },
  {
    n: 2,
    title: 'Stack Builder',
    pitch: 'Build the protocol tower each app needs — headset, file transfer, dial-up… — then send data through it and run the L2CAP post office.',
    concepts: ['Protocol stack', 'HCI', 'SCO vs ACL', 'RFCOMM / OBEX / SDP', 'L2CAP CIDs', 'Segmentation'],
    color: 'var(--magenta)',
  },
];
