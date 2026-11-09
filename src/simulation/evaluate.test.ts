import { describe, expect, it } from 'vitest';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell } from '../assembly/model';
import type { PieceSpec } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { evaluateAssembly, positionAt } from './evaluate';

const build = (...placements: [PieceSpec, Cell][]): Assembly =>
  placements.reduce((assembly, [spec, cell]) => addPiece(assembly, spec, cell, 0), EMPTY_ASSEMBLY);

/** A ramp, three level cubes and a stop. */
const track = build(
  [PRESETS.rampStraight, [1, 8, 1]],
  [PRESETS.straightTop, [1, 7, 0]],
  [PRESETS.straightTop, [1, 6, 0]],
  [PRESETS.straightTop, [1, 5, 0]],
  [PRESETS.stop, [1, 4, 0]],
);

describe('evaluation', () => {
  it('tries three levels of rolling resistance around the chosen one', () => {
    const { marbles } = evaluateAssembly(track, { crr: 0.02 });
    expect(marbles[0].cases.map((c) => c.crr)).toEqual([0.01, 0.02, 0.05]);
  });

  it('can show all three verdicts on one track, depending on the parameters', () => {
    const verdicts = new Set([0.005, 0.02, 0.08, 0.12, 0.2, 0.5, 1].map((crr) => evaluateAssembly(track, { crr }).verdict));
    expect(verdicts).toEqual(new Set(['good', 'marginal', 'problem']));
  });

  it('calls a track good when every case arrives', () => {
    expect(evaluateAssembly(track, { crr: 0.005 }).verdict).toBe('good');
  });

  it('reports no problems on a good track', () => {
    expect(evaluateAssembly(track, { crr: 0.005 }).problems).toEqual([]);
  });

  it('calls a track a problem when no case arrives, and says why', () => {
    const open = build([PRESETS.rampStraight, [1, 3, 0]]);
    const { verdict, problems } = evaluateAssembly(open);
    expect(verdict).toBe('problem');
    expect(problems).toHaveLength(1);
    expect(problems[0].outcome).toBe('noConnection');
    expect(problems[0].pieceId).toBe('p1');
    expect(problems[0].crrs).toHaveLength(3);
  });

  it('points at where the problem happened', () => {
    const open = build([PRESETS.rampStraight, [1, 3, 0]]);
    expect(evaluateAssembly(open).problems[0].position).toEqual([75, 150, 25]);
  });

  it('has no verdict without a place to start', () => {
    const flat = evaluateAssembly(build([PRESETS.cube, [1, 1, 0]]));
    expect(flat.verdict).toBeNull();
    expect(flat.marbles).toEqual([]);
  });

  it('rates several marbles together', () => {
    const mixed = build(
      [PRESETS.rampStraight, [1, 8, 1]],
      [PRESETS.stop, [1, 7, 0]],
      [PRESETS.rampStraight, [6, 3, 0]],
    );
    const { marbles, verdict } = evaluateAssembly(mixed);
    expect(marbles.map((m) => m.verdict).sort()).toEqual(['good', 'problem']);
    expect(verdict).toBe('marginal');
  });
});

describe('playback', () => {
  const samples = [
    { time: 0, position: [0, 0, 0] as [number, number, number], speed: 0 },
    { time: 1, position: [10, 0, 0] as [number, number, number], speed: 1 },
    { time: 2, position: [10, 20, 0] as [number, number, number], speed: 1 },
  ];

  it('interpolates between samples', () => {
    expect(positionAt(samples, 0.5)).toEqual([5, 0, 0]);
    expect(positionAt(samples, 1.5)).toEqual([10, 10, 0]);
  });

  it('holds the first and last positions outside the journey', () => {
    expect(positionAt(samples, -1)).toEqual([0, 0, 0]);
    expect(positionAt(samples, 9)).toEqual([10, 20, 0]);
  });
});
