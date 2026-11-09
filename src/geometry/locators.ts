import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { CONFIG } from './config';
import { leanSeat } from './moving';
import { bodyHeight, type Body, type Vec3 } from './ports';

/** How many corner studs a piece should have, and how many clear its channels. */
export interface StudReport {
  total: number;
  placed: number;
}

/** A height and the half width of the square section at that height. */
type Section = [number, number];

/** Share of a stud's footprint that must be solid for the stud to be built. */
const FIT_RATIO = 0.995;
/** How far a stud reaches into the piece, so that the two solids merge. */
const STUD_ROOT = 0.5;

/** Convex solid with square sections, built around a vertical axis. */
function squareSolid(wasm: ManifoldToplevel, x: number, y: number, sections: Section[]): Manifold {
  const points: Vec3[] = sections.flatMap(([z, w]) =>
    [-w, w].flatMap((dx) => [-w, w].map((dy): Vec3 => [x + dx, y + dy, z])),
  );
  return wasm.Manifold.hull(points);
}

/** Centres of the four corner locators of every cell of a footprint. */
function locatorCentres(cellsX: number, cellsY: number): [number, number][] {
  const { cubeSize, locatorInset } = CONFIG;
  const centres: [number, number][] = [];
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      for (const dx of [locatorInset, cubeSize - locatorInset]) {
        for (const dy of [locatorInset, cubeSize - locatorInset]) centres.push([i * cubeSize + dx, j * cubeSize + dy]);
      }
    }
  }
  return centres;
}

function studAt(wasm: ManifoldToplevel, x: number, y: number, base: number): Manifold {
  const { locatorSize, locatorHeight, locatorStraight } = CONFIG;
  const half = locatorSize / 2;
  const taper = locatorHeight - locatorStraight;
  return squareSolid(wasm, x, y, [
    [base - STUD_ROOT, half],
    [base + locatorStraight, half],
    [base + locatorHeight, half - taper],
  ]);
}

/**
 * Cuts the pockets that receive the studs of the piece below. A pocket closes in a point
 * rather than a flat ceiling, so that it prints upright with no bridging.
 */
export function cutPockets(wasm: ManifoldToplevel, solid: Manifold, body: Body): Manifold {
  const { locatorSize, locatorStraight, locatorClearance, locatorMouth } = CONFIG;
  const half = locatorSize / 2 + locatorClearance;
  const below = 1;
  // A leaning ramp only comes down on its two ends, each at its own height.
  const seats = (): [number, number, number][] => {
    const centres = locatorCentres(body.size[0], body.size[1]);
    if (body.shape !== 'leanRamp') return centres.map(([x, y]) => [x, y, 0]);
    const unit = CONFIG.cubeSize;
    const last = (body.size[1] - 1) * unit;
    return centres.flatMap(([x, y]): [number, number, number][] => {
      if (y < unit) return [[x, y, 0]];
      return y >= last ? [[x, y, leanSeat(body)]] : [];
    });
  };
  const tools = seats().flatMap(([x, y, z]) => [
    squareSolid(wasm, x, y, [
      [z - below, half],
      [z + locatorStraight, half],
      [z + locatorStraight + half, 0],
    ]),
    squareSolid(wasm, x, y, [
      [z - below, half + locatorMouth + below],
      [z + locatorMouth, half],
    ]),
  ]);
  const union = wasm.Manifold.union(tools);
  tools.forEach((tool) => tool.delete());
  const result = solid.subtract(union);
  union.delete();
  return result;
}

/** Adds the corner studs that stand on solid material; only flat-topped blocks carry them. */
export function addStuds(wasm: ManifoldToplevel, solid: Manifold, body: Body): { solid: Manifold; report: StudReport } {
  if (body.shape !== 'box') return { solid, report: { total: 0, placed: 0 } };
  const { locatorSize } = CONFIG;
  const top = bodyHeight(body);
  const half = locatorSize / 2;
  const footprint = locatorSize * locatorSize;
  const centres = locatorCentres(body.size[0], body.size[1]);

  const studs: Manifold[] = [];
  for (const [x, y] of centres) {
    const support = squareSolid(wasm, x, y, [
      [top - 1, half],
      [top, half],
    ]);
    const overlap = support.intersect(solid);
    if (overlap.volume() >= footprint * FIT_RATIO) studs.push(studAt(wasm, x, y, top));
    support.delete();
    overlap.delete();
  }

  const report = { total: centres.length, placed: studs.length };
  if (studs.length === 0) return { solid, report };
  const merged = wasm.Manifold.union([solid, ...studs]);
  studs.forEach((stud) => stud.delete());
  return { solid: merged, report };
}

/** A flat plate with one set of studs per cell, for the bottom layer to lock into. */
export function buildBasePlate(wasm: ManifoldToplevel, cellsX: number, cellsY: number): Manifold {
  const { cubeSize, fitClearance, chamfer, plateThickness } = CONFIG;
  const margin = fitClearance / 2;
  const [x1, y1] = [cellsX * cubeSize - margin, cellsY * cubeSize - margin];
  const ring = (inset: number, z: number): Vec3[] =>
    [margin + inset, x1 - inset].flatMap((x) => [margin + inset, y1 - inset].map((y): Vec3 => [x, y, z]));
  const plate = wasm.Manifold.hull([...ring(chamfer, 0), ...ring(0, chamfer), ...ring(0, plateThickness - chamfer), ...ring(chamfer, plateThickness)]);
  const studs = locatorCentres(cellsX, cellsY).map(([x, y]) => studAt(wasm, x, y, plateThickness));
  const result = wasm.Manifold.union([plate, ...studs]);
  plate.delete();
  studs.forEach((stud) => stud.delete());
  return result;
}
