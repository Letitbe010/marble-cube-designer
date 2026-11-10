import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { boreRadius, CONFIG, ROOF_PEAK_FACTOR } from './config';
import { bodyHeight, levelZ, type Body, type Shape, type Vec3 } from './ports';

/** Depth of the notch that keeps a leaning ramp on the edge of its support. */
const NOTCH_DEPTH = 2;

/** Seesaw geometry, in millimetres, for its 1 × 3 × 1.5 body. */
export const ARM = {
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
  /** Height of the tip of the divider above the axle, and its half thickness at root and tip. */
  vane: 33,
  vaneBase: 6,
  vaneTip: 1.2,
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

/** A solid shown with a piece, and where it goes in the exploded view. */
export interface Placed {
  solid: Manifold;
  explode: Vec3;
}

/** A printed part that moves in its piece. */
export interface MovingPart extends Placed {
  /** Tells the part's file apart from the others of its piece. */
  suffix: string;
}

/** A steel pin lying across the piece, along X. */
function crossPin(wasm: ManifoldToplevel, radius: number, y: number, z: number, fromX: number, toX: number): Manifold {
  const raw = wasm.Manifold.cylinder(toX - fromX, radius, radius, 24);
  const across = raw.rotate([0, 90, 0]);
  const placed = across.translate([fromX, y, z]);
  [raw, across].forEach((m) => m.delete());
  return placed;
}

/** Hexagonal prism standing on Z=0, measured across its flats. */
function hexPrism(wasm: ManifoldToplevel, acrossFlats: number, height: number): Manifold {
  const radius = acrossFlats / Math.sqrt(3);
  return wasm.Manifold.cylinder(height, radius, radius, 6);
}

const axleRadius = () => CONFIG.axleDiameter / 2;
/** A steel axle is a light press fit in the walls that carry it. */
const pressRadius = () => (CONFIG.axleDiameter + 0.1) / 2;

/** Height of the floor that stops the arm at the end of its travel. */
function armStop(): number {
  const t = (ARM.tilt * Math.PI) / 180;
  return ARM.axleZ - ARM.axleAbove * Math.cos(t) - ARM.halfLength * Math.sin(t);
}

/** The fork that carries the arm: a block with a slot along its length and a hole for the axle. */
export function buildSeesawBase(wasm: ManifoldToplevel, body: Body): Manifold {
  const { cubeSize, fitClearance } = CONFIG;
  const margin = fitClearance / 2;
  const length = body.size[1] * cubeSize;
  const height = bodyHeight(body);
  const block = prismX(wasm, [[margin, 0], [length - margin, 0], [length - margin, height], [margin, height]], margin, cubeSize - margin);

  const half = ARM.halfWidth + ARM.sideGap;
  const slot = prismX(wasm, [[-1, armStop()], [length + 1, armStop()], [length + 1, height + 1], [-1, height + 1]], centreX() - half, centreX() + half);
  // The axle is a tight fit in the walls, and it is the arm that turns on it.
  const hole = axleHole(wasm, pressRadius(), ARM.axleY, ARM.axleZ, -1, cubeSize + 1);
  const tools = wasm.Manifold.union([slot, hole]);
  const result = block.subtract(tools);
  [block, slot, hole, tools].forEach((m) => m.delete());
  return result;
}

/** How far the tip of the divider leans to the low side of the arm. */
export const seesawVaneShift = () => ARM.vane * Math.sin((ARM.tilt * Math.PI) / 180);

/**
 * The arm, lying level. Its groove faces up and its axle hole runs across it. The divider
 * in the middle leans with the arm, so a falling marble always lands on the raised half
 * and tips the arm over: marbles leave by alternate ends.
 */
export function buildSeesawArm(wasm: ManifoldToplevel, tilt = 0): Manifold {
  const { axleClearance } = CONFIG;
  const { halfWidth, halfLength, axleAbove, height, axleY, axleZ, vane, vaneBase, vaneTip } = ARM;
  const bottom = axleZ - axleAbove;
  const top = bottom + height;
  const [y0, y1] = [axleY - halfLength, axleY + halfLength];
  const x = centreX();
  const beam = prismX(wasm, [[y0, bottom], [y1, bottom], [y1, top], [y0, top]], x - halfWidth, x + halfWidth);

  const r = boreRadius();
  const ball = wasm.Manifold.sphere(r, 32);
  const ends = [ball.translate([x, y0 - 1, top]), ball.translate([x, y1 + 1, top])];
  const groove = wasm.Manifold.hull(ends);
  const hole = axleHole(wasm, axleRadius() + axleClearance, axleY, axleZ, x - halfWidth - 1, x + halfWidth + 1);
  const tools = wasm.Manifold.union([groove, hole]);
  const grooved = beam.subtract(tools);

  // The divider starts inside the beam, below the groove, so that it closes the groove under it.
  const root = top - r - 0.5;
  const tip = axleZ + vane;
  const divider = prismX(
    wasm,
    [[axleY - vaneBase, root], [axleY + vaneBase, root], [axleY + vaneBase, top], [axleY + vaneTip, tip], [axleY - vaneTip, tip], [axleY - vaneBase, top]],
    x - halfWidth,
    x + halfWidth,
  );
  const arm = wasm.Manifold.union([grooved, divider]);
  [beam, ball, ...ends, groove, hole, tools, grooved, divider].forEach((m) => m.delete());
  if (tilt === 0) return arm;

  const centred = arm.translate([0, -axleY, -axleZ]);
  const turned = centred.rotate([tilt, 0, 0]);
  const placed = turned.translate([0, axleY, axleZ]);
  [arm, centred, turned].forEach((m) => m.delete());
  return placed;
}

/** Pendulum launcher geometry, in millimetres, for its 1 × 2 × 2 body. */
export const PENDULUM = {
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
  headThick: 30,
  fingerThick: 14,
  /** Positions along the arm, measured down from the axle end of the bar. */
  axleAt: 6,
  headStart: 36,
  fingerStart: 63.5,
  tip: 80,
  /** The lever stands above the axle, for cocking the arm with a thumb. */
  leverLength: 26,
  leverThick: 11,
  /** Pocket for two M12 steel nuts (about 21 mm across corners, 10.8 mm thick each). */
  pocketRadius: 11.2,
  pocketFloor: 8,
  /** The striker is an M5 button-head screw; its head stands this far out of the face. */
  strikerHead: 2.75,
  strikerHeadRadius: 4.75,
  strikerPilot: 2.25,
  strikerDepth: 10,
  /** Angle at which the lever comes down on the frame, and at which the pull pin holds the arm. */
  cockAngle: 75,
  holdAngle: 70,
  /** Where the lever meets the frame, measured up the lever from the axle. */
  stopAt: 16,
  pinRadius: 2.5,
  pinClearance: 0.3,
  /** Where the pull pin meets the bar, measured down from the axle. */
  pinAt: 20,
  /** The bridge that ties the two walls together in front of the arm. */
  bridgeBottom: 40,
  bridgeTop: 75,
  /** Gap left between the hanging arm and the bridge, which stops the arm after the strike. */
  followThrough: 2.5,
};

/** Where the marble waits, touching the striker of the hanging arm. */
export const pendulumSeatY = () => PENDULUM.faceY - PENDULUM.strikerHead - CONFIG.ballDiameter / 2;

export const pendulumAxleY = () => PENDULUM.faceY + PENDULUM.axleDepth;

/** A point given in the arm's own frame (behind the axle, above the axle), with the arm swung back. */
function swungPoint(behind: number, above: number, degrees: number): Point2 {
  const t = (degrees * Math.PI) / 180;
  return [pendulumAxleY() + behind * Math.cos(t) - above * Math.sin(t), PENDULUM.axleZ + behind * Math.sin(t) + above * Math.cos(t)];
}

/** The edge of the frame that the lever comes down on when the arm is fully cocked. */
export const pendulumStop = (): Point2 => swungPoint(-PENDULUM.axleDepth, PENDULUM.stopAt, PENDULUM.cockAngle);

/** Axis of the pull pin, which sits just in front of the bar of the cocked arm. */
export const pendulumPin = (): Point2 =>
  swungPoint(-PENDULUM.axleDepth - PENDULUM.pinRadius - 0.2, -PENDULUM.pinAt, PENDULUM.holdAngle);

/** Height of the top of the marble channel's centre line at the launcher. */
const LAUNCH_Z = 25;

/** The frame: a block with a slot for the arm, an axle hole and a channel leading out. */
export function buildPendulumFrame(wasm: ManifoldToplevel, body: Body): Manifold {
  const { cubeSize, fitClearance } = CONFIG;
  const margin = fitClearance / 2;
  const length = body.size[1] * cubeSize;
  const height = bodyHeight(body);
  const { faceY, axleZ, axleDepth, slotHalf, ledge, tip, axleAt, bridgeBottom, bridgeTop, followThrough, pinRadius, pinClearance } = PENDULUM;
  const axleY = pendulumAxleY();
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
  const hole = axleHole(wasm, pressRadius(), axleY, axleZ, -1, cubeSize + 1);
  const [pinY, pinZ] = pendulumPin();
  const pinHole = axleHole(wasm, pinRadius + pinClearance, pinY, pinZ, -1, cubeSize + 1);

  const tools = Manifold.union([swing, upper, channel, seat, sweep, hole, pinHole]);
  const cut = block.subtract(tools);

  // A bridge in front of the arm ties the walls together. Its back stops the arm just after
  // the strike, and the edge of its taller front part is where the lever lands when cocked.
  const [stopY, stopZ] = pendulumStop();
  const back = faceY - followThrough;
  const [x0, x1] = [x - slotHalf - 0.5, x + slotHalf + 0.5];
  const low = prismX(wasm, [[margin, bridgeBottom], [back, bridgeBottom], [back, bridgeTop], [margin, bridgeTop]], x0, x1);
  const tall = prismX(wasm, [[margin, bridgeBottom], [stopY, bridgeBottom], [stopY, stopZ], [margin, stopZ]], x0, x1);
  const mass = Manifold.union([low, tall]);
  // The underside rises at 45 degrees from both walls, so that it prints without support.
  const gable = Manifold.hull(
    [-1, length + 1].flatMap((y): Vec3[] => [
      [x - slotHalf - 1, y, bridgeBottom - 1],
      [x + slotHalf + 1, y, bridgeBottom - 1],
      [x, y, bridgeBottom + slotHalf],
    ]),
  );
  // The marble is dropped in through a chute down the middle, in front of the arm.
  const chute = prismX(wasm, [[seatY - r, bridgeBottom - 1], [length, bridgeBottom - 1], [length, height + 1], [seatY - r, height + 1]], x - r - 0.25, x + r + 0.25);
  const openings = Manifold.union([gable, chute]);
  const bridge = mass.subtract(openings);
  const result = Manifold.union([cut, bridge]);
  [block, swing, upper, ball, ...ends, channel, seat, disc, turned, sweep, hole, pinHole, tools, cut, low, tall, mass, gable, chute, openings, bridge].forEach((m) => m.delete());
  return result;
}

/** Moves a solid built in the arm's printing pose to where it hangs in the frame. */
function hangArm(solid: Manifold): Manifold {
  const hanging = solid.rotate([-90, 0, 0]);
  const placed = hanging.translate([CONFIG.cubeSize / 2, PENDULUM.faceY, PENDULUM.axleZ + PENDULUM.axleAt]);
  [solid, hanging].forEach((m) => m.delete());
  return placed;
}

/** Position along the arm, from the axle end of the bar, that is level with the marble. */
const strikeAt = () => PENDULUM.axleAt + PENDULUM.axleZ - LAUNCH_Z;

/**
 * The swinging arm, built lying on its striking face so that it prints flat. The pocket in
 * the head takes two steel nuts and opens upwards when printing; the hole in the finger
 * takes the screw whose head strikes the marble.
 */
export function buildPendulumArm(wasm: ManifoldToplevel, assembled = false): Manifold {
  const { Manifold } = wasm;
  const { axleClearance } = CONFIG;
  const { bossHalf, barHalf, headHalf, fingerHalf, barThick, headThick, fingerThick, axleAt, headStart, fingerStart, tip, axleDepth, leverLength, leverThick, pocketRadius, pocketFloor, strikerPilot, strikerDepth } = PENDULUM;
  const part = (half: number, fromY: number, toY: number, thick: number) => {
    const raw = Manifold.cube([2 * half, toY - fromY, thick]);
    const placed = raw.translate([-half, fromY, 0]);
    raw.delete();
    return placed;
  };
  const parts = [
    part(bossHalf, axleAt - leverLength, 1, leverThick),
    part(bossHalf, 0, axleAt * 2 + 2, barThick),
    part(barHalf, 0, headStart + 1, barThick),
    part(headHalf, headStart, fingerStart, headThick),
    part(fingerHalf, fingerStart - 1, tip, fingerThick),
  ];
  const solid = Manifold.union(parts);
  parts.forEach((p) => p.delete());

  // The hole points along X here, so its teardrop roof is right for printing.
  const hole = prismX(wasm, teardropProfile(axleRadius() + axleClearance, axleAt, axleDepth), -bossHalf - 1, bossHalf + 1);
  const rawPocket = Manifold.cylinder(headThick, pocketRadius, pocketRadius, 48);
  const pocket = rawPocket.translate([0, (headStart + fingerStart) / 2, pocketFloor]);
  // The blind end of the pilot hole is pointed, like every hole closed from above.
  const drill = Manifold.cylinder(strikerDepth + 1.5, strikerPilot, strikerPilot, 24);
  const rawPilot = Manifold.hull([drill, [0, 0, strikerDepth + 1.5 + strikerPilot]]);
  drill.delete();
  const pilot = rawPilot.translate([0, strikeAt(), -1]);
  const tools = Manifold.union([hole, pocket, pilot]);
  const arm = solid.subtract(tools);
  [solid, hole, rawPocket, pocket, rawPilot, pilot, tools].forEach((m) => m.delete());
  return assembled ? hangArm(arm) : arm;
}

/**
 * The pull pin that holds the arm cocked. It prints lying on the flat along its length,
 * and its head is what the fingers pull.
 */
export function buildPendulumPin(wasm: ManifoldToplevel, assembled = false): Manifold {
  const { pinRadius } = PENDULUM;
  const { cubeSize } = CONFIG;
  // The flat is where the round section reaches 45 degrees, so nothing overhangs more.
  const flat = -pinRadius * 0.7;
  const chord = Math.sqrt(pinRadius ** 2 - flat ** 2);
  const round: Point2[] = [[-chord, flat], [chord, flat]];
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    const z = pinRadius * Math.sin(angle);
    if (z > flat) round.push([pinRadius * Math.cos(angle), z]);
  }
  const shaft = prismX(wasm, round, 3, cubeSize + 1);
  const head = prismX(wasm, [[-4, flat], [4, flat], [6, flat + 2], [6, 4], [4, 6], [-4, 6], [-6, 4], [-6, flat + 2]], cubeSize + 0.5, cubeSize + 4.5);
  const pin = wasm.Manifold.union([shaft, head]);
  [shaft, head].forEach((m) => m.delete());
  if (!assembled) return pin;
  const [y, z] = pendulumPin();
  const placed = pin.translate([0, y, z]);
  pin.delete();
  return placed;
}

