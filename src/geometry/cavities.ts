import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { boreRadius, CONFIG } from './config';
import { bodyHeight, type Body, type Cavity, type Vec3 } from './ports';

const SEGMENTS = 64;
const SPIRAL_START_RADIUS = 25;
const SPIRAL_TURNS = 1.25;
const SPIRAL_DROP = 13;
const SPIRAL_STEPS = 60;

export const CAVITY_SIZES = [12, 14, 16, 18, 20, 22];

/** Depth of a dish: deeper than a groove so that a ball settles in it. */
export const dishDepth = (radius: number) => Math.min(14, Math.max(9.5, radius * 0.7));

const cellCentre = ({ cell }: Cavity): [number, number] => [(cell[0] + 0.5) * CONFIG.cubeSize, (cell[1] + 0.5) * CONFIG.cubeSize];

/** Sweeps the ball along a path; `open` keeps the cut open to the top. */
export type Sweep = (path: Vec3[], open: boolean) => Manifold[];

/** Enters from the north face, along a cell centre, and winds inward to a hole at the middle. */
export function spiralPath(body: Body): Vec3[] {
  const top = bodyHeight(body);
  const centre = (body.size[0] * CONFIG.cubeSize) / 2;
  const entryX = centre + SPIRAL_START_RADIUS;
  const points: Vec3[] = [
    [entryX, body.size[1] * CONFIG.cubeSize + 1, top],
    [entryX, centre, top],
  ];
  const sweep = SPIRAL_TURNS * 2 * Math.PI;
  for (let i = 1; i <= SPIRAL_STEPS; i++) {
    const t = i / SPIRAL_STEPS;
    const angle = t * sweep;
    const radius = SPIRAL_START_RADIUS * (1 - t);
    points.push([centre + radius * Math.cos(angle), centre - radius * Math.sin(angle), top - SPIRAL_DROP * t]);
  }
  return points;
}

/** Solids to remove from a piece for one cavity. The caller owns them. */
export function buildCavityCutters(wasm: ManifoldToplevel, cavity: Cavity, body: Body, sweep: Sweep): Manifold[] {
  const { Manifold } = wasm;
  const top = bodyHeight(body);
  const r = boreRadius();
  const place = (solid: Manifold, x: number, y: number, z: number) => {
    const placed = solid.translate([x, y, z]);
    solid.delete();
    return placed;
  };

  if (cavity.type === 'spiral') {
    const centre = (body.size[0] * CONFIG.cubeSize) / 2;
    return [...sweep(spiralPath(body), true), place(Manifold.cylinder(top + 2, r, r, SEGMENTS), centre, centre, -1)];
  }

  const [x, y] = cellCentre(cavity);
  const size = cavity.size;

  if (cavity.type === 'funnel') {
    // A 45 degree cone: it narrows to the bore, continuing just past the top face.
    const depth = size - r;
    return [place(Manifold.cylinder(depth + 1, r, size + 1, SEGMENTS), x, y, top - depth)];
  }

  if (cavity.type === 'basin') {
    const depth = dishDepth(size);
    const sphereRadius = (size * size + depth * depth) / (2 * depth);
    return [place(Manifold.sphere(sphereRadius, SEGMENTS), x, y, top + sphereRadius - depth)];
  }

  // Chamber, open at the bottom; its cone roof keeps every overhang at 45 degrees.
  const apex = top - CONFIG.minWall;
  const springing = apex - size;
  return [
    place(Manifold.cylinder(springing + 1, size, size, SEGMENTS), x, y, -1),
    place(Manifold.cylinder(size, size, 0, SEGMENTS), x, y, springing),
  ];
}

/** Whether a cavity can be cut into a body while leaving printable walls. */
export function cavityFits(cavity: Cavity, body: Body): boolean {
  if (body.shape !== 'box') return false;
  const [width, length] = body.size;
  const top = bodyHeight(body);
  if (cavity.type === 'spiral') return width === 2 && length === 2;

  const [i, j] = cavity.cell;
  if (i < 0 || j < 0 || i >= width || j >= length) return false;
  if (cavity.size > CONFIG.cubeSize / 2 - CONFIG.minWall || cavity.size <= boreRadius()) return false;

  if (cavity.type === 'funnel') return cavity.size - boreRadius() + CONFIG.minWall <= top;
  if (cavity.type === 'basin') return dishDepth(cavity.size) + CONFIG.minWall <= top;
  return top >= CONFIG.cubeSize;
}
