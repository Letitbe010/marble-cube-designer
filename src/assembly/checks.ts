import { spiralPath } from '../geometry/cavities';
import { boreRadius, CONFIG } from '../geometry/config';
import { channelPath } from '../geometry/paths';
import { FACE_DIR, isVertical, parseSide, portPosition, verticalKind, type Channel, type Vec3 } from '../geometry/ports';
import { heightSteps, rotatedFootprint, toWorld, Z_STEP, type Assembly, type PlacedPiece } from './model';

export type CheckCode = 'overlap' | 'unsupported' | 'openExit' | 'blockedExit' | 'levelMismatch';

export interface CheckIssue {
  code: CheckCode;
  level: 'error' | 'warning';
  pieceIds: string[];
  /** World position of the problem, when it has one. */
  at?: Vec3;
}

const LEVELS: Record<CheckCode, CheckIssue['level']> = {
  overlap: 'error',
  unsupported: 'error',
  blockedExit: 'error',
  levelMismatch: 'error',
  openExit: 'warning',
};

const issue = (code: CheckCode, pieceIds: string[], at?: Vec3): CheckIssue => ({ code, level: LEVELS[code], pieceIds, at });

/** Largest height a ball may drop between two pieces (PLAN-2, section 2.3). */
const MAX_DROP = 25;
const ALIGN_TOLERANCE = 0.5;
const VERTICAL_TOLERANCE = 3;

/** Direction the ball travels along a run: from end 0 to end 1, or the reverse. */
type Flow = 'forward' | 'backward' | null;

interface End {
  run: Run;
  index: 0 | 1;
  position: Vec3;
  /** Outward horizontal direction; null for a vertical opening. */
  dir: [number, number] | null;
  vertical: 'U' | 'D' | null;
}

