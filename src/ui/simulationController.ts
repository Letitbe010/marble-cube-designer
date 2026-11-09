import type { Assembly } from '../assembly/model';
import { evaluateAssembly, MIDDLE_CASE, positionAt, type Evaluation, type Verdict } from '../simulation/evaluate';
import { DEFAULT_PARAMS, type Outcome, type SimParams } from '../simulation/marble';
import type { AssemblyView } from './assemblyView';
import type { StringKey } from './i18n';

export interface SimulationDeps {
  view: AssemblyView;
  assembly: () => Assembly;
  t: (key: StringKey, values?: Record<string, string>) => string;
  onChange: () => void;
}

const RATES = [0.25, 0.5, 1, 2];
const VERDICT_LABELS: Record<Verdict, StringKey> = { good: 'verdictGood', marginal: 'verdictMarginal', problem: 'verdictProblem' };
const OUTCOME_LABELS: Record<Outcome, StringKey> = {
  finished: 'outcomeFinished',
  stopped: 'outcomeStopped',
  derailed: 'outcomeDerailed',
  noConnection: 'outcomeNoConnection',
  timeout: 'outcomeTimeout',
  collision: 'outcomeCollision',
};

const FIELDS = [
  { id: 'simCrr', param: 'crr', label: 'simCrr', step: 0.005, scale: 1 },
  { id: 'simJoint', param: 'jointRetention', label: 'simJoint', step: 1, scale: 100 },
  { id: 'simJump', param: 'jumpRetention', label: 'simJump', step: 1, scale: 100 },
  { id: 'simLean', param: 'maxLean', label: 'simLean', step: 1, scale: 1 },
] as const;

/** The simulation tab: runs an assembly, then plays the middle case back in the 3D view. */
export class SimulationController {
  private params: SimParams = { ...DEFAULT_PARAMS };
  private evaluation: Evaluation | null = null;
  private playing = false;
  private rate = 1;
  private clock = 0;

  constructor(private readonly deps: SimulationDeps) {}

  private journeys() {
    return (this.evaluation?.marbles ?? []).map((m) => m.cases[MIDDLE_CASE].result);
  }

  private get duration() {
    return Math.max(0, ...this.journeys().map((r) => r.time));
  }

  private recompute() {
    this.evaluation = evaluateAssembly(this.deps.assembly(), this.params);
    this.playing = false;
    this.clock = 0;
    const { view } = this.deps;
    view.setTrails(this.journeys().map((r) => r.samples));
    view.setProblems(this.evaluation.problems.map((p) => p.position));
    this.placeMarbles();
  }

  private placeMarbles() {
    this.deps.view.setMarbles(this.journeys().map((r) => positionAt(r.samples, this.clock)));
  }

  private showClock() {
    const element = document.querySelector('#simClock');
    if (element) element.textContent = `${this.clock.toFixed(2)} s`;
  }

  private tick(elapsed: number) {
    if (!this.playing) return;
    this.clock = Math.min(this.duration, this.clock + elapsed * this.rate);
    this.placeMarbles();
    this.showClock();
    if (this.clock >= this.duration) {
      this.playing = false;
      this.deps.onChange();
    }
  }

  enter() {
    this.deps.view.onFrame = (elapsed) => this.tick(elapsed);
    this.recompute();
  }

  leave() {
    this.playing = false;
    this.deps.view.onFrame = null;
    this.deps.view.clearOverlay();
  }

  handleClick(target: HTMLElement) {
    const { sim, simProblem } = target.dataset;
    if (simProblem !== undefined) {
      const problem = this.evaluation?.problems[Number(simProblem)];
      if (problem) this.deps.view.focus(problem.position);
      return;
    }
    if (sim === 'play') {
      if (this.clock >= this.duration) this.clock = 0;
      this.playing = true;
    } else if (sim === 'pause') {
      this.playing = false;
    } else if (sim === 'reset') {
      this.playing = false;
      this.clock = 0;
      this.placeMarbles();
    } else if (sim === 'defaults') {
      this.params = { ...DEFAULT_PARAMS };
      this.recompute();
    } else return;
    this.deps.onChange();
  }

