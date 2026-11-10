import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from '../geometry/config';
import type { BuildResult, DisplayPart } from '../geometry/piece';
import { bodyHeight, FACE_DIR, FACES, isVertical, parseSide, portPosition, portsFor, type Body, type Face, type Port } from '../geometry/ports';

const COLORS = { T: 0x1f5fbf, M: 0xd9822b, B: 0x2f8f5b, vertical: 0x4b5563, selected: 0xd4262c };
const LABEL_GAP = 14;

function portColor(port: Port): number {
  return isVertical(port) ? COLORS.vertical : COLORS[parseSide(port).level];
}

function faceLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#68707a';
  ctx.fillText(text, 32, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(9, 9, 1);
  return sprite;
}

/** Turns a built mesh into flat-shaded geometry for display. */
export function toFlatGeometry(result: BuildResult): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
  indexed.setIndex(new THREE.BufferAttribute(result.triangles, 1));
  const flat = indexed.toNonIndexed();
  flat.computeVertexNormals();
  indexed.dispose();
  return flat;
}

/** 3D view of the current piece, with clickable port markers. */
export class Viewer {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
  private readonly controls: OrbitControls;
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 0.75, flatShading: true });
  private readonly movingMaterial = new THREE.MeshStandardMaterial({ color: 0xc47a3d, roughness: 0.75, flatShading: true });
  private readonly steelMaterial = new THREE.MeshStandardMaterial({ color: 0x9099a3, roughness: 0.35, metalness: 0.7, flatShading: true });
  private readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
  /** The moving and bought parts of a piece, each with where it goes when exploded. */
  private readonly extras: { mesh: THREE.Mesh; explode: THREE.Vector3 }[] = [];
  private exploded = false;
  private readonly markerGeometry = new THREE.SphereGeometry(2.6, 20, 14);
  private readonly markers = new Map<Port, THREE.Mesh>();
  private readonly labels = new Map<Face, THREE.Sprite>();
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly container: HTMLElement, onPortClick: (port: Port) => void) {
    this.scene.background = new THREE.Color(0xf4f4f1);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(60, -80, 140);
    this.scene.add(sun, this.mesh);

    for (const face of FACES) {
      const label = faceLabel(face);
      this.labels.set(face, label);
      this.scene.add(label);
    }

    container.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.bindClicks(onPortClick);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private bindClicks(onPortClick: (port: Port) => void) {
    const element = this.renderer.domElement;
    let downX = 0;
    let downY = 0;
    element.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    element.addEventListener('pointerup', (e) => {
      // A pointer that moved was orbiting the view, not clicking a port.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return;
      const rect = element.getBoundingClientRect();
      const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(pointer, this.camera);
      const hit = this.raycaster.intersectObjects([...this.markers.values()])[0];
      if (hit) onPortClick(hit.object.userData.port as Port);
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

  /** Shows the ports of a body and frames it in the view. */
  setBody(body: Body, lanes = false) {
    for (const marker of this.markers.values()) {
      (marker.material as THREE.Material).dispose();
      this.scene.remove(marker);
    }
    this.markers.clear();

    for (const port of portsFor(body, lanes)) {
      const marker = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ color: portColor(port), depthTest: false }));
      marker.position.set(...portPosition(port, body));
      marker.renderOrder = 2;
      marker.userData.port = port;
      // Side lanes sit close together, so their markers are smaller.
      marker.userData.scale = !isVertical(port) && parseSide(port).lane !== 0 ? 0.6 : 1;
      marker.scale.setScalar(marker.userData.scale);
      this.markers.set(port, marker);
      this.scene.add(marker);
    }

    const hx = (body.size[0] * CONFIG.cubeSize) / 2;
    const hy = (body.size[1] * CONFIG.cubeSize) / 2;
    const height = bodyHeight(body);
    for (const [face, label] of this.labels) {
      const [dx, dy] = FACE_DIR[face];
      label.position.set(hx + dx * (hx + LABEL_GAP), hy + dy * (hy + LABEL_GAP), 0);
    }

    const span = Math.max(hx * 2, hy * 2, height);
    this.controls.target.set(hx, hy, height / 2);
    this.camera.position.set(hx + span * 2.6, hy - span * 2.2, height / 2 + span * 2.4);
  }

  setResult(result: BuildResult) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = toFlatGeometry(result);
  }

  /** Shows a piece as separate parts, each in the colour of what it is made of. */
  setParts(parts: DisplayPart[] | null) {
    for (const { mesh } of this.extras) {
      mesh.geometry.dispose();
      this.scene.remove(mesh);
    }
    this.extras.length = 0;
    if (!parts) return;
    const [body, ...others] = parts;
    this.setResult(body.result);
    for (const part of others) {
      const mesh = new THREE.Mesh(toFlatGeometry(part.result), part.role === 'steel' ? this.steelMaterial : this.movingMaterial);
      this.extras.push({ mesh, explode: new THREE.Vector3(...part.explode) });
      this.scene.add(mesh);
    }
    this.placeExtras();
  }

  setExploded(exploded: boolean) {
    this.exploded = exploded;
    this.placeExtras();
  }

  private placeExtras() {
    for (const { mesh, explode } of this.extras) mesh.position.copy(this.exploded ? explode : new THREE.Vector3());
  }

  setSelected(selected: Port | null) {
    for (const [port, marker] of this.markers) {
      (marker.material as THREE.MeshBasicMaterial).color.setHex(port === selected ? COLORS.selected : portColor(port));
      marker.scale.setScalar((port === selected ? 1.5 : 1) * marker.userData.scale);
    }
  }

  setSeeThrough(enabled: boolean) {
    for (const material of [this.material, this.movingMaterial]) {
      material.transparent = enabled;
      material.opacity = enabled ? 0.4 : 1;
      material.depthWrite = !enabled;
      material.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    }
  }
}
