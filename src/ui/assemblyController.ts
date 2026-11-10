import type { ManifoldToplevel } from 'manifold-3d';
import type { BufferGeometry } from 'three';
import {
  addPiece,
  duplicatePiece,
  EMPTY_ASSEMBLY,
  fitsGrid,
  heightSteps,
  History,
  movePiece,
  parseAssembly,
  pieceMatrix,
  removePiece,
  ROTATIONS,
  rotatedFootprint,
  rotatePiece,
  serializeAssembly,
  Z_STEP,
  type Assembly,
  type Cell,
  type Rotation,
} from '../assembly/model';
import { checkAssembly, type CheckIssue } from '../assembly/checks';
import { exportAssemblyZip } from '../assembly/export';
import { GALLERY, type GalleryItem, type GalleryLevel } from '../assembly/gallery';
import { pieceList } from '../assembly/pieceList';
import { addPrinted, compareStock, inventoryToCsv, parseInventoryCsv, setStock, type Inventory, type StockRow } from '../assembly/inventory';
import { plateGroups, plateTiles } from '../assembly/plates';
import { filamentGrams, meshArea } from '../geometry/filament';
import { specKey } from '../geometry/print';
import { CONFIG } from '../geometry/config';
import { buildBasePlate } from '../geometry/locators';
import { toResult } from '../geometry/piece';
import { buildPiece } from '../geometry/piece';
import type { PieceSpec } from '../geometry/ports';
import { PRESETS } from '../geometry/presets';
import { AssemblyView } from './assemblyView';
import { CURRENT_PIECE, PiecePalette } from './piecePalette';
import { evaluateAssembly, type Verdict } from '../simulation/evaluate';
import { GALLERY_TEXT } from './galleryText';
import { SHAPE_LABELS, type Lang, type StringKey } from './i18n';
import { toFlatGeometry } from './viewer';

const STORAGE_KEY = 'marble-cube-assembly';
const INVENTORY_KEY = 'marble-cube-inventory';
const VERDICT_LABELS: Record<Verdict, StringKey> = { good: 'verdictGood', marginal: 'verdictMarginal', problem: 'verdictProblem' };

type Popover = 'gallery' | 'file' | 'details';

export interface AssemblyDeps {
  wasm: ManifoldToplevel;
  container: HTMLElement;
  paletteContainer: HTMLElement;
  t: (key: StringKey, values?: Record<string, string>) => string;
  currentSpec: () => PieceSpec;
  locators: () => boolean;
  lang: () => Lang;
  /** Tells the simulation how many marbles a loaded assembly is meant for. */
  onGalleryLoad: (item: GalleryItem) => void;
  onChange: () => void;
  download: (content: ArrayBuffer | string, name: string, type: string) => void;
}

function loadInventory(): Inventory {
  try {
    const parsed = JSON.parse(localStorage.getItem(INVENTORY_KEY) ?? '{}') as Inventory;
    return Object.entries(parsed).reduce((inventory, [id, count]) => setStock(inventory, id, Number(count)), {} as Inventory);
  } catch {
    return {};
  }
}

function loadSaved(): Assembly {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? parseAssembly(text) : EMPTY_ASSEMBLY;
  } catch {
    return EMPTY_ASSEMBLY;
  }
}

/** The assembly tab: its state, its panel and its link to the 3D view. */
export class AssemblyController {
  private readonly history = new History<Assembly>(loadSaved());
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly view: AssemblyView;
  private readonly palette: PiecePalette;
  private selected: string | null = null;
  private brush: string | null = null;
  private brushRotation: Rotation = 0;
  private hover: Cell | null = null;
  private importFailed = false;
  private popover: Popover | null = null;
  private inventory = loadInventory();
  private onlyMissing = true;
  private inventoryFailed = false;
  private readonly grams = new Map<string, number>();
  private issues: CheckIssue[] = [];
  private active = true;
  private galleryId = GALLERY[0].id;
  private readonly galleryInfo = new Map<string, { pieces: number; kinds: number; volume: number; verdict: Verdict | null }>();

