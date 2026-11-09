import { describe, expect, it } from 'vitest';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell, type Rotation } from '../assembly/model';
import { buildRunGraph } from '../assembly/runs';
import { boxPiece, channel, type PieceSpec } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { findStarts, simulateAssembly } from './marble';

type Placement = [PieceSpec, Cell, Rotation?];
const build = (...placements: Placement[]): Assembly =>
  placements.reduce((assembly, [spec, cell, rotation = 0]) => addPiece(assembly, spec, cell, rotation), EMPTY_ASSEMBLY);

/** Removes every loss, to compare against theory. */
const LOSSLESS = { crr: 0, jointRetention: 1, jumpRetention: 1 };

/** Two ramps in a row, 50 mm of descent in total. */
const descent = build([PRESETS.rampStraight, [1, 5, 2]], [PRESETS.rampStraight, [1, 4, 1]]);
const theoretical = Math.sqrt(2 * (5 / 7) * 9810 * 50);

describe('single marble', () => {
  it('reaches the theoretical speed after a 50 mm descent', () => {
    expect(theoretical).toBeCloseTo(837, 0);
    const [result] = simulateAssembly(descent, LOSSLESS);
    expect(result.outcome).toBe('noConnection');
    expect(Math.abs(result.finalSpeed - theoretical) / theoretical).toBeLessThan(0.01);
  });

  it('goes through the pieces in order', () => {
    const [result] = simulateAssembly(descent, { crr: 0 });
    expect(result.pieceIds).toEqual(['p1', 'p2']);
  });

  it('takes the same time when the whole track is turned', () => {
    const turned = build([PRESETS.rampStraight, [5, 8, 2], 90], [PRESETS.rampStraight, [6, 8, 1], 90]);
    const [a] = simulateAssembly(descent);
    const [b] = simulateAssembly(turned);
    expect(b.time).toBeCloseTo(a.time, 6);
    expect(b.finalSpeed).toBeCloseTo(a.finalSpeed, 6);
  });

  it('gives exactly the same result on every run', () => {
    expect(simulateAssembly(descent)).toEqual(simulateAssembly(descent));
  });

  it('is slowed by rolling resistance', () => {
    const [free] = simulateAssembly(descent, LOSSLESS);
    const [rough] = simulateAssembly(descent, { ...LOSSLESS, crr: 0.05 });
    expect(rough.finalSpeed).toBeLessThan(free.finalSpeed);
    expect(rough.time).toBeGreaterThan(free.time);
  });

  it('never rolls faster than the energy of its descent allows', () => {
    const [result] = simulateAssembly(descent, LOSSLESS);
    expect(result.maxSpeed).toBeLessThanOrEqual(theoretical * 1.01);
  });

  it('stops on a level stretch when resistance is high enough', () => {
    const track = build([PRESETS.rampLow, [1, 8, 1]], [PRESETS.longGroove3, [1, 5, 0]], [PRESETS.longGroove3, [1, 2, 0]]);
    const [result] = simulateAssembly(track, { crr: 0.3 });
    expect(result.outcome).toBe('stopped');
    expect(result.finalSpeed).toBe(0);
  });

  it('coasts along a level stretch when there is no resistance', () => {
    const track = build([PRESETS.rampStraight, [1, 8, 0]], [PRESETS.longGroove3, [1, 5, 0]]);
    const [result] = simulateAssembly(track, LOSSLESS);
    expect(result.outcome).toBe('noConnection');
    expect(result.pieceIds).toEqual(['p1', 'p2']);
    expect(result.finalSpeed).toBeCloseTo(Math.sqrt(2 * (5 / 7) * 9810 * 25), -1);
  });

  it('follows a funnel down its curved tunnel', () => {
    const track = build([PRESETS.funnelTunnel, [1, 1, 0]]);
    const [result] = simulateAssembly(track);
    expect(result.outcome).toBe('noConnection');
    expect(result.position[2]).toBeCloseTo(25, 3);
    expect(result.position[0]).toBeCloseTo(100, 3);
  });

  it('runs along a groove and falls through a hole in the same piece', () => {
    const track = build([PRESETS.rampStraight, [1, 3, 1]], [PRESETS.drop, [1, 2, 0]]);
    const [result] = simulateAssembly(track);
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2']);
    expect(result.position[2]).toBeCloseTo(0, 3);
  });

  it('drops into the groove of the piece below', () => {
    const track = build([PRESETS.funnelDrop, [1, 1, 2]], [PRESETS.rampStraight, [1, 1, 0]]);
    const [result] = simulateAssembly(track);
    expect(result.pieceIds).toEqual(['p1', 'p2']);
  });

  it('lands in the middle of a level groove below', () => {
    const track = build([PRESETS.funnelDrop, [1, 1, 2]], [PRESETS.straightTop, [1, 1, 0]]);
    const [result] = simulateAssembly(track, { crr: 0 });
    expect(result.pieceIds).toEqual(['p1', 'p2']);
    const middle = result.samples.some((s) => Math.hypot(s.position[0] - 75, s.position[1] - 75) < 15 && Math.abs(s.position[2] - 50) < 1);
    expect(middle).toBe(true);
  });

  it('cannot fall into a closed tunnel below', () => {
    const track = build([PRESETS.funnelDrop, [1, 1, 2]], [PRESETS.straightTunnel, [1, 1, 0]]);
    expect(simulateAssembly(track)[0].pieceIds).toEqual(['p1']);
  });

  it('keeps going straight at a fork', () => {
    const fork = boxPiece([channel('N.T.0', 'S.T.0'), channel('N.T.0', 'E.T.0')]);
    const track = build([PRESETS.rampStraight, [1, 3, 1]], [fork, [1, 2, 0]]);
    const [result] = simulateAssembly(track, LOSSLESS);
    expect(result.position[1]).toBeCloseTo(100, 3); // left by the south face, not the east one
    expect(result.position[0]).toBeCloseTo(75, 3);
  });

  it('winds down a spiral and leaves through its hole', () => {
    const [result] = simulateAssembly(build([PRESETS.spiral, [1, 1, 0]]), { startSpeed: 300 });
    expect(result.outcome).toBe('finished');
    expect(result.position[2]).toBeCloseTo(0, 3);
  });

  it('records the journey in time order', () => {
    const [result] = simulateAssembly(descent);
    expect(result.samples.length).toBeGreaterThan(5);
    result.samples.slice(1).forEach((s, i) => expect(s.time).toBeGreaterThanOrEqual(result.samples[i].time));
  });
});

