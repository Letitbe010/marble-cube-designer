import JSZip from 'jszip';
import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkAssembly } from '../assembly/checks';
import { exportAssemblyZip } from '../assembly/export';
import { addPiece, EMPTY_ASSEMBLY, type Assembly, type Cell, type Rotation } from '../assembly/model';
import { simulateAssembly } from '../simulation/marble';
import { CONFIG } from './config';
import { buildSeesawArm, leanSeat, seesawRestTilt } from './moving';
import { buildPiece, buildSolid } from './piece';
import { type PieceSpec } from './ports';
import { PRESETS } from './presets';
import { buildPrintParts } from './print';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

type Placement = [PieceSpec, Cell, Rotation?];
const build = (...placements: Placement[]): Assembly =>
  placements.reduce((assembly, [spec, cell, rotation = 0]) => addPiece(assembly, spec, cell, rotation), EMPTY_ASSEMBLY);
const codes = (assembly: Assembly) => checkAssembly(assembly).map((i) => i.code);

function shared(a: Manifold, b: Manifold): number {
  const overlap = a.intersect(b);
  const volume = overlap.volume();
  [a, b, overlap].forEach((m) => m.delete());
  return volume;
}

function zRange(positions: Float32Array) {
  let [min, max] = [Infinity, -Infinity];
  for (let i = 2; i < positions.length; i += 3) {
    min = Math.min(min, positions[i]);
    max = Math.max(max, positions[i]);
  }
  return [min, max];
}

describe('leaning ramp', () => {
  it('rests on a grid height', () => {
    expect(leanSeat(PRESETS.leanRamp2.body)).toBeCloseTo(25, 6);
    expect(leanSeat(PRESETS.leanRamp3.body)).toBeCloseTo(50, 6);
  });

  for (const [name, support, cell] of [
    ['leanRamp2', 'halfBlock', [0, 50, 0]],
    ['leanRamp3', 'cube', [0, 100, 0]],
  ] as const) {
    it(`${name} clears the block it rests on`, () => {
      const bar = buildSolid(wasm, PRESETS[name]);
      const block = buildSolid(wasm, PRESETS[support]);
      const placed = block.translate([cell[0], cell[1], cell[2]]);
      block.delete();
      expect(shared(bar, placed)).toBeLessThan(1);
    });

    it(`${name} prints in one piece, lying on its underside`, () => {
      const { parts } = buildPrintParts(wasm, PRESETS[name]);
      expect(parts).toHaveLength(1);
      expect(parts[0].result.pieces).toBe(1);
      expect(zRange(parts[0].result.positions)[0]).toBeCloseTo(0, 4);
    });
  }

  it('is much lower lying down than leaning', () => {
    const leaning = zRange(buildPiece(wasm, PRESETS.leanRamp3).positions);
    const lying = zRange(buildPrintParts(wasm, PRESETS.leanRamp3).parts[0].result.positions);
    expect(lying[1] - lying[0]).toBeLessThan(leaning[1] - leaning[0]);
  });

  const supported: Placement[] = [[PRESETS.leanRamp2, [1, 3, 0]], [PRESETS.halfBlock, [1, 4, 0]]];

  it('is accepted on its support', () => {
    expect(codes(build(...supported)).filter((c) => c !== 'openExit')).toEqual([]);
  });

  it('is reported when nothing holds up its high end', () => {
    expect(codes(build([PRESETS.leanRamp2, [1, 3, 0]]))).toContain('unsupported');
  });

  it('still clashes with a block under its low end', () => {
    expect(codes(build(...supported, [PRESETS.cube, [1, 3, 0]]))).toContain('overlap');
  });

  it('checks its support when turned', () => {
    const turned = build([PRESETS.leanRamp2, [3, 3, 0], 90], [PRESETS.halfBlock, [4, 3, 0]]);
    expect(codes(turned)).toContain('unsupported');
    const good = build([PRESETS.leanRamp2, [3, 3, 0], 90], [PRESETS.halfBlock, [3, 3, 0]]);
    expect(codes(good).filter((c) => c === 'unsupported' || c === 'overlap')).toEqual([]);
  });

  it('carries a marble from a piece above to the stop', () => {
    const track = build(
      [PRESETS.start, [1, 5, 2]],
      [PRESETS.leanRamp2, [1, 3, 0]],
      [PRESETS.halfBlock, [1, 4, 0]],
      [PRESETS.stopLow, [1, 2, 0]],
    );
    const [result] = simulateAssembly(track);
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p4']);
  });

  it('prints with pockets over both resting places', () => {
    const plain = buildPiece(wasm, PRESETS.leanRamp2).volume;
    const located = buildPiece(wasm, PRESETS.leanRamp2, { locators: true });
    expect(located.volume).toBeLessThan(plain);
    expect(located.pieces).toBe(1);
  });
});