/** The steel that goes into the launcher: axle, two nuts in the head and the striker screw. */
function pendulumHardware(wasm: ManifoldToplevel): Placed[] {
  const { Manifold } = wasm;
  const { cubeSize } = CONFIG;
  const { headStart, fingerStart, pocketFloor, strikerHead, strikerHeadRadius, strikerDepth, axleZ } = PENDULUM;
  const axle = crossPin(wasm, axleRadius(), pendulumAxleY(), axleZ, 0, cubeSize);

  const nut = (lift: number) => {
    const prism = hexPrism(wasm, 19, 10.8);
    const rawBore = Manifold.cylinder(12, 5, 5, 24);
    const bore = rawBore.translate([0, 0, -0.5]);
    const ring = prism.subtract(bore);
    const placed = ring.translate([0, (headStart + fingerStart) / 2, pocketFloor + lift]);
    [prism, rawBore, bore, ring].forEach((m) => m.delete());
    return placed;
  };
  const nuts = [nut(0), nut(10.8)];
  const weight = Manifold.union(nuts);
  nuts.forEach((m) => m.delete());

  const shank = Manifold.cylinder(strikerDepth, 2.5, 2.5, 24);
  const rawDome = Manifold.cylinder(strikerHead, strikerHeadRadius * 0.6, strikerHeadRadius, 24);
  const dome = rawDome.translate([0, 0, -strikerHead]);
  const screw = Manifold.union([shank, dome]);
  const striker = screw.translate([0, strikeAt(), 0]);
  [shank, rawDome, dome, screw].forEach((m) => m.delete());

  return [
    { solid: axle, explode: [-70, 0, 0] },
    { solid: hangArm(weight), explode: [0, 55, 85] },
    { solid: hangArm(striker), explode: [0, -30, 85] },
  ];
}

