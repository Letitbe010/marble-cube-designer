import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GRID_SIZE, Z_STEP, type Cell } from '../assembly/model';
import { CONFIG } from '../geometry/config';
import type { Vec3 } from '../geometry/ports';
import type { Sample } from '../simulation/marble';

export interface ViewPiece {
  id: string;
  geometry: THREE.BufferGeometry;
  matrix: number[];
  /** First free Z step above the piece. */
  top: number;
  /** Z step of the piece's base. */
  base: number;
}

export interface ViewEvents {
  onHover: (cell: Cell | null) => void;
  onClick: (cell: Cell | null, pieceId: string | null) => void;
}

const WOOD = 0xd8b98a;
const MARBLE_RADIUS = 8;
const SLOW_HUE = 0.62;
const FAST_HUE = 0;

/** 3D view of an assembly on its grid. */
export class AssemblyView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 1, 4000);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly material = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.75, flatShading: true });
  private readonly selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xe6c79a, emissive: 0x1f5fbf, emissiveIntensity: 0.45, roughness: 0.75, flatShading: true });
  private readonly flaggedMaterial = new THREE.MeshStandardMaterial({ color: 0xe0a39a, emissive: 0xb3261e, emissiveIntensity: 0.35, roughness: 0.75, flatShading: true });
  private readonly overlay = new THREE.Group();
  private readonly marbleGeometry = new THREE.SphereGeometry(MARBLE_RADIUS, 24, 16);
  private readonly marbleMaterial = new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.15, metalness: 0.2 });
  private readonly secondMarbleMaterial = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.15, metalness: 0.2 });
  private readonly problemMaterial = new THREE.MeshBasicMaterial({ color: 0xb3261e, depthTest: false });
  private readonly clock = new THREE.Clock();
  private trails: THREE.Line[] = [];
  private marbles: THREE.Mesh[] = [];
  private problems: THREE.Mesh[] = [];
  /** Called on every frame with the seconds since the previous one. */
  onFrame: ((elapsed: number) => void) | null = null;
  private readonly plateMaterial = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.8, flatShading: true });
  private readonly plates = new THREE.Group();
  private readonly ghost = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x2f8f5b, transparent: true, opacity: 0.55, depthWrite: false, flatShading: true }),
  );

  constructor(private readonly container: HTMLElement, private readonly events: ViewEvents) {
    const span = GRID_SIZE * CONFIG.cubeSize;
    this.scene.background = new THREE.Color(0xf4f4f1);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(span / 2 + span * 0.2, -span * 0.9, span * 1.05);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(span * 0.6, -span * 0.8, span * 1.4);
    this.scene.add(sun);

    const grid = new THREE.GridHelper(span, GRID_SIZE, 0x9aa1a8, 0xcfd3d6);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(span / 2, span / 2, 0);
    this.scene.add(grid);

    this.ghost.matrixAutoUpdate = false;
    this.ghost.visible = false;
    this.ghost.renderOrder = 3;
    this.scene.add(this.ghost, this.overlay, this.plates);

    container.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(span / 2, span / 2, 0);
    this.controls.enableDamping = true;

    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      const elapsed = this.clock.getDelta();
      if (!this.container.clientWidth) return;
      this.onFrame?.(elapsed);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Finds the cell a pointer aims at: on the ground, on top of a piece or beside it. */
  private pick(event: PointerEvent): { cell: Cell | null; pieceId: string | null } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const unit = CONFIG.cubeSize;

    const hit = this.raycaster.intersectObjects([...this.meshes.values()])[0];
    if (hit?.face) {
      const { id, top, base } = hit.object.userData as { id: string; top: number; base: number };
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.z > 0.5) {
        return { cell: [Math.floor(hit.point.x / unit), Math.floor(hit.point.y / unit), top], pieceId: id };
      }
      const x = Math.floor((hit.point.x + normal.x * unit * 0.5) / unit);
      const y = Math.floor((hit.point.y + normal.y * unit * 0.5) / unit);
      return { cell: [x, y, Math.max(base, Math.floor(hit.point.z / Z_STEP))], pieceId: id };
    }

    const point = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!point) return { cell: null, pieceId: null };
    const span = GRID_SIZE * unit;
    if (point.x < 0 || point.y < 0 || point.x >= span || point.y >= span) return { cell: null, pieceId: null };
    return { cell: [Math.floor(point.x / unit), Math.floor(point.y / unit), 0], pieceId: null };
  }

  private bindPointer() {
    const element = this.renderer.domElement;
    let downX = 0;
    let downY = 0;
    element.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    element.addEventListener('pointermove', (e) => {
      if (!e.buttons) this.events.onHover(this.pick(e).cell);
    });
    element.addEventListener('pointerleave', () => this.events.onHover(null));
    element.addEventListener('pointerup', (e) => {
      // A pointer that moved was orbiting the view, not clicking.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return;
      const { cell, pieceId } = this.pick(e);
      this.events.onClick(cell, pieceId);
    });
  }

  /** Shows the pieces; those in `flagged` have an error and stand out unless selected. */
  setPieces(pieces: ViewPiece[], selectedId: string | null, flagged: Set<string>) {
    const present = new Set(pieces.map((p) => p.id));
    for (const [id, mesh] of this.meshes) {
      if (!present.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
    for (const piece of pieces) {
      let mesh = this.meshes.get(piece.id);
      if (!mesh) {
        mesh = new THREE.Mesh(piece.geometry, this.material);
        mesh.matrixAutoUpdate = false;
        this.meshes.set(piece.id, mesh);
        this.scene.add(mesh);
      }
      mesh.geometry = piece.geometry;
      mesh.matrix.fromArray(piece.matrix);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.userData = { id: piece.id, top: piece.top, base: piece.base };
      mesh.material = piece.id === selectedId ? this.selectedMaterial : flagged.has(piece.id) ? this.flaggedMaterial : this.material;
    }
  }

  /** Draws each journey as a line, coloured from blue when slow to red when fast. */
  setTrails(journeys: Sample[][]) {
    for (const trail of this.trails) {
      trail.geometry.dispose();
      this.overlay.remove(trail);
    }
    const fastest = Math.max(1, ...journeys.flat().map((s) => s.speed));
    this.trails = journeys.map((samples) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(samples.flatMap((s) => s.position), 3));
      const color = new THREE.Color();
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(
          samples.flatMap((s) => {
            color.setHSL(SLOW_HUE + (FAST_HUE - SLOW_HUE) * (s.speed / fastest), 0.9, 0.45);
            return [color.r, color.g, color.b];
          }),
          3,
        ),
      );
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
      line.renderOrder = 4;
      this.overlay.add(line);
      return line;
    });
  }

  private syncMeshes(list: THREE.Mesh[], points: Vec3[], make: () => THREE.Mesh) {
    while (list.length > points.length) this.overlay.remove(list.pop()!);
    while (list.length < points.length) {
      const mesh = make();
      this.overlay.add(mesh);
      list.push(mesh);
    }
    points.forEach((p, i) => list[i].position.set(...p));
  }

  setMarbles(positions: Vec3[]) {
    this.syncMeshes(this.marbles, positions, () => {
      const mesh = new THREE.Mesh(this.marbleGeometry, this.marbles.length % 2 ? this.secondMarbleMaterial : this.marbleMaterial);
      mesh.renderOrder = 5;
      return mesh;
    });
  }

  setProblems(points: Vec3[]) {
    this.syncMeshes(this.problems, points, () => {
      const mesh = new THREE.Mesh(this.marbleGeometry, this.problemMaterial);
      mesh.scale.setScalar(0.6);
      mesh.renderOrder = 6;
      return mesh;
    });
  }

  clearOverlay() {
    this.setTrails([]);
    this.setMarbles([]);
    this.setProblems([]);
  }

  /** Points the camera at a place, keeping the current viewing direction. */
  focus([x, y, z]: Vec3) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(x, y, z);
    this.camera.position.copy(this.controls.target).add(offset.setLength(Math.min(offset.length(), 320)));
  }

  /** Shows base plates under the assembly; each is placed by its matrix. */
  setPlates(plates: { geometry: THREE.BufferGeometry; matrix: number[] }[]) {
    this.plates.clear();
    for (const { geometry, matrix } of plates) {
      const mesh = new THREE.Mesh(geometry, this.plateMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(matrix);
      this.plates.add(mesh);
    }
  }

  setGhost(ghost: { geometry: THREE.BufferGeometry; matrix: number[] } | null) {
    this.ghost.visible = ghost !== null;
    if (!ghost) return;
    this.ghost.geometry = ghost.geometry;
    this.ghost.matrix.fromArray(ghost.matrix);
    this.ghost.matrixWorldNeedsUpdate = true;
  }
}