  constructor(private readonly deps: AssemblyDeps) {
    this.view = new AssemblyView(deps.container, {
      onHover: (cell) => this.setHover(cell),
      onClick: (cell, pieceId) => this.onViewClick(cell, pieceId),
    });
    this.palette = new PiecePalette(deps.paletteContainer, {
      wasm: deps.wasm,
      t: deps.t,
      currentSpec: deps.currentSpec,
      onPick: (key) => this.setBrush(key),
    });
    this.syncView();
    this.frameAssembly();
  }

  /** Brings the whole assembly into view. */
  private frameAssembly() {
    const { pieces } = this.assembly;
    if (pieces.length === 0) return;
    const unit = CONFIG.cubeSize;
    const extents = pieces.map((p) => {
      const [footX, footY] = rotatedFootprint(p.spec, p.rotation);
      return [p.cell[0] * unit, p.cell[1] * unit, p.cell[2] * Z_STEP, (p.cell[0] + footX) * unit, (p.cell[1] + footY) * unit, (p.cell[2] + heightSteps(p.spec)) * Z_STEP];
    });
    const least = (i: number) => Math.min(...extents.map((e) => e[i]));
    const most = (i: number) => Math.max(...extents.map((e) => e[i]));
    this.view.frame([least(0), least(1), least(2)], [most(3), most(4), most(5)]);
  }

  private get assembly() {
    return this.history.value;
  }

  get current(): Assembly {
    return this.history.value;
  }

  get sharedView(): AssemblyView {
    return this.view;
  }

  /** While another tab uses the shared view, the pointer must not edit the assembly. */
  setActive(active: boolean) {
    this.active = active;
    this.popover = null;
    if (active) this.palette.start();
    this.hover = null;
    this.syncGhost();
  }

  private brushSpec(): PieceSpec | null {
    if (this.brush === CURRENT_PIECE) return this.deps.currentSpec();
    return this.brush ? PRESETS[this.brush] : null;
  }

  private geometryFor(spec: PieceSpec): BufferGeometry {
    const locators = this.deps.locators();
    const key = `${locators}|${JSON.stringify(spec)}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = toFlatGeometry(buildPiece(this.deps.wasm, spec, { locators }));
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private plateGeometry(size: [number, number]): BufferGeometry {
    const key = `plate|${size.join('x')}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      const plate = buildBasePlate(this.deps.wasm, size[0], size[1]);
      geometry = toFlatGeometry(toResult(plate));
      plate.delete();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  /** Redraws everything after the locator setting changes. */
  refresh() {
    this.syncView();
  }

  private syncView() {
    this.issues = checkAssembly(this.assembly);
    const flagged = new Set(this.issues.filter((i) => i.level === 'error').flatMap((i) => i.pieceIds));
    this.view.setPieces(
      this.assembly.pieces.map((piece) => ({
        id: piece.id,
        geometry: this.geometryFor(piece.spec),
        matrix: pieceMatrix(piece),
        base: piece.cell[2],
        top: piece.cell[2] + heightSteps(piece.spec),
      })),
      this.selected,
      flagged,
    );
    const { cubeSize, plateThickness } = CONFIG;
    const tiles = this.deps.locators() ? plateTiles(this.assembly) : [];
    this.view.setPlates(
      tiles.map(({ cell, size }) => ({
        geometry: this.plateGeometry(size),
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cell[0] * cubeSize, cell[1] * cubeSize, -plateThickness, 1],
      })),
    );
    this.syncGhost();
  }

  private syncGhost() {
    const spec = this.brushSpec();
    const placement = spec && this.hover ? { spec, cell: this.hover, rotation: this.brushRotation } : null;
    if (!placement || !fitsGrid(placement)) {
      this.view.setGhost(null);
      return;
    }
    this.view.setGhost({ geometry: this.geometryFor(placement.spec), matrix: pieceMatrix(placement) });
  }

  private commit(next: Assembly) {
    this.history.push(next);
    this.afterChange();
  }

