import { CONFIG } from './config';
import { FACE_DIR, isVertical, parseSide, portPosition, type Port, type Segment, type Vec3 } from './ports';

/** How far paths continue past the cube surface, so cuts open cleanly. */
const OVERSHOOT = 1;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

type SidePort = Exclude<Port, 'U' | 'D'>;

function sidePath(a: SidePort, b: SidePort): Vec3[] {
  const pa = portPosition(a);
  const pb = portPosition(b);
  const da = FACE_DIR[parseSide(a).face];
  const db = FACE_DIR[parseSide(b).face];
  const steps = CONFIG.curveSteps;
  const points: Vec3[] = [];
  const half = CONFIG.cubeSize / 2;

  if (da[0] === -db[0] && da[1] === -db[1]) {
    // Opposite faces: straight run, ramping between levels if needed.
    const n = pa[2] === pb[2] ? 1 : steps;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      points.push([
        pa[0] + (pb[0] - pa[0]) * t,
        pa[1] + (pb[1] - pa[1]) * t,
        pa[2] + (pb[2] - pa[2]) * smoothstep(t),
      ]);
    }
  } else {
    // Adjacent faces: quarter circle around the shared corner.
    const cx = half + (da[0] + db[0]) * half;
    const cy = half + (da[1] + db[1]) * half;
    const a0 = Math.atan2(pa[1] - cy, pa[0] - cx);
    let delta = Math.atan2(pb[1] - cy, pb[0] - cx) - a0;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = a0 + delta * t;
      points.push([
        cx + half * Math.cos(angle),
        cy + half * Math.sin(angle),
        pa[2] + (pb[2] - pa[2]) * smoothstep(t),
      ]);
    }
  }

  return [
    [pa[0] + da[0] * OVERSHOOT, pa[1] + da[1] * OVERSHOOT, pa[2]],
    ...points,
    [pb[0] + db[0] * OVERSHOOT, pb[1] + db[1] * OVERSHOOT, pb[2]],
  ];
}

function verticalPath(side: SidePort, vertical: 'U' | 'D'): Vec3[] {
  const half = CONFIG.cubeSize / 2;
  const { face, level } = parseSide(side);
  const [dx, dy] = FACE_DIR[face];
  const z = CONFIG.levels[level].z;
  const at = (u: number, h: number): Vec3 => [half + dx * u, half + dy * u, h];

  // A groove that reaches the top port simply ends over the centre of the cube.
  if (vertical === 'U' && CONFIG.levels[level].open) {
    return [at(half + OVERSHOOT, z), at(half, z), at(0, z)];
  }

  const direction = vertical === 'U' ? 1 : -1;
  const end = vertical === 'U' ? CONFIG.cubeSize : 0;
  const radius = Math.min(half, Math.abs(end - z));
  const points: Vec3[] = [at(half + OVERSHOOT, z), at(half, z)];
  if (radius < half) points.push(at(radius, z));
  for (let i = 1; i <= CONFIG.curveSteps; i++) {
    const t = ((i / CONFIG.curveSteps) * Math.PI) / 2;
    points.push(at(radius * (1 - Math.sin(t)), z + direction * radius * (1 - Math.cos(t))));
  }
  points.push(at(0, end + direction * OVERSHOOT));
  return points;
}

/** Centre line of the ball through a segment. */
export function segmentPath({ from, to }: Segment): Vec3[] {
  if (isVertical(from) && isVertical(to)) {
    const half = CONFIG.cubeSize / 2;
    return [
      [half, half, CONFIG.cubeSize + OVERSHOOT],
      [half, half, -OVERSHOOT],
    ];
  }
  if (isVertical(from)) return verticalPath(to as SidePort, from);
  if (isVertical(to)) return verticalPath(from as SidePort, to);
  return sidePath(from, to);
}
