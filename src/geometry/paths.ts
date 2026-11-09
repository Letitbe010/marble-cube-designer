import { CONFIG } from './config';
import {
  bodyHeight,
  FACE_DIR,
  isVertical,
  levelZ,
  parseSide,
  portPosition,
  verticalKind,
  type Body,
  type Channel,
  type Profile,
  type SidePort,
  type Vec3,
  type VerticalPort,
} from './ports';

/** How far paths continue past the piece surface, so cuts open cleanly. */
const OVERSHOOT = 1;

/** Height along a channel; a wave keeps descending, in one step per cell. */
function heightAt(profile: Profile, from: number, to: number, t: number, cells: number): number {
  const progress = profile === 'wave' ? t - Math.sin(2 * Math.PI * cells * t) / (2 * Math.PI * cells) : t;
  return from + (to - from) * progress;
}

function sidePath(a: SidePort, b: SidePort, body: Body, profile: Profile): Vec3[] {
  const pa = portPosition(a, body);
  const pb = portPosition(b, body);
  const da = FACE_DIR[parseSide(a).face];
  const db = FACE_DIR[parseSide(b).face];
  const steps = CONFIG.curveSteps;
  const points: Vec3[] = [];

  if (da[0] === -db[0] && da[1] === -db[1]) {
    // Opposite faces: straight run, ramping between levels if needed.
    const cells = Math.max(1, Math.round(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / CONFIG.cubeSize));
    const n = profile === 'flat' ? 1 : steps * cells;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      points.push([
        pa[0] + (pb[0] - pa[0]) * t,
        pa[1] + (pb[1] - pa[1]) * t,
        heightAt(profile, pa[2], pb[2], t, cells),
      ]);
    }
  } else {
    // Adjacent faces only exist on one-cell footprints: quarter circle around the shared corner.
    const half = CONFIG.cubeSize / 2;
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
        heightAt(profile, pa[2], pb[2], t, 1),
      ]);
    }
  }

  return [
    [pa[0] + da[0] * OVERSHOOT, pa[1] + da[1] * OVERSHOOT, pa[2]],
    ...points,
    [pb[0] + db[0] * OVERSHOOT, pb[1] + db[1] * OVERSHOOT, pb[2]],
  ];
}

/** Vertical ports only exist on one-cell footprints. */
function verticalPath(side: SidePort, port: VerticalPort, section: Channel['section'], body: Body): Vec3[] {
  const half = CONFIG.cubeSize / 2;
  const { face, level } = parseSide(side);
  const [dx, dy] = FACE_DIR[face];
  const z = levelZ(level, body);
  const at = (u: number, h: number): Vec3 => [half + dx * u, half + dy * u, h];

  // A groove or underside channel simply ends over the centre of the piece.
  if (section === 'groove' || section === 'underside') return [at(half + OVERSHOOT, z), at(half, z), at(0, z)];

  const up = verticalKind(port) === 'U';
  const direction = up ? 1 : -1;
  const end = up ? bodyHeight(body) : 0;
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

/** Centre line of the ball through a channel. */
export function channelPath({ from, to, section, profile }: Channel, body: Body): Vec3[] {
  if (isVertical(from) && isVertical(to)) {
    const half = CONFIG.cubeSize / 2;
    return [
      [half, half, bodyHeight(body) + OVERSHOOT],
      [half, half, -OVERSHOOT],
    ];
  }
  if (isVertical(from)) return verticalPath(to as SidePort, from, section, body);
  if (isVertical(to)) return verticalPath(from as SidePort, to, section, body);
  return sidePath(from, to, body, profile);
}