/** Screw lift geometry, in millimetres, for its 2 × 2 × 3 body. */
export const LIFT = {
  axis: 50,
  /** The marble runs up a keyway in the wall, on the centre line of a grid cell. */
  keywayX: 75,
  bore: 38.5,
  threadRadius: 38,
  /** The core leaves the marble no room to leave the keyway towards the middle. */
  coreRadius: 32,
  /** How far outside the wall of the bore the marble's centre runs. */
  keywayOffset: 3,
  /** Bevel on the outer edge of the thread, which is what carries the marble. */
  edge: 0.6,
  pitch: 25,
  /** Height of the floor the marble waits on, which is the bottom of a channel at 25 mm. */
  seat: 16.5,
  /** Height of the floor under the screw. It is lower, so that the thread starts under the marble. */
  well: 12.5,
  /** Gap between that floor and the screw, taken up by a washer. */
  gap: 0.5,
  inletZ: 25,
  outletZ: 125,
  /** The marble is lifted slightly above the outlet, so that it rolls out. */
  outletRise: 2,
  grip: 15,
  pivotDepth: 8,
  /** Socket in the top of the screw, across flats, for a motor to drive it later. */
  hex: 10.3,
  hexDepth: 12,
  windowHalf: 12,
  windowBottom: 45,
  windowTop: 92,
};