describe('seesaw', () => {
  const spec = PRESETS.seesaw;

  it('has a base and a separate arm when assembled', () => {
    expect(buildPiece(wasm, spec).pieces).toBe(2);
  });

  it('can be shown with locators', () => {
    expect(buildPiece(wasm, spec, { locators: true }).pieces).toBe(2);
  });

  it('leaves the arm free of the base at both ends of its travel', () => {
    for (const tilt of [seesawRestTilt(), -seesawRestTilt(), 0]) {
      const base = buildSolid(wasm, spec, { omitMoving: true });
      expect(shared(base, buildSeesawArm(wasm, tilt)), `tilt ${tilt}`).toBeLessThan(0.01);
    }
  });

  it('keeps the arm inside its own footprint', () => {
    const arm = buildSeesawArm(wasm, seesawRestTilt());
    const box = arm.boundingBox();
    arm.delete();
    expect(box.min[1]).toBeGreaterThanOrEqual(0);
    expect(box.max[1]).toBeLessThanOrEqual(150);
    expect(box.max[2]).toBeLessThanOrEqual(CONFIG.cubeSize + 0.1);
  });

  it('prints as two parts on the bed', () => {
    const { parts } = buildPrintParts(wasm, spec, { engrave: true });
    expect(parts.map((p) => p.suffix)).toEqual(['base', 'arm']);
    parts.forEach((part) => {
      expect(part.result.pieces).toBe(1);
      expect(zRange(part.result.positions)[0]).toBeCloseTo(0, 4);
    });
  });

  it('prints the arm without overhangs steeper than 45 degrees', () => {
    const { positions: p, triangles } = buildPrintParts(wasm, spec).parts[1].result;
    let worst = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = [triangles[i] * 3, triangles[i + 1] * 3, triangles[i + 2] * 3];
      if (Math.max(p[a + 2], p[b + 2], p[c + 2]) < 1e-3) continue;
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(n[0], n[1], n[2]);
      if (length > 1e-6) worst = Math.min(worst, n[2] / length);
    }
    expect(worst).toBeGreaterThanOrEqual(-0.71);
  });

  it('is never where a marble starts', () => {
    expect(simulateAssembly(build([spec, [1, 1, 0]]))).toEqual([]);
  });

  const fed: Placement[] = [
    [PRESETS.funnelDrop, [1, 3, 2]],
    [spec, [1, 2, 0]],
    [PRESETS.stopLow, [1, 1, 0]],
    [PRESETS.stopLow, [1, 5, 0], 180],
  ];

  it('passes a falling marble on to the next piece', () => {
    const [result] = simulateAssembly(build(...fed));
    expect(result.outcome).toBe('finished');
    expect(result.pieceIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('needs both of its ends connected', () => {
    expect(codes(build(...fed)).filter((c) => c !== 'unsupported')).toEqual([]);
    expect(codes(build(...fed.slice(0, 3)))).toContain('openExit');
  });

  it('packs both parts in the assembly archive', async () => {
    const zip = await JSZip.loadAsync(await exportAssemblyZip(wasm, build([spec, [1, 1, 0]])));
    const names = Object.keys(zip.files).filter((n) => n.endsWith('.stl'));
    expect(names).toHaveLength(2);
    expect(names.some((n) => n.includes('-base-'))).toBe(true);
    expect(names.some((n) => n.includes('-arm-'))).toBe(true);
  });
});
