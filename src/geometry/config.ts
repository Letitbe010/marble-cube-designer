/** All physical dimensions, in millimetres. Tune these after printing the calibration piece. */

export interface Level {
  /** Height of the ball centre above the bottom of the cube. */
  z: number;
  /** Open groove (true) or closed tunnel (false). */
  open: boolean;
}

export const LEVEL_IDS = ['T', 'M'] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

export const CONFIG = {
  cubeSize: 50,
  /** Removed from the cube's X and Y width so printed cubes fit side by side. */
  fitClearance: 0.2,
  /** Assumed ball diameter: sources report 16 or 17 mm, so the larger value is used. */
  ballDiameter: 17,
  /** Extra diameter so the ball rolls freely on FDM surfaces. */
  boreClearance: 1.5,
  /** Thinnest wall that prints reliably with a 0.4 mm nozzle. */
  minWall: 2.5,
  /** Sphere resolution of the cutting tool. */
  sphereSegments: 32,
  /** Number of steps along curved paths. */
  curveSteps: 16,
  levels: {
    T: { z: 44, open: true },
    M: { z: 19, open: false },
  } as Record<LevelId, Level>,
};

export const boreRadius = () => (CONFIG.ballDiameter + CONFIG.boreClearance) / 2;

/** A closed bore's teardrop roof peaks this many radii above its centre (45 degree flanks). */
export const ROOF_PEAK_FACTOR = Math.SQRT2;

/** Returns human-readable problems with the level list; empty when the stack-up is printable. */
export function checkLevels(): string[] {
  const r = boreRadius();
  const levels = LEVEL_IDS.map((id) => ({ id, ...CONFIG.levels[id] })).sort((a, b) => a.z - b.z);
  const upperExtent = (level: Level) => level.z + (level.open ? r : r * ROOF_PEAK_FACTOR);
  const problems: string[] = [];

  if (levels[0].z - r < CONFIG.minWall) problems.push(`Level ${levels[0].id} leaves too thin a floor`);
  for (let i = 1; i < levels.length; i++) {
    const wall = levels[i].z - r - upperExtent(levels[i - 1]);
    if (wall < CONFIG.minWall) problems.push(`Levels ${levels[i - 1].id} and ${levels[i].id} are too close`);
  }
  const top = levels[levels.length - 1];
  if (!top.open && upperExtent(top) > CONFIG.cubeSize - CONFIG.minWall) problems.push(`Level ${top.id} leaves too thin a roof`);
  return problems;
}