/** Distance of the marble's centre from the axis of the screw. */
export const liftBallRadius = () => LIFT.bore + LIFT.keywayOffset;

export const liftKeywayY = () => LIFT.axis - Math.sqrt(liftBallRadius() ** 2 - (LIFT.keywayX - LIFT.axis) ** 2);

/**
 * Height of the marble's centre above the edge of the thread that carries it. The marble
 * rests on that edge and against the back of the keyway, so the thread pushes it outwards.
 */
export function liftRide(): number {
  const ball = CONFIG.ballDiameter / 2;
  const centre = liftBallRadius() + boreRadius() - ball;
  const reach = centre - (LIFT.threadRadius - LIFT.edge);
  return Math.sqrt(ball * ball - reach * reach);
}

/** Height in the body of the bottom of the screw. */
export const liftScrewBase = () => LIFT.well + LIFT.gap;

/** Height above the bottom of the screw at which its thread ends. */
export const liftThreadEnd = () => LIFT.outletZ + LIFT.outletRise + 0.5 - liftRide() - liftScrewBase();

/** The fixed tube: a bore for the screw and a keyway that stops the marble turning with it. */
export function buildLiftTube(wasm: ManifoldToplevel, body: Body): Manifold {
  const { Manifold } = wasm;
  const { cubeSize, fitClearance } = CONFIG;
  const { axis, keywayX, bore, seat, well, inletZ, outletZ, outletRise, pivotDepth, windowHalf, windowBottom, windowTop } = LIFT;
  const margin = fitClearance / 2;
  const [spanX, spanY] = [body.size[0] * cubeSize - fitClearance, body.size[1] * cubeSize - fitClearance];
  const height = bodyHeight(body);
  const r = boreRadius();
  const keywayY = liftKeywayY();
  const top = outletZ + outletRise;

  const raw = Manifold.cube([spanX, spanY, height]);
  const block = raw.translate([margin, margin, 0]);

  const place = (solid: Manifold, x: number, y: number, z: number) => {
    const placed = solid.translate([x, y, z]);
    solid.delete();
    return placed;
  };
  const peak = r * ROOF_PEAK_FACTOR;
  const ball = Manifold.sphere(r, 32);
  /** A tunnel with a pointed roof between two points, on the line of the keyway. */
  const tunnel = (zOut: number, zIn: number) => {
    const ends = [ball.translate([keywayX, -1, zOut]), ball.translate([keywayX, keywayY, zIn])];
    const hull = Manifold.hull([...ends, [keywayX, -1, zOut + peak], [keywayX, keywayY, zIn + peak]]);
    ends.forEach((m) => m.delete());
    return hull;
  };

  // Windows with pointed tops show the screw and the marble on its way up.
  const pane = Manifold.hull(
    [-1, axis - bore + 12].flatMap((y): Vec3[] => [
      [axis - windowHalf, y, windowBottom],
      [axis + windowHalf, y, windowBottom],
      [axis + windowHalf, y, windowTop],
      [axis, y, windowTop + windowHalf],
      [axis - windowHalf, y, windowTop],
    ]),
  );
  const centred = pane.translate([-axis, -axis, 0]);
  const windows = [0, 90, 180, 270].map((turn) => place(centred.rotate([0, 0, turn]), axis, axis, 0));
  [pane, centred].forEach((m) => m.delete());

  const tools = [
    place(Manifold.cylinder(height - well + 1, bore, bore, 128), axis, axis, well),
    place(Manifold.cylinder(top - seat, r, r, 48), keywayX, keywayY, seat),
    place(Manifold.cylinder(r, r, 0, 48), keywayX, keywayY, top),
    tunnel(inletZ, inletZ),
    tunnel(outletZ, top),
    place(Manifold.cylinder(pivotDepth + 1, pressRadius(), pressRadius(), 24), axis, axis, well - pivotDepth),
    ...windows,
  ];
  const union = Manifold.union(tools);
  const result = block.subtract(union);
  [raw, block, ball, ...tools, union].forEach((m) => m.delete());
  return result;
}