  private afterChange() {
    try {
      localStorage.setItem(STORAGE_KEY, serializeAssembly(this.assembly));
    } catch {
      // Storage can be unavailable (private mode); the assembly just won't be remembered.
    }
    if (this.selected && !this.assembly.pieces.some((p) => p.id === this.selected)) this.selected = null;
    this.syncView();
    this.deps.onChange();
  }

  private setHover(cell: Cell | null) {
    if (!this.active) return;
    this.hover = cell;
    if (this.brush) this.syncGhost();
  }

  private onViewClick(cell: Cell | null, pieceId: string | null) {
    if (!this.active) return;
    if (this.popover === 'gallery' || this.popover === 'file') {
      this.popover = null;
      this.deps.onChange();
    }
    const spec = this.brushSpec();
    if (spec) {
      if (cell) this.commit(addPiece(this.assembly, spec, cell, this.brushRotation));
      return;
    }
    this.selected = pieceId;
    this.syncView();
    this.deps.onChange();
  }

  private setBrush(value: string | null) {
    this.brush = value;
    if (value) this.selected = null;
    this.syncView();
    this.deps.onChange();
  }

  private rotate() {
    if (this.brush) {
      this.brushRotation = ROTATIONS[(ROTATIONS.indexOf(this.brushRotation) + 1) % ROTATIONS.length];
      this.syncGhost();
      this.deps.onChange();
    } else if (this.selected) {
      this.commit(rotatePiece(this.assembly, this.selected));
    }
  }

  private move(delta: Cell) {
    if (this.selected) this.commit(movePiece(this.assembly, this.selected, delta));
  }

  private duplicate() {
    if (!this.selected) return;
    const { assembly, copyId } = duplicatePiece(this.assembly, this.selected);
    if (!copyId) return;
    this.selected = copyId;
    this.commit(assembly);
  }

  private remove() {
    if (this.selected) this.commit(removePiece(this.assembly, this.selected));
  }

  private undo() {
    this.history.undo();
    this.afterChange();
  }

  private redo() {
    this.history.redo();
    this.afterChange();
  }

  private galleryItem(): GalleryItem {
    return GALLERY.find((item) => item.id === this.galleryId) ?? GALLERY[0];
  }

  /** Summary of a gallery assembly; building its pieces takes a moment, so it is kept. */
  private describeGallery(item: GalleryItem) {
    let info = this.galleryInfo.get(item.id);
    if (!info) {
      const groups = pieceList(item.assembly);
      const params = item.followDelay ? { marbleCount: 2 as const, followDelay: item.followDelay } : {};
      info = {
        pieces: item.assembly.pieces.length,
        kinds: groups.length,
        volume: groups.reduce((sum, { spec, count }) => sum + buildPiece(this.deps.wasm, spec).volume * count, 0),
        verdict: evaluateAssembly(item.assembly, params).verdict,
      };
      this.galleryInfo.set(item.id, info);
    }
    return info;
  }

  private loadGallery() {
    const item = this.galleryItem();
    this.selected = null;
    this.brush = null;
    this.popover = null;
    this.commit(item.assembly);
    this.frameAssembly();
    this.deps.onGalleryLoad(item);
  }

  private renderGallery(): string {
    const { t, lang } = this.deps;
    const labels: Record<GalleryLevel, StringKey> = { showpiece: 'galShowpiece', beginner: 'galBeginner', intermediate: 'galIntermediate', advanced: 'galAdvanced' };
    const text = (item: GalleryItem) => GALLERY_TEXT[item.id][lang()];
    const groups = (Object.keys(labels) as GalleryLevel[])
      .map((level) => `<optgroup label="${t(labels[level])}">
        ${GALLERY.filter((item) => item.level === level).map((item) => `<option value="${item.id}"${item.id === this.galleryId ? ' selected' : ''}>${text(item).name}</option>`).join('')}
      </optgroup>`)
      .join('');
    const item = this.galleryItem();
    const info = this.describeGallery(item);
    return `
      <h2>${t('galTitle')}</h2>
      <select id="asmGallery" class="wide-select" aria-label="${t('galTitle')}">${groups}</select>
      <p class="hint">${text(item).note}</p>
      <p class="stats">${t('galInfo', { pieces: String(info.pieces), kinds: String(info.kinds), volume: (info.volume / 1000).toFixed(0) })}${info.verdict ? ` · ${t(VERDICT_LABELS[info.verdict])}` : ''}</p>
      <button class="btn wide" data-asm="loadGallery">${t('galLoad')}</button>`;
  }

