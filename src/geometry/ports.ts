import { CONFIG, LEVEL_IDS, type LevelId, type Section } from './config';

export type Face = 'N' | 'E' | 'S' | 'W';
/** Lateral track position on a face; only the centre lane exists for now. */
export type Lane = 0;
export type SidePort = `${Face}.${LevelId}.${Lane}`;
export type VerticalPort = `${'U' | 'D'}.${Lane}`;
export type Port = SidePort | VerticalPort;
export type Vec3 = [number, number, number];

export const SHAPES = ['box', 'cylinder', 'halfCylinder', 'arch', 'roof'] as const;
export type Shape = (typeof SHAPES)[number];

export interface Body {
  shape: Shape;
  /** Size in grid units: width (X), length (Y), height (Z). */
  size: [number, number, number];
}

export interface Channel {
  from: Port;
  to: Port;
  section: Section;
}

export interface PieceSpec {
  body: Body;
  channels: Channel[];
}

export const UNIT_BODY: Body = { shape: 'box', size: [1, 1, 1] };

export const FACES: Face[] = ['N', 'E', 'S', 'W'];
export const ALL_PORTS: Port[] = [
  ...FACES.flatMap((f) => LEVEL_IDS.map((l) => `${f}.${l}.0` as Port)),
  'U.0',
  'D.0',
];

export const FACE_DIR: Record<Face, [number, number]> = {
  N: [0, 1],
  E: [1, 0],
  S: [0, -1],
  W: [-1, 0],
};

export function isVertical(port: Port): port is VerticalPort {
  return port[0] === 'U' || port[0] === 'D';
}

export function verticalKind(port: VerticalPort): 'U' | 'D' {
  return port[0] as 'U' | 'D';
}

export function parseSide(port: SidePort): { face: Face; level: LevelId } {
  const [face, level] = port.split('.') as [Face, LevelId];
  return { face, level };
}

export const bodyHeight = (body: Body) => body.size[2] * CONFIG.cubeSize;

/** Ball-centre height of a level on a piece: the top groove follows the top of the piece. */
export function levelZ(level: LevelId, body: Body): number {
  return level === 'T' ? bodyHeight(body) : CONFIG.levels[level].z;
}

/**
 * Ports a body offers. Ports stay on grid-cell centres so pieces can connect, which
 * rules out faces wider than one cell; only boxes carry channels so far.
 */
export function portsFor(body: Body): Port[] {
  if (body.shape !== 'box') return [];
  const [width, length] = body.size;
  const tunnelFits = bodyHeight(body) >= CONFIG.cubeSize;
  return ALL_PORTS.filter((port) => {
    if (isVertical(port)) return width === 1 && length === 1;
    const { face, level } = parseSide(port);
    if (level === 'M' && !tunnelFits) return false;
    return (face === 'N' || face === 'S' ? width : length) === 1;
  });
}

/** Position of a port on the surface of a piece. */
export function portPosition(port: Port, body: Body): Vec3 {
  const hx = (body.size[0] * CONFIG.cubeSize) / 2;
  const hy = (body.size[1] * CONFIG.cubeSize) / 2;
  if (isVertical(port)) return [hx, hy, verticalKind(port) === 'U' ? bodyHeight(body) : 0];
  const { face, level } = parseSide(port);
  const [dx, dy] = FACE_DIR[face];
  return [hx + dx * hx, hy + dy * hy, levelZ(level, body)];
}

export function channelKey(c: Pick<Channel, 'from' | 'to'>): string {
  return [c.from, c.to].sort().join('|');
}

function defaultSection(from: Port, to: Port): Section {
  const sides = [from, to].filter((p): p is SidePort => !isVertical(p));
  const sections = sides.map((p) => CONFIG.levels[parseSide(p).level].section);
  if (sections.length === 2) return sections[0] === sections[1] ? sections[0] : 'tunnel';
  if (sections.length === 0) return 'tunnel';
  const vertical = verticalKind([from, to].find(isVertical) as VerticalPort);
  if (vertical === 'U' && sections[0] === 'groove') return 'groove';
  if (vertical === 'D' && sections[0] === 'underside') return 'underside';
  return 'tunnel';
}

/** Creates a channel with the section its ports imply. */
export function channel(from: Port, to: Port): Channel {
  return { from, to, section: defaultSection(from, to) };
}

export function boxPiece(channels: Channel[], size: Body['size'] = [1, 1, 1]): PieceSpec {
  return { body: { shape: 'box', size }, channels };
}

/** Applies shape constraints: a cylinder's length always equals its width. */
export function normalizeBody(body: Body): Body {
  const [x, y, z] = body.size;
  return { shape: body.shape, size: [x, body.shape === 'cylinder' ? x : y, z] };
}