/** One path a ball can follow inside a piece. */
interface Run {
  piece: PlacedPiece;
  ends: [End, End];
  flow: Flow;
  path: Vec3[];
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

function pieceCells(piece: PlacedPiece): [number, number, number][] {
  const [footX, footY] = rotatedFootprint(piece.spec, piece.rotation);
  const cells: [number, number, number][] = [];
  for (let z = 0; z < heightSteps(piece.spec); z++) {
    for (let y = 0; y < footY; y++) {
      for (let x = 0; x < footX; x++) cells.push([piece.cell[0] + x, piece.cell[1] + y, piece.cell[2] + z]);
    }
  }
  return cells;
}

function initialFlow(channel: Channel, zFrom: number, zTo: number): Flow {
  const { from, to, section } = channel;
  if (isVertical(from) && isVertical(to)) return verticalKind(from) === 'U' ? 'forward' : 'backward';
  if (isVertical(from) || isVertical(to)) {
    const port = isVertical(from) ? from : (to as typeof from);
    // A groove runs into the top opening; every other channel leaves it, or falls to the bottom one.
    const towardsVertical = verticalKind(port as Parameters<typeof verticalKind>[0]) === 'D' || section === 'groove';
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

function makeRun(piece: PlacedPiece, ends: { position: Vec3; dir: [number, number] | null; vertical: 'U' | 'D' | null }[], flow: Flow, path: Vec3[]): Run {
  const run = { piece, flow, path: path.map((p) => toWorld(piece, p)) } as Run;
  run.ends = ends.map((end, index) => ({
    run,
    index,
    position: toWorld(piece, end.position),
    dir: end.dir ? worldDirection(piece, end.position, end.dir) : null,
    vertical: end.vertical,
  })) as [End, End];
  return run;
}

function runsOf(piece: PlacedPiece): Run[] {
  const { body, channels, cavities = [] } = piece.spec;
  const describe = (port: Channel['from']) => {
    const position = portPosition(port, body);
    if (isVertical(port)) return { position, dir: null, vertical: verticalKind(port) };
    return { position, dir: FACE_DIR[parseSide(port).face], vertical: null };
  };

  const runs = channels.map((c) => {
    const [a, b] = [describe(c.from), describe(c.to)];
    return makeRun(piece, [a, b], initialFlow(c, a.position[2], b.position[2]), channelPath(c, body));
  });

  if (cavities.some((c) => c.type === 'spiral')) {
    const path = spiralPath(body);
    const entry: Vec3 = [path[1][0], body.size[1] * CONFIG.cubeSize, path[0][2]];
    const centre = (body.size[0] * CONFIG.cubeSize) / 2;
    runs.push(
      makeRun(
        piece,
        [
          { position: entry, dir: FACE_DIR.N, vertical: null },
          { position: [centre, centre, 0], dir: null, vertical: 'D' },
        ],
        'forward',
        path,
      ),
    );
  }
  return runs;
}

/** Ends of other pieces that face this end across the same joint, at any height. */
function facing(end: End, ends: End[]): End[] {
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

const isExit = (end: End) => end.run.flow !== null && (end.run.flow === 'forward') === (end.index === 1);
const isEntry = (end: End) => end.run.flow !== null && !isExit(end);

/** Spreads the known direction of travel into level channels, through their joints. */
function propagateFlow(runs: Run[], ends: End[]) {
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

function distanceToPath(point: Vec3, path: Vec3[]): number {
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

/** Finds problems with how the pieces of an assembly sit and connect. */
export function checkAssembly(assembly: Assembly): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const occupant = new Map<string, PlacedPiece>();
  const reported = new Set<string>();

  for (const piece of assembly.pieces) {
    for (const [x, y, z] of pieceCells(piece)) {
      const key = cellKey(x, y, z);
      const other = occupant.get(key);
      if (other && other !== piece) {
        const pair = `${other.id}|${piece.id}`;
        if (!reported.has(pair)) {
          reported.add(pair);
          issues.push(issue('overlap', [other.id, piece.id]));
        }
      } else occupant.set(key, piece);
    }
  }

  for (const piece of assembly.pieces) {
    if (piece.cell[2] === 0) continue;
    const [footX, footY] = rotatedFootprint(piece.spec, piece.rotation);
    let supported = false;
    for (let y = 0; y < footY && !supported; y++) {
      for (let x = 0; x < footX && !supported; x++) {
        supported = occupant.has(cellKey(piece.cell[0] + x, piece.cell[1] + y, piece.cell[2] - 1));
      }
    }
    if (!supported) issues.push(issue('unsupported', [piece.id]));
  }

  const runs = assembly.pieces.flatMap(runsOf);
  const ends = runs.flatMap((run) => run.ends);
  propagateFlow(runs, ends);

  const unit = CONFIG.cubeSize;
  const occupantAt = (x: number, y: number, z: number) => occupant.get(cellKey(Math.floor(x / unit), Math.floor(y / unit), Math.floor(z / Z_STEP)));

  for (const run of runs) {
    if (!run.flow) continue;
    const exit = run.ends[run.flow === 'forward' ? 1 : 0];
    const { piece } = run;
    const [x, y, z] = exit.position;

    if (exit.vertical === 'U') continue;

    if (exit.vertical === 'D') {
      const below = runs.some((other) => other.piece !== piece && distanceToPath([x, y, z], other.path) < VERTICAL_TOLERANCE);
      if (below) continue;
      const blocked = z > 0 && occupantAt(x, y, z - 1) !== undefined;
      issues.push(issue(blocked ? 'blockedExit' : 'openExit', [piece.id], exit.position));
      continue;
    }

    const candidates = facing(exit, ends);
    if (candidates.length === 0) {
      const [dx, dy] = exit.dir!;
      const across = occupantAt(x + dx * 1, y + dy * 1, z - boreRadius());
      if (across && across !== piece) issues.push(issue('blockedExit', [piece.id, across.id], exit.position));
      else issues.push(issue('openExit', [piece.id], exit.position));
      continue;
    }

    const connects = candidates.some((other) => {
      const drop = z - other.position[2];
      return !isExit(other) && drop >= 0 && drop <= MAX_DROP && (isEntry(other) || other.run.flow === null);
    });
    if (!connects) issues.push(issue('levelMismatch', [piece.id, ...new Set(candidates.map((c) => c.run.piece.id))], exit.position));
  }

  return issues;
}
