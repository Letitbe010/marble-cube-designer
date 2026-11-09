import { boreRadius, CONFIG } from './config';
import { segmentPath } from './paths';
import { isVertical, parseSide, segmentKey, type Segment, type Vec3 } from './ports';

export type IssueCode = 'samePort' | 'sameFace' | 'duplicate' | 'thinWall';

export interface Issue {
  code: IssueCode;
  segments: number[];
}

function pointSegmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len2));
  return Math.hypot(a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]);
}

/** Subdivides a polyline so point-to-polyline distances approximate the true gap. */
function densify(path: Vec3[], maxStep = 1): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / maxStep));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

function pathDistance(a: Vec3[], b: Vec3[]): number {
  let best = Infinity;
  for (const p of densify(a)) {
    for (let i = 0; i < b.length - 1; i++) best = Math.min(best, pointSegmentDistance(p, b[i], b[i + 1]));
  }
  return best;
}

const CROSSING_TOLERANCE = 1;

/** Checks a design for impossible segments and walls too thin to print. */
export function validateDesign(segments: Segment[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, number>();

  segments.forEach((s, i) => {
    if (s.from === s.to) issues.push({ code: 'samePort', segments: [i] });
    else if (!isVertical(s.from) && !isVertical(s.to) && parseSide(s.from).face === parseSide(s.to).face) {
      issues.push({ code: 'sameFace', segments: [i] });
    }
    const key = segmentKey(s);
    const previous = seen.get(key);
    if (previous !== undefined) issues.push({ code: 'duplicate', segments: [previous, i] });
    else seen.set(key, i);
  });
  if (issues.length) return issues;

  const paths = segments.map(segmentPath);
  const limit = 2 * boreRadius() + CONFIG.minWall;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const ports = new Set([segments[i].from, segments[i].to]);
      if (ports.has(segments[j].from) || ports.has(segments[j].to)) continue;
      const distance = pathDistance(paths[i], paths[j]);
      // Paths that truly meet are an intended crossing; near misses leave a fragile sliver.
      if (distance >= CROSSING_TOLERANCE && distance < limit) issues.push({ code: 'thinWall', segments: [i, j] });
    }
  }
  return issues;
}
