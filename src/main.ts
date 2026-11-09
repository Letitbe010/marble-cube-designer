import type { ManifoldToplevel } from 'manifold-3d';
import './style.css';
import { buildCube, type BuildResult } from './geometry/cube';
import { ALL_PORTS, type Port, type Segment } from './geometry/ports';
import { CALIBRATION, CALIBRATION_THICKNESS, PRESETS } from './geometry/presets';
import { toBinaryStl } from './geometry/stl';
import { validateDesign, type IssueCode } from './geometry/validate';
import { loadManifold } from './geometry/wasm';
import { LANGS, portName, translate, type Lang, type StringKey } from './ui/i18n';
import { Viewer } from './ui/viewer';

const STORAGE_KEY = 'marble-cube-designer';

interface Saved {
  lang: Lang;
  segments: Segment[];
}

function load(): Saved {
  const fallback: Saved = { lang: 'eu', segments: [...PRESETS.curveTop] };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!data) return fallback;
    const segments = (data.segments as Segment[]).filter((s) => ALL_PORTS.includes(s.from) && ALL_PORTS.includes(s.to));
    const lang = LANGS.includes(data.lang) ? (data.lang as Lang) : fallback.lang;
    return { lang, segments };
  } catch {
    return fallback;
  }
}

const saved = load();
const state = {
  lang: saved.lang,
  segments: saved.segments,
  picked: null as Port | null,
  from: 'N.T' as Port,
  to: 'S.T' as Port,
  seeThrough: false,
  rejected: null as IssueCode | null,
  buildFailed: false,
  result: null as BuildResult | null,
};

const panel = document.querySelector<HTMLElement>('#panel')!;
const t = (key: StringKey, values?: Record<string, string>) => translate(state.lang, key, values);

let wasm: ManifoldToplevel | null = null;
let viewer: Viewer | null = null;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang: state.lang, segments: state.segments }));
  } catch {
    // Storage can be unavailable (private mode); the design just won't be remembered.
  }
}

function rebuild() {
  if (!wasm || !viewer) return;
  try {
    state.result = buildCube(wasm, state.segments);
    state.buildFailed = false;
    viewer.setResult(state.result);
  } catch (error) {
    console.error(error);
    state.result = null;
    state.buildFailed = true;
  }
}

function setSegments(segments: Segment[]) {
  state.segments = segments;
  state.rejected = null;
  persist();
  rebuild();
  render();
}

function addSegment(segment: Segment) {
  const candidate = [...state.segments, segment];
  const blocking = validateDesign(candidate).find((issue) => issue.code !== 'thinWall');
  if (blocking) {
    state.rejected = blocking.code;
    render();
    return;
  }
  setSegments(candidate);
}

function onPortClick(port: Port) {
  if (state.picked === null) {
    state.picked = port;
  } else {
    const from = state.picked;
    state.picked = null;
    viewer?.setSelected(null);
    addSegment({ from, to: port });
    return;
  }
  viewer?.setSelected(state.picked);
}

function download(buffer: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/stl' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCube() {
  if (!state.result) return;
  const id = state.segments.map((s) => `${s.from}-${s.to}`.replace(/\./g, '')).join('_') || 'blank';
  const name = `cube-${id}`;
  download(toBinaryStl(state.result.positions, state.result.triangles, name), `${name}.stl`);
}

function exportCalibration() {
  if (!wasm) return;
  const { positions, triangles } = buildCube(wasm, CALIBRATION, { sliceThickness: CALIBRATION_THICKNESS });
  download(toBinaryStl(positions, triangles, 'calibration'), 'calibration-piece.stl');
}

function portOptions(selected: Port): string {
  return ALL_PORTS.map((p) => `<option value="${p}"${p === selected ? ' selected' : ''}>${portName(state.lang, p)}</option>`).join('');
}

