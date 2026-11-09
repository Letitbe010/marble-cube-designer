import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkAssembly } from '../assembly/checks';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell, type Rotation } from '../assembly/model';
import { canonicalSpec, pieceList, quarterTurn } from '../assembly/pieceList';
import { simulateAssembly } from '../simulation/marble';
import { boreRadius, CONFIG } from './config';
import { channelPath } from './paths';
import { buildPiece, buildSolid } from './piece';
import { boxPiece, channel, portPosition, portsFor, UNIT_BODY, type PieceSpec } from './ports';
import { PRESETS } from './presets';
import { specKey } from './print';
import { parseSpec } from './specIo';
import { validateDesign } from './validate';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

type Placement = [PieceSpec, Cell, Rotation?];
const build = (...placements: Placement[]): Assembly =>
  placements.reduce((assembly, [spec, cell, rotation = 0]) => addPiece(assembly, spec, cell, rotation), EMPTY_ASSEMBLY);

describe('lane ports', () => {
  it('spreads the lanes along the face', () => {
    expect(portPosition('N.T.-1', UNIT_BODY)).toEqual([12.5, 50, 50]);
    expect(portPosition('N.T.1', UNIT_BODY)).toEqual([37.5, 50, 50]);
    expect(portPosition('E.M.1', UNIT_BODY)).toEqual([50, 37.5, 25]);
  });

  it('leaves printable walls between and beside the lanes', () => {
    expect(CONFIG.laneOffset * 2 - 2 * boreRadius()).toBeGreaterThanOrEqual(CONFIG.minWall);
    expect(CONFIG.cubeSize / 2 - CONFIG.laneOffset - boreRadius() - CONFIG.fitClearance / 2).toBeGreaterThanOrEqual(CONFIG.minWall);
  });

  it('can hide the side lanes from the editor', () => {
    expect(portsFor(UNIT_BODY, false).some((p) => p.endsWith('.1'))).toBe(false);
    expect(portsFor(UNIT_BODY)).toContain('N.T.-1');
  });

  it('keeps lanes when a saved design is read back', () => {
    const spec = parseSpec({ spec: boxPiece([channel('N.T.-1', 'S.T.1')]) });
    expect(spec.channels.map((c) => [c.from, c.to])).toEqual([['N.T.-1', 'S.T.1']]);
  });
});

describe('lane paths', () => {
  const span = (spec: PieceSpec, axis: 0 | 1) => channelPath(spec.channels[0], spec.body).map((p) => p[axis]);

  it('runs straight along a lane', () => {
    expect(new Set(span(boxPiece([channel('N.T.1', 'S.T.1')]), 0))).toEqual(new Set([37.5]));
  });

  it('moves steadily across when changing lane', () => {
    const xs = span(PRESETS.laneShift, 0).slice(1, -1);
    expect(xs[0]).toBeCloseTo(12.5, 6);
    expect(xs[xs.length - 1]).toBeCloseTo(37.5, 6);
    xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(xs[i]));
  });

  it('nests two curves around the same corner', () => {
    const radius = (index: number) => {
      const path = channelPath(PRESETS.doubleCurve.channels[index], UNIT_BODY).slice(1, -1);
      return path.map((p) => Math.hypot(p[0] - 50, p[1] - 50));
    };
    radius(0).forEach((r) => expect(r).toBeCloseTo(37.5, 6));
    radius(1).forEach((r) => expect(r).toBeCloseTo(12.5, 6));
  });

  it('closes in on the central hole', () => {
    const path = channelPath(PRESETS.twinIntoHole.channels[1], UNIT_BODY);
    expect(path[1][0]).toBeCloseTo(37.5, 6);
    expect(path[path.length - 1].slice(0, 2)).toEqual([25, 25]);
  });
});

describe('double pieces', () => {
  const doubles = ['doubleStraight', 'doubleTunnel', 'doubleRamp', 'doubleCurve', 'doubleOverTunnel', 'doubleLow', 'yMerge', 'yMergeRamp', 'laneShift', 'tunnelShift', 'twinIntoHole'];

  for (const name of doubles) {
    it(`${name} is valid and stays in one piece`, () => {
      expect(validateDesign(PRESETS[name])).toEqual([]);
      expect(buildPiece(wasm, PRESETS[name]).pieces).toBe(1);
    });
  }

  it('leaves out the studs that the grooves run through', () => {
    const { studs } = buildPiece(wasm, PRESETS.doubleStraight, { locators: true });
    expect(studs).toEqual({ total: 4, placed: 0 });
  });

  it('keeps the studs of a double tunnel', () => {
    expect(buildPiece(wasm, PRESETS.doubleTunnel, { locators: true }).studs).toEqual({ total: 4, placed: 4 });
  });
});

