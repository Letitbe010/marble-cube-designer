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
import { plateTiles } from '../assembly/plates';
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
    this.commit(item.assembly);
    this.frameAssembly();
    this.deps.onGalleryLoad(item);
  }

  private renderGallery(): string {
    const { t, lang } = this.deps;
    const labels: Record<GalleryLevel, StringKey> = { showpiece: 'galShowpiece', beginner: 'galBeginner', intermediate: 'galIntermediate', advanced: 'galAdvanced' };
    const verdicts: Record<Verdict, StringKey> = { good: 'verdictGood', marginal: 'verdictMarginal', problem: 'verdictProblem' };
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
      <p class="stats">${t('galInfo', { pieces: String(info.pieces), kinds: String(info.kinds), volume: (info.volume / 1000).toFixed(0) })}${info.verdict ? ` · ${t(verdicts[info.verdict])}` : ''}</p>
      <button class="btn wide" data-asm="loadGallery">${t('galLoad')}</button>`;
  }

  private async exportZip() {
    const data = await exportAssemblyZip(this.deps.wasm, this.assembly, { locators: this.deps.locators() });
    this.deps.download(data, `${this.assembly.name}.zip`, 'application/zip');
  }

  private async importFile(file: File) {
    try {
      this.commit(parseAssembly(await file.text()));
      this.frameAssembly();
      this.importFailed = false;
      this.selected = null;
    } catch {
      this.importFailed = true;
    }
    this.deps.onChange();
  }

  /** Handles a click inside the panel. */
  handleClick(target: HTMLElement) {
    const { asm, asmMove, asmIssue } = target.dataset;
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
    else if (asm === 'stopPlacing') this.setBrush(null);
    else if (asm === 'exportZip') void this.exportZip();
    else if (asm === 'loadGallery') this.loadGallery();
    else if (asm === 'clear') this.commit({ ...this.assembly, pieces: [] });
    else if (asm === 'save') this.deps.download(serializeAssembly(this.assembly), `${this.assembly.name}.json`, 'application/json');
    else if (asm === 'load') target.closest('#panel')?.querySelector<HTMLInputElement>('#asmFile')?.click();
  }

  /** Handles a form change inside the panel. */
  handleChange(target: HTMLInputElement | HTMLSelectElement) {
    if (target.id === 'asmGallery') {
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
      if (this.brush) this.setBrush(null);
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
    const { t } = this.deps;
    const groups = pieceList(this.assembly);
    if (groups.length === 0) return '';
    const rows = groups
      .map(({ id, spec, count }) => {
        const [x, y, z] = spec.body.size;
        return `<li><span>${id} <small>${t(SHAPE_LABELS[spec.body.shape])} ${x * 50}×${y * 50}×${z * 50}</small></span><strong>× ${count}</strong></li>`;
      })
      .join('');
    const hasErrors = this.issues.some((i) => i.level === 'error');
    return `<h2>${t('asmList')}</h2><ul class="segments">${rows}</ul>
      <button class="btn primary spaced" data-asm="exportZip">${t('asmExportZip')}</button>
      ${hasErrors ? `<p class="hint">${t('asmExportWarn')}</p>` : ''}`;
  }

  render(): string {
    const { t } = this.deps;
    this.palette.sync(this.brush);
    const button = (attr: string, label: string, enabled = true) => `<button class="btn" ${attr}${enabled ? '' : ' disabled'}>${label}</button>`;
    const hasSelection = this.selected !== null;
    const piece = this.assembly.pieces.find((p) => p.id === this.selected);

    return `
      <p class="hint">${t('asmHint')}</p>

      ${this.renderGallery()}

      <h2>${t('asmPlace')}</h2>
      ${this.brush ? `<p class="stats">${t(this.brush === CURRENT_PIECE ? 'asmCurrentPiece' : (this.brush as StringKey))} · ${t('asmRotation')}: ${this.brushRotation}°</p>
        <div class="presets files">
          ${button('data-asm="rotate"', t('asmRotate'))}
          ${button('data-asm="stopPlacing"', t('asmStop'))}
        </div>` : `<p class="empty">${t('palHint')}</p>`}

      <h2>${t('asmSelected')}</h2>
      ${piece ? `<p class="stats">${t('asmPosition')}: ${piece.cell.join(' · ')} · ${piece.rotation}°</p>` : `<p class="empty">${t('asmNoSelection')}</p>`}
      <div class="move-grid">
        ${button('data-asm-move="0,1,0"', '↑', hasSelection)}
        ${button('data-asm-move="-1,0,0"', '←', hasSelection)}
        ${button('data-asm-move="0,-1,0"', '↓', hasSelection)}
        ${button('data-asm-move="1,0,0"', '→', hasSelection)}
        ${button('data-asm-move="0,0,1"', 'Z+', hasSelection)}
        ${button('data-asm-move="0,0,-1"', 'Z−', hasSelection)}
      </div>
      <div class="presets files">
        ${button('data-asm="rotate"', t('asmRotate'), hasSelection)}
        ${button('data-asm="duplicate"', t('asmDuplicate'), hasSelection)}
        ${button('data-asm="remove"', t('remove'), hasSelection)}
      </div>

      ${this.renderChecks()}
      ${this.renderList()}

      <h2>${t('asmAssembly')}</h2>
      <label class="toggle"><input type="checkbox" id="locators"${this.deps.locators() ? ' checked' : ''} /> ${t('printLocators')}</label>
      ${this.deps.locators() && plateTiles(this.assembly).length ? `<p class="stats">${t('asmPlates', { count: String(plateTiles(this.assembly).length) })}</p>` : ''}
      <p class="stats">${t('asmCount', { count: String(this.assembly.pieces.length) })}</p>
      <div class="presets files">
        ${button('data-asm="undo"', t('asmUndo'), this.history.canUndo)}
        ${button('data-asm="redo"', t('asmRedo'), this.history.canRedo)}
        ${button('data-asm="save"', t('saveDesign'))}
        ${button('data-asm="load"', t('loadDesign'))}
      </div>
      <button class="btn wide" data-asm="clear"${this.assembly.pieces.length ? '' : ' disabled'}>${t('clear')}</button>
      <input type="file" id="asmFile" accept=".json,application/json" hidden />
      ${this.importFailed ? `<div class="notice error">${t('badFile')}</div>` : ''}
      <p class="hint">${t('asmKeys')}</p>
    `;
  }
}
