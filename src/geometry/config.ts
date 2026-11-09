/** All physical dimensions, in millimetres. Tune these after printing the calibration piece. */

/** A groove runs along the top of a piece; a slot is open to the top at any depth. */
export type Section = 'groove' | 'slot' | 'tunnel' | 'underside';

export interface Level {
  /** Height of the ball centre above the bottom of the piece. */
  z: number;
  section: Section;
}

export const LEVEL_IDS = ['T', 'M', 'B'] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

export const CONFIG = {
  /** Size of one grid unit. */
  cubeSize: 50,
  /** Removed from the piece's X and Y width so printed pieces fit side by side. */
  fitClearance: 0.2,
  ballDiameter: 16,
  /** Extra diameter so the ball rolls freely on FDM surfaces. */
  boreClearance: 1,
  /** Thinnest wall that prints reliably with a 0.4 mm nozzle. */
  minWall: 2.5,
  /** Sphere resolution of the cutting tool. */
  sphereSegments: 32,
  /** Number of steps along curved paths. */
  curveSteps: 16,
  /** Distance from the centre of a face to each of its two side lanes. */
  laneOffset: 12.5,
  /** Solid material left beside and above an arch opening. */
  archWall: 8,
  /** Bevel on the outer edges of blocks and cylinders. */
  chamfer: 1,
  /** Alignment pins for split pieces: a piece of 1.75 mm filament. */
  pinDiameter: 1.75,
  pinClearance: 0.35,
  pinDepth: 6,
  pinInset: 8,
  /** Radial play of a moving part around its axle. */
  axleClearance: 0.3,
  /** Depth of the identifier engraved on the underside. */
  idDepth: 0.6,
  /** Corner studs on top of a piece and the pockets under the next one (PLAN-2, section 2.5). */
  locatorSize: 8,
  locatorHeight: 3,
  locatorStraight: 1.25,
  locatorClearance: 0.2,
  locatorMouth: 0.3,
  /** Distance from the cell edge to the centre of a stud. */
  locatorInset: 6,
  plateThickness: 4,
  /** Largest side of a base plate tile, in cells, set by the size of a print bed. */
  plateMaxCells: 4,
  levels: {
    T: { z: 50, section: 'groove' },
    M: { z: 25, section: 'tunnel' },
    B: { z: 0, section: 'underside' },
  } as Record<LevelId, Level>,
};

export const boreRadius = () => (CONFIG.ballDiameter + CONFIG.boreClearance) / 2;

/** A closed bore's teardrop roof peaks this many radii above its centre (45 degree flanks). */
export const ROOF_PEAK_FACTOR = Math.SQRT2;

/** Returns human-readable problems with the level list; empty when the stack-up is printable. */
export function checkLevels(): string[] {
  const r = boreRadius();
  const levels = LEVEL_IDS.map((id) => ({ id, ...CONFIG.levels[id] })).sort((a, b) => a.z - b.z);
  const upperExtent = (level: Level) => level.z + r * ROOF_PEAK_FACTOR;
  const problems: string[] = [];

  const lowest = levels[0];
  if (lowest.section === 'tunnel' && lowest.z - r < CONFIG.minWall) problems.push(`Level ${lowest.id} leaves too thin a floor`);
  for (let i = 1; i < levels.length; i++) {
    const wall = levels[i].z - r - upperExtent(levels[i - 1]);
    if (wall < CONFIG.minWall) problems.push(`Levels ${levels[i - 1].id} and ${levels[i].id} are too close`);
  }
  const top = levels[levels.length - 1];
  if (top.section !== 'groove' && upperExtent(top) > CONFIG.cubeSize - CONFIG.minWall) problems.push(`Level ${top.id} leaves too thin a roof`);
  return problems;
}