describe('how a run can end', () => {
  it('arrives at a stop', () => {
    const [result] = simulateAssembly(build([PRESETS.rampStraight, [1, 3, 1]], [PRESETS.stop, [1, 2, 0]]));
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2']);
  });

  it('reports a track that ends in the open', () => {
    expect(simulateAssembly(build([PRESETS.rampStraight, [1, 3, 0]]))[0].outcome).toBe('noConnection');
  });

  it('reports a hole that opens over nothing', () => {
    const [result] = simulateAssembly(build([PRESETS.funnelDrop, [1, 1, 2]]));
    expect(result.outcome).toBe('noConnection');
  });

  it('stops short on a long level stretch', () => {
    const track = build([PRESETS.rampLow, [1, 8, 1]], [PRESETS.longGroove3, [1, 5, 0]], [PRESETS.longGroove3, [1, 2, 0]]);
    expect(simulateAssembly(track, { crr: 0.3 })[0].outcome).toBe('stopped');
  });

  it('leaves an open curve that is taken too fast', () => {
    const track = build([PRESETS.rampStraight, [1, 5, 2]], [PRESETS.rampStraight, [1, 4, 1]], [PRESETS.curveTop, [1, 3, 0]]);
    const [result] = simulateAssembly(track, LOSSLESS);
    expect(result.outcome).toBe('derailed');
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('holds an open curve taken slowly', () => {
    const track = build([PRESETS.rampStraight, [1, 4, 0]], [PRESETS.halfCurve, [1, 3, 0]]);
    expect(simulateAssembly(track, LOSSLESS)[0].outcome).toBe('noConnection');
  });

  it('matches the theoretical speed limit of an open curve', () => {
    const limit = Math.sqrt(Math.tan(Math.PI / 3) * 25 * 9810);
    expect(limit).toBeCloseTo(652, 0);
    const curve = boxPiece([channel('N.T.0', 'E.M.0')]);
    const fast = simulateAssembly(build([curve, [1, 3, 0]]), { ...LOSSLESS, startSpeed: limit + 30 })[0];
    const slow = simulateAssembly(build([curve, [1, 3, 0]]), { ...LOSSLESS, startSpeed: limit - 200 })[0];
    expect(fast.outcome).toBe('derailed');
    expect(slow.outcome).toBe('noConnection');
  });

  it('keeps a marble in a curved tunnel at any speed', () => {
    const track = build([PRESETS.rampStraight, [1, 5, 1]], [PRESETS.rampStraight, [1, 4, 0]], [PRESETS.curveTunnel, [1, 3, 0]]);
    expect(simulateAssembly(track, LOSSLESS)[0].outcome).toBe('noConnection');
  });

  it('can tune how fast a curve may be taken', () => {
    const track = build([PRESETS.rampStraight, [1, 5, 2]], [PRESETS.rampStraight, [1, 4, 1]], [PRESETS.curveTop, [1, 3, 0]]);
    expect(simulateAssembly(track, { ...LOSSLESS, maxLean: 85 })[0].outcome).toBe('noConnection');
  });
});

describe('losses', () => {
  const jump = build([PRESETS.rampStraight, [1, 4, 2]], [PRESETS.longGroove3, [1, 1, 1]]);

  it('loses speed across joints', () => {
    const [none] = simulateAssembly(descent, LOSSLESS);
    const [some] = simulateAssembly(descent, { ...LOSSLESS, jointRetention: 0.95 });
    expect(some.finalSpeed).toBeLessThan(none.finalSpeed);
  });

  it('applies no joint loss inside one piece', () => {
    const track = build([PRESETS.drop, [1, 2, 0]]);
    const [none] = simulateAssembly(track, { ...LOSSLESS, startSpeed: 300 });
    const [some] = simulateAssembly(track, { ...LOSSLESS, startSpeed: 300, jointRetention: 0.5 });
    expect(some.finalSpeed).toBeCloseTo(none.finalSpeed, 6);
  });

  it('loses speed when landing', () => {
    const [none] = simulateAssembly(jump, LOSSLESS);
    const [some] = simulateAssembly(jump, { ...LOSSLESS, jumpRetention: 0.7 });
    expect(some.finalSpeed).toBeCloseTo(none.finalSpeed * 0.7, -1);
  });

  it('follows a falling curve between the pieces', () => {
    const [result] = simulateAssembly(jump, LOSSLESS);
    const flying = result.samples.filter((s) => s.position[1] < 200 && s.position[2] < 75 && s.position[2] > 50);
    expect(flying.length).toBeGreaterThan(0);
    flying.slice(1).forEach((s, i) => expect(s.position[2]).toBeLessThanOrEqual(flying[i].position[2]));
  });

  it('gains the speed of the fall when nothing is lost', () => {
    const [result] = simulateAssembly(jump, LOSSLESS);
    const expected = Math.sqrt(2 * (5 / 7) * 9810 * 25 + 2 * 9810 * 25);
    expect(result.maxSpeed).toBeCloseTo(expected, -1);
  });

  it('still gives the same time when the track with a jump is turned', () => {
    const turned = build([PRESETS.rampStraight, [5, 7, 2], 90], [PRESETS.longGroove3, [6, 7, 1], 90]);
    expect(simulateAssembly(turned)[0].time).toBeCloseTo(simulateAssembly(jump)[0].time, 6);
  });
});

describe('starting points', () => {
  it('starts only where nothing delivers', () => {
    const starts = findStarts(buildRunGraph(descent));
    expect(starts.map((run) => run.piece.id)).toEqual(['p1']);
  });

  it('finds one start per separate track, highest first', () => {
    const track = build([PRESETS.rampStraight, [1, 1, 0]], [PRESETS.rampStraight, [5, 5, 3]]);
    expect(findStarts(buildRunGraph(track)).map((run) => run.piece.id)).toEqual(['p2', 'p1']);
  });

  it('has no start on a track with no slope at all', () => {
    expect(simulateAssembly(build([PRESETS.straightTop, [1, 1, 0]]))).toEqual([]);
  });
});
