import Module, { type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { boreRadius, checkLevels, CONFIG } from './config';
import { channelPath } from './paths';
import { buildPiece } from './piece';
import { ALL_PORTS, boxPiece, channel, isVertical, parseSide, portPosition, type Port } from './ports';
import { CALIBRATION, CALIBRATION_THICKNESS, PRESETS } from './presets';
import { toBinaryStl } from './stl';
import { validateDesign } from './validate';

let wasm: ManifoldToplevel;
const fullVolume = CONFIG.cubeSize * (CONFIG.cubeSize - CONFIG.fitClearance) ** 2;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

describe('configuration', () => {
  it('has a printable level stack-up', () => expect(checkLevels()).toEqual([]));
  it('gives holes a 17 mm bore', () => expect(boreRadius() * 2).toBe(17));
});

describe('paths', () => {
  it('reaches both ports for every valid port pair', () => {
    for (const from of ALL_PORTS) {
      for (const to of ALL_PORTS) {
        if (from === to) continue;
        if (!isVertical(from) && !isVertical(to) && parseSide(from).face === parseSide(to).face) continue;
        const path = channelPath(channel(from, to));
        const touches = (port: Port) => {
          const [x, y, z] = portPosition(port);
          return path.some((p) => {
            // A channel can end at the centre at its own depth rather than on the surface.
            const dz = isVertical(port) ? 0 : Math.abs(p[2] - z);
            return Math.hypot(p[0] - x, p[1] - y) < 1.01 && dz < 1.01;
          });
        };
        expect(touches(from), `${from} -> ${to}`).toBe(true);
        expect(touches(to), `${from} -> ${to}`).toBe(true);
      }
    }
  });
});

describe('channel sections', () => {
  it('derives the section from the ports', () => {
    expect(channel('N.T.0', 'S.T.0').section).toBe('groove');
    expect(channel('N.T.0', 'U.0').section).toBe('groove');
    expect(channel('N.M.0', 'S.M.0').section).toBe('tunnel');
    expect(channel('E.B.0', 'W.B.0').section).toBe('underside');
    expect(channel('N.T.0', 'S.M.0').section).toBe('tunnel');
  });
});

describe('validation', () => {
  it('accepts every preset', () => {
    for (const [name, spec] of Object.entries(PRESETS)) expect(validateDesign(spec.channels), name).toEqual([]);
  });
  it('rejects two ports on one face', () => {
    expect(validateDesign([channel('N.T.0', 'N.M.0')])[0].code).toBe('sameFace');
  });
  it('rejects duplicates in either direction', () => {
    const issues = validateDesign([channel('N.T.0', 'S.T.0'), channel('S.T.0', 'N.T.0')]);
    expect(issues[0].code).toBe('duplicate');
  });
  it('flags a near miss between a ramp and a tunnel', () => {
    const design = [channel('N.T.0', 'S.M.0'), channel('E.M.0', 'W.M.0')];
    expect(validateDesign(design).some((i) => i.code === 'thinWall')).toBe(true);
  });
});

describe('solid', () => {
  it('builds an uncut cube', () => {
    const result = buildPiece(wasm, boxPiece([]));
    expect(result.volume).toBeCloseTo(fullVolume, 3);
    expect(result.pieces).toBe(1);
  });

  for (const [name, spec] of Object.entries(PRESETS)) {
    it(`builds preset ${name} as a single solid`, () => {
      const result = buildPiece(wasm, spec);
      expect(result.pieces).toBe(1);
      expect(result.volume).toBeGreaterThan(0);
      expect(result.volume).toBeLessThan(fullVolume);
    });

    it(`preset ${name} has no overhang steeper than 45 degrees`, () => {
      const { positions: p, triangles } = buildPiece(wasm, spec);
      let worst = 0;
      for (let i = 0; i < triangles.length; i += 3) {
        const [a, b, c] = [triangles[i] * 3, triangles[i + 1] * 3, triangles[i + 2] * 3];
        if (Math.max(p[a + 2], p[b + 2], p[c + 2]) < 1e-3) continue; // sits on the print bed
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(n[0], n[1], n[2]);
        if (length > 1e-6) worst = Math.min(worst, n[2] / length);
      }
      expect(worst).toBeGreaterThanOrEqual(-0.71);
    });
  }

  it('builds a calibration slice with the right thickness', () => {
    const result = buildPiece(wasm, CALIBRATION, { sliceThickness: CALIBRATION_THICKNESS });
    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < result.positions.length; i += 3) {
      min = Math.min(min, result.positions[i]);
      max = Math.max(max, result.positions[i]);
    }
    expect(max - min).toBeCloseTo(CALIBRATION_THICKNESS, 3);
    expect(result.pieces).toBe(1);
  });

  it('keeps a closed roof over a tunnel', () => {
    const { positions } = buildPiece(wasm, PRESETS.straightTunnel);
    let maxZ = 0;
    for (let i = 2; i < positions.length; i += 3) maxZ = Math.max(maxZ, positions[i]);
    expect(maxZ).toBeCloseTo(CONFIG.cubeSize, 3);
  });
});

describe('stl', () => {
  it('writes the exact binary size', () => {
    const { positions, triangles } = buildPiece(wasm, PRESETS.curveTop);
    const stl = toBinaryStl(positions, triangles, 'test');
    const count = triangles.length / 3;
    expect(stl.byteLength).toBe(84 + 50 * count);
    expect(new DataView(stl).getUint32(80, true)).toBe(count);
  });
});
