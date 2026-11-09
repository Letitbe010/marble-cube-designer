import { describe, expect, it } from 'vitest';
import { boxPiece, channel, type PieceSpec } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { checkAssembly, type CheckCode } from './checks';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell, type Rotation } from './model';
import { canonicalSpec, pieceList } from './pieceList';

type Placement = [PieceSpec, Cell, Rotation?];

const build = (...placements: Placement[]): Assembly =>
  placements.reduce((assembly, [spec, cell, rotation = 0]) => addPiece(assembly, spec, cell, rotation), EMPTY_ASSEMBLY);

const codes = (assembly: Assembly): CheckCode[] => checkAssembly(assembly).map((i) => i.code);

describe('assembly checks', () => {
  it('finds nothing wrong with a blank block', () => {
    expect(codes(build([PRESETS.cube, [1, 1, 0]]))).toEqual([]);
  });

  it('reports two pieces in the same cell once', () => {
    expect(codes(build([PRESETS.cube, [1, 1, 0]], [PRESETS.halfBlock, [1, 1, 1]]))).toEqual(['overlap']);
  });

  it('reports a long piece overlapping through its footprint', () => {
    expect(codes(build([PRESETS.longBlock3, [1, 1, 0]], [PRESETS.cube, [1, 3, 0]]))).toEqual(['overlap']);
  });

  it('reports a piece floating in the air', () => {
    expect(codes(build([PRESETS.cube, [1, 1, 2]]))).toEqual(['unsupported']);
  });

  it('accepts a piece stacked on another', () => {
    expect(codes(build([PRESETS.cube, [1, 1, 0]], [PRESETS.cube, [1, 1, 2]]))).toEqual([]);
  });

  it('accepts a long piece resting on only one of its cells', () => {
    expect(codes(build([PRESETS.cube, [1, 1, 0]], [PRESETS.longBlock3, [1, 1, 2]]))).toEqual([]);
  });

  it('warns when a ramp ends in the open', () => {
    expect(codes(build([PRESETS.rampStraight, [1, 1, 0]]))).toEqual(['openExit']);
  });

  it('reports a ramp ending against a solid block', () => {
    expect(codes(build([PRESETS.rampStraight, [1, 1, 0]], [PRESETS.cube, [1, 0, 0]]))).toEqual(['blockedExit']);
  });

  it('accepts a ramp feeding a lower groove', () => {
    const issues = codes(build([PRESETS.rampStraight, [1, 2, 0]], [PRESETS.halfGroove, [1, 1, 0]]));
    expect(issues).toEqual(['openExit']); // only the far end of the low groove stays open
  });

  it('reports a ramp arriving below the next entry', () => {
    const issues = codes(build([PRESETS.rampStraight, [1, 2, 0]], [PRESETS.straightTop, [1, 1, 0]]));
    expect(issues).toContain('levelMismatch');
  });

  it('reports a drop larger than the limit', () => {
    const high = build(
      [PRESETS.cube, [1, 2, 0]],
      [PRESETS.cube, [1, 2, 2]],
      [PRESETS.rampStraight, [1, 2, 4]],
      [PRESETS.halfGroove, [1, 1, 0]],
    );
    expect(codes(high)).toContain('levelMismatch');
  });

  it('reports two ramps running into each other', () => {
    const facing = build([PRESETS.rampStraight, [1, 2, 0]], [PRESETS.rampStraight, [1, 1, 0], 180]);
    expect(codes(facing)).toContain('levelMismatch');
  });

  it('accepts a drop into a groove below', () => {
    const issues = codes(build([PRESETS.funnelDrop, [1, 1, 2]], [PRESETS.straightTop, [1, 1, 0]]));
    expect(issues).toEqual([]);
  });

  it('warns about a drop with nothing below', () => {
    expect(codes(build([PRESETS.funnelDrop, [1, 1, 0]]))).toEqual(['openExit']);
  });

  it('reports a drop blocked by a blank block', () => {
    expect(codes(build([PRESETS.funnelDrop, [1, 1, 2]], [PRESETS.cube, [1, 1, 0]]))).toEqual(['blockedExit']);
  });

  it('gives the same result when the whole layout is turned', () => {
    const straight = build([PRESETS.rampStraight, [1, 2, 0]], [PRESETS.halfGroove, [1, 1, 0]]);
    const turned = build([PRESETS.rampStraight, [2, 1, 0], 90], [PRESETS.halfGroove, [3, 1, 0], 90]);
    expect(codes(turned)).toEqual(codes(straight));
  });

  it('carries the direction of travel along level channels', () => {
    const chain = build(
      [PRESETS.rampStraight, [1, 3, 0]],
      [PRESETS.halfGroove, [1, 2, 0]],
      [PRESETS.halfGroove, [1, 1, 0]],
      [PRESETS.cube, [1, 0, 0]],
    );
    expect(codes(chain)).toEqual(['blockedExit']);
  });

  it('connects a ramp into the spiral entry', () => {
    // The ramp stands on a low block so that it ends just above the spiral's entry.
    const issues = checkAssembly(build([PRESETS.spiral, [1, 1, 0]], [PRESETS.halfBlock, [2, 3, 0]], [PRESETS.rampLow, [2, 3, 1]]));
    expect(issues.map((i) => [i.code, i.pieceIds])).toEqual([['openExit', ['p1']]]); // only the hole below the spiral
  });

  it('points each problem at the pieces involved', () => {
    const [problem] = checkAssembly(build([PRESETS.rampStraight, [1, 1, 0]], [PRESETS.cube, [1, 0, 0]]));
    expect(problem.pieceIds).toEqual(['p1', 'p2']);
    expect(problem.at).toEqual([75, 50, 25]);
  });
});

describe('piece list', () => {
  const eastWest = boxPiece([channel('E.T.0', 'W.T.0')]);

  it('groups identical pieces', () => {
    const list = pieceList(build([PRESETS.cube, [0, 0, 0]], [PRESETS.cube, [2, 0, 0]], [PRESETS.halfBlock, [4, 0, 0]]));
    expect(list.map((g) => g.count).sort()).toEqual([1, 2]);
  });

  it('counts placements in different rotations as one piece', () => {
    const list = pieceList(build([PRESETS.curveTop, [0, 0, 0], 0], [PRESETS.curveTop, [2, 0, 0], 90], [PRESETS.curveTop, [4, 0, 0], 270]));
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(3);
  });

  it('counts a piece designed in another orientation as the same piece', () => {
    const list = pieceList(build([PRESETS.straightTop, [0, 0, 0]], [eastWest, [2, 0, 0]]));
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
  });

  it('keeps mirror-image pieces apart', () => {
    const left = boxPiece([channel('N.T.0', 'E.M.0')]);
    const right = boxPiece([channel('N.T.0', 'W.M.0')]);
    expect(pieceList(build([left, [0, 0, 0]], [right, [2, 0, 0]]))).toHaveLength(2);
  });

  it('keeps different sizes apart', () => {
    expect(pieceList(build([PRESETS.straightTop, [0, 0, 0]], [PRESETS.halfGroove, [2, 0, 0]]))).toHaveLength(2);
  });

  it('turns a long piece only by half circles', () => {
    expect(canonicalSpec(PRESETS.longGroove3).body.size).toEqual([1, 3, 0.5]);
    const reversed = boxPiece([channel('S.T.0', 'N.M.0', PRESETS.rampLong3.body)], [1, 3, 0.5]);
    expect(pieceList(build([PRESETS.rampLong3, [0, 0, 0]], [reversed, [2, 0, 0]]))).toHaveLength(1);
  });
});
