import JSZip from 'jszip';
import type { ManifoldToplevel } from 'manifold-3d';
import './style.css';
import { buildPiece, type BuildResult } from './geometry/piece';
import { CAVITY_SIZES, cavityFits } from './geometry/cavities';
import { CAVITY_TYPES, channel, expectedSolids, isSpecialShape, isSpiral, isVertical, normalizeBody, parseSide, portsFor, SHAPES, type Body, type Cavity, type CavityType, type Channel, type PieceSpec, type Port, type Shape } from './geometry/ports';
import { HEIGHTS, LENGTHS, parseSpec, WIDTHS } from './geometry/specIo';
import { CALIBRATION, CALIBRATION_THICKNESS, LIBRARY, PRESETS } from './geometry/presets';
import { toBinaryStl } from './geometry/stl';
import { adaptChannels, validateDesign, type IssueCode } from './geometry/validate';
import type { Section } from './geometry/config';
import { buildPrintParts, canSplit, pieceId } from './geometry/print';
import { loadManifold } from './geometry/wasm';
import { LANGS, portName, SHAPE_LABELS, translate, type Lang, type StringKey } from './ui/i18n';
import { AssemblyController } from './ui/assemblyController';
import { SimulationController } from './ui/simulationController';
import { applyStoredCalibration } from './geometry/calibration';
import { exportCalibrationKit } from './geometry/kit';
import { CalibrationPanel } from './ui/calibrationPanel';
import { Viewer } from './ui/viewer';

applyStoredCalibration();

const STORAGE_KEY = 'marble-cube-designer';

const CAVITY_LABELS: Record<CavityType, StringKey> = {
  funnel: 'cavityFunnel',
  basin: 'cavityBasin',
  chamber: 'cavityChamber',
  spiral: 'cavitySpiral',
  spiralMirror: 'cavitySpiralMirror',
};

type SectionChoice = 'auto' | 'slot' | 'tunnel';
type ProfileChoice = 'linear' | 'wave';

const SECTION_LABELS: Record<Section, StringKey> = {
  groove: 'sectionGroove',
  slot: 'sectionSlot',
  tunnel: 'sectionTunnel',
  underside: 'sectionUnderside',
};

interface Saved {
  lang: Lang;
  spec: PieceSpec;
  locators: boolean;
}

function load(): Saved {
  const fallback: Saved = { lang: 'eu', spec: PRESETS.curveTop, locators: true };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!data) return fallback;
    const lang = LANGS.includes(data.lang) ? (data.lang as Lang) : fallback.lang;
    return { lang, spec: parseSpec(data), locators: data.locators !== false };
  } catch {
    return fallback;
  }
}

const usesSideLane = ({ from, to }: Channel) => [from, to].some((p) => !isVertical(p) && parseSide(p).lane !== 0);

const saved = load();
const state = {
  lang: saved.lang,
  spec: saved.spec,
  tab: 'piece' as 'piece' | 'assembly' | 'simulation' | 'calibration',
  picked: null as Port | null,
  from: 'N.T.0' as Port,
  to: 'S.T.0' as Port,
  section: 'auto' as SectionChoice,
  profile: 'linear' as ProfileChoice,
  cavityType: 'funnel' as CavityType,
  cavitySize: 20,
  cavityCell: [0, 0] as [number, number],
  split: false,
  engrave: true,
  locators: saved.locators,
  lanes: saved.spec.channels.some((c) => usesSideLane(c)),
  importFailed: false,
  seeThrough: false,
  rejected: null as IssueCode | null,
  buildFailed: false,
  result: null as BuildResult | null,
};

const panel = document.querySelector<HTMLElement>('#panel')!;
const topbar = document.querySelector<HTMLElement>('#topbar')!;
const ribbon = document.querySelector<HTMLElement>('#ribbon')!;
const ribbonTools = document.querySelector<HTMLElement>('#ribbonTools')!;
const overlay = document.querySelector<HTMLElement>('#asmOverlay')!;
const t = (key: StringKey, values?: Record<string, string>) => translate(state.lang, key, values);

let wasm: ManifoldToplevel | null = null;
let viewer: Viewer | null = null;
let assembly: AssemblyController | null = null;
let simulation: SimulationController | null = null;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang: state.lang, spec: state.spec, locators: state.locators }));
  } catch {
    // Storage can be unavailable (private mode); the design just won't be remembered.
  }
}

