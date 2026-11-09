import type { ManifoldToplevel } from 'manifold-3d';
import './style.css';
import { buildPiece, type BuildResult } from './geometry/piece';
import { channel, normalizeBody, portsFor, SHAPES, UNIT_BODY, type Body, type Channel, type PieceSpec, type Port, type Shape } from './geometry/ports';
import { CALIBRATION, CALIBRATION_THICKNESS, LIBRARY, PRESETS } from './geometry/presets';
import { toBinaryStl } from './geometry/stl';
import { validateDesign, type IssueCode } from './geometry/validate';
import { loadManifold } from './geometry/wasm';
import { LANGS, portName, translate, type Lang, type StringKey } from './ui/i18n';
import { Viewer } from './ui/viewer';

const STORAGE_KEY = 'marble-cube-designer';

const WIDTHS = [1, 2];
const LENGTHS = [1, 2, 3];
const HEIGHTS = [0.5, 1, 1.5, 2];
const SHAPE_LABELS: Record<Shape, StringKey> = {
  box: 'shapeBox',
  cylinder: 'shapeCylinder',
  halfCylinder: 'shapeHalfCylinder',
  arch: 'shapeArch',
  roof: 'shapeRoof',
};

interface Saved {
  lang: Lang;
  spec: PieceSpec;
}

/** Designs saved before lanes existed use ports like "N.T"; they now read "N.T.0". */
const migratePort = (port: string) => (/\.\d$/.test(port) ? port : `${port}.0`) as Port;

function loadBody(raw: Partial<Body> | undefined): Body {
  const size = raw?.size;
  const valid = size?.length === 3 && WIDTHS.includes(size[0]) && LENGTHS.includes(size[1]) && HEIGHTS.includes(size[2]);
  if (!valid || !raw?.shape || !SHAPES.includes(raw.shape)) return UNIT_BODY;
  return normalizeBody({ shape: raw.shape, size });
}

function load(): Saved {
  const fallback: Saved = { lang: 'eu', spec: PRESETS.curveTop };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!data) return fallback;
    const body = loadBody(data.spec?.body);
    const available = portsFor(body);
    const stored = (data.spec?.channels ?? data.channels ?? data.segments) as { from: string; to: string }[];
    const channels = stored
      .map((s) => ({ from: migratePort(s.from), to: migratePort(s.to) }))
      .filter((s) => available.includes(s.from) && available.includes(s.to))
      .map((s) => channel(s.from, s.to));
    const lang = LANGS.includes(data.lang) ? (data.lang as Lang) : fallback.lang;
    return { lang, spec: { body, channels } };
  } catch {
    return fallback;
  }
}

const saved = load();
const state = {
  lang: saved.lang,
  spec: saved.spec,
  picked: null as Port | null,
  from: 'N.T.0' as Port,
  to: 'S.T.0' as Port,
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang: state.lang, spec: state.spec }));
  } catch {
    // Storage can be unavailable (private mode); the design just won't be remembered.
  }
}

function rebuild() {
  if (!wasm || !viewer) return;
  try {
    state.result = buildPiece(wasm, state.spec);
    state.buildFailed = false;
    viewer.setResult(state.result);
  } catch (error) {
    console.error(error);
    state.result = null;
    state.buildFailed = true;
  }
}

/** Keeps the port selectors on ports the current body actually has. */
function syncPortSelection() {
  const available = portsFor(state.spec.body);
  if (!available.length) return;
  if (!available.includes(state.from)) state.from = available[0];
  if (!available.includes(state.to)) state.to = available[available.length - 1];
}

function setSpec(spec: PieceSpec) {
  const bodyChanged = JSON.stringify(spec.body) !== JSON.stringify(state.spec.body);
  state.spec = spec;
  state.rejected = null;
  if (bodyChanged) {
    state.picked = null;
    viewer?.setBody(spec.body);
    syncPortSelection();
  }
  persist();
  rebuild();
  render();
}

const setChannels = (channels: Channel[]) => setSpec({ body: state.spec.body, channels });

function setBody(next: Body) {
  const body = normalizeBody(next);
  const available = portsFor(body);
  const channels = state.spec.channels
    .filter((c) => available.includes(c.from) && available.includes(c.to))
    .map((c) => channel(c.from, c.to));
  setSpec({ body, channels });
}

function addChannel(added: Channel) {
  const candidate = [...state.spec.channels, added];
  const blocking = validateDesign({ body: state.spec.body, channels: candidate }).find((issue) => issue.code !== 'thinWall');
  if (blocking) {
    state.rejected = blocking.code;
    render();
    return;
  }
  setChannels(candidate);
}