  handleChange(target: HTMLInputElement | HTMLSelectElement) {
    if (target.id === 'simRate') {
      this.rate = Number(target.value);
      return;
    }
    if (target.id === 'simCount') {
      this.params = { ...this.params, marbleCount: Number(target.value) as 1 | 2 };
      this.recompute();
      this.deps.onChange();
      return;
    }
    if (target.id === 'simDelay') {
      const delay = Number(target.value);
      if (!Number.isFinite(delay) || delay < 0) return;
      this.params = { ...this.params, followDelay: delay };
      this.recompute();
      this.deps.onChange();
      return;
    }
    const field = FIELDS.find((f) => f.id === target.id);
    const value = Number(target.value);
    if (!field || !Number.isFinite(value) || value < 0) return;
    this.params = { ...this.params, [field.param]: value / field.scale };
    this.recompute();
    this.deps.onChange();
  }

  private renderCases(): string {
    const { t } = this.deps;
    return (this.evaluation?.marbles ?? [])
      .map((marble, index) => {
        const rows = marble.cases
          .map(({ crr, result }) => `<tr><td>${crr.toFixed(3)}</td><td>${t(OUTCOME_LABELS[result.outcome])}</td><td>${result.time.toFixed(2)} s</td><td>${(result.maxSpeed / 1000).toFixed(2)} m/s</td></tr>`)
          .join('');
        return `<h3>${t('simMarble', { number: String(index + 1) })} · ${t(VERDICT_LABELS[marble.verdict])}</h3>
          <table class="sim-table"><thead><tr><th>Crr</th><th>${t('simOutcome')}</th><th>${t('simTime')}</th><th>${t('simMaxSpeed')}</th></tr></thead><tbody>${rows}</tbody></table>`;
      })
      .join('');
  }

  render(): string {
    const { t } = this.deps;
    const evaluation = this.evaluation;
    const verdict = evaluation?.verdict ?? null;
    const button = (attr: string, label: string, enabled = true) => `<button class="btn" ${attr}${enabled ? '' : ' disabled'}>${label}</button>`;
    const problems = (evaluation?.problems ?? [])
      .map((p, i) => `<button class="notice issue error" data-sim-problem="${i}">${t(OUTCOME_LABELS[p.outcome])}${p.time !== undefined ? ` · ${p.time.toFixed(2)} s` : ''} · ${p.crrs.length}/3</button>`)
      .join('');
    const fields = FIELDS.map((f) => {
      const value = (this.params[f.param] as number) * f.scale;
      return `<label>${t(f.label)}<input type="number" id="${f.id}" min="0" step="${f.step}" value="${Number(value.toFixed(3))}" /></label>`;
    }).join('');

    return `
      <p class="hint">${t('simHint')}</p>
      <h2>${t('simResult')}</h2>
      ${verdict ? `<div class="verdict ${verdict}">${t(VERDICT_LABELS[verdict])}</div>` : `<p class="empty">${t('simNoStart')}</p>`}
      ${problems}

      <h2>${t('simPlayback')}</h2>
      <p class="stats"><span id="simClock">${this.clock.toFixed(2)} s</span> / ${this.duration.toFixed(2)} s</p>
      <div class="presets files">
        ${this.playing ? button('data-sim="pause"', t('simPause')) : button('data-sim="play"', t('simPlay'), verdict !== null)}
        ${button('data-sim="reset"', t('simReset'), verdict !== null)}
      </div>
      <div class="params two">
        <label>${t('simRate')}<select id="simRate">${RATES.map((r) => `<option value="${r}"${r === this.rate ? ' selected' : ''}>${r}×</option>`).join('')}</select></label>
      </div>
      <p class="hint">${t('simLegend')}</p>

      ${this.renderCases()}

      <h2>${t('simMarbles')}</h2>
      <div class="params two">
        <label>${t('simCount')}<select id="simCount">
          <option value="1"${this.params.marbleCount === 1 ? ' selected' : ''}>1</option>
          <option value="2"${this.params.marbleCount === 2 ? ' selected' : ''}>2</option>
        </select></label>
        ${this.params.marbleCount === 2 ? `<label>${t('simDelay')}<input type="number" id="simDelay" min="0" step="0.1" value="${this.params.followDelay}" /></label>` : ''}
      </div>
      <p class="hint">${t('simMarblesHint')}</p>

      <h2>${t('simParams')}</h2>
      <div class="params two">${fields}</div>
      <button class="btn wide" data-sim="defaults">${t('simDefaults')}</button>
      <p class="hint">${t('simAssumptions')}</p>
    `;
  }
}
