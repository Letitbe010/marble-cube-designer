import JSZip from 'jszip';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { boxPiece, channel } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { ASSEMBLY_FILE_NAME, exportAssemblyZip, MANIFEST_NAME } from './export';
import { addPiece, EMPTY_ASSEMBLY, parseAssembly, type Assembly } from './model';
import { pieceList } from './pieceList';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const layout: Assembly = [
  [PRESETS.straightTop, [0, 0, 0], 0],
  [boxPiece([channel('E.T.0', 'W.T.0')]), [2, 0, 0], 0],
  [PRESETS.curveTop, [4, 0, 0], 90],
  [PRESETS.curveTop, [6, 0, 0], 180],
  [PRESETS.arch, [0, 4, 0], 0],
].reduce((assembly, [spec, cell, rotation]) => addPiece(assembly, spec as never, cell as never, rotation as never), EMPTY_ASSEMBLY);

async function open() {
  const zip = await JSZip.loadAsync(await exportAssemblyZip(wasm, layout));
  const stlNames = Object.keys(zip.files).filter((name) => name.endsWith('.stl'));
  const manifest = (await zip.file(MANIFEST_NAME)!.async('string')).split('\n');
  return { zip, stlNames, manifest };
}

describe('assembly export', () => {
  it('holds one STL for each distinct piece', async () => {
    const { stlNames } = await open();
    expect(stlNames).toHaveLength(pieceList(layout).length);
    expect(stlNames).toHaveLength(3);
  });

  it('lists quantities that add up to the pieces of the assembly', async () => {
    const { manifest } = await open();
    const rows = manifest.slice(1, -1).map((row) => row.split('\t'));
    expect(rows.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(layout.pieces.length);
    expect(manifest[manifest.length - 1]).toBe(`total\t${layout.pieces.length}`);
  });

  it('can leave out what is already printed', async () => {
    const groups = pieceList(layout);
    const quantities = { [groups[0].id]: 1 };
    const zip = await JSZip.loadAsync(await exportAssemblyZip(wasm, layout, { quantities }));
    const stlNames = Object.keys(zip.files).filter((name) => name.endsWith('.stl'));
    const manifest = (await zip.file(MANIFEST_NAME)!.async('string')).split('\n');
    expect(stlNames).toHaveLength(1);
    expect(stlNames[0]).toContain(`${groups[0].id}-`);
    expect(stlNames[0]).toMatch(/-x1\.stl$/);
    expect(manifest[manifest.length - 1]).toBe('total\t1');
  });

  it('names in the list exactly the files in the archive', async () => {
    const { manifest, stlNames } = await open();
    const listed = manifest.slice(1, -1).map((row) => row.split('\t')[5]);
    expect(listed.sort()).toEqual([...stlNames].sort());
  });

  it('writes valid binary STL files', async () => {
    const { zip, stlNames } = await open();
    for (const name of stlNames) {
      const data = await zip.file(name)!.async('arraybuffer');
      const triangles = new DataView(data).getUint32(80, true);
      expect(triangles).toBeGreaterThan(0);
      expect(data.byteLength).toBe(84 + 50 * triangles);
    }
  });

  it('includes the assembly so that it can be reopened', async () => {
    const { zip } = await open();
    const restored = parseAssembly(await zip.file(ASSEMBLY_FILE_NAME)!.async('string'));
    expect(restored.pieces).toHaveLength(layout.pieces.length);
  });
});
