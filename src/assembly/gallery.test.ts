import JSZip from 'jszip';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPrintParts } from '../geometry/print';
import { evaluateAssembly } from '../simulation/evaluate';
import { checkAssembly } from './checks';
import { exportAssemblyZip, MANIFEST_NAME } from './export';
import { GALLERY } from './gallery';
import { fitsGrid, parseAssembly, serializeAssembly } from './model';
import { pieceList } from './pieceList';
import { buildRunGraph } from './runs';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const parameters = (followDelay?: number) => (followDelay ? { marbleCount: 2 as const, followDelay } : {});

describe('gallery', () => {
  it('holds assemblies with distinct names', () => {
    expect(GALLERY.length).toBeGreaterThanOrEqual(32);
    expect(new Set(GALLERY.map((item) => item.id)).size).toBe(GALLERY.length);
  });

  it('covers every level', () => {
    expect(new Set(GALLERY.map((item) => item.level))).toEqual(new Set(['beginner', 'intermediate', 'advanced', 'showpiece']));
  });

  for (const { id, assembly, followDelay } of GALLERY) {
    describe(id, () => {
      it('stays inside the grid', () => {
        expect(assembly.pieces.every(fitsGrid)).toBe(true);
      });

      it('has no assembly errors', () => {
        expect(checkAssembly(assembly).filter((i) => i.level === 'error')).toEqual([]);
      });

      it('leaves no exit open, except a hole resting on the table', () => {
        const graph = buildRunGraph(assembly);
        expect(graph.runs.length).toBeGreaterThan(0);
        const open = checkAssembly(assembly).filter((i) => i.code === 'openExit' && !(i.at && i.at[2] === 0));
        expect(open).toEqual([]);
      });

      it('runs well with the default parameters', () => {
        const evaluation = evaluateAssembly(assembly, parameters(followDelay));
        expect(evaluation.problems).toEqual([]);
        expect(evaluation.verdict).toBe('good');
      });

      it('survives being saved and loaded', () => {
        expect(parseAssembly(serializeAssembly(assembly)).pieces).toHaveLength(assembly.pieces.length);
      });
    });
  }

  it('prints every piece in one part with locators', () => {
    const seen = new Set<string>();
    for (const { assembly } of GALLERY) {
      for (const { id, spec } of pieceList(assembly)) {
        if (seen.has(id)) continue;
        seen.add(id);
        expect(buildPrintParts(wasm, spec, { locators: true, engrave: true }).parts[0].result.pieces, id).toBe(1);
      }
    }
  }, 60000);

  it('packs the same number of pieces as it lists', async () => {
    const { assembly } = GALLERY[0];
    const zip = await JSZip.loadAsync(await exportAssemblyZip(wasm, assembly, { locators: true }));
    const rows = (await zip.file(MANIFEST_NAME)!.async('string')).split('\n');
    const total = rows.find((row) => row.startsWith('total'))!;
    expect(total).toBe(`total\t${assembly.pieces.length}`);
  }, 30000);
});
