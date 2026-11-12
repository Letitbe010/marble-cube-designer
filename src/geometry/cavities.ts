import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { boreRadius, CONFIG } from './config';
import { bodyHeight, FACE_DIR, isSpiral, levelZ, type Body, type Cavity, type CavityType, type Vec3 } from './ports';

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
export function spiralPath(body: Body, mirrored = false): Vec3[] {
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
  return mirrored ? points.map(([x, y, z]) => [2 * centre - x, y, z]) : points;
}

const easeInOut = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;

const WIDE_STEPS = 32;

/** A quarter circle across a 2 × 2 plate, from the north face to the east one, in a slot deep enough to wall the marble in. */
export function wideCurvePath(body: Body): Vec3[] {
  const span = body.size[0] * CONFIG.cubeSize;
  const lane = CONFIG.cubeSize / 2;
  const radius = span - lane;
  const z = levelZ('M', body);
  const points: Vec3[] = [[lane, span + 1, z]];
  for (let i = 0; i <= WIDE_STEPS; i++) {
    const angle = Math.PI * (1 + i / (2 * WIDE_STEPS));
    points.push([span + radius * Math.cos(angle), span + radius * Math.sin(angle), z]);
  }
  points.push([span + 1, lane, z]);
  return points;
}

export const HELIX = {
  turns: 2,
  steps: 96,
  /** Depth of the shaft that leads from the top face down to the first turn. */
  inlet: 15,
  /** Width and depth of the slits that show the marble passing, narrower than the marble. */
  windowWidth: 9,
  windowDepth: 15,
  windowMargin: 12,
};

/** Where the helix is entered from above and left below: the centre of one cell, so that modules stack. */
export const helixAxis = (body: Body): [number, number] => {
  const span = body.size[0] * CONFIG.cubeSize;
  return [span - CONFIG.cubeSize / 2, span - CONFIG.cubeSize / 2];
};

/** Falls in at the top, winds down round the middle of the block and falls out at the bottom, under where it came in. */
export function helixPath(body: Body, mirrored = false): Vec3[] {
  const top = bodyHeight(body);
  const centre = (body.size[0] * CONFIG.cubeSize) / 2;
  const [x0, y0] = helixAxis(body);
  const radius = Math.hypot(x0 - centre, y0 - centre);
  const start = Math.atan2(y0 - centre, x0 - centre);
  const high = top - HELIX.inlet;
  const low = boreRadius() + CONFIG.minWall;
  const points: Vec3[] = [[x0, y0, top + 1], [x0, y0, high]];
  for (let i = 1; i <= HELIX.steps; i++) {
    const t = i / HELIX.steps;
    const angle = start - 2 * Math.PI * HELIX.turns * t;
    points.push([centre + radius * Math.cos(angle), centre + radius * Math.sin(angle), high + (low - high) * t]);
  }
  points.push([x0, y0, -1]);
  // Swapping the axes keeps the way in where it was and reverses the winding.
  return mirrored ? points.map(([x, y, z]) => [y, x, z]) : points;
}

export const LOOP = {
  /** Radius of the circle the centre of the marble follows. */
  radius: 30,
  steps: 48,
  /** Length over which the track moves from the centre of the face to its lane, at each end. */
  shift: 40,
  shiftSteps: 8,
  /** Turn of the loop over which the track crosses from one lane to the other, around its top. */
  crossFrom: (2 * Math.PI) / 3,
  crossSpan: (2 * Math.PI) / 3,
  /** Stretch of the loop shown through each side slit, in degrees from its lowest point. */
  windows: [[20, 120], [240, 340]] as const,
  /** Half width of a slit where it opens into the bore: the marble cannot leave through it. */
  windowHalf: 5.5,
};

