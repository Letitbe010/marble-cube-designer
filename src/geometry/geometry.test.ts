import Module, { type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { boreRadius, checkLevels, CONFIG } from './config';
import { channelPath } from './paths';
import { buildPiece } from './piece';
import { ALL_PORTS, boxPiece, channel, isVertical, parseSide, portPosition, portsFor, UNIT_BODY, type Body, type Port, type Shape } from './ports';
import { CALIBRATION, CALIBRATION_THICKNESS, PRESETS } from './presets';
import { toBinaryStl } from './stl';
import { adaptChannels, validateDesign } from './validate';

const LOW_BODY: Body = { shape: 'box', size: [1, 1, 0.5] };
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
        const path = channelPath(channel(from, to), UNIT_BODY);
        const touches = (port: Port) => {
          const [x, y, z] = portPosition(port, UNIT_BODY);
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
    expect(channel('N.T.0', 'S.M.0').section).toBe('slot');
    expect(channel('N.M.0', 'S.B.0').section).toBe('tunnel');
  });

  it('only ramps channels whose ends differ in height', () => {
    expect(channel('N.T.0', 'S.T.0', UNIT_BODY, { profile: 'wave' }).profile).toBe('flat');
    expect(channel('N.T.0', 'S.M.0').profile).toBe('linear');
    expect(channel('N.T.0', 'S.M.0', UNIT_BODY, { profile: 'wave' }).profile).toBe('wave');
  });

  it('forces an open section at the middle level of a low piece', () => {
    expect(channel('N.M.0', 'S.M.0', LOW_BODY).section).toBe('slot');
  });
});

describe('profiles', () => {
  const heights = (spec: { body: typeof UNIT_BODY; channels: ReturnType<typeof channel>[] }) =>
    channelPath(spec.channels[0], spec.body).map((p) => p[2]);

  it('descends from the top level to the middle level', () => {
    const z = heights(PRESETS.rampStraight);
    expect(z[0]).toBe(50);
    expect(z[z.length - 1]).toBe(25);
  });

  it('never climbs on the way down', () => {
    for (const name of ['rampStraight', 'rampLow', 'rampCurve', 'rampLong3', 'waveLong3']) {
      const z = heights(PRESETS[name]);
      z.slice(1).forEach((value, i) => expect(value, name).toBeLessThanOrEqual(z[i] + 1e-9));
    }
  });

  it('makes a long wave differ from a straight line', () => {
    const wave = heights(PRESETS.waveLong3);
    const line = heights(PRESETS.rampLong3);
    const gap = Math.max(...wave.map((z, i) => Math.abs(z - line[i])));
    expect(gap).toBeGreaterThan(0.5);
  });
});

