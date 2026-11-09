import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { boreRadius, CONFIG, ROOF_PEAK_FACTOR } from './config';
import { bodyHeight, levelZ, type Body, type Shape, type Vec3 } from './ports';

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
function teardropProfile(radius: number, y: number, z: number): Point2[] {
  const steps = 24;
  const ring: Point2[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([y + radius * Math.cos(angle), z + radius * Math.sin(angle)]);
  }
  ring.push([y, z + radius * ROOF_PEAK_FACTOR]);
  return ring;
}

function axleHole(wasm: ManifoldToplevel, radius: number, y: number, z: number, fromX: number, toX: number): Manifold {
  return prismX(wasm, teardropProfile(radius, y, z), fromX, toX);
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

/** Pendulum launcher geometry, in millimetres, for its 1 × 2 × 2 body. */
const PENDULUM = {
  /** Plane of the arm's striking face in the body. */
  faceY: 46,
  axleZ: 92,
  /** Distance of the axle from the striking face. */
  axleDepth: 11,
  /** Half widths, across the slot. */
  bossHalf: 16.5,
  barHalf: 5,
  headHalf: 16.5,
  fingerHalf: 7,
  slotHalf: 18,
  /** Height of the ledges the head swings over. */
  ledge: 33,
  /** Thicknesses, from the striking face. */
  barThick: 22,
  headThick: 28,
  fingerThick: 14,
  /** Positions along the arm, measured down from its top end. */
  axleAt: 6,
  headStart: 36,
  fingerStart: 63.5,
  tip: 80,
};

/** Where the marble waits, just in front of the hanging arm. */
export const pendulumSeatY = () => PENDULUM.faceY - CONFIG.ballDiameter / 2;

/** Height of the top of the marble channel's centre line at the launcher. */
const LAUNCH_Z = 25;

/** The frame: a block with a slot for the arm, an axle hole and a channel leading out. */
export function buildPendulumFrame(wasm: ManifoldToplevel, body: Body): Manifold {
  const { cubeSize, fitClearance, pinDiameter } = CONFIG;
  const margin = fitClearance / 2;
  const length = body.size[1] * cubeSize;
  const height = bodyHeight(body);
  const { faceY, axleZ, axleDepth, slotHalf, ledge, tip, axleAt } = PENDULUM;
  const axleY = faceY + axleDepth;
  const x = cubeSize / 2;
  const r = boreRadius();
  const seatY = pendulumSeatY();
  const { Manifold } = wasm;

  const block = prismX(wasm, [[margin, 0], [length - margin, 0], [length - margin, height], [margin, height]], margin, cubeSize - margin);
  const swing = prismX(wasm, [[-1, ledge], [length + 1, ledge], [length + 1, height + 1], [-1, height + 1]], x - slotHalf, x + slotHalf);
  const upper = prismX(wasm, [[-1, LAUNCH_Z], [seatY + r, LAUNCH_Z], [seatY + r, ledge + 1], [-1, ledge + 1]], x - r, x + r);

  const ball = Manifold.sphere(r, 32);
  const ends = [ball.translate([x, seatY, LAUNCH_Z]), ball.translate([x, -1, LAUNCH_Z])];
  const channel = Manifold.hull(ends);
  // A slight hollow keeps the marble waiting at the arm until it is struck.
  const seat = ball.translate([x, seatY, LAUNCH_Z - 0.8]);

  // The arm's finger sweeps a circle around the axle, only as wide as the channel.
  const radius = Math.hypot(axleDepth, tip - axleAt) + 1.2;
  const disc = Manifold.cylinder(2 * r, radius, radius, 128);
  const turned = disc.rotate([0, 90, 0]);
  const sweep = turned.translate([x - r, axleY, axleZ]);
  const hole = axleHole(wasm, (pinDiameter + 0.1) / 2, axleY, axleZ, -1, cubeSize + 1);

  const tools = Manifold.union([swing, upper, channel, seat, sweep, hole]);
  const result = block.subtract(tools);
  [block, swing, upper, ball, ...ends, channel, seat, disc, turned, sweep, hole, tools].forEach((m) => m.delete());
  return result;
}

/**
 * The swinging arm, built lying on its striking face so that it prints flat. A pocket
 * in the head takes extra weight (steel nuts or similar), and it opens upwards when printing.
 */
export function buildPendulumArm(wasm: ManifoldToplevel, assembled = false): Manifold {
  const { Manifold } = wasm;
  const { pinDiameter, axleClearance } = CONFIG;
  const { bossHalf, barHalf, headHalf, fingerHalf, barThick, headThick, fingerThick, axleAt, headStart, fingerStart, tip, axleDepth, faceY, axleZ } = PENDULUM;
  const part = (half: number, fromY: number, toY: number, thick: number) => {
    const raw = Manifold.cube([2 * half, toY - fromY, thick]);
    const placed = raw.translate([-half, fromY, 0]);
    raw.delete();
    return placed;
  };
  const parts = [
    part(bossHalf, 0, axleAt * 2 + 2, barThick),
    part(barHalf, 0, headStart + 1, barThick),
    part(headHalf, headStart, fingerStart, headThick),
    part(fingerHalf, fingerStart - 1, tip, fingerThick),
  ];
  const solid = Manifold.union(parts);
  parts.forEach((p) => p.delete());

  // The hole points along X here, so its teardrop roof is right for printing.
  const hole = prismX(wasm, teardropProfile(pinDiameter / 2 + axleClearance, axleAt, axleDepth), -bossHalf - 1, bossHalf + 1);
  const rawPocket = Manifold.cylinder(headThick, 11, 11, 48);
  const pocket = rawPocket.translate([0, (headStart + fingerStart) / 2, 8]);
  const tools = Manifold.union([hole, pocket]);
  const arm = solid.subtract(tools);
  [solid, hole, rawPocket, pocket, tools].forEach((m) => m.delete());
  if (!assembled) return arm;

  const hanging = arm.rotate([-90, 0, 0]);
  const placed = hanging.translate([CONFIG.cubeSize / 2, faceY, axleZ + axleAt]);
  [arm, hanging].forEach((m) => m.delete());
  return placed;
}

/** The moving part of a piece, either posed in place or laid out for printing. */
export function buildMovingPart(wasm: ManifoldToplevel, shape: Shape, assembled: boolean): Manifold {
  if (shape === 'pendulum') return buildPendulumArm(wasm, assembled);
  return buildSeesawArm(wasm, assembled ? ARM.tilt : 0);
}

/** The arm as it sits in the fork, resting on its low end. */

/** Height of the groove where a falling marble lands on the arm. */
export const seesawLanding = () => ARM.axleZ - ARM.axleAbove + ARM.height;
