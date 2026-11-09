import { spiralPath } from '../geometry/cavities';
import { CONFIG } from '../geometry/config';
import { FACE_DIR, isSpiral, isVertical, parseSide, portPosition, type Channel, type Face, type PieceSpec, type Port, type SidePort, type Vec3 } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { leanCells, pieceCells } from './checks';
import { addPiece, EMPTY_ASSEMBLY, ROTATIONS, rotatedFootprint, toWorld, Z_STEP, type Assembly, type Cell, type PlacedPiece, type Rotation } from './model';

export type GalleryLevel = 'beginner' | 'intermediate' | 'advanced' | 'showpiece';

export interface GalleryItem {
  id: string;
  level: GalleryLevel;
  /** A second marble behind the first, for tracks with a single start. */
  followDelay?: number;
  assembly: Assembly;
}

const UNIT = CONFIG.cubeSize;
/** Tallest block used as a support, in cubes. */
const MAX_BLOCK_CUBES = 4;
const COS: Record<Rotation, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<Rotation, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

type Direction = [number, number];

const turn = ([x, y]: Direction, r: Rotation): Direction => [COS[r] * x - SIN[r] * y, SIN[r] * x + COS[r] * y];
const rotationFor = (local: Direction, world: Direction): Rotation =>
  ROTATIONS.find((r) => {
    const [x, y] = turn(local, r);
    return x === world[0] && y === world[1];
  }) as Rotation;

interface Route {
  entry: Port;
  exit: Port;
}

/** Follows the channels of a piece from the first one, through any that continue it. */
function defaultRoute(spec: PieceSpec): Route {
  let current: Channel = spec.channels[0];
  for (const channel of spec.channels.slice(1)) {
    if (channel.from === current.to) current = channel;
  }
  return { entry: spec.channels[0].from, exit: current.to };
}

interface Cursor {
  /** Cell the track enters next. */
  cell: [number, number];
  /** Where the track left the last piece, seen from above. */
  at: [number, number];
  /** Height of the ball on arrival, in millimetres. */
  z: number;
  heading: Direction;
  /** True when the marble is falling from a hole, not rolling out of a side. */
  falling: boolean;
}

/** An assembly under construction. */
class Draft {
  pieces: Assembly = EMPTY_ASSEMBLY;

  place(key: string, cell: Cell, rotation: Rotation = 0): PlacedPiece {
    const before = this.pieces;
    this.pieces = addPiece(before, PRESETS[key], cell, rotation);
    if (this.pieces === before) throw new Error(`${key} does not fit at ${cell.join(',')}`);
    return this.pieces.pieces[this.pieces.pieces.length - 1];
  }

  /** Starts a track at a side exit of a piece already placed. */
  after(piece: PlacedPiece, exit: Port): Line {
    return new Line(this).through(piece, exit);
  }

  line(key: string, cell: Cell, heading: Face): Line {
    return new Line(this).begin(key, cell, FACE_DIR[heading]);
  }
}

interface ToOptions {
  /** Extra steps of 25 mm for the marble to fall on the way in. */
  drop?: number;
  /** Runs a level piece backwards, which turns a left curve into a right one. */
  reverse?: boolean;
}

/** Lays a track piece by piece, working out where each must go to meet the one before. */
class Line {
  private cursor: Cursor | null = null;

  constructor(private readonly draft: Draft) {}

  private leave(piece: PlacedPiece, port: Port) {
    const position = toWorld(piece, portPosition(port, piece.spec.body));
    if (isVertical(port)) {
      this.cursor = port[0] === 'D' && position[2] > 0
        ? { cell: [Math.floor(position[0] / UNIT), Math.floor(position[1] / UNIT)], at: [position[0], position[1]], z: position[2], heading: this.cursor?.heading ?? FACE_DIR.S, falling: true }
        : null;
      return;
    }
    const heading = turn(FACE_DIR[parseSide(port).face], piece.rotation);
    this.cursor = {
      cell: [Math.floor((position[0] + heading[0] * UNIT * 0.5) / UNIT), Math.floor((position[1] + heading[1] * UNIT * 0.5) / UNIT)],
      at: [position[0], position[1]],
      z: position[2],
      heading,
      falling: false,
    };
  }

