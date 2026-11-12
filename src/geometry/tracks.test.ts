import { describe, expect, it } from 'vitest';
import { cavityFits, helixAxis, helixPath, HELIX, LOOP, loopPath, loopPoint, pieceTrack, wideCurvePath } from './cavities';
import { boreRadius, CONFIG, ROOF_PEAK_FACTOR } from './config';
import { bodyHeight, isTrack, type Vec3 } from './ports';
import { LIBRARY, PRESETS } from './presets';

const gap = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Material left between two bores whose centres are this far apart. */
const wall = (centres: number) => centres - 2 * boreRadius();

describe('track pieces', () => {
  it('lists every track in the library', () => {
    const tracks = LIBRARY.find((group) => group.category === 'catTracks')!.items;
    expect(tracks).toEqual(['wideCurve', 'wideCurveLow', 'helix', 'helixMirror', 'loop']);
    for (const name of tracks) expect(pieceTrack(PRESETS[name]), name).not.toBeNull();
  });

  it('only fits a track into the body it was designed for', () => {
    for (const name of ['wideCurve', 'helix', 'loop']) {
      const [cavity] = PRESETS[name].cavities!;
      expect(isTrack(cavity.type)).toBe(true);
      expect(cavityFits(cavity, PRESETS[name].body), name).toBe(true);
      expect(cavityFits(cavity, { shape: 'box', size: [1, 1, 1] }), name).toBe(false);
    }
  });

  it('gives plain pieces no track', () => {
    expect(pieceTrack(PRESETS.rampStraight)).toBeNull();
    expect(pieceTrack(PRESETS.spiral)).toBeNull();
  });
});

describe('wide curve', () => {
  for (const name of ['wideCurve', 'wideCurveLow']) {
    it(`${name} turns on a 75 mm radius between two cell centres`, () => {
      const { body } = PRESETS[name];
      const path = wideCurvePath(body).slice(1, -1);
      for (const [x, y] of path) expect(Math.hypot(x - 100, y - 100)).toBeCloseTo(75, 6);
      expect(path[0][0]).toBeCloseTo(25, 6);
      expect(path[0][1]).toBeCloseTo(100, 6);
      expect(path[path.length - 1][0]).toBeCloseTo(100, 6);
      expect(path[path.length - 1][1]).toBeCloseTo(25, 6);
    });

    it(`${name} walls the marble in above its centre`, () => {
      const { body } = PRESETS[name];
      const z = wideCurvePath(body)[5][2];
      expect(bodyHeight(body) - z).toBeGreaterThan(CONFIG.ballDiameter / 2);
      expect(z - boreRadius()).toBeGreaterThanOrEqual(CONFIG.minWall);
    });
  }
});

