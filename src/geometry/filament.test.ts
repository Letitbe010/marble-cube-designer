import Module, { type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { filamentGrams, meshArea, PRINT_DEFAULTS } from './filament';
import { buildPiece } from './piece';
import { PRESETS } from './presets';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

describe('filament estimate', () => {
  it('measures the surface of a mesh', () => {
    const cube = wasm.Manifold.cube([50, 50, 50]);
    const mesh = cube.getMesh();
    expect(meshArea(mesh.vertProperties, mesh.triVerts)).toBeCloseTo(15000, 3);
    cube.delete();
  });

  it('weighs a plain 50 mm cube like a slicer would, roughly', () => {
    // 125 cm³ of solid PLA would be 155 g; with a skin and 15 % infill, slicers give about 30-40 g.
    const grams = filamentGrams(125000, 15000);
    expect(grams).toBeGreaterThan(30);
    expect(grams).toBeLessThan(40);
  });

  it('counts thin parts as solid', () => {
    expect(filamentGrams(1000, 5000)).toBeCloseTo(PRINT_DEFAULTS.density, 6);
  });

  it('gives a channel piece less plastic than a solid block', () => {
    const block = buildPiece(wasm, PRESETS.cube);
    const tunnel = buildPiece(wasm, PRESETS.straightTunnel);
    const weigh = (r: typeof block) => filamentGrams(r.volume, meshArea(r.positions, r.triangles));
    expect(weigh(tunnel)).toBeGreaterThan(20);
    expect(weigh(tunnel)).toBeLessThan(weigh(block) * 1.6);
  });
});