  /** What the assembly needs, what is on the shelf and what each piece and plate is. */
  private stock() {
    const { t } = this.deps;
    const groups = pieceList(this.assembly);
    const plates = this.deps.locators() ? plateGroups(this.assembly) : [];
    const rows = compareStock([...groups, ...plates], this.inventory);
    const labels = new Map<string, string>([
      ...groups.map(({ id, spec }): [string, string] => [id, `${t(SHAPE_LABELS[spec.body.shape])} ${spec.body.size.map((v) => v * 50).join('×')}`]),
      ...plates.map(({ id, size }): [string, string] => [id, t('invPlate', { size: size.map((v) => v * 50).join('×') })]),
    ]);
    return { groups, plates, rows, labels };
  }

  /** Whether the ZIP should hold only the pieces that are missing. */
  private exportsMissing(rows: StockRow[]): boolean {
    return this.onlyMissing && rows.some((row) => row.have > 0);
  }

  private remember(key: string, solid: () => { positions: Float32Array; triangles: Uint32Array; volume: number }): number {
    let grams = this.grams.get(key);
    if (grams === undefined) {
      const { positions, triangles, volume } = solid();
      grams = filamentGrams(volume, meshArea(positions, triangles));
      this.grams.set(key, grams);
    }
    return grams;
  }

  private pieceGrams(spec: PieceSpec): number {
    const locators = this.deps.locators();
    return this.remember(`${locators}|${specKey(spec)}`, () => buildPiece(this.deps.wasm, spec, { locators }));
  }

  private plateGrams(size: [number, number]): number {
    return this.remember(`plate|${size.join('x')}`, () => {
      const plate = buildBasePlate(this.deps.wasm, size[0], size[1]);
      const result = toResult(plate);
      plate.delete();
      return result;
    });
  }

