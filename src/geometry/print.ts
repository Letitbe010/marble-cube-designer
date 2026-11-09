import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { CONFIG } from './config';
import { buildSolid, toResult, type BuildResult } from './piece';
import { bodyHeight, channelKey, type PieceSpec } from './ports';

export interface PrintOptions {
  /** Cuts a tunnel piece in two at tunnel height, joined with pins. */
  split?: boolean;
  /** Engraves the piece identifier on the underside. */
  engrave?: boolean;
}

export interface PrintPart {
  /** Empty for a whole piece; otherwise tells the halves apart. */
  suffix: string;
  result: BuildResult;
}

export interface PrintOutput {
  id: string;
  parts: PrintPart[];
}

/** Share of a tool that must lie in solid material for it to count as fitting. */
const FIT_RATIO = 0.995;

const DIGIT_WIDTH = 3;
const DIGIT_HEIGHT = 5;
const DIGIT_GAP = 1;
const STROKE = 0.8;
const ID_LENGTH = 4;
const ID_MARGIN = 3;

/** Lit segments of each hexadecimal digit, in the order a b c d e f g. */
const SEGMENTS: Record<string, string> = {
  '0': '1111110', '1': '0110000', '2': '1101101', '3': '1111001', '4': '0110011', '5': '1011011',
  '6': '1011111', '7': '1110000', '8': '1111111', '9': '1111011', A: '1110111', B: '0011111',
  C: '1001110', D: '0111101', E: '1001111', F: '1000111',
};

/** Text describing a piece's geometry, independent of the order it was edited in. */
export function specKey(spec: PieceSpec): string {
  return JSON.stringify({
    body: spec.body,
    channels: spec.channels.map((c) => `${channelKey(c)}:${c.section}:${c.profile}`).sort(),
    cavities: (spec.cavities ?? []).map((c) => `${c.type}:${c.size}:${c.cell.join(',')}`).sort(),
  });
}

/** Short code identifying a piece's geometry. */
export function pieceId(spec: PieceSpec): string {
  const canonical = specKey(spec);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 0x10000).toString(16).toUpperCase().padStart(ID_LENGTH, '0');
}

/** Only a closed tunnel gains from being opened along its length. */
export function canSplit(spec: PieceSpec): boolean {
  return bodyHeight(spec.body) >= CONFIG.cubeSize && spec.channels.some((c) => c.section === 'tunnel');
}

function fits(tool: Manifold, solid: Manifold, expectedVolume: number): boolean {
  const overlap = tool.intersect(solid);
  const volume = overlap.volume();
  overlap.delete();
  return volume >= expectedVolume * FIT_RATIO;
}

/** Rectangles of a digit in block coordinates: [x, y, width, height]. */
function digitRects(digit: string, originX: number): [number, number, number, number][] {
  const w = DIGIT_WIDTH;
  const h = DIGIT_HEIGHT;
  const mid = (h - STROKE) / 2;
  const half = (h + STROKE) / 2;
  const all: [number, number, number, number][] = [
    [0, h - STROKE, w, STROKE],
    [w - STROKE, mid, STROKE, half],
    [w - STROKE, 0, STROKE, half],
    [0, 0, w, STROKE],
    [0, 0, STROKE, half],
    [0, mid, STROKE, half],
    [0, mid, w, STROKE],
  ];
  return all.filter((_, i) => SEGMENTS[digit][i] === '1').map(([x, y, rw, rh]) => [originX + x, y, rw, rh]);
}