/**
 * The screw, standing as it prints. Its fluted top stands above the tube, with a dimple
 * for turning it with one finger and a hexagonal socket for a motor.
 */
export function buildLiftScrew(wasm: ManifoldToplevel, assembled = false): Manifold {
  const { Manifold } = wasm;
  const { pinClearance, axleDiameter } = CONFIG;
  const { axis, threadRadius, coreRadius, pitch, gap, grip, pivotDepth, edge, hex, hexDepth } = LIFT;
  const STEPS_PER_TURN = 48;
  const start = gap;
  const turns = (liftThreadEnd() - start) / pitch;
  const steps = Math.round(turns * STEPS_PER_TURN);
  const inner = coreRadius - 1;
  // The underside falls steeply enough to print; the first turn is cut off level with the bed.
  const underside = (threadRadius - inner) * 1.2;

  const section = (i: number): Vec3[] => {
    const angle = (i / STEPS_PER_TURN) * 2 * Math.PI;
    const z = start + (i / STEPS_PER_TURN) * pitch;
    const at = (r: number, h: number): Vec3 => [r * Math.cos(angle), r * Math.sin(angle), h];
    return [at(inner, z), at(threadRadius - edge, z), at(threadRadius, z - edge), at(threadRadius, z - edge - 1), at(inner, z - edge - 1 - underside)];
  };

  const blades: Manifold[] = [];
  // Each step reaches slightly into the next, so that the steps fuse into one thread.
  for (let i = 0; i < steps; i++) blades.push(Manifold.hull([...section(i), ...section(i + 1.05)]));

  const height = CONFIG.cubeSize * 3 - liftScrewBase() + grip;
  const core = Manifold.cylinder(height, coreRadius, coreRadius, 96);
  const pivotRadius = (axleDiameter + pinClearance) / 2;
  // Blind hole with a pointed end, printed upright.
  const shaft = Manifold.cylinder(pivotDepth, pivotRadius, pivotRadius, 24);
  const pivot = Manifold.hull([shaft, [0, 0, pivotDepth + pivotRadius]]);
  shaft.delete();

  const lift = (solid: Manifold, x: number, y: number, z: number) => {
    const placed = solid.translate([x, y, z]);
    solid.delete();
    return placed;
  };
  const FLUTES = 16;
  const flutes = Array.from({ length: FLUTES }, (_, i) => {
    const angle = (i / FLUTES) * 2 * Math.PI;
    const reach = coreRadius + 0.8;
    return lift(Manifold.cylinder(grip, 2.5, 2.5, 16), reach * Math.cos(angle), reach * Math.sin(angle), height - grip + 1.5);
  });
  const dimple = lift(Manifold.cylinder(7, 9, 9, 32), 19, 0, height - 6);
  const socket = lift(hexPrism(wasm, hex, hexDepth + 1), 0, 0, height - hexDepth);

  const whole = Manifold.union([core, ...blades]);
  const level = whole.trimByPlane([0, 0, 1], 0);
  const tools = Manifold.union([pivot, dimple, socket, ...flutes]);
  const screw = level.subtract(tools);
  [core, pivot, whole, level, dimple, socket, tools, ...flutes, ...blades].forEach((m) => m.delete());
  if (!assembled) return screw;

  const placed = screw.translate([axis, axis, liftScrewBase()]);
  screw.delete();
  return placed;
}