function render() {
  document.documentElement.lang = state.lang;
  const issues = validateDesign(state.segments);
  const { result } = state;
  const broken = result !== null && result.pieces !== 1;
  const canExport = result !== null && !broken;

  const notices = [
    state.rejected && `<div class="notice error">${t(state.rejected)}</div>`,
    ...issues.filter((i) => i.code === 'thinWall').slice(0, 1).map(() => `<div class="notice warn">${t('thinWall')}</div>`),
    broken && `<div class="notice error">${t('pieces')}</div>`,
    state.buildFailed && `<div class="notice error">${t('failed')}</div>`,
  ].filter(Boolean).join('');

  panel.innerHTML = `
    <header>
      <h1>Marble Cube Designer</h1>
      <div class="lang">${LANGS.map((l) => `<button data-lang="${l}" class="${l === state.lang ? 'active' : ''}">${l.toUpperCase()}</button>`).join('')}</div>
    </header>
    <p class="hint">${t('hint')}</p>

    <h2>${t('presets')}</h2>
    <div class="presets">
      ${Object.keys(PRESETS).map((key) => `<button class="btn" data-preset="${key}">${t(key as StringKey)}</button>`).join('')}
    </div>

    <h2>${t('custom')}</h2>
    <div class="adder">
      <select id="from" aria-label="from">${portOptions(state.from)}</select>
      <select id="to" aria-label="to">${portOptions(state.to)}</select>
      <button class="btn" id="add">${t('add')}</button>
    </div>

    <h2>${t('segments')}</h2>
    ${state.segments.length === 0 ? `<p class="empty">${t('empty')}</p>` : `
      <ul class="segments">
        ${state.segments.map((s, i) => `<li><span>${portName(state.lang, s.from)} → ${portName(state.lang, s.to)}</span><button data-remove="${i}" title="${t('remove')}" aria-label="${t('remove')}">×</button></li>`).join('')}
      </ul>
      <button class="btn wide" id="clear">${t('clear')}</button>`}
    ${notices}
    <label class="toggle"><input type="checkbox" id="xray"${state.seeThrough ? ' checked' : ''} /> ${t('xray')}</label>

    <h2>${t('export')}</h2>
    ${result ? `<p class="stats">${t('stats', { volume: (result.volume / 1000).toFixed(1), tris: String(result.triangles.length / 3) })}</p>` : wasm ? '' : `<p class="stats">${t('loading')}</p>`}
    <button class="btn primary" id="export"${canExport ? '' : ' disabled'}>${t('exportStl')}</button>
    <button class="btn wide" id="calibration"${wasm ? '' : ' disabled'}>${t('calibration')}</button>
    <p class="hint">${t('calibrationHint')}</p>

    <footer>${t('disclaimer')}</footer>
  `;
}

panel.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  const { lang, preset, remove } = target.dataset;

  if (lang) {
    state.lang = lang as Lang;
    persist();
    render();
  } else if (preset) {
    setSegments([...PRESETS[preset]]);
  } else if (remove !== undefined) {
    setSegments(state.segments.filter((_, i) => i !== Number(remove)));
  } else if (target.id === 'add') {
    addSegment({ from: state.from, to: state.to });
  } else if (target.id === 'clear') {
    setSegments([]);
  } else if (target.id === 'export') {
    exportCube();
  } else if (target.id === 'calibration') {
    exportCalibration();
  }
});

panel.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === 'from') state.from = target.value as Port;
  else if (target.id === 'to') state.to = target.value as Port;
  else if (target.id === 'xray') {
    state.seeThrough = (target as HTMLInputElement).checked;
    viewer?.setSeeThrough(state.seeThrough);
  }
});

render();
viewer = new Viewer(document.querySelector<HTMLElement>('#viewport')!, onPortClick);
loadManifold()
  .then((instance) => {
    wasm = instance;
    rebuild();
  })
  .catch((error) => {
    console.error(error);
    state.buildFailed = true;
  })
  .finally(render);
