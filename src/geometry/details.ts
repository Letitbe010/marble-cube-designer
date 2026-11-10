import type { Shape } from './ports';

/** A bought part of a piece. Its name is translated; its specification reads the same in any language. */
export interface HardwareItem {
  id: 'axle' | 'nut' | 'striker' | 'pivot' | 'washer';
  count: number;
  spec: string;
}

/** What a piece with moving parts is made of, and how many steps its assembly takes. */
export interface PieceDetails {
  /** Printed parts, in the order their files are exported. */
  printed: string[];
  hardware: HardwareItem[];
  /** Whether the piece is prepared for a motor that is not designed yet. */
  motorReady: boolean;
}

const DETAILS: Partial<Record<Shape, PieceDetails>> = {
  seesaw: {
    printed: ['base', 'arm'],
    hardware: [{ id: 'axle', count: 1, spec: 'ISO 2338 · Ø3 × 50' }],
    motorReady: false,
  },
  pendulum: {
    printed: ['base', 'arm', 'pin'],
    hardware: [
      { id: 'axle', count: 1, spec: 'ISO 2338 · Ø3 × 50' },
      { id: 'nut', count: 2, spec: 'ISO 4032 · M12' },
      { id: 'striker', count: 1, spec: 'ISO 7380 · M5 × 10' },
    ],
    motorReady: false,
  },
  lift: {
    printed: ['base', 'screw'],
    hardware: [
      { id: 'pivot', count: 1, spec: 'ISO 2338 · Ø3 × 16' },
      { id: 'washer', count: 1, spec: 'ISO 7089 · M3' },
    ],
    motorReady: true,
  },
};

export const detailsOf = (shape: Shape): PieceDetails | null => DETAILS[shape] ?? null;

/** Adds up the bought parts of several pieces, each needed a number of times. */
export function hardwareTotals(pieces: { shape: Shape; count: number }[]): HardwareItem[] {
  const totals = new Map<string, HardwareItem>();
  for (const { shape, count } of pieces) {
    for (const item of detailsOf(shape)?.hardware ?? []) {
      const key = `${item.id}|${item.spec}`;
      const known = totals.get(key);
      if (known) known.count += item.count * count;
      else totals.set(key, { ...item, count: item.count * count });
    }
  }
  return [...totals.values()].sort((a, b) => a.spec.localeCompare(b.spec));
}
