import type { Assembly } from '../assembly/model';
import type { Vec3 } from '../geometry/ports';
import { DEFAULT_PARAMS, simulateAssembly, type MarbleResult, type Outcome, type SimParams } from './marble';

export { positionAt } from './marble';

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
  /** When it happened, for an encounter between marbles. */
  time?: number;
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
      // Marbles can meet anywhere along a piece, so encounters are told apart by place.
      const place = result.outcome === 'collision' ? result.position.map((v) => Math.round(v / 20)).join(',') : pieceId;
      const key = `${result.outcome}|${place}`;
      const known = problems.get(key);
      if (known) known.crrs = [...new Set([...known.crrs, crr])];
      else problems.set(key, { outcome: result.outcome, position: result.position, pieceId, crrs: [crr], time: result.outcome === 'collision' ? result.time : undefined });
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
