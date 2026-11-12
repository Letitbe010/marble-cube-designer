import { describe, expect, it } from 'vitest';
import { checkAssembly } from '../assembly/checks';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell, type Rotation } from '../assembly/model';
import { pieceList } from '../assembly/pieceList';
import type { PieceSpec } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { simulateAssembly } from './marble';

type Placement = [PieceSpec, Cell, Rotation?];
const build = (...placements: Placement[]): Assembly =>
  placements.reduce((assembly, [spec, cell, rotation = 0]) => addPiece(assembly, spec, cell, rotation), EMPTY_ASSEMBLY);

/** A start block and a staircase of ramps heading south, ending at the middle level of the given step. */
function feed(ramps: number, endStep: number, y: number): Placement[] {
  const pieces: Placement[] = [[PRESETS.start, [1, y, endStep + ramps]]];
  for (let i = 1; i <= ramps; i++) pieces.push([PRESETS.rampStraight, [1, y - i, endStep + ramps - i]]);
  return pieces;
}

describe('vertical loop', () => {
  it('takes a marble that comes in fast enough right round and out', () => {
    const track = build(...feed(4, 2, 10), [PRESETS.loop, [1, 3, 2]], [PRESETS.stop, [1, 2, 1]]);
    expect(checkAssembly(track).filter((issue) => issue.code !== 'unsupported')).toEqual([]);
    const [result] = simulateAssembly(track);
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    // It went over the top, 60 mm above the way in at 75 mm.
    const inLoop = result.samples.filter((s) => s.position[1] > 150 && s.position[1] < 300);
    expect(Math.max(...inLoop.map((s) => s.position[2]))).toBeGreaterThan(130);
  });

  it('stops a marble that comes in too slowly to reach the top', () => {
    const track = build(...feed(0, 0, 5), [PRESETS.loop, [1, 2, 0]]);
    const [result] = simulateAssembly(track);
    expect(result.outcome).toBe('stopped');
    expect(result.pieceIds).toEqual(['p1', 'p2']);
    expect(result.position[2]).toBeLessThan(25 + 60);
  });

  it('needs more height the more the track holds the marble back', () => {
    const track = build(...feed(2, 0, 7), [PRESETS.loop, [1, 2, 0]]);
    const outcomes = [0.005, 0.08].map((crr) => simulateAssembly(track, { crr })[0].outcome);
    expect(outcomes).toEqual(['noConnection', 'stopped']);
  });
});

describe('wide curve', () => {
  it('holds a marble that would leave an open curve', () => {
    const fast = feed(3, 1, 8);
    const [open] = simulateAssembly(build(...fast, [PRESETS.curveTop, [1, 4, 0]]));
    const [wide] = simulateAssembly(build(...fast, [PRESETS.wideCurve, [1, 3, 1]], [PRESETS.straightTunnel, [3, 3, 1], 90]));
    expect(open.outcome).toBe('derailed');
    expect(wide.maxSpeed).toBeGreaterThan(650);
    expect(wide.pieceIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(wide.outcome).toBe('noConnection'); // ran off the end of the tunnel, not out of the curve
  });

  it('can be run either way', () => {
    // Coming in by the east end instead, the marble leaves by the north one.
    const track = build([PRESETS.start, [4, 1, 1], 270], [PRESETS.rampStraight, [3, 1, 0], 270], [PRESETS.wideCurve, [1, 1, 0]]);
    const [result] = simulateAssembly(track);
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p3']);
    expect(result.position[0]).toBeCloseTo(75, 3);
    expect(result.position[1]).toBeCloseTo(150, 3);
  });
});

describe('helix', () => {
  const tower = build([PRESETS.funnelDrop, [2, 2, 8]], [PRESETS.helix, [1, 1, 4]], [PRESETS.helix, [1, 1, 0]]);

  it('stacks, each module feeding the one below', () => {
    expect(checkAssembly(tower).filter((issue) => issue.level === 'error')).toEqual([]);
    const [result] = simulateAssembly(tower);
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p3']);
    expect(result.position).toEqual([125, 125, 0]);
  });

  it('winds the marble down instead of letting it fall', () => {
    const [result] = simulateAssembly(tower);
    const freeFall = Math.sqrt((2 * 250) / 9810);
    expect(result.time).toBeGreaterThan(5 * freeFall);
    // Each shaft ends on the floor of a turn, which takes the speed of the fall away.
    expect(result.maxSpeed).toBeLessThan(1300);
  });

  it('counts both modules as the same piece to print', () => {
    expect(pieceList(tower).map((group) => group.count).sort()).toEqual([1, 2]);
  });

  it('tells the two windings apart', () => {
    const mixed = build([PRESETS.helix, [1, 1, 4]], [PRESETS.helixMirror, [1, 1, 0]]);
    expect(pieceList(mixed)).toHaveLength(2);
    expect(simulateAssembly(mixed)[0].outcome).toBe('finished');
  });
});
