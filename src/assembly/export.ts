import JSZip from 'jszip';
import type { ManifoldToplevel } from 'manifold-3d';
import { CONFIG } from '../geometry/config';
import { buildBasePlate } from '../geometry/locators';
import { toResult } from '../geometry/piece';
import { buildPrintParts } from '../geometry/print';
import { toBinaryStl } from '../geometry/stl';
import { serializeAssembly, type Assembly } from './model';
import { pieceList } from './pieceList';
import { plateGroups } from './plates';

export interface ExportOptions {
  /** Adds corner studs and pockets to the pieces, and base plates under them. */
  locators?: boolean;
  /**
   * How many of each piece and plate to print, by ID, when some are already printed.
   * Anything not named is left out. Without it, the whole assembly is exported.
   */
  quantities?: Record<string, number>;
}

export const MANIFEST_NAME = 'parts.txt';
export const ASSEMBLY_FILE_NAME = 'assembly.json';

/** Packs one STL per distinct piece, a list with quantities and the assembly itself. */
export async function exportAssemblyZip(wasm: ManifoldToplevel, assembly: Assembly, options: ExportOptions = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const rows = ['id\tcount\tshape\tsize_mm\tvolume_cm3\tfile'];

  const howMany = (id: string, count: number) => (options.quantities ? options.quantities[id] ?? 0 : count);
  let total = 0;

  for (const group of pieceList(assembly)) {
    const { id, spec } = group;
    const count = howMany(id, group.count);
    if (count === 0) continue;
    total += count;
    const { parts } = buildPrintParts(wasm, spec, { engrave: true, locators: options.locators });
    const size = spec.body.size.map((value) => value * CONFIG.cubeSize).join('x');
    for (const { suffix, result } of parts) {
      const part = suffix ? `-${suffix}` : '';
      const file = `${id}-${spec.body.shape}-${size}${part}-x${count}.stl`;
      zip.file(file, toBinaryStl(result.positions, result.triangles, id));
      rows.push([id, count, spec.body.shape, size, (result.volume / 1000).toFixed(1), file].join('\t'));
    }
  }

  rows.push(`total\t${total}`);

  if (options.locators) {
    for (const group of plateGroups(assembly)) {
      const { size } = group;
      const count = howMany(group.id, group.count);
      if (count === 0) continue;
      const key = size.join('x');
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
