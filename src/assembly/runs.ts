import { spiralPath } from '../geometry/cavities';
import { CONFIG } from '../geometry/config';
import { channelPath } from '../geometry/paths';
import { FACE_DIR, isVertical, parseSide, portPosition, verticalKind, type Channel, type Vec3 } from '../geometry/ports';
import { toWorld, type Assembly, type PlacedPiece } from './model';

/** Largest height a ball may drop between two pieces (PLAN-2, section 2.3). */
export const MAX_DROP = 25;
export const VERTICAL_TOLERANCE = 3;
const ALIGN_TOLERANCE = 0.5;

/** Direction the ball travels along a run: from end 0 to end 1, or the reverse. */
export type Flow = 'forward' | 'backward' | null;

export interface End {
  run: Run;
  index: 0 | 1;
  position: Vec3;
  /** Outward horizontal direction; null for a vertical opening. */
  dir: [number, number] | null;
  vertical: 'U' | 'D' | null;
}

/** One path a ball can follow inside a piece, in assembly coordinates, from end 0 to end 1. */
export interface Run {
  piece: PlacedPiece;
  ends: [End, End];
  flow: Flow;
  path: Vec3[];
  /** True when the run is open from above, so a falling ball can land in it. */
  open: boolean;
}

export interface RunGraph {
  runs: Run[];
  ends: End[];
}

function initialFlow(channel: Channel, zFrom: number, zTo: number): Flow {
  const { from, to, section } = channel;
  if (isVertical(from) && isVertical(to)) return verticalKind(from) === 'U' ? 'forward' : 'backward';
  if (isVertical(from) || isVertical(to)) {
    const port = (isVertical(from) ? from : to) as Parameters<typeof verticalKind>[0];
    // A groove runs into the top opening; every other channel leaves it, or falls to the bottom one.
    const towardsVertical = verticalKind(port) === 'D' || section === 'groove';
    return towardsVertical === isVertical(to) ? 'forward' : 'backward';
  }
  if (zFrom === zTo) return null;
  return zFrom > zTo ? 'forward' : 'backward';
}