function onPortClick(port: Port) {
  if (state.picked === null) {
    state.picked = port;
  } else {
    const from = state.picked;
    state.picked = null;
    viewer?.setSelected(null);
    addChannel(channel(from, port));
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

function exportPiece() {
  if (!state.result) return;
  const { body, channels } = state.spec;
  const id = channels.map((s) => `${s.from}-${s.to}`.replace(/\.0/g, '').replace(/\./g, '')).join('_');
  const name = [`${body.shape}-${body.size.join('x')}`, id].filter(Boolean).join('-');
  download(toBinaryStl(state.result.positions, state.result.triangles, name), `${name}.stl`);
}

function exportCalibration() {
  if (!wasm) return;
  const { positions, triangles } = buildPiece(wasm, CALIBRATION, { sliceThickness: CALIBRATION_THICKNESS });
  download(toBinaryStl(positions, triangles, 'calibration'), 'calibration-piece.stl');
}

function portOptions(selected: Port, ports: Port[]): string {
  return ports.map((p) => `<option value="${p}"${p === selected ? ' selected' : ''}>${portName(state.lang, p)}</option>`).join('');
}

function sizeOptions(values: number[], selected: number): string {
  return values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v * 50} mm</option>`).join('');
}

function renderBodyEditor(body: Body): string {
  const [x, y, z] = body.size;
  const shapes = SHAPES.map((s) => `<option value="${s}"${s === body.shape ? ' selected' : ''}>${t(SHAPE_LABELS[s])}</option>`).join('');
  return `
    <h2>${t('body')}</h2>
    <div class="params">
      <label class="full">${t('shape')}<select id="shape">${shapes}</select></label>
      <label>${t('width')}<select id="sizeX">${sizeOptions(WIDTHS, x)}</select></label>
      <label>${t('length')}<select id="sizeY"${body.shape === 'cylinder' ? ' disabled' : ''}>${sizeOptions(LENGTHS, y)}</select></label>
      <label>${t('height')}<select id="sizeZ">${sizeOptions(HEIGHTS, z)}</select></label>
    </div>`;
}

function renderChannelEditor(spec: PieceSpec, ports: Port[], notices: string): string {
  if (ports.length === 0) return `<p class="hint">${t('noPorts')}</p>${notices}`;
  return `
    <h2>${t('custom')}</h2>
    <div class="adder">
      <select id="from" aria-label="from">${portOptions(state.from, ports)}</select>
      <select id="to" aria-label="to">${portOptions(state.to, ports)}</select>
      <button class="btn" id="add">${t('add')}</button>
    </div>

    <h2>${t('segments')}</h2>
    ${spec.channels.length === 0 ? `<p class="empty">${t('empty')}</p>` : `
      <ul class="segments">
        ${spec.channels.map((s, i) => `<li><span>${portName(state.lang, s.from)} → ${portName(state.lang, s.to)}</span><button data-remove="${i}" title="${t('remove')}" aria-label="${t('remove')}">×</button></li>`).join('')}
      </ul>
      <button class="btn wide" id="clear">${t('clear')}</button>`}
    ${notices}`;
}

function render() {
  document.documentElement.lang = state.lang;
  const { spec, result } = state;
  const ports = portsFor(spec.body);
  const issues = validateDesign(spec);
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

    ${LIBRARY.map(({ category, items }) => `
      <h2>${t(category)}</h2>
      <div class="presets">
        ${items.map((key) => `<button class="btn" data-preset="${key}">${t(key as StringKey)}</button>`).join('')}
      </div>`).join('')}

    ${renderBodyEditor(spec.body)}
    ${renderChannelEditor(spec, ports, notices)}
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
    setSpec(PRESETS[preset]);
  } else if (remove !== undefined) {
    setChannels(state.spec.channels.filter((_, i) => i !== Number(remove)));
  } else if (target.id === 'add') {
    addChannel(channel(state.from, state.to));
  } else if (target.id === 'clear') {
    setChannels([]);
  } else if (target.id === 'export') {
    exportPiece();
  } else if (target.id === 'calibration') {
    exportCalibration();
  }
});

panel.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const { body } = state.spec;
  const [x, y, z] = body.size;

  if (target.id === 'from') state.from = target.value as Port;
  else if (target.id === 'to') state.to = target.value as Port;
  else if (target.id === 'shape') setBody({ shape: target.value as Shape, size: [x, y, z] });
  else if (target.id === 'sizeX') setBody({ shape: body.shape, size: [Number(target.value), y, z] });
  else if (target.id === 'sizeY') setBody({ shape: body.shape, size: [x, Number(target.value), z] });
  else if (target.id === 'sizeZ') setBody({ shape: body.shape, size: [x, y, Number(target.value)] });
  else if (target.id === 'xray') {
    state.seeThrough = (target as HTMLInputElement).checked;
    viewer?.setSeeThrough(state.seeThrough);
  }
});

syncPortSelection();
render();
viewer = new Viewer(document.querySelector<HTMLElement>('#viewport')!, onPortClick);
viewer.setBody(state.spec.body);
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
