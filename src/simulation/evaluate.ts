import type { Assembly } from '../assembly/model';
import type { Vec3 } from '../geometry/ports';
import { DEFAULT_PARAMS, simulateAssembly, type MarbleResult, type Outcome, type SimParams } from './marble';

export type Verdict = 'good' | 'marginal' | 'problem';

export interface CaseResult {
  crr: number;
  result: MarbleResult;
}

export interface MarbleEvaluation {
  /** One simulation per rolling resistance, from the lowest to the highest. */
  cases: CaseResult[];
  verdict: Verdict;
}

export interface Problem {
  outcome: Outcome;
  position: Vec3;
  pieceId: string;
  crrs: number[];
}

export interface Evaluation {
  marbles: MarbleEvaluation[];
  /** Null when the assembly has nowhere to release a marble. */
  verdict: Verdict | null;
  problems: Problem[];
}

/** Rolling resistance is the least known value, so each track is tried across a range of it. */
const CRR_FACTORS = [0.5, 1, 2.5];
export const MIDDLE_CASE = 1;

function verdictOf(arrivals: boolean[]): Verdict {
  if (arrivals.every(Boolean)) return 'good';
  return arrivals.some(Boolean) ? 'marginal' : 'problem';
}

/** Rates an assembly by how its marbles fare across the range of rolling resistance. */
export function evaluateAssembly(assembly: Assembly, overrides: Partial<SimParams> = {}): Evaluation {
  const params = { ...DEFAULT_PARAMS, ...overrides };
  const runs = CRR_FACTORS.map((factor) => {
    const crr = params.crr * factor;
    return { crr, results: simulateAssembly(assembly, { ...params, crr }) };
  });

  const marbles: MarbleEvaluation[] = runs[0].results.map((_, marble) => {
    const cases = runs.map(({ crr, results }) => ({ crr, result: results[marble] }));
    return { cases, verdict: verdictOf(cases.map((c) => c.result.outcome === 'finished')) };
  });

  const problems = new Map<string, Problem>();
  for (const { cases } of marbles) {
    for (const { crr, result } of cases) {
      if (result.outcome === 'finished') continue;
      const pieceId = result.pieceIds[result.pieceIds.length - 1];
      const key = `${result.outcome}|${pieceId}`;
      const known = problems.get(key);
      if (known) known.crrs.push(crr);
      else problems.set(key, { outcome: result.outcome, position: result.position, pieceId, crrs: [crr] });
    }
  }

  const verdicts = marbles.map((m) => m.verdict);
  let verdict: Verdict | null = null;
  if (verdicts.length) {
    if (verdicts.every((v) => v === 'good')) verdict = 'good';
    else if (verdicts.every((v) => v === 'problem')) verdict = 'problem';
    else verdict = 'marginal';
  }
  return { marbles, verdict, problems: [...problems.values()] };
}

/** Marble position at a moment of a recorded journey. */
export function positionAt(samples: MarbleResult['samples'], time: number): Vec3 {
  if (time <= samples[0].time) return samples[0].position;
  const last = samples[samples.length - 1];
  if (time >= last.time) return last.position;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].time <= time) low = middle;
    else high = middle;
  }
  const [a, b] = [samples[low], samples[high]];
  const t = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time);
  return [
    a.position[0] + (b.position[0] - a.position[0]) * t,
    a.position[1] + (b.position[1] - a.position[1]) * t,
    a.position[2] + (b.position[2] - a.position[2]) * t,
  ];
}
