import type { ManifoldToplevel } from 'manifold-3d';
import * as THREE from 'three';
import { buildPiece } from '../geometry/piece';
import type { PieceSpec } from '../geometry/ports';
import { LIBRARY, PRESETS } from '../geometry/presets';
import type { StringKey } from './i18n';
import { toFlatGeometry } from './viewer';

export const CURRENT_PIECE = 'current';

const THUMBNAIL_SIZE = 192;
const VIEW_DIRECTION = new THREE.Vector3(0.55, -0.75, 0.7).normalize();

/** Draws small pictures of pieces, off screen. */
class ThumbnailRenderer {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 0.75, flatShading: true });

  constructor() {
    this.renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(60, -80, 140);
    this.scene.add(sun);
  }

  draw(wasm: ManifoldToplevel, spec: PieceSpec): string {
    const geometry = toFlatGeometry(buildPiece(wasm, spec));
    geometry.computeBoundingSphere();
    const { center, radius } = geometry.boundingSphere!;
    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);

    const distance = (radius * 1.08) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance);
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    const image = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(mesh);
    geometry.dispose();
    return image;
  }
}

export interface PaletteDeps {
  wasm: ManifoldToplevel;
  t: (key: StringKey, values?: Record<string, string>) => string;
  currentSpec: () => PieceSpec;
  onPick: (key: string | null) => void;
}

/** The pieces to place, shown as pictures grouped by kind. */
export class PiecePalette {
  private renderer: ThumbnailRenderer | null = null;
  private readonly images = new Map<string, string>();
  private readonly pending: string[] = [];
  private working = false;
  private started = false;
  private active: string | null = null;
  private labelSample = '';
  private currentKey = '';
  private query = '';
  private category: string = LIBRARY[0].category;
  private folded = false;

  constructor(private readonly root: HTMLElement, private readonly deps: PaletteDeps) {
    root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('button');
      if (!target) return;
      const { piece, paletteCategory } = target.dataset;
      if (paletteCategory) this.showCategory(paletteCategory);
      else if ('paletteFold' in target.dataset) this.fold(!this.folded);
      else if (piece || 'paletteSelect' in target.dataset) deps.onPick(piece ?? null);
    });
    root.addEventListener('input', (event) => {
      this.query = (event.target as HTMLInputElement).value.trim().toLowerCase();
      this.folded = false;
      this.showActive();
      this.applyFilter();
    });
    this.render();
  }

  private card(key: string, label: string, category = ''): string {
    const image = this.images.get(this.imageKey(key));
    return `<button class="piece-card" data-piece="${key}" data-category="${category}" data-name="${label.toLowerCase()}" title="${label}">
      <span class="piece-image">${image ? `<img src="${image}" alt="" />` : ''}</span>
      <span class="piece-label">${label}</span>
    </button>`;
  }

  private render() {
    const { t } = this.deps;
    this.labelSample = t('asmCurrentPiece');
    const chips = LIBRARY.map(({ category }) => `<button class="chip" data-palette-category="${category}">${t(category)}</button>`).join('');
    const cards = LIBRARY.flatMap(({ category, items }) => items.map((key) => this.card(key, t(key as StringKey), category))).join('');
    this.root.innerHTML = `
      <div class="palette-head">
        <input type="search" id="paletteSearch" placeholder="${t('palSearch')}" aria-label="${t('palSearch')}" value="${this.query}" />
        <button class="btn" data-palette-select>${t('palSelect')}</button>
        <div class="chips">${chips}</div>
        <button class="btn palette-fold" data-palette-fold title="${t('ribFold')}" aria-label="${t('ribFold')}"></button>
      </div>
      <div class="piece-grid">${this.card(CURRENT_PIECE, t('asmCurrentPiece'))}${cards}</div>`;
    this.showActive();
    this.applyFilter();
  }

  /** With a search, every matching piece shows; without one, the chosen category does. */
  private applyFilter() {
    for (const card of this.root.querySelectorAll<HTMLElement>('.piece-card')) {
      const { name, category } = card.dataset;
      card.hidden = this.query !== '' ? !name!.includes(this.query) : category !== '' && category !== this.category;
    }
  }

  private showCategory(category: string) {
    this.category = category;
    this.query = '';
    this.folded = false;
    this.root.querySelector<HTMLInputElement>('#paletteSearch')!.value = '';
    this.showActive();
    this.applyFilter();
  }

  private fold(folded: boolean) {
    this.folded = folded;
    this.showActive();
  }

  private showActive() {
    for (const card of this.root.querySelectorAll<HTMLElement>('.piece-card')) {
      card.classList.toggle('active', card.dataset.piece === this.active);
    }
    this.root.querySelector('[data-palette-select]')?.classList.toggle('active', this.active === null);
    for (const chip of this.root.querySelectorAll<HTMLElement>('.chip')) {
      chip.classList.toggle('active', this.query === '' && chip.dataset.paletteCategory === this.category);
    }
    this.root.classList.toggle('folded', this.folded);
    this.root.querySelector('.palette-fold')!.textContent = this.folded ? '▼' : '▲';
  }

  private specOf(key: string): PieceSpec {
    return key === CURRENT_PIECE ? this.deps.currentSpec() : PRESETS[key];
  }

  private imageKey(key: string): string {
    return key === CURRENT_PIECE ? this.currentKey : key;
  }

  private enqueue(key: string) {
    if (!this.pending.includes(key)) this.pending.push(key);
    if (!this.working) this.drawNext();
  }

  /** Draws one picture at a time, so that the page stays responsive. */
  private drawNext() {
    const key = this.pending.shift();
    if (!key) {
      this.working = false;
      return;
    }
    this.working = true;
    window.setTimeout(() => {
      this.renderer ??= new ThumbnailRenderer();
      const image = this.renderer.draw(this.deps.wasm, this.specOf(key));
      this.images.set(this.imageKey(key), image);
      const holder = this.root.querySelector(`[data-piece="${key}"] .piece-image`);
      if (holder) holder.innerHTML = `<img src="${image}" alt="" />`;
      this.drawNext();
    }, 0);
  }

  /** Starts drawing the pictures, the first time the palette is shown. */
  start() {
    if (this.started) return;
    this.started = true;
    LIBRARY.flatMap(({ items }) => items).forEach((key) => this.enqueue(key));
  }

  /** Brings the palette up to date with the language, the chosen piece and the piece in the editor. */
  sync(active: string | null) {
    this.active = active;
    if (this.labelSample !== this.deps.t('asmCurrentPiece')) this.render();
    else this.showActive();

    const key = JSON.stringify(this.deps.currentSpec());
    if (key === this.currentKey) return;
    this.currentKey = key;
    const known = this.images.get(key);
    const holder = this.root.querySelector(`[data-piece="${CURRENT_PIECE}"] .piece-image`);
    if (holder) holder.innerHTML = known ? `<img src="${known}" alt="" />` : '';
    if (!known) this.enqueue(CURRENT_PIECE);
  }
}
