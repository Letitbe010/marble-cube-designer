import { isSpiral, type Face, type PieceSpec, type Port } from '../geometry/ports';
import { isVertical, parseSide } from '../geometry/ports';
import { pieceId, specKey } from '../geometry/print';
import type { Assembly } from './model';

export interface PieceGroup {
  id: string;
  spec: PieceSpec;
  count: number;
}

const QUARTER_TURN: Record<Face, Face> = { E: 'N', N: 'W', W: 'S', S: 'E' };

function turnPort(port: Port): Port {
  if (isVertical(port)) return port;
  const { face, level } = parseSide(port);
  return `${QUARTER_TURN[face]}.${level}.0`;
}

/** The same piece, turned a quarter counter-clockwise. Only valid for square footprints. */
function quarterTurn(spec: PieceSpec): PieceSpec {
  const width = spec.body.size[0];
  return {
    ...spec,
    channels: spec.channels.map((c) => ({ ...c, from: turnPort(c.from), to: turnPort(c.to) })),
    cavities: spec.cavities?.map((c) => ({ ...c, cell: [width - 1 - c.cell[1], c.cell[0]] })),
  };
}

/** The same piece, turned half a circle. Valid for any footprint. */
function halfTurn(spec: PieceSpec): PieceSpec {
  const [width, length] = spec.body.size;
  return {
    ...spec,
    channels: spec.channels.map((c) => ({ ...c, from: turnPort(turnPort(c.from)), to: turnPort(turnPort(c.to)) })),
    cavities: spec.cavities?.map((c) => ({ ...c, cell: [width - 1 - c.cell[0], length - 1 - c.cell[1]] })),
  };
}

function orientations(spec: PieceSpec): PieceSpec[] {
  // A spiral's entry is fixed to its plate, so turning its description would not describe the same solid.
  if (spec.cavities?.some((c) => isSpiral(c.type))) return [spec];
  const [width, length] = spec.body.size;
  if (width !== length) return [spec, halfTurn(spec)];
  const turned = [spec];
  for (let i = 0; i < 3; i++) turned.push(quarterTurn(turned[i]));
  return turned;
}

/** A piece's description in the orientation shared by all of its rotations. */
export function canonicalSpec(spec: PieceSpec): PieceSpec {
  return orientations(spec).sort((a, b) => (specKey(a) < specKey(b) ? -1 : 1))[0];
}

/** How many of each distinct piece an assembly needs. */
export function pieceList(assembly: Assembly): PieceGroup[] {
  const groups = new Map<string, PieceGroup>();
  for (const piece of assembly.pieces) {
    const spec = canonicalSpec(piece.spec);
    const key = specKey(spec);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { id: pieceId(spec), spec, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}