describe('helix', () => {
  const { body } = PRESETS.helix;
  const path = helixPath(body);
  const winding = path.slice(1, -1);

  it('comes out straight under where it goes in, so that modules stack', () => {
    const [x, y] = helixAxis(body);
    expect(path[0]).toEqual([x, y, bodyHeight(body) + 1]);
    expect(path[path.length - 1]).toEqual([x, y, -1]);
    expect(winding[winding.length - 1][0]).toBeCloseTo(x, 6);
    expect(winding[winding.length - 1][1]).toBeCloseTo(y, 6);
    // The way in is the centre of a cell, where a hole of the piece above can be.
    expect([x % CONFIG.cubeSize, y % CONFIG.cubeSize]).toEqual([25, 25]);
  });

  it('never climbs', () => {
    for (let i = 1; i < path.length; i++) expect(path[i][2]).toBeLessThanOrEqual(path[i - 1][2]);
  });

  it('keeps a printable wall between its turns, its roof and its floor', () => {
    const perTurn = HELIX.steps / HELIX.turns;
    const roofPeak = boreRadius() * ROOF_PEAK_FACTOR;
    for (let i = 0; i + perTurn < winding.length; i++) {
      const pitch = winding[i][2] - winding[i + perTurn][2];
      expect(pitch - boreRadius() - roofPeak).toBeGreaterThanOrEqual(CONFIG.minWall);
    }
    expect(bodyHeight(body) - (winding[0][2] + roofPeak)).toBeGreaterThanOrEqual(CONFIG.minWall);
    expect(winding[winding.length - 1][2] - boreRadius()).toBeGreaterThanOrEqual(CONFIG.minWall);
  });

  it('keeps a wall between the bore and the outer faces', () => {
    const span = body.size[0] * CONFIG.cubeSize;
    for (const [x, y] of winding) {
      expect(Math.min(x, y, span - x, span - y) - boreRadius()).toBeGreaterThanOrEqual(CONFIG.minWall);
    }
  });

  it('shows the marble through slits it cannot leave by', () => {
    expect(HELIX.windowWidth).toBeLessThan(CONFIG.ballDiameter - 4);
  });

  it('winds the other way when mirrored, from the same way in', () => {
    const mirrored = helixPath(body, true);
    expect(mirrored[0]).toEqual(path[0]);
    path.forEach(([x, y, z], i) => expect(mirrored[i]).toEqual([y, x, z]));
    expect(mirrored[10]).not.toEqual(path[10]);
  });
});

describe('vertical loop', () => {
  const { body } = PRESETS.loop;
  const path = loopPath(body);

  it('runs from the middle of one end face to the middle of the other', () => {
    expect(path[1]).toEqual([25, 150, 25]);
    expect(path[path.length - 2][0]).toBeCloseTo(25, 6);
    expect(path[path.length - 2][1]).toBeCloseTo(0, 6);
  });

  it('leaves a roof over its highest point', () => {
    const top = Math.max(...path.map((p) => p[2]));
    expect(top).toBeCloseTo(25 + 2 * LOOP.radius, 6);
    expect(bodyHeight(body) - (top + boreRadius() * ROOF_PEAK_FACTOR)).toBeGreaterThanOrEqual(CONFIG.minWall);
  });

  it('goes in and comes out in different lanes, with a wall between them', () => {
    const [start, end] = [loopPoint(body, 0), loopPoint(body, 2 * Math.PI)];
    expect(start[0]).toBeCloseTo(25 - CONFIG.laneOffset, 6);
    expect(end[0]).toBeCloseTo(25 + CONFIG.laneOffset, 6);
    expect(wall(gap(start, end))).toBeGreaterThanOrEqual(CONFIG.minWall);
  });

  it('keeps the loop clear of the tracks that lead in and out', () => {
    // Away from the lowest point, where the three meet, no part of the loop may come near either straight.
    const straightIn = path.filter((p) => p[2] === 25 && p[1] > 75);
    const straightOut = path.filter((p) => p[2] === 25 && p[1] < 75);
    for (let degrees = 40; degrees <= 320; degrees += 5) {
      const point = loopPoint(body, (degrees * Math.PI) / 180);
      for (const other of [...straightIn, ...straightOut]) expect(wall(gap(point, other)), `${degrees}`).toBeGreaterThanOrEqual(CONFIG.minWall);
    }
    for (let degrees = 5; degrees <= 40; degrees += 5) {
      const rising = loopPoint(body, (degrees * Math.PI) / 180);
      const falling = loopPoint(body, ((360 - degrees) * Math.PI) / 180);
      for (const other of straightOut) expect(wall(gap(falling, other)), `${degrees}`).toBeGreaterThanOrEqual(CONFIG.minWall);
      for (const other of straightIn) expect(wall(gap(rising, other)), `${degrees}`).toBeGreaterThanOrEqual(CONFIG.minWall);
    }
  });

  it('shows the marble through slits it cannot leave by', () => {
    expect(2 * LOOP.windowHalf).toBeLessThan(CONFIG.ballDiameter - 4);
    for (const [from, to] of LOOP.windows) expect(to - from).toBeGreaterThanOrEqual(90);
  });
});
