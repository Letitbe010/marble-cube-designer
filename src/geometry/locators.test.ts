import JSZip from 'jszip';
import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportAssemblyZip, MANIFEST_NAME } from '../assembly/export';
import { addPiece, EMPTY_ASSEMBLY, type Assembly } from '../assembly/model';
import { plateTiles } from '../assembly/plates';
import { CONFIG } from './config';
import { buildBasePlate } from './locators';
import { buildPiece, buildSolid } from './piece';
import { PRESETS } from './presets';
import { buildPrintParts } from './print';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

/** Volume shared by two solids; both are consumed. */
function sharedVolume(a: Manifold, b: Manifold): number {
  const overlap = a.intersect(b);
  const volume = overlap.volume();
  [a, b, overlap].forEach((m) => m.delete());
  return volume;
}

const located = (name: string) => buildSolid(wasm, PRESETS[name], { locators: true });

function moved(solid: Manifold, offset: [number, number, number]): Manifold {
  const result = solid.translate(offset);
  solid.delete();
  return result;
}

function turned(solid: Manifold, degrees: number): Manifold {
  // Rotates about the centre of a one-cell piece.
  const centred = moved(solid, [-25, -25, 0]);
  const rotated = centred.rotate([0, 0, degrees]);
  centred.delete();
  return moved(rotated, [25, 25, 0]);
}

describe('studs and pockets', () => {
  it('seats one cube on another without touching', () => {
    expect(sharedVolume(located('cube'), moved(located('cube'), [0, 0, 50]))).toBeCloseTo(0, 6);
  });

  it('seats in every quarter turn', () => {
    for (const degrees of [90, 180, 270]) {
      expect(sharedVolume(located('cube'), moved(turned(located('cube'), degrees), [0, 0, 50]))).toBeCloseTo(0, 6);
    }
  });

  it('holds the piece above in place sideways', () => {
    const shift = CONFIG.locatorClearance + 0.5;
    expect(sharedVolume(located('cube'), moved(located('cube'), [shift, 0, 50]))).toBeGreaterThan(0.1);
    expect(sharedVolume(located('cube'), moved(located('cube'), [0, -shift, 50]))).toBeGreaterThan(0.1);
  });

  it('leaves play within the clearance', () => {
    const play = CONFIG.locatorClearance * 0.9;
    expect(sharedVolume(located('cube'), moved(located('cube'), [play, 0, 50]))).toBeCloseTo(0, 6);
  });

  it('seats a cube on a base plate', () => {
    const plate = buildBasePlate(wasm, 1, 1);
    expect(sharedVolume(plate, moved(located('cube'), [0, 0, CONFIG.plateThickness]))).toBeCloseTo(0, 6);
  });

  it('seats a long piece across several cubes', () => {
    const cube = located('cube');
    const next = moved(located('cube'), [0, 50, 0]);
    const below = wasm.Manifold.union([cube, next]);
    cube.delete();
    next.delete();
    expect(sharedVolume(below, moved(located('longBlock2'), [0, 0, 50]))).toBeCloseTo(0, 6);
  });

  it('keeps the outline of a cube within its cell', () => {
    const { positions } = buildPiece(wasm, PRESETS.cube, { locators: true });
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i]).toBeGreaterThanOrEqual(0);
      expect(positions[i]).toBeLessThanOrEqual(50);
    }
  });

  it('raises a block by the stud height only', () => {
    const { positions } = buildPiece(wasm, PRESETS.cube, { locators: true });
    let top = 0;
    for (let i = 2; i < positions.length; i += 3) top = Math.max(top, positions[i]);
    expect(top).toBeCloseTo(50 + CONFIG.locatorHeight, 4);
  });
});

describe('corner clashes', () => {
  const report = (name: string) => buildPiece(wasm, PRESETS[name], { locators: true }).studs!;

  it('keeps all four studs on plain channels', () => {
    for (const name of ['cube', 'straightTop', 'curveTop', 'crossTop', 'rampStraight', 'rampCurve', 'drop', 'halfCurve']) {
      expect(report(name), name).toEqual({ total: 4, placed: 4 });
    }
  });

  it('gives each cell of a long piece its own studs', () => {
    expect(report('longGroove3')).toEqual({ total: 12, placed: 12 });
  });

  it('keeps the studs beside the funnels and bowls of the library', () => {
    for (const name of ['funnelTunnel', 'funnelDrop', 'basinCross', 'basinCrossLow', 'start', 'stop']) {
      expect(report(name), name).toEqual({ total: 4, placed: 4 });
    }
  });

  it('keeps the studs when the largest funnel only grazes their corners', () => {
    const big = { ...PRESETS.funnelDrop, cavities: [{ type: 'funnel' as const, size: 22, cell: [0, 0] as [number, number] }] };
    const { studs, pieces } = buildPiece(wasm, big, { locators: true });
    expect(studs).toEqual({ total: 4, placed: 4 });
    expect(pieces).toBe(1);
  });

  it('leaves out the studs that the spiral runs through', () => {
    const { total, placed } = report('spiral');
    expect(total).toBe(16);
    expect(placed).toBeGreaterThan(0);
    expect(placed).toBeLessThan(16);
  });

  it('gives no studs to shapes without a flat block top', () => {
    expect(report('cylinder').total).toBe(0);
    expect(report('roof').total).toBe(0);
  });
});

