import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { boreRadius, CONFIG, ROOF_PEAK_FACTOR } from './config';
import { bodyHeight, levelZ, type Body, type Vec3 } from './ports';

/** Depth of the notch that keeps a leaning ramp on the edge of its support. */
const NOTCH_DEPTH = 2;

/** Seesaw geometry, in millimetres, for its 1 × 3 × 1 body. */
const ARM = {
  halfWidth: 15,
  halfLength: 73,
  /** Height of the axle above the bottom of the arm. */
  axleAbove: 4.5,
  height: 18,
  /** Axle position in the body. */
  axleY: 75,
  axleZ: 23.9,
  /** Tilt of the arm at either end of its travel. */
  tilt: 10,
  /** Gap on each side of the arm inside its slot. */
  sideGap: 1,
};

type Point2 = [number, number];

/** Solid made by extruding a convex profile in the YZ plane along X. */
function prismX(wasm: ManifoldToplevel, profile: Point2[], fromX: number, toX: number): Manifold {
  return wasm.Manifold.hull(profile.flatMap(([y, z]): Vec3[] => [[fromX, y, z], [toX, y, z]]));
}

function leanLine(body: Body) {
  const length = body.size[1] * CONFIG.cubeSize;
  const low = levelZ('M', body);
  const rise = bodyHeight(body) - low;
  return { length, low, rise, under: (y: number) => (rise * y) / length };
}

/** Height of the underside of a leaning ramp along its length. */
export const leanUnderside = (body: Body, y: number) => leanLine(body).under(y);

/** Angle of a leaning ramp, in degrees. */
export function leanAngle(body: Body): number {
  const { length, rise } = leanLine(body);
  return (Math.atan2(rise, length) * 180) / Math.PI;
}

/** Height of the support that a leaning ramp rests on, in its last cell. */
export function leanSeat(body: Body): number {
  const { cubeSize } = CONFIG;
  return leanUnderside(body, (body.size[1] - 1) * cubeSize);
}

/** A bar of even thickness, sloping from the top of its high end to the middle level of its low end. */
export function buildLeanRamp(wasm: ManifoldToplevel, body: Body): Manifold {
  const { cubeSize, fitClearance } = CONFIG;
  const margin = fitClearance / 2;
  const { length, low, under } = leanLine(body);
  const [y0, y1] = [margin, length - margin];
  const bar = prismX(wasm, [[y0, under(y0)], [y1, under(y1)], [y1, low + under(y1)], [y0, low + under(y0)]], margin, cubeSize - margin);

  // A shallow notch sits over the edge of the support and stops the bar from sliding.
  const angle = Math.atan2(under(1) - under(0), 1);
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const y = (body.size[1] - 1) * cubeSize;
  const z = under(y);
  const notch = prismX(
    wasm,
    [
      [y - NOTCH_DEPTH * c + s, z - NOTCH_DEPTH * s - c],
      [y + NOTCH_DEPTH * c + s, z + NOTCH_DEPTH * s - c],
      [y - s * NOTCH_DEPTH, z + c * NOTCH_DEPTH],
    ],
    -1,
    cubeSize + 1,
  );
  const result = bar.subtract(notch);
  bar.delete();
  notch.delete();
  return result;
}

/** Circle with a pointed top, so that a horizontal hole prints without support. */
function axleHole(wasm: ManifoldToplevel, radius: number, y: number, z: number, fromX: number, toX: number): Manifold {
  const steps = 24;
  const ring: Point2[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([y + radius * Math.cos(angle), z + radius * Math.sin(angle)]);
  }
  ring.push([y, z + radius * ROOF_PEAK_FACTOR]);
  return prismX(wasm, ring, fromX, toX);
}

const centreX = () => CONFIG.cubeSize / 2;

/** Height of the floor that stops the arm at the end of its travel. */
function armStop(): number {
  const t = (ARM.tilt * Math.PI) / 180;
  return ARM.axleZ - ARM.axleAbove * Math.cos(t) - ARM.halfLength * Math.sin(t);
}

/** The fork that carries the arm: a block with a slot along its length and a hole for the axle. */
export function buildSeesawBase(wasm: ManifoldToplevel, body: Body): Manifold {
  const { cubeSize, fitClearance, pinDiameter } = CONFIG;
  const margin = fitClearance / 2;
  const length = body.size[1] * cubeSize;
  const height = bodyHeight(body);
  const block = prismX(wasm, [[margin, 0], [length - margin, 0], [length - margin, height], [margin, height]], margin, cubeSize - margin);

  const half = ARM.halfWidth + ARM.sideGap;
  const slot = prismX(wasm, [[-1, armStop()], [length + 1, armStop()], [length + 1, height + 1], [-1, height + 1]], centreX() - half, centreX() + half);
  // The axle is a tight fit in the walls, and it is the arm that turns on it.
  const hole = axleHole(wasm, (pinDiameter + 0.1) / 2, ARM.axleY, ARM.axleZ, -1, cubeSize + 1);
  const tools = wasm.Manifold.union([slot, hole]);
  const result = block.subtract(tools);
  [block, slot, hole, tools].forEach((m) => m.delete());
  return result;
}

/** The arm, lying level. Its groove faces up and its axle hole runs across it. */
export function buildSeesawArm(wasm: ManifoldToplevel, tilt = 0): Manifold {
  const { pinDiameter, axleClearance } = CONFIG;
  const { halfWidth, halfLength, axleAbove, height, axleY, axleZ } = ARM;
  const bottom = axleZ - axleAbove;
  const top = bottom + height;
  const [y0, y1] = [axleY - halfLength, axleY + halfLength];
  const x = centreX();
  const beam = prismX(wasm, [[y0, bottom], [y1, bottom], [y1, top], [y0, top]], x - halfWidth, x + halfWidth);

  const r = boreRadius();
  const ball = wasm.Manifold.sphere(r, 32);
  const ends = [ball.translate([x, y0 - 1, top]), ball.translate([x, y1 + 1, top])];
  const groove = wasm.Manifold.hull(ends);
  const hole = axleHole(wasm, pinDiameter / 2 + axleClearance, axleY, axleZ, x - halfWidth - 1, x + halfWidth + 1);
  const tools = wasm.Manifold.union([groove, hole]);
  const arm = beam.subtract(tools);
  [beam, ball, ...ends, groove, hole, tools].forEach((m) => m.delete());
  if (tilt === 0) return arm;

  const centred = arm.translate([0, -axleY, -axleZ]);
  const turned = centred.rotate([tilt, 0, 0]);
  const placed = turned.translate([0, axleY, axleZ]);
  [arm, centred, turned].forEach((m) => m.delete());
  return placed;
}

/** The arm as it sits in the fork, resting on its low end. */
export const seesawRestTilt = () => ARM.tilt;

/** Height of the groove where a falling marble lands on the arm. */
export const seesawLanding = () => ARM.axleZ - ARM.axleAbove + ARM.height;
