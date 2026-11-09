import type { Assembly } from '../assembly/model';
import { buildRunGraph, facing, isEntry, isExit, landingDrop, MAX_DROP, projectOnPath, type End, type Run, type RunGraph } from '../assembly/runs';
import type { Vec3 } from '../geometry/ports';

/** Every value is an assumption until measured on printed pieces (PLAN-3, section 5.3). */
export interface SimParams {
  /** Rolling resistance coefficient. */
  crr: number;
  /** Share of the speed kept when crossing a joint between pieces. */
  jointRetention: number;
  /** Share of the speed kept when landing after a fall. */
  jumpRetention: number;
  /** Lean angle in an open curve, in degrees, beyond which the marble leaves the channel. */
  maxLean: number;
  /** Fixed time step, in seconds, so that every run gives the same result. */
  dt: number;
  /** Gravity, in mm/s². */
  gravity: number;
  /** Longest time simulated, in seconds. */
  timeLimit: number;
  /** Speed given to the marble at the start, in mm/s. */
  startSpeed: number;
}

export const DEFAULT_PARAMS: SimParams = {
  crr: 0.02,
  jointRetention: 0.95,
  jumpRetention: 0.7,
  maxLean: 60,
  dt: 0.001,
  gravity: 9810,
  timeLimit: 120,
  startSpeed: 0,
};

/** `finished`: the marble came to rest at a stop or left through a hole onto the table. */
export type Outcome = 'finished' | 'stopped' | 'derailed' | 'noConnection' | 'timeout';

export interface Sample {
  time: number;
  position: Vec3;
  speed: number;
}

export interface MarbleResult {
  outcome: Outcome;
  time: number;
  maxSpeed: number;
  finalSpeed: number;
  position: Vec3;
  /** Pieces the marble went through, in order. */
  pieceIds: string[];
  samples: Sample[];
}

/** A rolling sphere keeps 5/7 of the acceleration; a falling one, in a vertical bore, all of it. */
const ROLLING_FACTOR = 5 / 7;
const FREE_FALL_SINE = 0.95;
const SAMPLE_INTERVAL = 0.01;

const orientedPath = (run: Run): Vec3[] => (run.flow === 'backward' ? [...run.path].reverse() : run.path);
const exitOf = (run: Run): End => run.ends[run.flow === 'forward' ? 1 : 0];
const segmentLength = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

function direction(a: Vec3, b: Vec3): Vec3 {
  const length = segmentLength(a, b) || 1;
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Radius of the horizontal circle through three points; infinite on a straight line. */
function horizontalRadius(a: Vec3, b: Vec3, c: Vec3): number {
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  if (area < 1e-6) return Infinity;
  const [ab, bc, ca] = [Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1])];
  return (ab * bc * ca) / (2 * area);
}

/** Curve radius at the start of each segment of a path. */
function pathRadii(path: Vec3[]): number[] {
  return path.slice(0, -1).map((_, i) => (i === 0 ? Infinity : horizontalRadius(path[i - 1], path[i], path[i + 1])));
}

interface Step {
  run: Run;
  /** Index of the path segment on which the marble continues. */
  from: number;
  /** Distance already covered along that segment. */
  along: number;
  /** Height the marble falls on the way in. */
  drop: number;
}

/** Picks the continuation with the smallest fall, then the one that goes most nearly straight. */
function straightest(options: Step[], heading: Vec3): Step | null {
  if (options.length === 0) return null;
  const score = (step: Step) => {
    const path = orientedPath(step.run);
    return dot(heading, direction(path[step.from], path[step.from + 1]));
  };
  return [...options].sort((a, b) => a.drop - b.drop || score(b) - score(a))[0];
}

/** Where a marble goes after leaving a run; null when the track ends. */
function nextStep(run: Run, graph: RunGraph): Step | null {
  const path = orientedPath(run);
  const heading = direction(path[path.length - 2], path[path.length - 1]);
  const exit = exitOf(run);
  const [x, y, z] = exit.position;

  if (exit.vertical === 'U') {
    const inside = graph.runs.filter((other) => other !== run && other.piece === run.piece && other.flow && other.ends.some((e) => e.vertical === 'U' && isEntry(e)));
    return straightest(inside.map((other) => ({ run: other, from: 0, along: 0, drop: 0 })), heading);
  }

  if (exit.vertical === 'D') {
    const below = graph.runs.filter((other) => other.piece !== run.piece && landingDrop([x, y, z], other) !== null);
    return straightest(
      below.map((other) => {
        if (!other.flow) other.flow = 'forward';
        const points = orientedPath(other);
        const { index, t } = projectOnPath([x, y, z], points);
        return { run: other, from: index, along: t * segmentLength(points[index], points[index + 1]), drop: landingDrop([x, y, z], other) as number };
      }),
      heading,
    );
  }

  const options = facing(exit, graph.ends)
    .filter((other) => !isExit(other) && z - other.position[2] >= 0 && z - other.position[2] <= MAX_DROP)
    .map((other) => {
      if (!other.run.flow) other.run.flow = other.index === 0 ? 'forward' : 'backward';
      return { run: other.run, from: 0, along: 0, drop: z - other.position[2] };
    });
  return straightest(options, heading);
}