describe('printing with locators', () => {
  for (const [name, spec] of Object.entries(PRESETS)) {
    it(`${name} stays in one piece`, () => {
      expect(buildPrintParts(wasm, spec, { locators: true, engrave: true }).parts[0].result.pieces).toBe(1);
    });

    // An arch prints on its side, which turns the straight walls of its pockets into small ceilings.
    it.skipIf(spec.body.shape === 'arch')(`${name} has no overhang steeper than 45 degrees`, () => {
      const { positions: p, triangles } = buildPrintParts(wasm, spec, { locators: true }).parts[0].result;
      let worst = 0;
      for (let i = 0; i < triangles.length; i += 3) {
        const [a, b, c] = [triangles[i] * 3, triangles[i + 1] * 3, triangles[i + 2] * 3];
        if (Math.max(p[a + 2], p[b + 2], p[c + 2]) < 1e-3) continue; // sits on the print bed
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(n[0], n[1], n[2]);
        if (length > 1e-6) worst = Math.min(worst, n[2] / length);
      }
      expect(worst).toBeGreaterThanOrEqual(-0.71);
    });
  }

  it('still engraves the identifier between the pockets', () => {
    const plain = buildPrintParts(wasm, PRESETS.cube, { locators: true }).parts[0].result.volume;
    const engraved = buildPrintParts(wasm, PRESETS.cube, { locators: true, engrave: true }).parts[0].result.volume;
    expect(engraved).toBeLessThan(plain);
  });

  it('changes nothing unless asked', () => {
    expect(buildPiece(wasm, PRESETS.cube).studs).toBeUndefined();
  });

  it('splits a located tunnel piece', () => {
    const { parts } = buildPrintParts(wasm, PRESETS.straightTunnel, { split: true, locators: true });
    expect(parts).toHaveLength(2);
    parts.forEach((part) => expect(part.result.pieces).toBe(1));
  });
});

describe('base plates', () => {
  const place = (...cells: [number, number, number][]): Assembly =>
    cells.reduce((assembly, cell) => addPiece(assembly, PRESETS.cube, cell, 0), EMPTY_ASSEMBLY);

  it('is one solid with the studs of every cell', () => {
    const plate = buildBasePlate(wasm, 2, 3);
    const result = plate.decompose();
    expect(result).toHaveLength(1);
    result.forEach((part) => part.delete());
    expect(plate.boundingBox().max[2]).toBeCloseTo(CONFIG.plateThickness + CONFIG.locatorHeight, 4);
    plate.delete();
  });

  it('covers the rectangle under the bottom layer', () => {
    expect(plateTiles(place([2, 3, 0], [4, 3, 0]))).toEqual([{ cell: [2, 3], size: [3, 1] }]);
  });

  it('ignores pieces above the bottom layer', () => {
    expect(plateTiles(place([2, 3, 0], [7, 7, 4]))).toEqual([{ cell: [2, 3], size: [1, 1] }]);
  });

  it('counts the rotated footprint of a long piece', () => {
    const turned = addPiece(EMPTY_ASSEMBLY, PRESETS.longBlock3, [1, 1, 0], 90);
    expect(plateTiles(turned)).toEqual([{ cell: [1, 1], size: [3, 1] }]);
  });

  it('divides a large area into tiles that fit a print bed', () => {
    const tiles = plateTiles(place([0, 0, 0], [8, 2, 0]));
    expect(tiles.every((t) => t.size[0] <= CONFIG.plateMaxCells && t.size[1] <= CONFIG.plateMaxCells)).toBe(true);
    expect(tiles.reduce((sum, t) => sum + t.size[0] * t.size[1], 0)).toBe(9 * 3);
  });

  it('has none for an empty assembly', () => {
    expect(plateTiles(EMPTY_ASSEMBLY)).toEqual([]);
  });

  it('is packed with the pieces in the assembly archive', async () => {
    const zip = await JSZip.loadAsync(await exportAssemblyZip(wasm, place([0, 0, 0], [1, 0, 0]), { locators: true }));
    const names = Object.keys(zip.files);
    expect(names.filter((n) => n.startsWith('plate-'))).toEqual(['plate-2x1-x1.stl']);
    expect(await zip.file(MANIFEST_NAME)!.async('string')).toContain('plate-2x1-x1.stl');
  });

  it('is left out when locators are off', async () => {
    const zip = await JSZip.loadAsync(await exportAssemblyZip(wasm, place([0, 0, 0])));
    expect(Object.keys(zip.files).some((n) => n.startsWith('plate-'))).toBe(false);
  });
});