function worldDirection(piece: PlacedPiece, position: Vec3, local: [number, number]): [number, number] {
  const origin = toWorld(piece, position);
  const moved = toWorld(piece, [position[0] + local[0], position[1] + local[1], position[2]]);
  return [Math.round(moved[0] - origin[0]), Math.round(moved[1] - origin[1])];
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Channel paths run past the surface and not always from end 0: fits one exactly between its ends. */
function fitPath(path: Vec3[], first: Vec3, last: Vec3): Vec3[] {
  const ordered = distance(path[0], first) <= distance(path[0], last) ? [...path] : [...path].reverse();
  ordered[0] = first;
  ordered[ordered.length - 1] = last;
  return ordered.filter((point, i) => i === 0 || distance(point, ordered[i - 1]) > 1e-6);
}

type EndSpec = { position: Vec3; dir: [number, number] | null; vertical: 'U' | 'D' | null };

function makeRun(piece: PlacedPiece, ends: [EndSpec, EndSpec], flow: Flow, path: Vec3[], open: boolean): Run {
  const run = { piece, flow, open } as Run;
  run.ends = ends.map((end, index) => ({
    run,
    index,
    position: toWorld(piece, end.position),
    dir: end.dir ? worldDirection(piece, end.position, end.dir) : null,
    vertical: end.vertical,
  })) as [End, End];
  run.path = fitPath(path.map((p) => toWorld(piece, p)), run.ends[0].position, run.ends[1].position);
  return run;
}

function runsOf(piece: PlacedPiece): Run[] {
  const { body, channels, cavities = [] } = piece.spec;
  const describe = (port: Channel['from']): EndSpec => {
    const position = portPosition(port, body);
    if (isVertical(port)) return { position, dir: null, vertical: verticalKind(port) };
    return { position, dir: FACE_DIR[parseSide(port).face], vertical: null };
  };

  const runs = channels.map((c) => {
    const [a, b] = [describe(c.from), describe(c.to)];
    return makeRun(piece, [a, b], initialFlow(c, a.position[2], b.position[2]), channelPath(c, body), c.section === 'groove' || c.section === 'slot');
  });

  if (cavities.some((c) => c.type === 'spiral')) {
    const path = spiralPath(body);
    const entry: Vec3 = [path[1][0], body.size[1] * CONFIG.cubeSize, path[0][2]];
    const centre = (body.size[0] * CONFIG.cubeSize) / 2;
    const exit: Vec3 = [centre, centre, 0];
    runs.push(
      makeRun(
        piece,
        [
          { position: entry, dir: FACE_DIR.N, vertical: null },
          { position: exit, dir: null, vertical: 'D' },
        ],
        'forward',
        [...path, exit],
        true,
      ),
    );
  }
  return runs;
}

/** Ends of other pieces that face this end across the same joint, at any height. */
export function facing(end: End, ends: End[]): End[] {
  if (!end.dir) return [];
  return ends.filter(
    (other) =>
      other.run.piece !== end.run.piece &&
      other.dir !== null &&
      other.dir[0] === -end.dir![0] &&
      other.dir[1] === -end.dir![1] &&
      Math.abs(other.position[0] - end.position[0]) < ALIGN_TOLERANCE &&
      Math.abs(other.position[1] - end.position[1]) < ALIGN_TOLERANCE,
  );
}

export const isExit = (end: End) => end.run.flow !== null && (end.run.flow === 'forward') === (end.index === 1);
export const isEntry = (end: End) => end.run.flow !== null && !isExit(end);

/** Spreads the known direction of travel into level channels, through their joints. */
function propagateFlow({ runs, ends }: RunGraph) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const run of runs) {
      if (run.flow) continue;
      for (const end of run.ends) {
        const neighbour = facing(end, ends)
          .filter((o) => Math.abs(o.position[2] - end.position[2]) <= MAX_DROP && o.run.flow)
          .sort((a, b) => Math.abs(a.position[2] - end.position[2]) - Math.abs(b.position[2] - end.position[2]))[0];
        if (!neighbour) continue;
        // A neighbour delivering here makes this end the way in; one collecting makes it the way out.
        run.flow = isExit(neighbour) === (end.index === 0) ? 'forward' : 'backward';
        changed = true;
        break;
      }
    }
  }
}

/** Every path of an assembly, with the direction of travel worked out where it can be. */
export function buildRunGraph(assembly: Assembly): RunGraph {
  const runs = assembly.pieces.flatMap(runsOf);
  const graph = { runs, ends: runs.flatMap((run) => run.ends) };
  propagateFlow(graph);
  return graph;
}

/** Where a path passes closest to a point seen from above. */
export function projectOnPath([x, y]: Vec3, path: Vec3[]): { index: number; t: number; distance: number; z: number } {
  let best = { index: 0, t: 0, distance: Infinity, z: path[0][2] };
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
    const distance = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
    if (distance < best.distance) best = { index: i, t, distance, z: a[2] + (b[2] - a[2]) * t };
  }
  return best;
}

/** Height a ball falls from a hole above onto a run, or null if it cannot land there. */
export function landingDrop(point: Vec3, run: Run): number | null {
  if (distanceToPath(point, run.path) < VERTICAL_TOLERANCE) return 0;
  if (!run.open) return null;
  const { distance, z } = projectOnPath(point, run.path);
  const drop = point[2] - z;
  return distance < VERTICAL_TOLERANCE && drop >= 0 && drop <= MAX_DROP ? drop : null;
}

export function distanceToPath(point: Vec3, path: Vec3[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const lengthSquared = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const dot = (point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1] + (point[2] - a[2]) * ab[2];
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, dot / lengthSquared));
    best = Math.min(best, Math.hypot(a[0] + ab[0] * t - point[0], a[1] + ab[1] * t - point[1], a[2] + ab[2] * t - point[2]));
  }
  return best;
}