  private get here(): Cursor {
    if (!this.cursor) throw new Error('The track has already ended');
    return this.cursor;
  }

  begin(key: string, cell: Cell, heading: Direction): this {
    const { exit } = defaultRoute(PRESETS[key]);
    const rotation = isVertical(exit) ? 0 : rotationFor(FACE_DIR[parseSide(exit).face], heading);
    this.cursor = { cell: [cell[0], cell[1]], at: [0, 0], z: 0, heading, falling: false };
    this.leave(this.draft.place(key, cell, rotation), exit);
    return this;
  }

  /** Places a piece so that its entry meets the end of the track so far. */
  to(key: string, options: ToOptions = {}): this {
    const spec = PRESETS[key];
    const spiral = spec.cavities?.find((c) => isSpiral(c.type));
    const forward = spiral ? null : defaultRoute(spec);
    const route = forward && options.reverse ? { entry: forward.exit, exit: forward.entry } : forward;
    const entryLocal: Vec3 = spiral
      ? (() => {
          const path = spiralPath(spec.body, spiral.type === 'spiralMirror');
          return [path[1][0], spec.body.size[1] * UNIT, path[0][2]];
        })()
      : portPosition(route!.entry, spec.body);
    const here = this.here;
    const entryFace: Direction = spiral ? FACE_DIR.N : FACE_DIR[parseSide(route!.entry as SidePort).face];
    const rotation = rotationFor(entryFace, [-here.heading[0], -here.heading[1]]);
    const base = Math.floor((here.z - entryLocal[2]) / Z_STEP) - (options.drop ?? 0);

    const origin = toWorld({ spec, cell: [0, 0, 0], rotation }, entryLocal);
    const cell: Cell = [(here.at[0] - origin[0]) / UNIT, (here.at[1] - origin[1]) / UNIT, base];
    const piece = this.draft.place(key, cell, rotation);
    if (route) this.leave(piece, route.exit);
    else this.cursor = null;
    return this;
  }

  /** Places a piece directly under a hole, so that its channel catches the falling marble. */
  below(key: string, heading?: Face): this {
    const here = this.here;
    if (!here.falling) throw new Error('Nothing is falling here');
    const spec = PRESETS[key];
    const route = defaultRoute(spec);
    const direction = heading ? FACE_DIR[heading] : here.heading;
    const rotation = rotationFor(FACE_DIR[parseSide(route.exit as SidePort).face], direction);
    const piece = this.draft.place(key, [here.cell[0], here.cell[1], (here.z - spec.body.size[2] * UNIT) / Z_STEP], rotation);
    this.cursor = { ...here, heading: direction, falling: false };
    this.leave(piece, route.exit);
    return this;
  }

  /** Goes through a piece already in place, along another of its channels. */
  through(piece: PlacedPiece, exit: Port): this {
    this.leave(piece, exit);
    return this;
  }

  /** Keeps the piece a later pass of the track will go through. */
  mark(receive: (piece: PlacedPiece) => void): this {
    receive(this.draft.pieces.pieces[this.draft.pieces.pieces.length - 1]);
    return this;
  }
}

/** Fills the given cells with as few blocks as it can, using tall and double-width ones. */
function packSupports(draft: Draft, wanted: Set<string>) {
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const has = (x: number, y: number, z: number) => wanted.has(key(x, y, z));
  const run = (x: number, y: number, z: number) => {
    let n = 0;
    while (has(x, y, z + n)) n += 1;
    return n;
  };
  const take = (x: number, y: number, z: number, height: number) => {
    for (let i = 0; i < height; i++) wanted.delete(key(x, y, z + i));
  };
  const cells = [...wanted].map((cell) => cell.split(',').map(Number)).sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);

  for (const [x, y, z] of cells) {
    if (!has(x, y, z)) continue;
    const free = run(x, y, z);
    // Half blocks go first, so that everything above sits on whole cubes.
    if (free % 2 === 1) {
      draft.place('halfBlock', [x, y, z]);
      take(x, y, z, 1);
      continue;
    }
    const steps = Math.min(free, 2 * MAX_BLOCK_CUBES);
    const cubes = steps / 2;
    if (run(x + 1, y, z) >= steps) {
      draft.place(`wall${cubes}`, [x, y, z], 0);
      take(x + 1, y, z, steps);
    } else if (run(x, y + 1, z) >= steps) {
      draft.place(`wall${cubes}`, [x, y, z], 90);
      take(x, y + 1, z, steps);
    } else {
      draft.place(cubes === 1 ? 'cube' : `column${cubes}`, [x, y, z]);
    }
    take(x, y, z, steps);
  }
}

