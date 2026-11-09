import { CONFIG } from '../geometry/config';
import type { PieceSpec, Vec3 } from '../geometry/ports';
import { parseSpec } from '../geometry/specIo';

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];
/** Grid position: X and Y in 50 mm cells, Z in 25 mm steps. */
export type Cell = [number, number, number];

export interface PlacedPiece {
  id: string;
  spec: PieceSpec;
  cell: Cell;
  rotation: Rotation;
}

export interface Assembly {
  name: string;
  pieces: PlacedPiece[];
}

export const GRID_SIZE = 20;
export const Z_STEP = 25;
export const EMPTY_ASSEMBLY: Assembly = { name: 'assembly', pieces: [] };

const COS: Record<Rotation, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<Rotation, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

/** Footprint in cells once rotated. */
export function rotatedFootprint(spec: PieceSpec, rotation: Rotation): [number, number] {
  const [x, y] = spec.body.size;
  return rotation === 90 || rotation === 270 ? [y, x] : [x, y];
}

/** Height of a piece in Z steps. */
export const heightSteps = (spec: PieceSpec) => (spec.body.size[2] * CONFIG.cubeSize) / Z_STEP;

type Placement = Pick<PlacedPiece, 'spec' | 'cell' | 'rotation'>;

/** Position of a piece's local point in the assembly; rotation turns it around its own centre. */
export function toWorld({ spec, cell, rotation }: Placement, [x, y, z]: Vec3): Vec3 {
  const unit = CONFIG.cubeSize;
  const [footX, footY] = rotatedFootprint(spec, rotation);
  const [pivotX, pivotY] = [(spec.body.size[0] * unit) / 2, (spec.body.size[1] * unit) / 2];
  const [dx, dy] = [x - pivotX, y - pivotY];
  return [
    cell[0] * unit + (footX * unit) / 2 + COS[rotation] * dx - SIN[rotation] * dy,
    cell[1] * unit + (footY * unit) / 2 + SIN[rotation] * dx + COS[rotation] * dy,
    cell[2] * Z_STEP + z,
  ];
}

/** Column-major 4x4 matrix equivalent to `toWorld`. */
export function pieceMatrix(placement: Placement): number[] {
  const { rotation } = placement;
  const [tx, ty, tz] = toWorld(placement, [0, 0, 0]);
  return [COS[rotation], SIN[rotation], 0, 0, -SIN[rotation], COS[rotation], 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

/** Whether a piece lies inside the assembly grid. */
export function fitsGrid({ spec, cell, rotation }: Placement): boolean {
  const [footX, footY] = rotatedFootprint(spec, rotation);
  return cell[0] >= 0 && cell[1] >= 0 && cell[2] >= 0 && cell[0] + footX <= GRID_SIZE && cell[1] + footY <= GRID_SIZE;
}

function nextId(assembly: Assembly): string {
  const used = assembly.pieces.map((p) => Number(p.id.slice(1))).filter(Number.isFinite);
  return `p${Math.max(0, ...used) + 1}`;
}

const replace = (assembly: Assembly, id: string, change: (piece: PlacedPiece) => PlacedPiece): Assembly => ({
  ...assembly,
  pieces: assembly.pieces.map((p) => (p.id === id ? change(p) : p)),
});

/** Each edit returns the same assembly when the result would leave the grid. */
export function addPiece(assembly: Assembly, spec: PieceSpec, cell: Cell, rotation: Rotation): Assembly {
  const piece: PlacedPiece = { id: nextId(assembly), spec, cell, rotation };
  return fitsGrid(piece) ? { ...assembly, pieces: [...assembly.pieces, piece] } : assembly;
}

export function removePiece(assembly: Assembly, id: string): Assembly {
  return { ...assembly, pieces: assembly.pieces.filter((p) => p.id !== id) };
}

export function movePiece(assembly: Assembly, id: string, [dx, dy, dz]: Cell): Assembly {
  const piece = assembly.pieces.find((p) => p.id === id);
  if (!piece) return assembly;
  const cell: Cell = [piece.cell[0] + dx, piece.cell[1] + dy, piece.cell[2] + dz];
  return fitsGrid({ ...piece, cell }) ? replace(assembly, id, (p) => ({ ...p, cell })) : assembly;
}

export function rotatePiece(assembly: Assembly, id: string): Assembly {
  const piece = assembly.pieces.find((p) => p.id === id);
  if (!piece) return assembly;
  const rotation = ROTATIONS[(ROTATIONS.indexOf(piece.rotation) + 1) % ROTATIONS.length];
  return fitsGrid({ ...piece, rotation }) ? replace(assembly, id, (p) => ({ ...p, rotation })) : assembly;
}

/** Copies a piece next to itself along X, or along Y when X is out of room. */
export function duplicatePiece(assembly: Assembly, id: string): { assembly: Assembly; copyId: string | null } {
  const piece = assembly.pieces.find((p) => p.id === id);
  if (!piece) return { assembly, copyId: null };
  const [footX, footY] = rotatedFootprint(piece.spec, piece.rotation);
  const copyId = nextId(assembly);
  const targets: Cell[] = [
    [piece.cell[0] + footX, piece.cell[1], piece.cell[2]],
    [piece.cell[0], piece.cell[1] + footY, piece.cell[2]],
  ];
  const cell = targets.find((c) => fitsGrid({ ...piece, cell: c }));
  if (!cell) return { assembly, copyId: null };
  return { assembly: { ...assembly, pieces: [...assembly.pieces, { ...piece, id: copyId, cell }] }, copyId };
}

export function serializeAssembly(assembly: Assembly): string {
  return JSON.stringify({ version: 1, ...assembly }, null, 2);
}

const isCell = (c: unknown): c is Cell => Array.isArray(c) && c.length === 3 && c.every(Number.isInteger);

/** Reads an assembly, throwing if the data is not one. */
export function parseAssembly(text: string): Assembly {
  const data = JSON.parse(text);
  if (!Array.isArray(data.pieces)) throw new Error('Not an assembly');
  const pieces: PlacedPiece[] = data.pieces.map((raw: PlacedPiece) => {
    if (!isCell(raw.cell) || !ROTATIONS.includes(raw.rotation) || typeof raw.id !== 'string') throw new Error('Bad piece');
    const piece = { id: raw.id, spec: parseSpec({ spec: raw.spec }), cell: raw.cell, rotation: raw.rotation };
    if (!fitsGrid(piece)) throw new Error('Piece outside the grid');
    return piece;
  });
  return { name: typeof data.name === 'string' ? data.name : EMPTY_ASSEMBLY.name, pieces };
}

const HISTORY_LIMIT = 100;

/** Undo and redo over immutable values. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(public value: T) {}

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  push(next: T) {
    if (next === this.value) return;
    this.past = [...this.past, this.value].slice(-HISTORY_LIMIT);
    this.value = next;
    this.future = [];
  }

  undo() {
    const previous = this.past.pop();
    if (previous === undefined) return;
    this.future.push(this.value);
    this.value = previous;
  }

  redo() {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.value);
    this.value = next;
  }
}
