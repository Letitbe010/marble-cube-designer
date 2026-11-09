import type { Assembly } from '../assembly/model';
import { buildRunGraph, facing, isEntry, isExit, landingDrop, MAX_DROP, projectOnPath, type End, type Run, type RunGraph } from '../assembly/runs';
import type { Vec3 } from '../geometry/ports';

export interface SimParams {
  /** Rolling resistance coefficient; an assumption until measured on printed pieces. */
  crr: number;
  /** Fixed time step, in seconds, so that every run gives the same result. */
  dt: number;
  /** Gravity, in mm/s². */
  gravity: number;
  /** Longest time simulated, in seconds. */
  timeLimit: number;
  /** Speed given to the marble at the start, in mm/s. */
  startSpeed: number;
}

export const DEFAULT_PARAMS: SimParams = { crr: 0.02, dt: 0.001, gravity: 9810, timeLimit: 120, startSpeed: 0 };

export type Outcome = 'end' | 'stopped' | 'timeout';

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

function direction(a: Vec3, b: Vec3): Vec3 {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Step {
  run: Run;
  /** Index of the path segment on which the marble continues. */
  from: number;
  /** Distance already covered along that segment. */
  along: number;
  /** Height the marble falls on the way in. */
  drop: number;
}

/** Picks the continuation that keeps the marble going most nearly straight. */
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
        const [a, b] = [points[index], points[index + 1]];
        return { run: other, from: index, along: t * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), drop: landingDrop([x, y, z], other) as number };
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

/** Rolls one marble from a starting path to wherever it ends up. */
function roll(start: Run, graph: RunGraph, params: SimParams): MarbleResult {
  const { crr, dt, gravity, timeLimit, startSpeed } = params;
  const samples: Sample[] = [];
  const pieceIds: string[] = [];
  let run = start;
  let path = orientedPath(run);
  let index = 0;
  let along = 0;
  let speed = startSpeed;
  let maxSpeed = speed;
  let time = 0;
  let nextSample = 0;

  const position = (): Vec3 => {
    const [a, b] = [path[index], path[index + 1]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const t = length === 0 ? 0 : along / length;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  const finish = (outcome: Outcome): MarbleResult => {
    const at = position();
    samples.push({ time, position: at, speed });
    return { outcome, time, maxSpeed, finalSpeed: speed, position: at, pieceIds, samples };
  };

  pieceIds.push(run.piece.id);
  for (;;) {
    if (time >= nextSample) {
      samples.push({ time, position: position(), speed });
      nextSample += SAMPLE_INTERVAL;
    }
    if (time >= timeLimit) return finish('timeout');

    const [a, b] = [path[index], path[index + 1]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const sine = length === 0 ? 0 : (a[2] - b[2]) / length;
    const cosine = Math.sqrt(Math.max(0, 1 - sine * sine));
    const acceleration = sine >= FREE_FALL_SINE ? gravity * sine : ROLLING_FACTOR * gravity * (sine - crr * cosine);

    speed += acceleration * dt;
    if (speed <= 0) {
      speed = 0;
      return finish('stopped');
    }
    maxSpeed = Math.max(maxSpeed, speed);
    along += speed * dt;
    time += dt;

    while (along >= Math.hypot(path[index + 1][0] - path[index][0], path[index + 1][1] - path[index][1], path[index + 1][2] - path[index][2])) {
      along -= Math.hypot(path[index + 1][0] - path[index][0], path[index + 1][1] - path[index][1], path[index + 1][2] - path[index][2]);
      if (index + 2 < path.length) {
        index += 1;
        continue;
      }
      const next = nextStep(run, graph);
      if (!next) {
        along = Math.hypot(path[index + 1][0] - path[index][0], path[index + 1][1] - path[index][1], path[index + 1][2] - path[index][2]);
        return finish('end');
      }
      // A fall gains the speed of free fall; S2 replaces this with a proper jump.
      speed = Math.sqrt(speed * speed + 2 * gravity * next.drop);
      maxSpeed = Math.max(maxSpeed, speed);
      run = next.run;
      path = orientedPath(run);
      index = next.from;
      along = next.along;
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