/** Centre of the marble after turning the given angle round the loop, from its lowest point. */
export function loopPoint(body: Body, angle: number): Vec3 {
  const centre = CONFIG.cubeSize / 2;
  const middle = (body.size[1] * CONFIG.cubeSize) / 2;
  const base = levelZ('M', body);
  const across = easeInOut((angle - LOOP.crossFrom) / LOOP.crossSpan);
  return [
    centre + CONFIG.laneOffset * (2 * across - 1),
    middle - LOOP.radius * Math.sin(angle),
    base + LOOP.radius * (1 - Math.cos(angle)),
  ];
}

/** In by the north face, once round a vertical loop that also steps one lane sideways, and out by the south face. */
export function loopPath(body: Body): Vec3[] {
  const centre = CONFIG.cubeSize / 2;
  const length = body.size[1] * CONFIG.cubeSize;
  const z = levelZ('M', body);
  const lane = CONFIG.laneOffset;
  const points: Vec3[] = [[centre, length + 1, z]];
  for (let i = 0; i <= LOOP.shiftSteps; i++) {
    const t = i / LOOP.shiftSteps;
    points.push([centre - lane * easeInOut(t), length - LOOP.shift * t, z]);
  }
  for (let i = 0; i <= LOOP.steps; i++) points.push(loopPoint(body, (2 * Math.PI * i) / LOOP.steps));
  for (let i = 0; i <= LOOP.shiftSteps; i++) {
    const t = i / LOOP.shiftSteps;
    points.push([centre + lane * (1 - easeInOut(t)), LOOP.shift * (1 - t), z]);
  }
  points.push([centre, -1, z]);
  return points;
}

/** One end of a track: where it meets a face, and which way it leaves the piece there. */
export interface TrackEnd {
  position: Vec3;
  /** Outward horizontal direction; null for an opening in the top or the bottom. */
  dir: [number, number] | null;
  vertical: 'U' | 'D' | null;
}

/** A fixed path through a piece that is not made of channels between ports. */
export interface Track {
  /** Centre line of the marble, running a little past each end. */
  path: Vec3[];
  ends: [TrackEnd, TrackEnd];
  /** True when the track is open from above. */
  open: boolean;
  /** False when the track can be run in either direction. */
  oneWay: boolean;
}

/** Bodies each track can be cut into. */
const TRACK_BODIES: Partial<Record<CavityType, [number, number, number][]>> = {
  wideCurve: [[2, 2, 1], [2, 2, 0.5]],
  helix: [[2, 2, 2]],
  helixMirror: [[2, 2, 2]],
  loop: [[1, 3, 2]],
};

/** The track a cavity makes in its body; null for a spiral or a plain cavity. */
export function trackOf(cavity: Cavity, body: Body): Track | null {
  const unit = CONFIG.cubeSize;
  if (cavity.type === 'wideCurve') {
    const span = body.size[0] * unit;
    const z = levelZ('M', body);
    return {
      path: wideCurvePath(body),
      ends: [
        { position: [unit / 2, span, z], dir: FACE_DIR.N, vertical: null },
        { position: [span, unit / 2, z], dir: FACE_DIR.E, vertical: null },
      ],
      open: true,
      oneWay: false,
    };
  }
  if (cavity.type === 'helix' || cavity.type === 'helixMirror') {
    const [x, y] = helixAxis(body);
    return {
      path: helixPath(body, cavity.type === 'helixMirror'),
      ends: [
        { position: [x, y, bodyHeight(body)], dir: null, vertical: 'U' },
        { position: [x, y, 0], dir: null, vertical: 'D' },
      ],
      open: false,
      oneWay: true,
    };
  }
  if (cavity.type === 'loop') {
    const z = levelZ('M', body);
    return {
      path: loopPath(body),
      ends: [
        { position: [unit / 2, body.size[1] * unit, z], dir: FACE_DIR.N, vertical: null },
        { position: [unit / 2, 0, z], dir: FACE_DIR.S, vertical: null },
      ],
      open: false,
      oneWay: true,
    };
  }
  return null;
}