describe('turning lanes', () => {
  function turned(solid: Manifold): Manifold {
    const centred = solid.translate([-25, -25, 0]);
    const rotated = centred.rotate([0, 0, 90]);
    const back = rotated.translate([25, 25, 0]);
    [solid, centred, rotated].forEach((m) => m.delete());
    return back;
  }

  function difference(a: Manifold, b: Manifold): number {
    const [ab, ba] = [a.subtract(b), b.subtract(a)];
    const volume = ab.volume() + ba.volume();
    [a, b, ab, ba].forEach((m) => m.delete());
    return volume;
  }

  for (const name of ['doubleCurve', 'laneShift', 'tunnelShift', 'doubleOverTunnel', 'yMerge']) {
    it(`describes ${name} correctly after a quarter turn`, () => {
      const spec = PRESETS[name];
      expect(difference(turned(buildSolid(wasm, spec)), buildSolid(wasm, quarterTurn(spec)))).toBeLessThan(1);
    });
  }

  it('groups a double piece designed in another orientation', () => {
    const eastWest = boxPiece([channel('E.T.-1', 'W.T.-1'), channel('E.T.1', 'W.T.1')]);
    expect(specKey(canonicalSpec(eastWest))).toBe(specKey(canonicalSpec(PRESETS.doubleStraight)));
  });

  it('keeps a lane change apart from its mirror image', () => {
    const mirror = boxPiece([channel('N.T.1', 'S.T.-1')]);
    expect(pieceList(build([PRESETS.laneShift, [0, 0, 0]], [mirror, [2, 0, 0]]))).toHaveLength(2);
  });
});

describe('lanes in an assembly', () => {
  const twoRamps: Placement = [PRESETS.doubleRamp, [1, 3, 1]];

  it('connects lane to lane', () => {
    const issues = checkAssembly(build(twoRamps, [PRESETS.doubleStraight, [1, 2, 0]]));
    expect(issues.filter((i) => i.code === 'blockedExit' || i.code === 'levelMismatch')).toEqual([]);
  });

  it('connects lanes through a half turn', () => {
    const issues = checkAssembly(build([PRESETS.doubleRamp, [1, 1, 1], 180], [PRESETS.doubleStraight, [1, 2, 0], 180]));
    expect(issues.filter((i) => i.code === 'blockedExit' || i.code === 'levelMismatch')).toEqual([]);
  });

  it('blocks a lane that meets a solid wall of the next piece', () => {
    const issues = checkAssembly(build(twoRamps, [PRESETS.straightTop, [1, 2, 0]]));
    expect(issues.map((i) => i.code)).toContain('blockedExit');
  });

  it('keeps two marbles apart on separate lanes', () => {
    const results = simulateAssembly(build(twoRamps, [PRESETS.doubleStraight, [1, 2, 0]]));
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.outcome)).not.toContain('collision');
    expect(results[0].time).toBeCloseTo(results[1].time, 6);
  });

  it('marks an encounter where two lanes merge', () => {
    const results = simulateAssembly(build(twoRamps, [PRESETS.yMerge, [1, 2, 0]], [PRESETS.stop, [1, 1, 0]]));
    expect(results.map((r) => r.outcome)).toEqual(['collision', 'collision']);
  });

  it('brings one marble through a merge to the stop', () => {
    const one = boxPiece([channel('N.T.1', 'S.M.1')]);
    const [result] = simulateAssembly(build([one, [1, 3, 1]], [PRESETS.yMerge, [1, 2, 0]], [PRESETS.stop, [1, 1, 0]]));
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('takes the tight inner curve more slowly than the wide outer one', () => {
    const limit = (radius: number) => Math.sqrt(Math.tan(Math.PI / 3) * radius * 9810);
    expect(limit(12.5)).toBeLessThan(limit(37.5));
    const inner = boxPiece([channel('N.T.1', 'E.M.1')]);
    const outer = boxPiece([channel('N.T.-1', 'E.M.-1')]);
    const speed = { crr: 0, startSpeed: limit(12.5) + 20 };
    expect(simulateAssembly(build([inner, [1, 1, 0]]), speed)[0].outcome).toBe('derailed');
    expect(simulateAssembly(build([outer, [1, 1, 0]]), speed)[0].outcome).not.toBe('derailed');
  });
});
