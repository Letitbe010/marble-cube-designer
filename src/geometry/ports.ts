import { CONFIG, LEVEL_IDS, type LevelId } from './config';

export type Face = 'N' | 'E' | 'S' | 'W';
export type Port = `${Face}.${LevelId}` | 'U' | 'D';
export type Vec3 = [number, number, number];

export interface Segment {
  from: Port;
  to: Port;
}

export const FACES: Face[] = ['N', 'E', 'S', 'W'];
export const ALL_PORTS: Port[] = [
  ...FACES.flatMap((f) => LEVEL_IDS.map((l) => `${f}.${l}` as Port)),
  'U',
  'D',
];

export const FACE_DIR: Record<Face, [number, number]> = {
  N: [0, 1],
  E: [1, 0],
  S: [0, -1],
  W: [-1, 0],
};

export function isVertical(port: Port): port is 'U' | 'D' {
  return port === 'U' || port === 'D';
}

export function parseSide(port: Exclude<Port, 'U' | 'D'>): { face: Face; level: LevelId } {
  const [face, level] = port.split('.') as [Face, LevelId];
  return { face, level };
}

/** Position of a port on the surface of the cube. */
export function portPosition(port: Port): Vec3 {
  const half = CONFIG.cubeSize / 2;
  if (port === 'U') return [half, half, CONFIG.cubeSize];
  if (port === 'D') return [half, half, 0];
  const { face, level } = parseSide(port);
  const [dx, dy] = FACE_DIR[face];
  return [half + dx * half, half + dy * half, CONFIG.levels[level].z];
}

export function segmentKey(s: Segment): string {
  return [s.from, s.to].sort().join('|');
}
