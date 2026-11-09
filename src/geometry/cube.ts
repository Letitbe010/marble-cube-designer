import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { boreRadius, CONFIG, LEVEL_IDS, ROOF_PEAK_FACTOR } from './config';
import { segmentPath } from './paths';
import type { Segment, Vec3 } from './ports';

export interface BuildResult {
  /** Three coordinates per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  triangles: Uint32Array;
  volume: number;
  /** Number of disconnected solids; anything but 1 means the cube fell apart. */
  pieces: number;
}

export interface BuildOptions {
  /** Keeps only a central slice this thick along Y (used for the calibration piece). */
  sliceThickness?: number;
}

const isOpenHeight = (z: number) =>
  LEVEL_IDS.some((id) => CONFIG.levels[id].open && Math.abs(z - CONFIG.levels[id].z) < 1e-6);

/** Height added above an open groove so the cut clears the top of the cube. */
const SLOT_HEIGHT = 20;

/** Sweeps a ball along each path, returning one cutter per path step. */
function buildCutters(wasm: ManifoldToplevel, segments: Segment[]): Manifold[] {
  const sphere = wasm.Manifold.sphere(boreRadius(), CONFIG.sphereSegments);
  const mesh = sphere.getMesh();
  sphere.delete();
  const shell: Vec3[] = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    shell.push([mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]]);
  }
  const place = (at: Vec3, dz = 0): Vec3[] => shell.map((v) => [v[0] + at[0], v[1] + at[1], v[2] + at[2] + dz]);

  const cutters: Manifold[] = [];
  for (const segment of segments) {
    const path = segmentPath(segment);
    for (let i = 0; i < path.length - 1; i++) {
      const [a, b] = [path[i], path[i + 1]];
      const points = [...place(a), ...place(b)];
      if (isOpenHeight(a[2]) && isOpenHeight(b[2])) {
        points.push(...place(a, SLOT_HEIGHT), ...place(b, SLOT_HEIGHT));
      } else {
        // Teardrop roof: closed bores print without supports at a 45 degree overhang.
        const peak = boreRadius() * ROOF_PEAK_FACTOR;
        points.push([a[0], a[1], a[2] + peak], [b[0], b[1], b[2] + peak]);
      }
      cutters.push(wasm.Manifold.hull(points));
    }
  }
  return cutters;
}

/** Builds the printable solid for a set of segments. */
export function buildCube(wasm: ManifoldToplevel, segments: Segment[], options: BuildOptions = {}): BuildResult {
  const { Manifold } = wasm;
  const { cubeSize, fitClearance } = CONFIG;
  const owned: Manifold[] = [];
  const keep = (m: Manifold) => (owned.push(m), m);

  try {
    const width = cubeSize - fitClearance;
    let solid = keep(keep(Manifold.cube([width, width, cubeSize])).translate([fitClearance / 2, fitClearance / 2, 0]));

    if (segments.length) {
      const cutters = buildCutters(wasm, segments).map(keep);
      solid = keep(solid.subtract(keep(Manifold.union(cutters))));
    }

    if (options.sliceThickness) {
      const t = options.sliceThickness;
      const slab = keep(keep(Manifold.cube([cubeSize * 2, t, cubeSize * 2])).translate([-cubeSize / 2, (cubeSize - t) / 2, -cubeSize / 2]));
      solid = keep(solid.intersect(slab));
    }

    const mesh = solid.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) {
      for (let c = 0; c < 3; c++) positions[i * 3 + c] = mesh.vertProperties[i * mesh.numProp + c];
    }
    const parts = solid.decompose();
    const pieces = parts.length;
    parts.forEach((p) => p.delete());

    return { positions, triangles: Uint32Array.from(mesh.triVerts), volume: solid.volume(), pieces };
  } finally {
    owned.forEach((m) => m.delete());
  }
}