describe('validation', () => {
  it('accepts every preset', () => {
    for (const [name, spec] of Object.entries(PRESETS)) expect(validateDesign(spec), name).toEqual([]);
  });
  it('rejects two ports on one face', () => {
    expect(validateDesign(boxPiece([channel('N.T.0', 'N.M.0')]))[0].code).toBe('sameFace');
  });
  it('rejects duplicates in either direction', () => {
    const issues = validateDesign(boxPiece([channel('N.T.0', 'S.T.0'), channel('S.T.0', 'N.T.0')]));
    expect(issues[0].code).toBe('duplicate');
  });
  it('flags a near miss between a ramp and a tunnel', () => {
    const design = [channel('N.T.0', 'S.M.0'), channel('E.M.0', 'W.M.0')];
    expect(validateDesign(boxPiece(design)).some((i) => i.code === 'thinWall')).toBe(true);
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
      expect(result.volume).toBeLessThan(buildPiece(wasm, { body: spec.body, channels: [] }).volume + (spec.channels.length ? 0 : 1));
    });

    // Arches print on their side; automatic orientation arrives with the print output step.
    it.skipIf(spec.body.shape === 'arch')(`preset ${name} has no overhang steeper than 45 degrees`, () => {
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

describe('bodies', () => {
  const extents = (positions: Float32Array) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    positions.forEach((value, i) => {
      min[i % 3] = Math.min(min[i % 3], value);
      max[i % 3] = Math.max(max[i % 3], value);
    });
    return max.map((m, i) => m - min[i]);
  };
  const shapes: [Shape, [number, number, number]][] = [
    ['box', [1, 1, 0.5]],
    ['box', [2, 2, 0.5]],
    ['box', [1, 3, 2]],
    ['halfCylinder', [2, 1, 1]],
    ['roof', [2, 3, 0.5]],
    ['arch', [1, 1, 0.5]],
    ['arch', [2, 3, 2]],
  ];

  for (const [shape, size] of shapes) {
    it(`builds a ${shape} of ${size.join('x')} with the right outline`, () => {
      const result = buildPiece(wasm, { body: { shape, size }, channels: [] });
      const [x, y, z] = extents(result.positions);
      expect(result.pieces).toBe(1);
      expect(x).toBeCloseTo(size[0] * CONFIG.cubeSize - CONFIG.fitClearance, 2);
      expect(y).toBeCloseTo(size[1] * CONFIG.cubeSize - CONFIG.fitClearance, 2);
      expect(z).toBeCloseTo(size[2] * CONFIG.cubeSize, 2);
    });
  }

  it('builds a cylinder with the expected volume', () => {
    const result = buildPiece(wasm, { body: { shape: 'cylinder', size: [1, 1, 1] }, channels: [] });
    const r = (CONFIG.cubeSize - CONFIG.fitClearance) / 2;
    expect(result.volume / (Math.PI * r * r * CONFIG.cubeSize)).toBeCloseTo(1, 2);
  });

  it('offers ports only on faces one cell wide', () => {
    const ports = portsFor({ shape: 'box', size: [1, 2, 1] });
    expect(ports).toContain('N.T.0');
    expect(ports).toContain('S.M.0');
    expect(ports).not.toContain('E.T.0');
    expect(ports).not.toContain('U.0');
    expect(portsFor({ shape: 'box', size: [2, 2, 1] })).toEqual([]);
  });

  it('allows only open channels at the middle level of low pieces', () => {
    expect(portPosition('N.M.0', LOW_BODY)[2]).toBe(12.5);
    const tunnel = channel('N.M.0', 'S.M.0', LOW_BODY, { section: 'tunnel' });
    expect(validateDesign({ body: LOW_BODY, channels: [tunnel] })[0].code).toBe('badSection');
    expect(validateDesign({ body: LOW_BODY, channels: [channel('N.M.0', 'S.M.0', LOW_BODY)] })).toEqual([]);
  });

  it('rejects an open section that has no clear way up', () => {
    const slot = channel('N.B.0', 'S.B.0', UNIT_BODY, { section: 'slot' });
    expect(validateDesign(boxPiece([slot]))[0].code).toBe('badSection');
  });

  it('refits channels when a piece gets lower', () => {
    const tunnel = channel('N.M.0', 'S.M.0');
    expect(adaptChannels([tunnel], LOW_BODY)[0].section).toBe('slot');
  });

  it('offers no ports on structural shapes', () => {
    expect(portsFor({ shape: 'arch', size: [2, 1, 1] })).toEqual([]);
  });

  it('puts the top groove at the top of a low piece', () => {
    const body = { shape: 'box', size: [1, 1, 0.5] } as const;
    expect(portPosition('N.T.0', { ...body, size: [1, 1, 0.5] })[2]).toBe(25);
  });

  it('runs a long groove from end to end', () => {
    const body = PRESETS.longGroove3.body;
    const path = channelPath(PRESETS.longGroove3.channels[0], body);
    const ys = path.map((p) => p[1]);
    expect(Math.max(...ys)).toBeCloseTo(151, 3);
    expect(Math.min(...ys)).toBeCloseTo(-1, 3);
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