/** Paths nothing delivers into: where marbles are released, highest first. */
export function findStarts(graph: RunGraph): Run[] {
  const fed = new Set<Run>();
  for (const run of graph.runs) {
    if (!run.flow) continue;
    const next = nextStep(run, graph);
    if (next) fed.add(next.run);
  }
  const top = (run: Run) => orientedPath(run)[0][2];
  return graph.runs.filter((run) => run.flow && !fed.has(run)).sort((a, b) => top(b) - top(a));
}

/** How a track ends when nothing follows: a stop or the table is an arrival, anything else a gap. */
function endOfTrack(run: Run): Outcome {
  const exit = exitOf(run);
  if (exit.vertical === 'U') return 'finished';
  return exit.vertical === 'D' && exit.position[2] === 0 ? 'finished' : 'noConnection';
}

/** Rolls one marble from a starting path to wherever it ends up. */
function roll(start: Run, graph: RunGraph, params: SimParams): MarbleResult {
  const { crr, dt, gravity, timeLimit, startSpeed, jointRetention, jumpRetention, maxLean } = params;
  const leanLimit = Math.tan((maxLean * Math.PI) / 180);
  const samples: Sample[] = [];
  const pieceIds: string[] = [start.piece.id];
  let run = start;
  let path = orientedPath(run);
  let radii = pathRadii(path);
  let index = 0;
  let along = 0;
  let speed = startSpeed;
  let maxSpeed = speed;
  let time = 0;
  let nextSample = 0;

  const position = (): Vec3 => {
    const [a, b] = [path[index], path[index + 1]];
    const length = segmentLength(a, b);
    const t = length === 0 ? 0 : Math.min(1, along / length);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  const finish = (outcome: Outcome): MarbleResult => {
    const at = position();
    samples.push({ time, position: at, speed });
    return { outcome, time, maxSpeed, finalSpeed: speed, position: at, pieceIds, samples };
  };

  /** Follows the parabola of a fall, then returns how far along the next path the marble lands. */
  const fly = (exitPoint: Vec3, heading: Vec3, drop: number): number => {
    const down = Math.max(0, -heading[2] * speed);
    const flat = Math.hypot(heading[0], heading[1]) * speed;
    const duration = (-down + Math.sqrt(down * down + 2 * gravity * drop)) / gravity;
    const unit = Math.hypot(heading[0], heading[1]) || 1;
    for (let t = SAMPLE_INTERVAL; t < duration; t += SAMPLE_INTERVAL) {
      const fallen = down * t + 0.5 * gravity * t * t;
      samples.push({
        time: time + t,
        position: [exitPoint[0] + (heading[0] / unit) * flat * t, exitPoint[1] + (heading[1] / unit) * flat * t, exitPoint[2] - fallen],
        speed: Math.hypot(flat, down + gravity * t),
      });
    }
    time += duration;
    nextSample = time;
    const impact = Math.sqrt(speed * speed + 2 * gravity * drop);
    maxSpeed = Math.max(maxSpeed, impact);
    speed = impact * jumpRetention;
    return flat * duration;
  };

  /** Moves along the current path, stopping at its last point. */
  const advance = (distance: number) => {
    along += distance;
    while (along >= segmentLength(path[index], path[index + 1]) && index + 2 < path.length) {
      along -= segmentLength(path[index], path[index + 1]);
      index += 1;
    }
  };

  for (;;) {
    if (time >= nextSample) {
      samples.push({ time, position: position(), speed });
      nextSample += SAMPLE_INTERVAL;
    }
    if (time >= timeLimit) return finish('timeout');

    const [a, b] = [path[index], path[index + 1]];
    const length = segmentLength(a, b);
    const sine = length === 0 ? 0 : (a[2] - b[2]) / length;
    const cosine = Math.sqrt(Math.max(0, 1 - sine * sine));
    const acceleration = sine >= FREE_FALL_SINE ? gravity * sine : ROLLING_FACTOR * gravity * (sine - crr * cosine);

    speed += acceleration * dt;
    if (speed <= 0) {
      speed = 0;
      return finish('stopped');
    }
    maxSpeed = Math.max(maxSpeed, speed);

    if (!run.guarded && (speed * speed) / (radii[index] * gravity) > leanLimit) return finish('derailed');

    along += speed * dt;
    time += dt;

    while (along >= segmentLength(path[index], path[index + 1])) {
      if (index + 2 < path.length) {
        along -= segmentLength(path[index], path[index + 1]);
        index += 1;
        continue;
      }
      const next = nextStep(run, graph);
      if (!next) {
        along = segmentLength(path[index], path[index + 1]);
        return finish(endOfTrack(run));
      }

      const exitPoint = path[path.length - 1];
      const heading = direction(path[path.length - 2], exitPoint);
      const changesPiece = next.run.piece !== run.piece;
      const flight = next.drop > 0 ? fly(exitPoint, heading, next.drop) : 0;
      if (next.drop === 0 && changesPiece) speed *= jointRetention;

      run = next.run;
      path = orientedPath(run);
      radii = pathRadii(path);
      index = next.from;
      along = next.along;
      advance(flight);
      if (pieceIds[pieceIds.length - 1] !== run.piece.id) pieceIds.push(run.piece.id);
    }
  }
}

/** Simulates one marble from each starting point of an assembly. */
export function simulateAssembly(assembly: Assembly, overrides: Partial<SimParams> = {}): MarbleResult[] {
  const params = { ...DEFAULT_PARAMS, ...overrides };
  const graph = buildRunGraph(assembly);
  return findStarts(graph).map((start) => roll(start, graph, params));
}
