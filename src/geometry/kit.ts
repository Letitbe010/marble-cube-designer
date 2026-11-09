import JSZip from 'jszip';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { buildBody } from './body';
import { withConfig } from './calibration';
import { CONFIG } from './config';
import { buildBasePlate, cutPockets } from './locators';
import { buildSolid, toResult } from './piece';
import type { Body } from './ports';
import { CALIBRATION, CALIBRATION_THICKNESS } from './presets';
import { toBinaryStl } from './stl';

export const BORE_STEPS = [-0.4, 0, 0.4];
export const CLEARANCE_STEPS = [0.1, 0.2, 0.3];
export const COUPON_HEIGHT = 12;

const PIT_RADIUS = 1.2;

/** Marks a slice with 1 to 3 small pits on its flat side, so that the prints can be told apart. */
function markSlice(wasm: ManifoldToplevel, solid: Manifold, count: number): Manifold {
  const face = (CONFIG.cubeSize + CALIBRATION_THICKNESS) / 2;
  let result = solid;
  for (let i = 0; i < count; i++) {
    const upright = wasm.Manifold.cylinder(3, PIT_RADIUS, PIT_RADIUS, 16);
    const across = upright.rotate([90, 0, 0]);
    const pit = across.translate([8, face + 1, 10 + i * 6]);
    const next = result.subtract(pit);
    [upright, across, pit].forEach((m) => m.delete());
    if (result !== solid) result.delete();
    result = next;
  }
  return result;
}

/** A thin square with pockets underneath, for testing how a piece seats on the studs. */
export function buildCoupon(wasm: ManifoldToplevel, clearance: number, marks: number): Manifold {
  const height = COUPON_HEIGHT / CONFIG.cubeSize;
  const body: Body = { shape: 'box', size: [1, 1, height] };
  const plain = buildBody(wasm, body);
  const pocketed = withConfig({ locatorClearance: clearance }, () => cutPockets(wasm, plain, body));
  plain.delete();
  let result = pocketed;
  for (let i = 0; i < marks; i++) {
    const raw = wasm.Manifold.cylinder(3, PIT_RADIUS, PIT_RADIUS, 16);
    const pit = raw.translate([17 + i * 8, 25, COUPON_HEIGHT - 1.5]);
    const next = result.subtract(pit);
    [raw, pit, result].forEach((m) => m.delete());
    result = next;
  }
  return result;
}

/** A slice through all three channel levels, with the given bore clearance. */
export function buildBoreSlice(wasm: ManifoldToplevel, boreClearance: number, marks: number): Manifold {
  return withConfig({ boreClearance }, () => {
    const slice = buildSolid(wasm, CALIBRATION, { sliceThickness: CALIBRATION_THICKNESS });
    const marked = markSlice(wasm, slice, marks);
    slice.delete();
    return marked;
  });
}

const NOTES = `Calibration kit

bore-*.stl       Three slices with different bore sizes (1, 2 or 3 pits on the side).
                 Print standing as exported, without supports. Test the marble in each channel.
coupon-*.stl     Three squares with different stud clearance (1, 2 or 3 pits on top).
plate-1x1.stl    Studs to test the squares on. Print flat.

Enter the values that work best in the Calibration tab of the app.
`;

/** Packs the test pieces for measuring the real printer and marbles. */
export async function exportCalibrationKit(wasm: ManifoldToplevel): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const add = (name: string, solid: Manifold) => {
    const { positions, triangles } = toResult(solid);
    solid.delete();
    zip.file(name, toBinaryStl(positions, triangles, name));
  };

  BORE_STEPS.forEach((step, i) => {
    const clearance = Math.max(0.2, CONFIG.boreClearance + step);
    add(`bore-${(CONFIG.ballDiameter + clearance).toFixed(1)}mm-pits${i + 1}.stl`, buildBoreSlice(wasm, clearance, i + 1));
  });
  CLEARANCE_STEPS.forEach((clearance, i) => add(`coupon-${clearance.toFixed(1)}mm-pits${i + 1}.stl`, buildCoupon(wasm, clearance, i + 1)));
  add('plate-1x1.stl', buildBasePlate(wasm, 1, 1));
  zip.file('README.txt', NOTES);
  return zip.generateAsync({ type: 'arraybuffer' });
}
