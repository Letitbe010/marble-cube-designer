import { describe, expect, it } from 'vitest';
import { PRESETS } from '../geometry/presets';
import {
  addPiece,
  duplicatePiece,
  EMPTY_ASSEMBLY,
  fitsGrid,
  GRID_SIZE,
  History,
  movePiece,
  parseAssembly,
  pieceMatrix,
  removePiece,
  rotatedFootprint,
  rotatePiece,
  serializeAssembly,
  toWorld,
  type Assembly,
  type Rotation,
} from './model';

const long = PRESETS.longGroove3;
const cube = PRESETS.cube;

describe('placement', () => {
  it('leaves an unrotated piece at its cell', () => {
    expect(toWorld({ spec: cube, cell: [2, 3, 4], rotation: 0 }, [0, 0, 0])).toEqual([100, 150, 100]);
  });

  it('swaps the footprint when turned a quarter', () => {
    expect(rotatedFootprint(long, 0)).toEqual([1, 3]);
    expect(rotatedFootprint(long, 90)).toEqual([3, 1]);
  });

  it('keeps a turned long piece inside its rotated footprint', () => {
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const placement = { spec: long, cell: [1, 1, 0] as [number, number, number], rotation };
      const [footX, footY] = rotatedFootprint(long, rotation);
      for (const corner of [[0, 0, 0], [50, 150, 25], [50, 0, 0], [0, 150, 25]] as [number, number, number][]) {
        const [x, y] = toWorld(placement, corner);
        expect(x).toBeGreaterThanOrEqual(50 - 1e-9);
        expect(x).toBeLessThanOrEqual(50 + footX * 50 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(50 - 1e-9);
        expect(y).toBeLessThanOrEqual(50 + footY * 50 + 1e-9);
      }
    }
  });

  it('turns counter-clockwise when seen from above', () => {
    const placed = { spec: cube, cell: [0, 0, 0] as [number, number, number], rotation: 90 as Rotation };
    const [x, y] = toWorld(placed, [50, 25, 0]); // the middle of the east face
    expect([x, y]).toEqual([25, 50]); // has moved to the north
  });

  it('gives the matrix the same result as the point transform', () => {
    const placed = { spec: long, cell: [2, 1, 3] as [number, number, number], rotation: 270 as Rotation };
    const m = pieceMatrix(placed);
    const [x, y, z] = [10, 40, 5];
    expect([m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13], z + m[14]]).toEqual(toWorld(placed, [x, y, z]));
  });
});

describe('editing', () => {
  const one = addPiece(EMPTY_ASSEMBLY, cube, [1, 1, 0], 0);
  const id = one.pieces[0].id;

  it('adds pieces with distinct identifiers', () => {
    const two = addPiece(one, cube, [2, 1, 0], 0);
    expect(new Set(two.pieces.map((p) => p.id)).size).toBe(2);
  });

  it('rejects pieces outside the grid', () => {
    expect(addPiece(EMPTY_ASSEMBLY, long, [0, GRID_SIZE - 1, 0], 0)).toBe(EMPTY_ASSEMBLY);
    expect(fitsGrid({ spec: long, cell: [0, GRID_SIZE - 1, 0], rotation: 90 })).toBe(true);
  });

  it('moves and rejects moves off the grid', () => {
    expect(movePiece(one, id, [1, 0, 2]).pieces[0].cell).toEqual([2, 1, 2]);
    expect(movePiece(one, id, [-5, 0, 0])).toBe(one);
  });

  it('cycles through the four rotations', () => {
    let current = one;
    const seen = [];
    for (let i = 0; i < 4; i++) {
      current = rotatePiece(current, id);
      seen.push(current.pieces[0].rotation);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it('refuses a rotation that would leave the grid', () => {
    const edge = addPiece(EMPTY_ASSEMBLY, long, [GRID_SIZE - 1, 0, 0], 0);
    expect(rotatePiece(edge, edge.pieces[0].id)).toBe(edge);
  });

  it('duplicates next to the original', () => {
    const { assembly, copyId } = duplicatePiece(one, id);
    expect(assembly.pieces.find((p) => p.id === copyId)?.cell).toEqual([2, 1, 0]);
  });

  it('removes pieces', () => {
    expect(removePiece(one, id).pieces).toEqual([]);
  });
});

describe('files', () => {
  const assembly: Assembly = addPiece(addPiece(EMPTY_ASSEMBLY, long, [3, 2, 0], 90), PRESETS.funnelTunnel, [4, 6, 2], 180);

  it('restores rotated pieces from JSON', () => {
    const restored = parseAssembly(serializeAssembly(assembly));
    expect(restored.pieces.map((p) => [p.cell, p.rotation])).toEqual([[[3, 2, 0], 90], [[4, 6, 2], 180]]);
    expect(restored.pieces[1].spec).toEqual(assembly.pieces[1].spec);
  });

  it('rejects data that is not an assembly', () => {
    expect(() => parseAssembly('{"foo":1}')).toThrow();
    expect(() => parseAssembly('not json')).toThrow();
    expect(() => parseAssembly('{"pieces":[{"id":"p1","cell":[0,0],"rotation":0}]}')).toThrow();
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    const history = new History(1);
    history.push(2);
    history.push(3);
    history.undo();
    expect(history.value).toBe(2);
    history.redo();
    expect(history.value).toBe(3);
  });

  it('forgets the redo branch after a new edit', () => {
    const history = new History(1);
    history.push(2);
    history.undo();
    history.push(9);
    expect(history.canRedo).toBe(false);
    expect(history.value).toBe(9);
  });

  it('ignores edits that change nothing', () => {
    const history = new History(1);
    history.push(1);
    expect(history.canUndo).toBe(false);
  });
});