/** The steel that goes into the lift: the pivot pin and the washer the screw turns on. */
function liftHardware(wasm: ManifoldToplevel): Placed[] {
  const { Manifold } = wasm;
  const { axis, well, gap, pivotDepth } = LIFT;
  const rawPin = Manifold.cylinder(2 * pivotDepth, axleRadius(), axleRadius(), 24);
  const pin = rawPin.translate([axis, axis, well - pivotDepth]);
  const disc = Manifold.cylinder(gap, 3.5, 3.5, 32);
  const rawHole = Manifold.cylinder(gap + 2, 1.6, 1.6, 24);
  const hole = rawHole.translate([0, 0, -1]);
  const ring = disc.subtract(hole);
  const washer = ring.translate([axis, axis, well]);
  [rawPin, disc, rawHole, hole, ring].forEach((m) => m.delete());
  return [
    { solid: pin, explode: [0, 0, 150] },
    { solid: washer, explode: [0, 0, 172] },
  ];
}

/** The printed parts that move in a piece, either posed in place or laid out for printing. */
export function buildMovingParts(wasm: ManifoldToplevel, shape: Shape, assembled: boolean): MovingPart[] {
  if (shape === 'lift') return [{ suffix: 'screw', solid: buildLiftScrew(wasm, assembled), explode: [0, 0, 200] }];
  if (shape === 'pendulum') {
    return [
      { suffix: 'arm', solid: buildPendulumArm(wasm, assembled), explode: [0, 0, 85] },
      { suffix: 'pin', solid: buildPendulumPin(wasm, assembled), explode: [45, 0, 0] },
    ];
  }
  if (shape === 'seesaw') return [{ suffix: 'arm', solid: buildSeesawArm(wasm, assembled ? ARM.tilt : 0), explode: [0, 0, 70] }];
  return [];
}

/** The bought parts of a piece, posed in place. They are only shown, never printed. */
export function buildHardware(wasm: ManifoldToplevel, shape: Shape): Placed[] {
  if (shape === 'lift') return liftHardware(wasm);
  if (shape === 'pendulum') return pendulumHardware(wasm);
  if (shape === 'seesaw') return [{ solid: crossPin(wasm, axleRadius(), ARM.axleY, ARM.axleZ, 0, CONFIG.cubeSize), explode: [-70, 0, 0] }];
  return [];
}

/** Height of the groove where a falling marble lands on the arm. */
export const seesawLanding = () => ARM.axleZ - ARM.axleAbove + ARM.height;