  private setInventory(next: Inventory) {
    this.inventory = next;
    try {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(next));
    } catch {
      // Without storage the inventory lasts until the page is closed; the CSV keeps a copy.
    }
    this.deps.onChange();
  }

  private exportInventory() {
    const { labels } = this.stock();
    this.deps.download(inventoryToCsv(this.inventory, (id) => labels.get(id)), 'inventory.csv', 'text/csv');
  }

  private async importInventory(file: File) {
    try {
      this.inventoryFailed = false;
      this.setInventory(parseInventoryCsv(await file.text()));
    } catch {
      this.inventoryFailed = true;
      this.deps.onChange();
    }
  }

  private async exportZip() {
    const { rows } = this.stock();
    const quantities = this.exportsMissing(rows) ? Object.fromEntries(rows.map((row) => [row.id, row.toPrint])) : undefined;
    const data = await exportAssemblyZip(this.deps.wasm, this.assembly, { locators: this.deps.locators(), quantities });
    this.deps.download(data, `${this.assembly.name}.zip`, 'application/zip');
  }

  private async importFile(file: File) {
    try {
      this.commit(parseAssembly(await file.text()));
      this.frameAssembly();
      this.importFailed = false;
      this.selected = null;
      this.popover = null;
    } catch {
      this.importFailed = true;
    }
    this.deps.onChange();
  }

  /** Handles a click inside the panel. */
  handleClick(target: HTMLElement) {
    const { asm, asmMove, asmIssue, asmToggle } = target.dataset;
    if (asmToggle) {
      this.popover = this.popover === asmToggle ? null : (asmToggle as Popover);
      this.deps.onChange();
      return;
    }
    if (asmIssue !== undefined) {
      this.selected = this.issues[Number(asmIssue)]?.pieceIds[0] ?? null;
      this.syncView();
      this.deps.onChange();
      return;
    }
    if (asmMove) {
      this.move(asmMove.split(',').map(Number) as Cell);
      return;
    }
    if (asm === 'rotate') this.rotate();
    else if (asm === 'duplicate') this.duplicate();
    else if (asm === 'remove') this.remove();
    else if (asm === 'undo') this.undo();
    else if (asm === 'redo') this.redo();
    else if (asm === 'exportZip') void this.exportZip();
    else if (asm === 'loadGallery') this.loadGallery();
    else if (asm === 'addPrinted') this.setInventory(addPrinted(this.inventory, this.stock().rows));
    else if (asm === 'invExport') this.exportInventory();
    else if (asm === 'invImport') document.querySelector<HTMLInputElement>('#invFile')?.click();
    else if (asm === 'clear') this.commit({ ...this.assembly, pieces: [] });
    else if (asm === 'save') this.deps.download(serializeAssembly(this.assembly), `${this.assembly.name}.json`, 'application/json');
    else if (asm === 'load') document.querySelector<HTMLInputElement>('#asmFile')?.click();
  }

  /** Handles a form change inside the panel. */
  handleChange(target: HTMLInputElement | HTMLSelectElement) {
    if (target.dataset.invId) {
      this.setInventory(setStock(this.inventory, target.dataset.invId, Number(target.value)));
    } else if (target.id === 'onlyMissing') {
      this.onlyMissing = (target as HTMLInputElement).checked;
      this.deps.onChange();
    } else if (target.id === 'invFile') {
      const file = (target as HTMLInputElement).files?.[0];
      if (file) void this.importInventory(file);
    } else if (target.id === 'asmGallery') {
      this.galleryId = target.value;
      this.deps.onChange();
    } else if (target.id === 'asmFile') {
      const file = (target as HTMLInputElement).files?.[0];
      if (file) void this.importFile(file);
    }
  }

  /** Keyboard shortcuts; returns true when the key was used. */
  handleKey(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === 'z' && event.shiftKey) this.redo();
      else if (key === 'z') this.undo();
      else if (key === 'y') this.redo();
      else if (key === 'd') this.duplicate();
      else return false;
      return true;
    }
    const moves: Record<string, Cell> = {
      arrowleft: [-1, 0, 0],
      arrowright: [1, 0, 0],
      arrowup: [0, 1, 0],
      arrowdown: [0, -1, 0],
      pageup: [0, 0, 1],
      pagedown: [0, 0, -1],
    };
    if (moves[key]) this.move(moves[key]);
    else if (key === 'r') this.rotate();
    else if (key === 'delete' || key === 'backspace') this.remove();
    else if (key === 'escape') {
      if (this.popover) {
        this.popover = null;
        this.deps.onChange();
      } else if (this.brush) this.setBrush(null);
      else {
        this.selected = null;
        this.syncView();
        this.deps.onChange();
      }
    } else return false;
    return true;
  }

  private renderChecks(): string {
    const { t } = this.deps;
    const errors = this.issues.filter((i) => i.level === 'error').length;
    const warnings = this.issues.length - errors;
    const items = this.issues
      .map((issue, i) => `<button class="notice issue ${issue.level === 'error' ? 'error' : 'warn'}" data-asm-issue="${i}">${t(`issue_${issue.code}` as StringKey)}</button>`)
      .join('');
    const summary = this.assembly.pieces.length === 0 ? '' : `<p class="stats">${t('asmChecksSummary', { errors: String(errors), warnings: String(warnings) })}</p>`;
    return `<h2>${t('asmChecks')}</h2>${summary}${items || `<p class="empty">${t('asmNoIssues')}</p>`}`;
  }

  private renderList(): string {
    const { t, lang } = this.deps;
    const { groups, plates, rows, labels } = this.stock();
    if (rows.length === 0) return '';
    const grams = new Map<string, number>([
      ...groups.map(({ id, spec }): [string, number] => [id, this.pieceGrams(spec)]),
      ...plates.map(({ id, size }): [string, number] => [id, this.plateGrams(size)]),
    ]);
    const weight = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.max(5, Math.round(g / 5) * 5)} g`).replace('.', lang() === 'en' ? '.' : ',');
    const sum = (pick: (row: StockRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
    const toPrint = sum((row) => row.toPrint);
    const printGrams = sum((row) => row.toPrint * grams.get(row.id)!);
    const allGrams = sum((row) => row.count * grams.get(row.id)!);
    const body = rows
      .map(({ id, count, have, toPrint: due }) => `<tr>
        <td>${id} <small>${labels.get(id)}</small></td>
        <td>${count}</td>
        <td><input type="number" min="0" step="1" value="${have}" data-inv-id="${id}" aria-label="${t('invHave')} ${id}" /></td>
        <td class="${due ? 'due' : 'done'}">${due}</td>
      </tr>`)
      .join('');
    const hasErrors = this.issues.some((i) => i.level === 'error');
    return `<h2>${t('asmList')}</h2>
      <table class="stock">
        <thead><tr><th></th><th>${t('invNeed')}</th><th>${t('invHave')}</th><th>${t('invPrint')}</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <p class="stats total">${toPrint ? t('invToPrint', { pieces: String(toPrint), weight: weight(printGrams), percent: String(Math.max(1, Math.round(printGrams / 10))) }) : t('invNothing')}</p>
      <p class="stats">${t('invAll', { pieces: String(sum((row) => row.count)), weight: weight(allGrams) })}</p>
      <p class="hint">${t('invAssumptions')}</p>
      <p class="hint">${t('invHint')}</p>
      <label class="toggle"><input type="checkbox" id="onlyMissing"${this.onlyMissing ? ' checked' : ''} /> ${t('invOnlyMissing')}</label>
      <button class="btn wide" data-asm="addPrinted"${toPrint ? '' : ' disabled'}>${t('invAddPrinted')}</button>
      <div class="presets files">
        <button class="btn" data-asm="invExport">${t('invExport')}</button>
        <button class="btn" data-asm="invImport">${t('invImport')}</button>
      </div>
      <input type="file" id="invFile" accept=".csv,text/csv,text/plain" hidden />
      ${this.inventoryFailed ? `<div class="notice error">${t('badFile')}</div>` : ''}
      ${hasErrors ? `<p class="hint">${t('asmExportWarn')}</p>` : ''}`;
  }

  private renderFile(): string {
    const { t } = this.deps;
    const plates = this.deps.locators() ? plateTiles(this.assembly).length : 0;
    return `
      <h2>${t('asmAssembly')}</h2>
      <label class="toggle"><input type="checkbox" id="locators"${this.deps.locators() ? ' checked' : ''} /> ${t('printLocators')}</label>
      ${plates ? `<p class="stats">${t('asmPlates', { count: String(plates) })}</p>` : ''}
      <div class="presets files">
        <button class="btn" data-asm="save">${t('saveDesign')}</button>
        <button class="btn" data-asm="load">${t('loadDesign')}</button>
      </div>
      <button class="btn wide" data-asm="clear"${this.assembly.pieces.length ? '' : ' disabled'}>${t('clear')}</button>
      ${this.importFailed ? `<div class="notice error">${t('badFile')}</div>` : ''}`;
  }

  /** The commands, in a row above the 3D view. */
  renderRibbon(): string {
    const { t } = this.deps;
    this.palette.sync(this.brush);
    const button = (attr: string, label: string, enabled = true) => `<button class="btn" ${attr}${enabled ? '' : ' disabled'}>${label}</button>`;
    const menu = (id: Popover, label: StringKey) => `<button class="btn${this.popover === id ? ' open' : ''}" data-asm-toggle="${id}">${t(label)} ▾</button>`;
    const hasSelection = this.selected !== null;
    const hasPieces = this.assembly.pieces.length > 0;
    const hasErrors = this.issues.some((i) => i.level === 'error');
    const { rows } = this.stock();
    const missingOnly = this.exportsMissing(rows);
    const canExport = hasPieces && (!missingOnly || rows.some((row) => row.toPrint > 0));
    const openMenu = this.popover === 'gallery' ? this.renderGallery() : this.popover === 'file' ? this.renderFile() : '';

    return `
      <div class="rib-group">${menu('gallery', 'ribExamples')}${menu('file', 'ribFile')}</div>
      <div class="rib-group">
        ${button('data-asm="undo"', t('asmUndo'), this.history.canUndo)}
        ${button('data-asm="redo"', t('asmRedo'), this.history.canRedo)}
      </div>
      <div class="rib-group">
        ${button('data-asm="rotate"', t('asmRotate'), hasSelection || this.brush !== null)}
        ${button('data-asm="duplicate"', t('asmDuplicate'), hasSelection)}
        ${button('data-asm="remove"', t('remove'), hasSelection)}
      </div>
      <div class="rib-group">
        <span class="rib-label">${t('ribMove')}</span>
        ${button('data-asm-move="-1,0,0"', '←', hasSelection)}
        ${button('data-asm-move="0,1,0"', '↑', hasSelection)}
        ${button('data-asm-move="0,-1,0"', '↓', hasSelection)}
        ${button('data-asm-move="1,0,0"', '→', hasSelection)}
        ${button('data-asm-move="0,0,1"', 'Z+', hasSelection)}
        ${button('data-asm-move="0,0,-1"', 'Z−', hasSelection)}
      </div>
      <div class="rib-group end">
        <button class="btn" data-tab="simulation">${t('tabSimulation')}</button>
        <button class="btn primary" data-asm="exportZip"${canExport ? '' : ' disabled'}${hasErrors ? ` title="${t('asmExportWarn')}"` : ''}>${t(missingOnly ? 'asmExportMissing' : 'asmExportZip')}</button>
      </div>
      ${openMenu ? `<div class="pop menu">${openMenu}</div>` : ''}
      <input type="file" id="asmFile" accept=".json,application/json" hidden />`;
  }

  /** What the status card says about the current action. */
  private statusContext(): string {
    const { t } = this.deps;
    if (this.brush) return `${t(this.brush === CURRENT_PIECE ? 'asmCurrentPiece' : (this.brush as StringKey))} · ${t('asmRotation')}: ${this.brushRotation}°`;
    const piece = this.assembly.pieces.find((p) => p.id === this.selected);
    if (piece) return `${t('asmPosition')}: ${piece.cell.join(' · ')} · ${piece.rotation}°`;
    return t(this.assembly.pieces.length ? 'asmNoSelection' : 'palHint');
  }

  /** The status card over the 3D view, with the checks and the piece list behind it. */
  renderOverlay(): string {
    const { t } = this.deps;
    const errors = this.issues.filter((i) => i.level === 'error').length;
    const warnings = this.issues.length - errors;
    const count = this.assembly.pieces.length;
    const verdict: Verdict = errors ? 'problem' : warnings ? 'marginal' : 'good';
    const open = this.popover === 'details';
    const details = `<div class="pop details">
      ${this.renderChecks()}
      ${this.renderList()}
      <p class="hint">${t('asmHint')}</p>
      <p class="hint">${t('asmKeys')}</p>
      <footer>${t('disclaimer')}</footer>
    </div>`;
    return `
      ${open ? details : ''}
      <button class="status" data-asm-toggle="details" aria-expanded="${open}">
        <span class="status-main">
          ${count ? `<strong class="tone-${verdict}">${t(VERDICT_LABELS[verdict])}</strong> ·` : ''}
          ${t('asmCount', { count: String(count) })} · ${t('asmChecksSummary', { errors: String(errors), warnings: String(warnings) })}
          <span class="caret">${open ? '▼' : '▲'}</span>
        </span>
        <span class="status-context">${this.statusContext()}</span>
      </button>`;
  }
}
