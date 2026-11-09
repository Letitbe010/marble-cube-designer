import JSZip from 'jszip';
import type { ManifoldToplevel } from 'manifold-3d';
import { CONFIG } from '../geometry/config';
import { buildPrintParts } from '../geometry/print';
import { toBinaryStl } from '../geometry/stl';
import { serializeAssembly, type Assembly } from './model';
import { pieceList } from './pieceList';

export const MANIFEST_NAME = 'parts.txt';
export const ASSEMBLY_FILE_NAME = 'assembly.json';

/** Packs one STL per distinct piece, a list with quantities and the assembly itself. */
export async function exportAssemblyZip(wasm: ManifoldToplevel, assembly: Assembly): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const rows = ['id\tcount\tshape\tsize_mm\tvolume_cm3\tfile'];

  for (const { id, spec, count } of pieceList(assembly)) {
    const { parts } = buildPrintParts(wasm, spec, { engrave: true });
    const { result } = parts[0];
    const size = spec.body.size.map((value) => value * CONFIG.cubeSize).join('x');
    const file = `${id}-${spec.body.shape}-${size}-x${count}.stl`;
    zip.file(file, toBinaryStl(result.positions, result.triangles, id));
    rows.push([id, count, spec.body.shape, size, (result.volume / 1000).toFixed(1), file].join('\t'));
  }

  rows.push(`total\t${assembly.pieces.length}`);
  zip.file(MANIFEST_NAME, rows.join('\n'));
  zip.file(ASSEMBLY_FILE_NAME, serializeAssembly(assembly));
  return zip.generateAsync({ type: 'arraybuffer' });
}
