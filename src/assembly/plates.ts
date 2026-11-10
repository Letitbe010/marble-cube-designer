import { CONFIG } from '../geometry/config';
import { rotatedFootprint, type Assembly } from './model';

export interface PlateTile {
  /** Grid cell of the tile's corner. */
  cell: [number, number];
  /** Size in cells. */
  size: [number, number];
}

/** Base plate tiles covering the rectangle under the bottom layer, each small enough to print. */
export function plateTiles(assembly: Assembly, maxCells: number = CONFIG.plateMaxCells): PlateTile[] {
  const ground = assembly.pieces.filter((p) => p.cell[2] === 0);
  if (ground.length === 0) return [];

  const footprints = ground.map((p) => {
    const [x, y] = rotatedFootprint(p.spec, p.rotation);
    return [p.cell[0], p.cell[1], p.cell[0] + x, p.cell[1] + y];
  });
  const [minX, minY] = [Math.min(...footprints.map((f) => f[0])), Math.min(...footprints.map((f) => f[1]))];
  const [maxX, maxY] = [Math.max(...footprints.map((f) => f[2])), Math.max(...footprints.map((f) => f[3]))];

  const tiles: PlateTile[] = [];
  for (let y = minY; y < maxY; y += maxCells) {
    for (let x = minX; x < maxX; x += maxCells) {
      tiles.push({ cell: [x, y], size: [Math.min(maxCells, maxX - x), Math.min(maxCells, maxY - y)] });
    }
  }
  return tiles;
}

export interface PlateGroup {
  id: string;
  /** Size in cells, the longer side first. */
  size: [number, number];
  count: number;
}

/** Plates of the same size, as they are printed: a 3 × 4 tile is a 4 × 3 one turned. */
export function plateGroups(assembly: Assembly, maxCells: number = CONFIG.plateMaxCells): PlateGroup[] {
  const groups = new Map<string, PlateGroup>();
  for (const { size } of plateTiles(assembly, maxCells)) {
    const sorted: [number, number] = [Math.max(...size), Math.min(...size)];
    const id = `plate-${sorted[0]}x${sorted[1]}`;
    const group = groups.get(id);
    if (group) group.count += 1;
    else groups.set(id, { id, size: sorted, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}
