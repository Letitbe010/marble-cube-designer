import JSZip from 'jszip';
import type { ManifoldToplevel } from 'manifold-3d';
import { CONFIG } from '../geometry/config';
import { buildBasePlate } from '../geometry/locators';
import { toResult } from '../geometry/piece';
import { buildPrintParts } from '../geometry/print';
import { toBinaryStl } from '../geometry/stl';
import { serializeAssembly, type Assembly } from './model';
import { pieceList } from './pieceList';
import { plateTiles } from './plates';

export interface ExportOptions {
  /** Adds corner studs and pockets to the pieces, and base plates under them. */
  locators?: boolean;
}

export const MANIFEST_NAME = 'parts.txt';
export const ASSEMBLY_FILE_NAME = 'assembly.json';

/** Packs one STL per distinct piece, a list with quantities and the assembly itself. */
export async function exportAssemblyZip(wasm: ManifoldToplevel, assembly: Assembly, options: ExportOptions = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const rows = ['id\tcount\tshape\tsize_mm\tvolume_cm3\tfile'];

  for (const { id, spec, count } of pieceList(assembly)) {
    const { parts } = buildPrintParts(wasm, spec, { engrave: true, locators: options.locators });
    const size = spec.body.size.map((value) => value * CONFIG.cubeSize).join('x');
    for (const { suffix, result } of parts) {
      const part = suffix ? `-${suffix}` : '';
      const file = `${id}-${spec.body.shape}-${size}${part}-x${count}.stl`;
      zip.file(file, toBinaryStl(result.positions, result.triangles, id));
      rows.push([id, count, spec.body.shape, size, (result.volume / 1000).toFixed(1), file].join('\t'));
    }
  }

  rows.push(`total\t${assembly.pieces.length}`);

  if (options.locators) {
    const sizes = new Map<string, { size: [number, number]; count: number }>();
    for (const { size } of plateTiles(assembly)) {
      const key = size.join('x');
      sizes.set(key, { size, count: (sizes.get(key)?.count ?? 0) + 1 });
    }
    for (const [key, { size, count }] of sizes) {
      const plate = buildBasePlate(wasm, size[0], size[1]);
      const result = toResult(plate);
      plate.delete();
      const file = `plate-${key}-x${count}.stl`;
      zip.file(file, toBinaryStl(result.positions, result.triangles, `plate ${key}`));
      rows.push(['plate', count, key, '', (result.volume / 1000).toFixed(1), file].join('\t'));
    }
  }
  zip.file(MANIFEST_NAME, rows.join('\n'));
  zip.file(ASSEMBLY_FILE_NAME, serializeAssembly(assembly));
  return zip.generateAsync({ type: 'arraybuffer' });
}
