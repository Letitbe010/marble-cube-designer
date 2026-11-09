import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { CONFIG } from './config';
import type { Body, Vec3 } from './ports';

const ARC_STEPS = 48;
const CYLINDER_SEGMENTS = 96;

type Profile = [number, number][];

/** Half ellipse in the XZ plane, from one side to the other over the top. */
function arc(centreX: number, radius: number, baseZ: number, height: number): Profile {
  const points: Profile = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const angle = (i / ARC_STEPS) * Math.PI;
    points.push([centreX + radius * Math.cos(angle), baseZ + height * Math.sin(angle)]);
  }
  return points;
}

/** Solid made by extruding a convex XZ profile along Y. */
function extrude(wasm: ManifoldToplevel, profile: Profile, fromY: number, toY: number): Manifold {
  const points: Vec3[] = profile.flatMap(([x, z]): Vec3[] => [
    [x, fromY, z],
    [x, toY, z],
  ]);
  return wasm.Manifold.hull(points);
}

/** Builds the uncut solid of a piece. The caller owns the returned manifold. */
export function buildBody(wasm: ManifoldToplevel, body: Body): Manifold {
  const { cubeSize, fitClearance, archWall } = CONFIG;
  const [sizeX, sizeY, sizeZ] = body.size;
  const width = sizeX * cubeSize - fitClearance;
  const length = sizeY * cubeSize - fitClearance;
  const height = sizeZ * cubeSize;
  const centreX = (sizeX * cubeSize) / 2;
  const margin = fitClearance / 2;

  const box = () => {
    const raw = wasm.Manifold.cube([width, length, height]);
    const placed = raw.translate([margin, margin, 0]);
    raw.delete();
    return placed;
  };

  switch (body.shape) {
    case 'box':
      return box();
    case 'cylinder': {
      const raw = wasm.Manifold.cylinder(height, width / 2, width / 2, CYLINDER_SEGMENTS);
      const placed = raw.translate([centreX, centreX, 0]);
      raw.delete();
      return placed;
    }
    case 'halfCylinder':
      return extrude(wasm, arc(centreX, width / 2, 0, height), margin, margin + length);
    case 'roof':
      return extrude(wasm, [[margin, 0], [margin + width, 0], [centreX, height]], margin, margin + length);
    case 'arch': {
      const outer = box();
      const radius = Math.min(width / 2 - archWall, height - archWall);
      const springing = height - archWall - radius;
      const opening = extrude(
        wasm,
        [[centreX - radius, -1], [centreX + radius, -1], ...arc(centreX, radius, springing, radius)],
        -1,
        sizeY * cubeSize + 1,
      );
      const result = outer.subtract(opening);
      outer.delete();
      opening.delete();
      return result;
    }
  }
}
