import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from '../geometry/config';
import type { BuildResult } from '../geometry/piece';
import { ALL_PORTS, FACE_DIR, FACES, isVertical, parseSide, portPosition, type Port } from '../geometry/ports';

const COLORS = { T: 0x1f5fbf, M: 0xd9822b, B: 0x2f8f5b, vertical: 0x4b5563, selected: 0xd4262c };

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

/** 3D view of the current cube, with clickable port markers. */
export class Viewer {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 1, 1000);
  private readonly controls: OrbitControls;
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 0.75, flatShading: true });
  private readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
  private readonly markers = new Map<Port, THREE.Mesh>();
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly container: HTMLElement, onPortClick: (port: Port) => void) {
    const size = CONFIG.cubeSize;
    const centre = new THREE.Vector3(size / 2, size / 2, size / 2);

    this.scene.background = new THREE.Color(0xf4f4f1);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(size * 2.6, -size * 2.2, size * 2.4);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(60, -80, 140);
    this.scene.add(sun, this.mesh);

    const markerGeometry = new THREE.SphereGeometry(2.6, 20, 14);
    for (const port of ALL_PORTS) {
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: portColor(port), depthTest: false }));
      marker.position.set(...portPosition(port));
      marker.renderOrder = 2;
      marker.userData.port = port;
      this.markers.set(port, marker);
      this.scene.add(marker);
    }
    for (const face of FACES) {
      const [dx, dy] = FACE_DIR[face];
      const label = faceLabel(face);
      label.position.set(size / 2 + dx * size * 0.78, size / 2 + dy * size * 0.78, 0);
      this.scene.add(label);
    }

    container.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(centre);
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

  setResult(result: BuildResult) {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
    indexed.setIndex(new THREE.BufferAttribute(result.triangles, 1));
    const flat = indexed.toNonIndexed();
    flat.computeVertexNormals();
    indexed.dispose();
    this.mesh.geometry.dispose();
    this.mesh.geometry = flat;
  }

  setSelected(selected: Port | null) {
    for (const [port, marker] of this.markers) {
      (marker.material as THREE.MeshBasicMaterial).color.setHex(port === selected ? COLORS.selected : portColor(port));
      marker.scale.setScalar(port === selected ? 1.5 : 1);
    }
  }

  setSeeThrough(enabled: boolean) {
    this.material.transparent = enabled;
    this.material.opacity = enabled ? 0.4 : 1;
    this.material.depthWrite = !enabled;
    this.material.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
    this.material.needsUpdate = true;
  }
}