function rebuild() {
  if (!wasm || !viewer) return;
  try {
    state.result = buildPiece(wasm, state.spec, { locators: state.locators });
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
  const available = portsFor(state.spec.body, state.lanes);
  if (!available.length) return;
  if (!available.includes(state.from)) state.from = available[0];
  if (!available.includes(state.to)) state.to = available[available.length - 1];
}

function setSpec(spec: PieceSpec) {
  const bodyChanged = JSON.stringify(spec.body) !== JSON.stringify(state.spec.body);
  const lanesNeeded = !state.lanes && spec.channels.some((c) => usesSideLane(c));
  state.spec = spec;
  state.rejected = null;
  if (lanesNeeded) state.lanes = true;
  if (bodyChanged || lanesNeeded) {
    state.picked = null;
    viewer?.setBody(spec.body, state.lanes);
    syncPortSelection();
  }
  persist();
  rebuild();
  render();
}

const setChannels = (channels: Channel[]) => setSpec({ ...state.spec, channels });
const setCavities = (cavities: Cavity[]) => setSpec({ ...state.spec, cavities });

function setBody(next: Body) {
  const body = normalizeBody(next);
  setSpec({
    body,
    channels: adaptChannels(state.spec.channels, body),
    cavities: (state.spec.cavities ?? []).filter((c) => cavityFits(c, body)),
  });
}

function addCavity() {
  const added: Cavity = { type: state.cavityType, size: state.cavitySize, cell: state.cavityCell };
  const cavities = [...(state.spec.cavities ?? []), added];
  if (!cavityFits(added, state.spec.body)) {
    state.rejected = 'badCavity';
    render();
    return;
  }
  setCavities(cavities);
}

/** Builds a channel using the section and profile chosen in the editor. */
function newChannel(from: Port, to: Port): Channel {
  return channel(from, to, state.spec.body, {
    section: state.section === 'auto' ? undefined : state.section,
    profile: state.profile,
  });
}

function addChannel(added: Channel) {
  const candidate = [...state.spec.channels, added];
  const blocking = validateDesign({ ...state.spec, channels: candidate }).find((issue) => issue.code !== 'thinWall');
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
    addChannel(newChannel(from, port));
    return;
  }
  viewer?.setSelected(state.picked);
}