/** Fills the gap under every raised piece with blocks. */
function addSupports(draft: Draft) {
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const filled = new Set<string>();
  const wanted = new Set<string>();
  draft.pieces.pieces.forEach((piece) => pieceCells(piece).forEach(([x, y, z]) => filled.add(key(x, y, z))));

  const fill = (x: number, y: number, top: number) => {
    for (let z = top - 1; z >= 0 && !filled.has(key(x, y, z)); z--) {
      filled.add(key(x, y, z));
      wanted.add(key(x, y, z));
    }
  };

  for (const piece of draft.pieces.pieces) {
    if (piece.spec.body.shape === 'leanRamp') {
      const cells = leanCells(piece);
      const [low, high] = [cells[0], cells[cells.length - 1]];
      fill(low.x, low.y, piece.cell[2]);
      fill(high.x, high.y, high.from);
      continue;
    }
    if (piece.cell[2] === 0) continue;
    const [footX, footY] = rotatedFootprint(piece.spec, piece.rotation);
    const columns = new Set([`0,0`, `${footX - 1},0`, `0,${footY - 1}`, `${footX - 1},${footY - 1}`]);
    for (const column of columns) {
      const [dx, dy] = column.split(',').map(Number);
      fill(piece.cell[0] + dx, piece.cell[1] + dy, piece.cell[2]);
    }
  }
  packSupports(draft, wanted);
}

function make(id: string, level: GalleryLevel, build: (draft: Draft) => void, followDelay?: number): GalleryItem {
  const draft = new Draft();
  build(draft);
  addSupports(draft);
  return { id, level, followDelay, assembly: { ...draft.pieces, name: id } };
}

/** A descending square of ramps and tunnel curves, the only way to take a long fall round bends. */
function lap(line: Line): Line {
  return line
    .to('rampStraight').to('curveTunnel')
    .to('rampStraight').to('curveTunnel')
    .to('rampStraight').to('curveTunnel')
    .to('rampStraight').to('curveTunnel');
}

