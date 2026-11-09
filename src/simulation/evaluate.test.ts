import { describe, expect, it } from 'vitest';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell } from '../assembly/model';
import type { PieceSpec } from '../geometry/ports';
import { CONFIG } from '../geometry/config';
import { PRESETS } from '../geometry/presets';
import { evaluateAssembly, positionAt } from './evaluate';
import { simulateAssembly } from './marble';

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

describe('marbles meeting', () => {
  // Two equal ramps feed the same crossing from the north and from the east.
  const meeting = addPiece(
    addPiece(addPiece(EMPTY_ASSEMBLY, PRESETS.crossTop, [3, 3, 0], 0), PRESETS.rampStraight, [3, 4, 1], 0),
    PRESETS.rampStraight,
    [4, 3, 1],
    270,
  );

  it('marks an encounter when marbles reach a crossing together', () => {
    const results = simulateAssembly(meeting);
    expect(results.map((r) => r.outcome)).toEqual(['collision', 'collision']);
  });

  it('says where and when marbles met', () => {
    const { problems } = evaluateAssembly(meeting);
    const encounter = problems.find((p) => p.outcome === 'collision')!;
    expect(encounter.time).toBeGreaterThan(0);
    expect(encounter.crrs).toHaveLength(3); // both marbles of each case count once
    expect(Math.hypot(encounter.position[0] - 175, encounter.position[1] - 175)).toBeLessThan(CONFIG.ballDiameter);
  });

  it('counts an encounter against the verdict', () => {
    expect(evaluateAssembly(meeting).verdict).toBe('problem');
  });

  it('ends both journeys at the encounter', () => {
    const [a, b] = simulateAssembly(meeting);
    expect(a.time).toBe(b.time);
    expect(a.samples[a.samples.length - 1].time).toBe(a.time);
  });

  it('finds no encounter when the marbles arrive at different times', () => {
    const offset = addPiece(
      addPiece(EMPTY_ASSEMBLY, PRESETS.crossTop, [3, 3, 0], 0),
      PRESETS.rampStraight,
      [3, 4, 1],
      0,
    );
    const withLongerRoute = addPiece(addPiece(offset, PRESETS.rampStraight, [4, 3, 1], 270), PRESETS.rampStraight, [5, 3, 2], 270);
    expect(simulateAssembly(withLongerRoute).some((r) => r.outcome === 'collision')).toBe(false);
  });

  describe('on a single channel', () => {
    const line = addPiece(addPiece(EMPTY_ASSEMBLY, PRESETS.rampStraight, [1, 3, 1], 0), PRESETS.stop, [1, 2, 0], 0);

    it('releases one marble by default', () => {
      expect(simulateAssembly(line)).toHaveLength(1);
    });

    it('releases a second marble after the chosen delay', () => {
      const results = simulateAssembly(line, { marbleCount: 2, followDelay: 1 });
      expect(results).toHaveLength(2);
      expect(results[1].samples[0].time).toBe(1);
      expect(results[1].time).toBeCloseTo(results[0].time + 1, 6);
    });

    it('leaves separated marbles alone', () => {
      expect(simulateAssembly(line, { marbleCount: 2, followDelay: 1 }).map((r) => r.outcome)).toEqual(['finished', 'finished']);
    });

    it('marks marbles released too close together', () => {
      const results = simulateAssembly(line, { marbleCount: 2, followDelay: 0.01 });
      expect(results.map((r) => r.outcome)).toEqual(['collision', 'collision']);
    });
  });

  it('does not add a follower when there are already several starts', () => {
    const two = addPiece(addPiece(EMPTY_ASSEMBLY, PRESETS.rampStraight, [1, 3, 0], 0), PRESETS.rampStraight, [5, 3, 0], 0);
    expect(simulateAssembly(two, { marbleCount: 2 })).toHaveLength(2);
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
