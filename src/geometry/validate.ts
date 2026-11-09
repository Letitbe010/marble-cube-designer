import { boreRadius, CONFIG } from './config';
import { channelPath } from './paths';
import {
  channel,
  channelKey,
  isLowBody,
  isVertical,
  parseSide,
  portsFor,
  type Body,
  type Channel,
  type PieceSpec,
  type Port,
  type Vec3,
} from './ports';

export type IssueCode = 'samePort' | 'sameFace' | 'duplicate' | 'badSection' | 'thinWall';

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

const levelOf = (port: Port) => (isVertical(port) ? null : parseSide(port).level);

/** A slot needs a clear way up, and a closed tunnel needs a piece tall enough to hold it. */
function sectionFits(c: Channel, body: Body): boolean {
  const levels = [levelOf(c.from), levelOf(c.to)];
  if (c.section === 'slot') return !levels.includes(null) && !levels.includes('B');
  if (c.section === 'tunnel' && isLowBody(body)) return !levels.includes('M');
  return true;
}

/** Refits channels to a body, keeping their section and profile where the body allows it. */
export function adaptChannels(channels: Pick<Channel, 'from' | 'to' | 'section' | 'profile'>[], body: Body): Channel[] {
  const available = portsFor(body);
  const result: Channel[] = [];
  for (const c of channels) {
    if (!available.includes(c.from) || !available.includes(c.to)) continue;
    const candidates = [channel(c.from, c.to, body, { section: c.section, profile: c.profile }), channel(c.from, c.to, body)];
    const fit = candidates.find((candidate) =>
      validateDesign({ body, channels: [...result, candidate] }).every((issue) => issue.code === 'thinWall'),
    );
    if (fit) result.push(fit);
  }
  return result;
}

/** Checks a design for impossible channels and walls too thin to print. */
export function validateDesign({ body, channels }: PieceSpec): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, number>();

  channels.forEach((s, i) => {
    if (s.from === s.to) issues.push({ code: 'samePort', segments: [i] });
    else if (!isVertical(s.from) && !isVertical(s.to) && parseSide(s.from).face === parseSide(s.to).face) {
      issues.push({ code: 'sameFace', segments: [i] });
    } else if (!sectionFits(s, body)) {
      issues.push({ code: 'badSection', segments: [i] });
    }
    const key = channelKey(s);
    const previous = seen.get(key);
    if (previous !== undefined) issues.push({ code: 'duplicate', segments: [previous, i] });
    else seen.set(key, i);
  });
  if (issues.length) return issues;

  const paths = channels.map((c) => channelPath(c, body));
  const limit = 2 * boreRadius() + CONFIG.minWall;
  for (let i = 0; i < channels.length; i++) {
    for (let j = i + 1; j < channels.length; j++) {
      const ports = new Set([channels[i].from, channels[i].to]);
      if (ports.has(channels[j].from) || ports.has(channels[j].to)) continue;
      const distance = pathDistance(paths[i], paths[j]);
      // Paths that truly meet are an intended crossing; near misses leave a fragile sliver.
      if (distance >= CROSSING_TOLERANCE && distance < limit) issues.push({ code: 'thinWall', segments: [i, j] });
    }
  }
  return issues;
}
