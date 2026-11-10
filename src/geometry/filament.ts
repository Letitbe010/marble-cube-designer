/**
 * Settings close to the defaults that common slicers use for PLA and a 0.4 mm nozzle
 * (0.2 mm layers, two perimeters of about 0.42 mm, four or five solid layers on top and
 * bottom, 15 % infill). They are a reference for a rough figure, not a measurement:
 * the slicer's own estimate is the one to trust.
 */
export const PRINT_DEFAULTS = {
  /** Perimeters and solid top and bottom layers, taken as one even skin, in mm. */
  shellThickness: 0.9,
  /** Share of the inside filled by the infill pattern. */
  infill: 0.15,
  /** A usual figure for PLA, in g/cm³. */
  density: 1.24,
};

export type PrintSettings = typeof PRINT_DEFAULTS;

/** Total surface of a triangle mesh, in mm². */
export function meshArea(positions: Float32Array, triangles: Uint32Array): number {
  let area = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = [triangles[i] * 3, triangles[i + 1] * 3, triangles[i + 2] * 3];
    const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    area += Math.hypot(cross[0], cross[1], cross[2]) / 2;
  }
  return area;
}

/**
 * Grams of filament for one solid: a skin over every surface (the channels included),
 * and sparse infill in what is left inside. Supports, skirt and waste are not counted.
 */
export function filamentGrams(volume: number, area: number, settings: PrintSettings = PRINT_DEFAULTS): number {
  const shell = Math.min(volume, area * settings.shellThickness);
  const plastic = shell + (volume - shell) * settings.infill;
  return (plastic / 1000) * settings.density;
}