/** The track of a piece, if it has one. */
export function pieceTrack(spec: { body: Body; cavities?: Cavity[] }): Track | null {
  for (const cavity of spec.cavities ?? []) {
    const track = trackOf(cavity, spec.body);
    if (track) return track;
  }
  return null;
}

/** Slits in the four faces of a helix block, with a pointed top so that they print without support. */
function helixWindows(wasm: ManifoldToplevel, body: Body): Manifold[] {
  const span = body.size[0] * CONFIG.cubeSize;
  const centre = span / 2;
  const top = bodyHeight(body) - HELIX.windowMargin;
  const half = HELIX.windowWidth / 2;
  const slits: Manifold[] = [];
  for (const [cos, sin] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const points: Vec3[] = [];
    for (const depth of [-1, HELIX.windowDepth]) {
      for (const [side, z] of [[-half, HELIX.windowMargin], [half, HELIX.windowMargin], [-half, top - half], [half, top - half], [0, top]]) {
        // Built on the west face, then turned to each of the others about the middle of the block.
        const [dx, dy] = [depth - centre, side];
        points.push([centre + cos * dx - sin * dy, centre + sin * dx + cos * dy, z]);
      }
    }
    slits.push(wasm.Manifold.hull(points));
  }
  return slits;
}

/**
 * Slits along the rising and the falling side of the loop, each in the face its lane runs beside.
 * They widen outwards at 45 degrees, which keeps every overhang printable.
 */
function loopWindows(wasm: ManifoldToplevel, body: Body): Manifold[] {
  const width = body.size[0] * CONFIG.cubeSize;
  const r = boreRadius();
  const tip = 2.5;
  const slits: Manifold[] = [];
  LOOP.windows.forEach(([from, to], side) => {
    const west = side === 0;
    const cones: Manifold[] = [];
    for (let degrees = from; degrees <= to; degrees += 5) {
      const [x, y, z] = loopPoint(body, (degrees * Math.PI) / 180);
      // Distance from the face to where the slit meets the wall of the bore.
      const wall = (west ? x : width - x) - r;
      const height = wall + 1 + (LOOP.windowHalf - tip);
      const raw = wasm.Manifold.cylinder(height, LOOP.windowHalf + wall + 1, tip, 24);
      const turned = raw.rotate([0, west ? 90 : -90, 0]);
      cones.push(turned.translate([west ? -1 : width + 1, y, z]));
      raw.delete();
      turned.delete();
    }
    for (let i = 0; i < cones.length - 1; i++) slits.push(wasm.Manifold.hull([cones[i], cones[i + 1]]));
    cones.forEach((cone) => cone.delete());
  });
  return slits;
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

  if (isSpiral(cavity.type)) {
    const centre = (body.size[0] * CONFIG.cubeSize) / 2;
    return [...sweep(spiralPath(body, cavity.type === 'spiralMirror'), true), place(Manifold.cylinder(top + 2, r, r, SEGMENTS), centre, centre, -1)];
  }

  const track = trackOf(cavity, body);
  if (track) {
    const windows = cavity.type === 'loop' ? loopWindows(wasm, body) : cavity.type === 'wideCurve' ? [] : helixWindows(wasm, body);
    return [...sweep(track.path, track.open), ...windows];
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
  if (isSpiral(cavity.type)) return width === 2 && length === 2;
  const bodies = TRACK_BODIES[cavity.type];
  if (bodies) return bodies.some((size) => size.every((n, i) => n === body.size[i]));

  const [i, j] = cavity.cell;
  if (i < 0 || j < 0 || i >= width || j >= length) return false;
  if (cavity.size > CONFIG.cubeSize / 2 - CONFIG.minWall || cavity.size <= boreRadius()) return false;

  if (cavity.type === 'funnel') return cavity.size - boreRadius() + CONFIG.minWall <= top;
  if (cavity.type === 'basin') return dishDepth(cavity.size) + CONFIG.minWall <= top;
  return top >= CONFIG.cubeSize;
}