/** Cuts the identifier into the underside, mirrored so that it reads from below. */
function engraveId(wasm: ManifoldToplevel, solid: Manifold, id: string, spec: PieceSpec): Manifold {
  const { Manifold } = wasm;
  const { idDepth, cubeSize } = CONFIG;
  const below = 1;
  const blockWidth = ID_LENGTH * DIGIT_WIDTH + (ID_LENGTH - 1) * DIGIT_GAP;
  const [sizeX, sizeY] = spec.body.size;
  const [spanX, spanY] = [sizeX * cubeSize, sizeY * cubeSize];

  const rects = [...id].flatMap((digit, i) => digitRects(digit, i * (DIGIT_WIDTH + DIGIT_GAP)));
  const boxes = rects.map(([x, y, w, h]) => {
    const raw = Manifold.cube([w, h, idDepth + below]);
    const placed = raw.translate([blockWidth - x - w, y, -below]);
    raw.delete();
    return placed;
  });
  const glyphs = Manifold.union(boxes);
  boxes.forEach((b) => b.delete());

  const engravedVolume = (glyphs.volume() * idDepth) / (idDepth + below);
  const candidates: [number, number][] = [
    [ID_MARGIN, ID_MARGIN],
    [spanX - blockWidth - ID_MARGIN, ID_MARGIN],
    [ID_MARGIN, spanY - DIGIT_HEIGHT - ID_MARGIN],
    [spanX - blockWidth - ID_MARGIN, spanY - DIGIT_HEIGHT - ID_MARGIN],
    [(spanX - blockWidth) / 2, (spanY - DIGIT_HEIGHT) / 2],
  ];

  try {
    for (const [x, y] of candidates) {
      const placed = glyphs.translate([x, y, 0]);
      try {
        if (fits(placed, solid, engravedVolume)) return solid.subtract(placed);
      } finally {
        placed.delete();
      }
    }
    return solid;
  } finally {
    glyphs.delete();
  }
}

/** Drills pin holes across the split plane wherever they clear the channels. */
function drillPins(wasm: ManifoldToplevel, solid: Manifold, spec: PieceSpec, z: number): Manifold {
  const { cubeSize, pinDiameter, pinClearance, pinDepth, pinInset } = CONFIG;
  const radius = (pinDiameter + pinClearance) / 2;
  const [spanX, spanY] = [spec.body.size[0] * cubeSize, spec.body.size[1] * cubeSize];
  const positions: [number, number][] = [
    [pinInset, pinInset],
    [spanX - pinInset, pinInset],
    [pinInset, spanY - pinInset],
    [spanX - pinInset, spanY - pinInset],
  ];
  const pinVolume = Math.PI * radius * radius * pinDepth * 2;

  let current = solid;
  for (const [x, y] of positions) {
    const raw = wasm.Manifold.cylinder(pinDepth * 2, radius, radius, 24);
    const pin = raw.translate([x, y, z - pinDepth]);
    raw.delete();
    if (fits(pin, current, pinVolume * 0.95)) {
      const next = current.subtract(pin);
      if (current !== solid) current.delete();
      current = next;
    }
    pin.delete();
  }
  return current;
}

/** Moves a solid so that it rests on the print bed. */
function placeOnBed(solid: Manifold): Manifold {
  return solid.translate([0, 0, -solid.boundingBox().min[2]]);
}

/** Builds the files to print for a piece, each laid out on the print bed. */
export function buildPrintParts(wasm: ManifoldToplevel, spec: PieceSpec, options: PrintOptions = {}): PrintOutput {
  const id = pieceId(spec);
  const owned: Manifold[] = [];
  const keep = (m: Manifold) => {
    if (!owned.includes(m)) owned.push(m);
    return m;
  };

  try {
    let solid = keep(buildSolid(wasm, spec));
    if (options.engrave) solid = keep(engraveId(wasm, solid, id, spec));

    if (options.split && canSplit(spec)) {
      const z = CONFIG.levels.M.z;
      solid = keep(drillPins(wasm, solid, spec, z));
      const halves = solid.splitByPlane([0, 0, 1], z).map(keep);
      halves.sort((a, b) => a.boundingBox().min[2] - b.boundingBox().min[2]);
      return {
        id,
        parts: [
          { suffix: 'bottom', result: toResult(keep(placeOnBed(halves[0]))) },
          { suffix: 'top', result: toResult(keep(placeOnBed(halves[1]))) },
        ],
      };
    }

    // An arch printed upright would need its crown supported; on its side it needs nothing.
    if (spec.body.shape === 'arch') solid = keep(placeOnBed(keep(solid.rotate([90, 0, 0]))));

    return { id, parts: [{ suffix: '', result: toResult(solid) }] };
  } finally {
    owned.forEach((m) => m.delete());
  }
}
