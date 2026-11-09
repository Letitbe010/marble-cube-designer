import JSZip from 'jszip';
import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../simulation/marble';
import { currentValues, invalidFields, withConfig } from './calibration';
import { boreRadius, CONFIG } from './config';
import { buildBoreSlice, buildCoupon, COUPON_HEIGHT, exportCalibrationKit } from './kit';
import { buildBasePlate } from './locators';

let wasm: ManifoldToplevel;
const original = { ...CONFIG };

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

afterEach(() => expect(CONFIG).toEqual(original));

function shared(a: Manifold, b: Manifold): number {
  const overlap = a.intersect(b);
  const volume = overlap.volume();
  [a, b, overlap].forEach((m) => m.delete());
  return volume;
}

function raised(solid: Manifold, x = 0): Manifold {
  const moved = solid.translate([x, 0, CONFIG.plateThickness]);
  solid.delete();
  return moved;
}

describe('configuration overrides', () => {
  it('applies only inside the work', () => {
    expect(withConfig({ boreClearance: 2 }, () => boreRadius())).toBeCloseTo((CONFIG.ballDiameter + 2) / 2, 6);
    expect(CONFIG.boreClearance).toBe(original.boreClearance);
  });

  it('restores the values even when the work fails', () => {
    expect(() => withConfig({ boreClearance: 2 }, () => { throw new Error('no'); })).toThrow();
    expect(CONFIG.boreClearance).toBe(original.boreClearance);
  });
});

describe('calibration values', () => {
  it('reads the values in use', () => {
    expect(currentValues().boreClearance).toBe(CONFIG.boreClearance);
    expect(currentValues().crr).toBe(DEFAULT_PARAMS.crr);
  });

  it('accepts the current values', () => {
    expect(invalidFields(currentValues())).toEqual([]);
  });

  it('rejects a value out of range', () => {
    expect(invalidFields({ ...currentValues(), crr: 5 })).toEqual(['crr']);
    expect(invalidFields({ ...currentValues(), fitClearance: Number.NaN })).toEqual(['fitClearance']);
  });

  it('rejects a bore too large for the levels to stay printable', () => {
    expect(invalidFields({ ...currentValues(), ballDiameter: 25, boreClearance: 3 })).toEqual(['boreClearance']);
  });
});

describe('test pieces', () => {
  it('seats every coupon on the plate at its nominal position', () => {
    for (const clearance of [0.1, 0.2, 0.3]) {
      expect(shared(buildBasePlate(wasm, 1, 1), raised(buildCoupon(wasm, clearance, 1)))).toBeCloseTo(0, 6);
    }
  });

  it('gives each coupon the play it is named for', () => {
    expect(shared(buildBasePlate(wasm, 1, 1), raised(buildCoupon(wasm, 0.1, 1), 0.25))).toBeGreaterThan(0.01);
    expect(shared(buildBasePlate(wasm, 1, 1), raised(buildCoupon(wasm, 0.3, 1), 0.25))).toBeCloseTo(0, 6);
  });

  it('keeps coupons thin and in one piece', () => {
    const coupon = buildCoupon(wasm, 0.2, 3);
    const parts = coupon.decompose();
    expect(parts).toHaveLength(1);
    expect(coupon.boundingBox().max[2]).toBeCloseTo(COUPON_HEIGHT, 6);
    [coupon, ...parts].forEach((m) => m.delete());
  });

  it('widens the bores of the slices', () => {
    const volumes = [0.6, 1, 1.4].map((clearance) => {
      const slice = buildBoreSlice(wasm, clearance, 1);
      const parts = slice.decompose();
      expect(parts).toHaveLength(1);
      const volume = slice.volume();
      [slice, ...parts].forEach((m) => m.delete());
      return volume;
    });
    expect(volumes[0]).toBeGreaterThan(volumes[1]);
    expect(volumes[1]).toBeGreaterThan(volumes[2]);
  });

  it('packs the whole kit', async () => {
    const zip = await JSZip.loadAsync(await exportCalibrationKit(wasm));
    const names = Object.keys(zip.files);
    expect(names.filter((n) => n.startsWith('bore-'))).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('coupon-'))).toHaveLength(3);
    expect(names).toContain('plate-1x1.stl');
    expect(names).toContain('README.txt');
  });
});
