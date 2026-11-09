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