export const GALLERY: GalleryItem[] = [
  make('firstRun', 'beginner', (d) => {
    d.line('start', [4, 7, 2], 'S').to('rampStraight').to('stop');
  }),
  make('stairs', 'beginner', (d) => {
    d.line('start', [4, 8, 4], 'S').to('rampStraight').to('rampStraight').to('rampStraight').to('stop');
  }),
  make('longRamp', 'beginner', (d) => {
    d.line('start', [4, 9, 2], 'S').to('rampLong3').to('rampLong2').to('stopLow');
  }),
  make('wave', 'beginner', (d) => {
    d.line('startLow', [4, 9, 3], 'S').to('waveLong3').to('stopLow');
  }),
  make('leftRight', 'beginner', (d) => {
    d.line('startLow', [3, 8, 3], 'S').to('rampCurveLow').to('rampCurveLowMirror').to('stopLow');
  }),
  make('funnelTunnel', 'intermediate', (d) => {
    d.line('funnelTunnel', [2, 5, 3], 'E').to('straightTunnel').to('straightTunnel').to('stop');
  }),
  make('downTheHole', 'intermediate', (d) => {
    d.line('start', [4, 8, 4], 'S').to('drop').below('rampStraight').to('stop');
  }),
  make('jump', 'intermediate', (d) => {
    d.line('start', [4, 9, 4], 'S').to('rampStraight').to('straightTop', { drop: 1 }).to('stop');
  }),
  make('bridge', 'intermediate', (d) => {
    d.place('cylinder', [4, 7, 0]);
    d.place('arch', [4, 6, 0]);
    d.place('cylinder', [4, 5, 0]);
    d.line('start', [4, 8, 3], 'S').to('straightTop').to('straightTop').to('straightTop').to('rampStraight').to('stop');
  }),
  make('hiddenTunnel', 'intermediate', (d) => {
    let crossing: PlacedPiece;
    d.line('start', [2, 5, 3], 'S')
      .to('double').mark((p) => (crossing = p))
      .to('rampStraight').to('curveTunnel').to('curveTunnel').to('straightTunnel').to('curveTunnel')
      .through(crossing!, 'W.M.0')
      .to('stop');
  }),
  make('lowTrack', 'intermediate', (d) => {
    d.line('startLow', [5, 9, 3], 'S').to('rampLow').to('halfCurve').to('halfGroove').to('rampLow').to('stopLow');
  }),
  make('spiralDescent', 'intermediate', (d) => {
    d.line('start', [5, 6, 1], 'S').to('rampLow').to('spiral');
  }),
  make('twinSpirals', 'advanced', (d) => {
    d.line('start', [2, 7, 1], 'S').to('rampLow').to('spiral');
    d.line('start', [6, 7, 1], 'S').to('rampLow').to('spiralMirror');
  }),
  make('tower', 'advanced', (d) => {
    lap(lap(d.line('start', [3, 6, 9], 'S'))).to('stop');
  }),
  make('bigLoop', 'advanced', (d) => {
    let crossing: PlacedPiece;
    d.line('start', [4, 7, 3], 'S')
      .to('double').mark((p) => (crossing = p))
      .to('rampStraight').to('curveTunnel').to('straightTunnel').to('curveTunnel').to('straightTunnel').to('curveTunnel').to('straightTunnel')
      .through(crossing!, 'W.M.0')
      .to('straightTunnel')
      .to('stop');
  }),
  make('chamber', 'advanced', (d) => {
    d.line('start', [4, 9, 4], 'S').to('rampStraight').to('rampStraight').to('rampStraight').to('straightTop').to('chamberDrop');
  }),
  make('race', 'advanced', (d) => {
    for (const x of [3, 5]) d.line('start', [x, 8, 4], 'S').to('rampStraight').to('straightTop').to('rampStraight').to('straightTop').to('stop');
  }),
  make('crossroads', 'advanced', (d) => {
    let crossing: PlacedPiece;
    d.line('start', [4, 5, 2], 'S').to('crossTop').mark((p) => (crossing = p)).to('stop');
    d.line('start', [9, 4, 4], 'W').to('rampLong3').to('rampLow').through(crossing!, 'W.T.0').to('stop');
  }),
  make('convoy', 'advanced', (d) => {
    d.line('start', [4, 9, 4], 'S').to('rampStraight').to('straightTop').to('rampStraight').to('straightTop').to('straightTop').to('stop');
  }, 1.2),
  make('showcase', 'advanced', (d) => {
    d.place('cylinder', [1, 7, 0]);
    d.line('start', [1, 9, 6], 'S')
      .to('straightTunnel').to('curveTunnel')
      .to('waveLong3').to('rampLow').to('drop')
      .below('rampStraight', 'S')
      .to('spiral', { drop: 1 });
  }),

  make('launcher', 'advanced', (d) => {
    d.place('pendulum', [5, 7, 0]);
    d.place('rampClimb', [5, 6, 0]);
    d.place('stop', [5, 5, 0]);
  }),

  make('catapult', 'showpiece', (d) => {
    d.after(d.place('pendulum', [5, 9, 2]), 'S.M.0')
      .to('rampClimb').to('straightTop').to('rampStraight')
      .to('curveTunnel').to('straightTunnel').to('rampStraight')
      .to('curveTunnel').to('rampStraight').to('stopLow');
  }),

  make('castle', 'showpiece', (d) => {
    d.line('start', [6, 7, 9], 'S')
      .to('rampStraight').to('straightTunnel').to('curveTunnel')
      .to('rampStraight').to('curveTunnel')
      .to('rampStraight').to('curveTunnel')
      .to('rampStraight').to('rampStraight')
      .to('stop');
  }),
  make('serpentine', 'showpiece', (d) => {
    const left = (l: Line) => l.to('curveTunnel').to('curveTunnel');
    const right = (l: Line) => l.to('curveTunnel', { reverse: true }).to('curveTunnel', { reverse: true });
    let line = d.line('start', [5, 9, 8], 'S').to('rampStraight').to('rampStraight');
    line = right(left(line).to('rampStraight').to('rampStraight')).to('rampStraight').to('rampStraight');
    line.to('curveTunnel').to('stop');
  }),
  make('terraces', 'showpiece', (d) => {
    d.line('start', [5, 10, 5], 'S').to('leanRamp3').to('curveTunnel').to('straightTunnel').to('leanRamp2').to('stopLow');
  }),
  make('viaduct', 'showpiece', (d) => {
    d.place('cylinder', [6, 11, 0]);
    d.place('cylinder', [6, 11, 2]);
    d.place('cylinder', [6, 9, 0]);
    d.place('cylinder', [6, 9, 2]);
    d.place('arch', [6, 8, 0]);
    d.place('arch', [6, 8, 2]);
    d.place('arch', [6, 6, 0]);
    d.place('arch', [6, 6, 2]);
    d.line('start', [6, 12, 4], 'S').to('longGroove3').to('longGroove3').to('rampLong3').to('rampLow').to('stopLow');
  }),
  make('crossover', 'showpiece', (d) => {
    let crossing: PlacedPiece;
    d.line('start', [6, 9, 3], 'S').to('double').mark((p) => (crossing = p)).to('straightTop').to('stop');
    d.line('start', [8, 8, 2], 'W').to('straightTunnel').through(crossing!, 'W.M.0').to('straightTunnel').to('stop');
  }),
  make('twinMerge', 'showpiece', (d) => {
    d.place('rampOneLane', [6, 8, 3]);
    d.place('doubleRamp', [6, 7, 2]);
    d.place('yMerge', [6, 6, 1]);
    d.place('stop', [6, 5, 1]);
  }),
  make('spiralTower', 'showpiece', (d) => {
    d.line('start', [7, 9, 6], 'S')
      .to('rampStraight').to('rampStraight').to('rampStraight').to('rampStraight').to('rampStraight')
      .to('rampLow').to('spiral');
  }),
  make('seesawJunction', 'showpiece', (d) => {
    d.place('seesaw', [6, 6, 0]);
    d.place('stopLow', [6, 5, 0]);
    d.place('stopLow', [6, 9, 0], 180);
    d.line('start', [6, 8, 3], 'S').to('drop');
  }),
  make('finale', 'showpiece', (d) => {
    d.line('funnelTunnel', [4, 6, 6], 'E')
      .to('straightTunnel').to('curveTunnel')
      .to('rampStraight').to('rampStraight').to('curveTunnel')
      .to('rampStraight').to('rampStraight').to('rampStraight')
      .to('chamberDrop');
  }),
  make('leanZigzag', 'showpiece', (d) => {
    d.line('start', [4, 12, 7], 'S')
      .to('leanRamp3').to('curveTunnel').to('curveTunnel', { reverse: true })
      .to('leanRamp3').to('curveTunnel').to('stop');
  }),
  make('hiddenLoopTower', 'showpiece', (d) => {
    let crossing: PlacedPiece;
    d.line('start', [8, 10, 7], 'S').to('rampStraight').to('rampStraight').to('rampStraight')
      .to('double').mark((p) => (crossing = p))
      .to('rampStraight').to('curveTunnel').to('curveTunnel').to('straightTunnel').to('curveTunnel')
      .through(crossing!, 'W.M.0')
      .to('rampStraight').to('stop');
  }),
  make('grandTour', 'showpiece', (d) => {
    d.line('start', [4, 12, 9], 'S')
      .to('rampStraight').to('rampStraight').to('straightTunnel').to('curveTunnel').to('straightTunnel')
      .to('rampStraight').to('curveTunnel').to('rampStraight').to('curveTunnel', { reverse: true })
      .to('rampStraight').to('curveTunnel', { reverse: true }).to('drop')
      .below('rampStraight', 'S').to('rampLow').to('spiral');
  }),
];
