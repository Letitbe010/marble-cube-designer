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
  rotatePiece,
  serializeAssembly,
  type Assembly,
  type Cell,
  type Rotation,
} from '../assembly/model';
import { buildPiece } from '../geometry/piece';
import type { PieceSpec } from '../geometry/ports';
import { LIBRARY, PRESETS } from '../geometry/presets';
import { AssemblyView } from './assemblyView';
import type { StringKey } from './i18n';
import { toFlatGeometry } from './viewer';

const STORAGE_KEY = 'marble-cube-assembly';
const CURRENT_PIECE = 'current';

export interface AssemblyDeps {
  wasm: ManifoldToplevel;
  container: HTMLElement;
  t: (key: StringKey, values?: Record<string, string>) => string;
  currentSpec: () => PieceSpec;
  onChange: () => void;
  download: (content: string, name: string, type: string) => void;
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
  private selected: string | null = null;
  private brush: string | null = null;
  private brushRotation: Rotation = 0;
  private hover: Cell | null = null;
  private importFailed = false;

  constructor(private readonly deps: AssemblyDeps) {
    this.view = new AssemblyView(deps.container, {
      onHover: (cell) => this.setHover(cell),
      onClick: (cell, pieceId) => this.onViewClick(cell, pieceId),
    });
    this.syncView();
  }

  private get assembly() {
    return this.history.value;
  }

  private brushSpec(): PieceSpec | null {
    if (this.brush === CURRENT_PIECE) return this.deps.currentSpec();
    return this.brush ? PRESETS[this.brush] : null;
  }

  private geometryFor(spec: PieceSpec): BufferGeometry {
    const key = JSON.stringify(spec);
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = toFlatGeometry(buildPiece(this.deps.wasm, spec));
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private syncView() {
    this.view.setPieces(
      this.assembly.pieces.map((piece) => ({
        id: piece.id,
        geometry: this.geometryFor(piece.spec),
        matrix: pieceMatrix(piece),
        base: piece.cell[2],
        top: piece.cell[2] + heightSteps(piece.spec),
      })),
      this.selected,
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
    this.hover = cell;
    if (this.brush) this.syncGhost();
  }

  private onViewClick(cell: Cell | null, pieceId: string | null) {
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

  private async importFile(file: File) {
    try {
      this.commit(parseAssembly(await file.text()));
      this.importFailed = false;
      this.selected = null;
    } catch {
      this.importFailed = true;
    }
    this.deps.onChange();
  }

  /** Handles a click inside the panel. */
  handleClick(target: HTMLElement) {
    const { asm, asmMove } = target.dataset;
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
    else if (asm === 'clear') this.commit({ ...this.assembly, pieces: [] });
    else if (asm === 'save') this.deps.download(serializeAssembly(this.assembly), `${this.assembly.name}.json`, 'application/json');
    else if (asm === 'load') target.closest('#panel')?.querySelector<HTMLInputElement>('#asmFile')?.click();
  }

  /** Handles a form change inside the panel. */
  handleChange(target: HTMLInputElement | HTMLSelectElement) {
    if (target.id === 'asmBrush') this.setBrush(target.value || null);
    else if (target.id === 'asmFile') {
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

  render(): string {
    const { t } = this.deps;
    const button = (attr: string, label: string, enabled = true) => `<button class="btn" ${attr}${enabled ? '' : ' disabled'}>${label}</button>`;
    const options = LIBRARY.map(
      ({ category, items }) => `<optgroup label="${t(category)}">
        ${items.map((key) => `<option value="${key}"${key === this.brush ? ' selected' : ''}>${t(key as StringKey)}</option>`).join('')}
      </optgroup>`,
    ).join('');
    const hasSelection = this.selected !== null;
    const piece = this.assembly.pieces.find((p) => p.id === this.selected);

    return `
      <p class="hint">${t('asmHint')}</p>

      <h2>${t('asmPlace')}</h2>
      <select id="asmBrush" class="wide-select" aria-label="${t('asmPlace')}">
        <option value="">${t('asmSelectTool')}</option>
        <option value="${CURRENT_PIECE}"${this.brush === CURRENT_PIECE ? ' selected' : ''}>${t('asmCurrentPiece')}</option>
        ${options}
      </select>
      ${this.brush ? `<p class="stats">${t('asmRotation')}: ${this.brushRotation}°</p>
        <div class="presets files">
          ${button('data-asm="rotate"', t('asmRotate'))}
          ${button('data-asm="stopPlacing"', t('asmStop'))}
        </div>` : ''}

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

      <h2>${t('asmAssembly')}</h2>
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
