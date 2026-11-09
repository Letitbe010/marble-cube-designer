import { boreRadius, CONFIG } from '../geometry/config';
import type { Vec3 } from '../geometry/ports';
import { heightSteps, rotatedFootprint, Z_STEP, type Assembly, type PlacedPiece } from './model';
import { buildRunGraph, facing, isEntry, isExit, isIdleHole, landingDrop, MAX_DROP } from './runs';

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

  const graph = buildRunGraph(assembly);
  const { runs, ends } = graph;
  const unit = CONFIG.cubeSize;
  const occupantAt = (x: number, y: number, z: number) => occupant.get(cellKey(Math.floor(x / unit), Math.floor(y / unit), Math.floor(z / Z_STEP)));

  for (const run of runs) {
    if (!run.flow || isIdleHole(run, graph)) continue;
    const exit = run.ends[run.flow === 'forward' ? 1 : 0];
    const { piece } = run;
    const [x, y, z] = exit.position;

    if (exit.vertical === 'U') continue;

    if (exit.vertical === 'D') {
      const below = runs.some((other) => other.piece !== piece && landingDrop([x, y, z], other) !== null);
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
