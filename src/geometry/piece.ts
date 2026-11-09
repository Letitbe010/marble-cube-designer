import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { buildBody } from './body';
import { buildCavityCutters, type Sweep } from './cavities';
import { boreRadius, CONFIG, ROOF_PEAK_FACTOR } from './config';
import { channelPath } from './paths';
import type { PieceSpec, Vec3 } from './ports';

export interface BuildResult {
  /** Three coordinates per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  triangles: Uint32Array;
  volume: number;
  /** Number of disconnected solids; anything but 1 means the piece fell apart. */
  pieces: number;
}

export interface BuildOptions {
  /** Keeps only a central slice this thick along Y (used for the calibration piece). */
  sliceThickness?: number;
}

/** Height added above an open channel so the cut clears the top of the piece. */
const SLOT_HEIGHT = 20;

/** Prepares the ball-sweeping tool, returning one cutter per path step. */
function createSweep(wasm: ManifoldToplevel): Sweep {
  const sphere = wasm.Manifold.sphere(boreRadius(), CONFIG.sphereSegments);
  const mesh = sphere.getMesh();
  sphere.delete();
  const shell: Vec3[] = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    shell.push([mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]]);
  }
  const place = (at: Vec3, dz = 0): Vec3[] => shell.map((v) => [v[0] + at[0], v[1] + at[1], v[2] + at[2] + dz]);

  return (path, open) => {
    const cutters: Manifold[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [a, b] = [path[i], path[i + 1]];
      const points = [...place(a), ...place(b)];
      if (open) {
        points.push(...place(a, SLOT_HEIGHT), ...place(b, SLOT_HEIGHT));
      } else {
        // Teardrop roof: closed bores print without supports at a 45 degree overhang.
        const peak = boreRadius() * ROOF_PEAK_FACTOR;
        points.push([a[0], a[1], a[2] + peak], [b[0], b[1], b[2] + peak]);
      }
      cutters.push(wasm.Manifold.hull(points));
    }
    return cutters;
  };
}

/** Copies a solid into plain arrays that outlive the geometry kernel's objects. */
export function toResult(solid: Manifold): BuildResult {
  const mesh = solid.getMesh();
  const positions = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    for (let c = 0; c < 3; c++) positions[i * 3 + c] = mesh.vertProperties[i * mesh.numProp + c];
  }
  const parts = solid.decompose();
  const pieces = parts.length;
  parts.forEach((p) => p.delete());
  return { positions, triangles: Uint32Array.from(mesh.triVerts), volume: solid.volume(), pieces };
}

/** Builds the solid for a piece. The caller owns the returned manifold. */
export function buildSolid(wasm: ManifoldToplevel, spec: PieceSpec, options: BuildOptions = {}): Manifold {
  const { Manifold } = wasm;
  const { cubeSize } = CONFIG;
  const owned: Manifold[] = [];
  const keep = (m: Manifold) => (owned.push(m), m);

  try {
    let solid = keep(buildBody(wasm, spec.body));

    const sweep = createSweep(wasm);
    const cutters = [
      ...spec.channels.flatMap((c) => sweep(channelPath(c, spec.body), c.section === 'groove' || c.section === 'slot')),
      ...(spec.cavities ?? []).flatMap((cavity) => buildCavityCutters(wasm, cavity, spec.body, sweep)),
    ].map(keep);
    if (cutters.length) solid = keep(solid.subtract(keep(Manifold.union(cutters))));

    if (options.sliceThickness) {
      const t = options.sliceThickness;
      const slab = keep(keep(Manifold.cube([cubeSize * 2, t, cubeSize * 2])).translate([-cubeSize / 2, (cubeSize - t) / 2, -cubeSize / 2]));
      solid = keep(solid.intersect(slab));
    }

    owned.splice(owned.indexOf(solid), 1);
    return solid;
  } finally {
    owned.forEach((m) => m.delete());
  }
}

/** Builds a piece and returns its mesh, as the viewer shows it. */
export function buildPiece(wasm: ManifoldToplevel, spec: PieceSpec, options: BuildOptions = {}): BuildResult {
  const solid = buildSolid(wasm, spec, options);
  try {
    return toResult(solid);
  } finally {
    solid.delete();
  }
}