function download(content: ArrayBuffer | string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const STL_TYPE = 'model/stl';
const ZIP_TYPE = 'application/zip';

function pieceFileName(): string {
  const { body, channels, cavities = [] } = state.spec;
  const id = channels.map((s) => `${s.from}-${s.to}`.replace(/\.0/g, '').replace(/\./g, '')).join('_');
  return [`${body.shape}-${body.size.join('x')}`, id, ...cavities.map((c) => c.type)].filter(Boolean).join('-');
}

const stlOf = ({ positions, triangles }: BuildResult, name: string) => toBinaryStl(positions, triangles, name);

async function exportPiece() {
  if (!wasm) return;
  const { id, parts } = buildPrintParts(wasm, state.spec, { split: state.split, engrave: state.engrave, locators: state.locators });
  const name = `${id}-${pieceFileName()}`;
  if (parts.length === 1) {
    download(stlOf(parts[0].result, name), `${name}.stl`, STL_TYPE);
    return;
  }
  const zip = new JSZip();
  for (const { suffix, result } of parts) zip.file(`${name}-${suffix}.stl`, stlOf(result, name));
  download(await zip.generateAsync({ type: 'arraybuffer' }), `${name}.zip`, ZIP_TYPE);
}

async function exportLibrary() {
  if (!wasm) return;
  const zip = new JSZip();
  const manifest: string[] = ['id\tpiece\tvolume_cm3'];
  for (const [key, spec] of Object.entries(PRESETS)) {
    const { id, parts } = buildPrintParts(wasm, spec, { engrave: true, locators: state.locators });
    for (const { suffix, result } of parts) {
      const part = suffix ? `-${suffix}` : '';
      zip.file(`${key}-${id}${part}.stl`, stlOf(result, id));
      manifest.push(`${id}${part}\t${key}\t${(result.volume / 1000).toFixed(1)}`);
    }
  }
  zip.file('parts.txt', manifest.join('\n'));
  download(await zip.generateAsync({ type: 'arraybuffer' }), 'marble-cube-library.zip', ZIP_TYPE);
}

function saveDesign() {
  download(JSON.stringify({ version: 1, spec: state.spec }, null, 2), `${pieceFileName()}.json`, 'application/json');
}

async function loadDesign(file: File) {
  try {
    const spec = parseSpec(JSON.parse(await file.text()));
    state.importFailed = false;
    setSpec(spec);
  } catch {
    state.importFailed = true;
    render();
  }
}

function exportCalibration() {
  if (!wasm) return;
  const { positions, triangles } = buildPiece(wasm, CALIBRATION, { sliceThickness: CALIBRATION_THICKNESS });
  download(toBinaryStl(positions, triangles, 'calibration'), 'calibration-piece.stl', STL_TYPE);
}

function portOptions(selected: Port, ports: Port[]): string {
  return ports.map((p) => `<option value="${p}"${p === selected ? ' selected' : ''}>${portName(state.lang, p)}</option>`).join('');
}

function sizeOptions(values: number[], selected: number): string {
  return values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v * 50} mm</option>`).join('');
}

function renderBodyEditor(body: Body): string {
  if (isSpecialShape(body.shape)) return `<h2>${t('body')}</h2><p class="hint">${t(body.shape === 'seesaw' ? 'specialSeesaw' : body.shape === 'pendulum' ? 'specialPendulum' : body.shape === 'lift' ? 'specialLift' : 'specialLean')}</p>`;
  const [x, y, z] = body.size;
  const shapes = SHAPES.filter((s) => !isSpecialShape(s)).map((s) => `<option value="${s}"${s === body.shape ? ' selected' : ''}>${t(SHAPE_LABELS[s])}</option>`).join('');
  return `
    <h2>${t('body')}</h2>
    <div class="params">
      <label class="full">${t('shape')}<select id="shape">${shapes}</select></label>
      <label>${t('width')}<select id="sizeX">${sizeOptions(WIDTHS, x)}</select></label>
      <label>${t('length')}<select id="sizeY"${body.shape === 'cylinder' ? ' disabled' : ''}>${sizeOptions(LENGTHS, y)}</select></label>
      <label>${t('height')}<select id="sizeZ">${sizeOptions(HEIGHTS, z)}</select></label>
    </div>`;
}

function renderCavityEditor(spec: PieceSpec): string {
  if (spec.body.shape !== 'box') return '';
  const [width, length] = spec.body.size;
  const cavities = spec.cavities ?? [];
  const spiral = isSpiral(state.cavityType);
  const cells: string[] = [];
  for (let j = 0; j < length; j++) for (let i = 0; i < width; i++) cells.push(`${i},${j}`);
  const selectedCell = state.cavityCell.join(',');
  return `
    <h2>${t('features')}</h2>
    <div class="params">
      <label class="full">${t('featureType')}<select id="cavityType">
        ${CAVITY_TYPES.map((type) => `<option value="${type}"${type === state.cavityType ? ' selected' : ''}>${t(CAVITY_LABELS[type])}</option>`).join('')}
      </select></label>
      <label>${t('featureSize')}<select id="cavitySize"${spiral ? ' disabled' : ''}>
        ${CAVITY_SIZES.map((s) => `<option value="${s}"${s === state.cavitySize ? ' selected' : ''}>Ø ${s * 2} mm</option>`).join('')}
      </select></label>
      ${cells.length > 1 && !spiral ? `<label>${t('featureCell')}<select id="cavityCell">
        ${cells.map((cell) => `<option value="${cell}"${cell === selectedCell ? ' selected' : ''}>${cell.replace(',', ' · ')}</option>`).join('')}
      </select></label>` : ''}
      <button class="btn add-feature" id="addCavity">${t('add')}</button>
    </div>
    ${cavities.length ? `<ul class="segments">
      ${cavities.map((c, i) => `<li><span>${t(CAVITY_LABELS[c.type])}${isSpiral(c.type) ? '' : ` <small>Ø ${c.size * 2} mm</small>`}</span><button data-remove-cavity="${i}" title="${t('remove')}" aria-label="${t('remove')}">×</button></li>`).join('')}
    </ul>` : ''}`;
}

function renderChannelEditor(spec: PieceSpec, ports: Port[], notices: string): string {
  if (isSpecialShape(spec.body.shape)) return notices;
  if (ports.length === 0) return `<p class="hint">${t('noPorts')}</p>${notices}`;
  return `
    <h2>${t('custom')}</h2>
    <label class="toggle lanes"><input type="checkbox" id="lanes"${state.lanes ? ' checked' : ''} /> ${t('showLanes')}</label>
    <div class="adder">
      <select id="from" aria-label="from">${portOptions(state.from, ports)}</select>
      <select id="to" aria-label="to">${portOptions(state.to, ports)}</select>
      <button class="btn" id="add">${t('add')}</button>
    </div>
    <div class="params two">
      <label>${t('section')}<select id="section">
        <option value="auto"${state.section === 'auto' ? ' selected' : ''}>${t('sectionAuto')}</option>
        <option value="slot"${state.section === 'slot' ? ' selected' : ''}>${t('sectionSlot')}</option>
        <option value="tunnel"${state.section === 'tunnel' ? ' selected' : ''}>${t('sectionTunnel')}</option>
      </select></label>
      <label>${t('profile')}<select id="profile">
        <option value="linear"${state.profile === 'linear' ? ' selected' : ''}>${t('profileLinear')}</option>
        <option value="wave"${state.profile === 'wave' ? ' selected' : ''}>${t('profileWave')}</option>
      </select></label>
    </div>

    <h2>${t('segments')}</h2>
    ${spec.channels.length === 0 ? `<p class="empty">${t('empty')}</p>` : `
      <ul class="segments">
        ${spec.channels.map((s, i) => `<li><span>${portName(state.lang, s.from)} → ${portName(state.lang, s.to)} <small>${t(SECTION_LABELS[s.section])}${s.profile === 'wave' ? ` · ${t('profileWave')}` : ''}</small></span><button data-remove="${i}" title="${t('remove')}" aria-label="${t('remove')}">×</button></li>`).join('')}
      </ul>
      <button class="btn wide" id="clear">${t('clear')}</button>`}
    ${notices}`;
}

async function downloadCalibrationKit() {
  if (wasm) download(await exportCalibrationKit(wasm), 'calibration-kit.zip', ZIP_TYPE);
}

const calibrationPanel = new CalibrationPanel({ t, onChange: () => render(), downloadKit: () => void downloadCalibrationKit(), ready: () => wasm !== null });

function switchTab(next: typeof state.tab) {
  if (state.tab === 'simulation') simulation?.leave();
  state.tab = next;
  assembly?.setActive(next === 'assembly');
  if (next === 'simulation') simulation?.enter();
  render();
}

function renderTopbar(): string {
  const tab = (id: typeof state.tab, label: StringKey) => `<button class="tab${state.tab === id ? ' active' : ''}" data-tab="${id}">${t(label)}</button>`;
  return `
    <h1>Marble Cube Designer</h1>
    <nav class="tabs">${tab('piece', 'tabPiece')}${tab('assembly', 'tabAssembly')}${tab('simulation', 'tabSimulation')}${tab('calibration', 'tabCalibration')}</nav>
    <div class="lang">${LANGS.map((l) => `<button data-lang="${l}" class="${l === state.lang ? 'active' : ''}">${l.toUpperCase()}</button>`).join('')}</div>`;
}

function showTab() {
  const isAssembly = state.tab === 'assembly';
  const usesAssemblyView = isAssembly || state.tab === 'simulation';
  document.querySelector<HTMLElement>('#viewport')!.hidden = usesAssemblyView;
  document.querySelector<HTMLElement>('#assemblyViewport')!.hidden = !usesAssemblyView;
  document.querySelector<HTMLElement>('#workspace')!.classList.toggle('full', isAssembly);
  ribbon.hidden = !isAssembly;
  overlay.hidden = !isAssembly;
  panel.hidden = isAssembly;
}

/** Redraws the floating assembly card, keeping its list where the user scrolled it. */
function renderOverlay() {
  const scrolled = overlay.querySelector('.pop')?.scrollTop ?? 0;
  overlay.innerHTML = assembly?.renderOverlay() ?? '';
  const pop = overlay.querySelector('.pop');
  if (pop) pop.scrollTop = scrolled;
}

function render() {
  document.documentElement.lang = state.lang;
  topbar.innerHTML = renderTopbar();
  showTab();
  if (state.tab === 'assembly') {
    ribbonTools.innerHTML = assembly?.renderRibbon() ?? `<p class="stats">${t('loading')}</p>`;
    renderOverlay();
    return;
  }
  if (state.tab !== 'piece') {
    const body = state.tab === 'simulation' ? simulation?.render() : calibrationPanel.render();
    panel.innerHTML = `${body ?? `<p class="stats">${t('loading')}</p>`}<footer>${t('disclaimer')}</footer>`;
    return;
  }
  const { spec, result } = state;
  const ports = portsFor(spec.body, state.lanes);
  const issues = validateDesign(spec);
  const broken = result !== null && result.pieces !== expectedSolids(spec);
  const canExport = result !== null && !broken;

  const notices = [
    state.rejected && `<div class="notice error">${t(state.rejected)}</div>`,
    ...issues.filter((i) => i.code === 'thinWall').slice(0, 1).map(() => `<div class="notice warn">${t('thinWall')}</div>`),
    broken && `<div class="notice error">${t('pieces')}</div>`,
    state.buildFailed && `<div class="notice error">${t('failed')}</div>`,
    state.importFailed && `<div class="notice error">${t('badFile')}</div>`,
  ].filter(Boolean).join('');

  panel.innerHTML = `
    <p class="hint">${t('hint')}</p>

    ${LIBRARY.map(({ category, items }) => `
      <h2>${t(category)}</h2>
      <div class="presets">
        ${items.map((key) => `<button class="btn" data-preset="${key}">${t(key as StringKey)}</button>`).join('')}
      </div>`).join('')}

    ${renderBodyEditor(spec.body)}
    ${renderChannelEditor(spec, ports, notices)}
    ${renderCavityEditor(spec)}
    <label class="toggle"><input type="checkbox" id="xray"${state.seeThrough ? ' checked' : ''} /> ${t('xray')}</label>

    <h2>${t('export')}</h2>
    ${result ? `<p class="stats">${t('stats', { volume: (result.volume / 1000).toFixed(1), tris: String(result.triangles.length / 3) })}</p>` : wasm ? '' : `<p class="stats">${t('loading')}</p>`}
    <p class="stats">ID: ${pieceId(spec)}</p>
    ${canSplit(spec) ? `<label class="toggle"><input type="checkbox" id="split"${state.split ? ' checked' : ''} /> ${t('printSplit')}</label>` : ''}
    <label class="toggle"><input type="checkbox" id="locators"${state.locators ? ' checked' : ''} /> ${t('printLocators')}</label>
    ${result?.studs && result.studs.placed < result.studs.total ? `<div class="notice warn">${t('studsLost', { placed: String(result.studs.placed), total: String(result.studs.total) })}</div>` : ''}
    <label class="toggle"><input type="checkbox" id="engrave"${state.engrave ? ' checked' : ''} /> ${t('printEngrave')}</label>
    <button class="btn primary spaced" id="export"${canExport ? '' : ' disabled'}>${t('exportStl')}</button>
    <button class="btn wide" id="library"${wasm ? '' : ' disabled'}>${t('exportLibrary')}</button>
    <div class="presets files">
      <button class="btn" id="save">${t('saveDesign')}</button>
      <button class="btn" id="load">${t('loadDesign')}</button>
    </div>
    <input type="file" id="importFile" accept=".json,application/json" hidden />
    <button class="btn wide" id="calibration"${wasm ? '' : ' disabled'}>${t('calibration')}</button>
    <p class="hint">${t('calibrationHint')}</p>

    <footer>${t('disclaimer')}</footer>
  `;
}

const controlAreas = [topbar, panel, ribbonTools, overlay];

const onControlClick = (event: Event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  const { lang, preset, remove, removeCavity, tab } = target.dataset;

  if (tab) {
    switchTab(tab as typeof state.tab);
  } else if (lang) {
    state.lang = lang as Lang;
    persist();
    render();
  } else if (state.tab === 'assembly') {
    assembly?.handleClick(target);
  } else if (state.tab === 'simulation') {
    simulation?.handleClick(target);
  } else if (state.tab === 'calibration') {
    calibrationPanel.handleClick(target);
  } else if (preset) {
    setSpec(PRESETS[preset]);
  } else if (remove !== undefined) {
    setChannels(state.spec.channels.filter((_, i) => i !== Number(remove)));
  } else if (removeCavity !== undefined) {
    setCavities((state.spec.cavities ?? []).filter((_, i) => i !== Number(removeCavity)));
  } else if (target.id === 'addCavity') {
    addCavity();
  } else if (target.id === 'add') {
    addChannel(newChannel(state.from, state.to));
  } else if (target.id === 'clear') {
    setChannels([]);
  } else if (target.id === 'export') {
    void exportPiece();
  } else if (target.id === 'library') {
    void exportLibrary();
  } else if (target.id === 'save') {
    saveDesign();
  } else if (target.id === 'load') {
    panel.querySelector<HTMLInputElement>('#importFile')?.click();
  } else if (target.id === 'calibration') {
    exportCalibration();
  }
};

const onControlChange = (event: Event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === 'lanes') {
    state.lanes = (target as HTMLInputElement).checked;
    state.picked = null;
    viewer?.setBody(state.spec.body, state.lanes);
    syncPortSelection();
    render();
    return;
  }
  if (target.id === 'locators') {
    state.locators = (target as HTMLInputElement).checked;
    persist();
    rebuild();
    assembly?.refresh();
    render();
    return;
  }
  if (state.tab === 'assembly') {
    assembly?.handleChange(target);
    return;
  }
  if (state.tab === 'simulation') {
    simulation?.handleChange(target);
    return;
  }
  if (state.tab === 'calibration') {
    calibrationPanel.handleChange(target);
    return;
  }
  const { body } = state.spec;
  const [x, y, z] = body.size;

  if (target.id === 'from') state.from = target.value as Port;
  else if (target.id === 'to') state.to = target.value as Port;
  else if (target.id === 'cavityType') {
    state.cavityType = target.value as CavityType;
    render();
  } else if (target.id === 'cavitySize') state.cavitySize = Number(target.value);
  else if (target.id === 'cavityCell') state.cavityCell = target.value.split(',').map(Number) as [number, number];
  else if (target.id === 'split') state.split = (target as HTMLInputElement).checked;
  else if (target.id === 'engrave') state.engrave = (target as HTMLInputElement).checked;
  else if (target.id === 'importFile') {
    const file = (target as HTMLInputElement).files?.[0];
    if (file) void loadDesign(file);
  } else if (target.id === 'section') state.section = target.value as SectionChoice;
  else if (target.id === 'profile') state.profile = target.value as ProfileChoice;
  else if (target.id === 'shape') setBody({ shape: target.value as Shape, size: [x, y, z] });
  else if (target.id === 'sizeX') setBody({ shape: body.shape, size: [Number(target.value), y, z] });
  else if (target.id === 'sizeY') setBody({ shape: body.shape, size: [x, Number(target.value), z] });
  else if (target.id === 'sizeZ') setBody({ shape: body.shape, size: [x, y, Number(target.value)] });
  else if (target.id === 'xray') {
    state.seeThrough = (target as HTMLInputElement).checked;
    viewer?.setSeeThrough(state.seeThrough);
  }
};

for (const area of controlAreas) {
  area.addEventListener('click', onControlClick);
  area.addEventListener('change', onControlChange);
}

window.addEventListener('keydown', (event) => {
  if (state.tab !== 'assembly' || !assembly) return;
  if ((event.target as HTMLElement).matches('select, input, textarea')) return;
  if (assembly.handleKey(event)) event.preventDefault();
});

syncPortSelection();
render();
viewer = new Viewer(document.querySelector<HTMLElement>('#viewport')!, onPortClick);
viewer.setBody(state.spec.body, state.lanes);
loadManifold()
  .then((instance) => {
    wasm = instance;
    rebuild();
    assembly = new AssemblyController({
      wasm: instance,
      container: document.querySelector<HTMLElement>('#assemblyViewport')!,
      paletteContainer: document.querySelector<HTMLElement>('#palette')!,
      t,
      currentSpec: () => state.spec,
      locators: () => state.locators,
      lang: () => state.lang,
      onGalleryLoad: (item) => simulation?.setFollowDelay(item.followDelay),
      onChange: render,
      download,
    });
    const shared = assembly;
    simulation = new SimulationController({ view: shared.sharedView, assembly: () => shared.current, t, onChange: render });
  })
  .catch((error) => {
    console.error(error);
    state.buildFailed = true;
  })
  .finally(render);
