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

/** How a channel's height changes along its length. */
/** `release` leaves a seat at the top of the piece: level at first, then falling to the side port. */
export type Profile = 'flat' | 'linear' | 'wave' | 'release';

export interface Channel {
  from: Port;
  to: Port;
  section: Section;
  profile: Profile;
}

export interface ChannelOptions {
  section?: Section;
  profile?: Profile;
}

export const CAVITY_TYPES = ['funnel', 'basin', 'chamber', 'spiral', 'spiralMirror'] as const;
export type CavityType = (typeof CAVITY_TYPES)[number];

export const isSpiral = (type: CavityType) => type === 'spiral' || type === 'spiralMirror';

export interface Cavity {
  type: CavityType;
  /** Radius in millimetres; ignored by the spiral, which fills its plate. */
  size: number;
  /** Grid cell holding the cavity; ignored by the spiral. */
  cell: [number, number];
}

export interface PieceSpec {
  body: Body;
  channels: Channel[];
  cavities?: Cavity[];
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

/** True when a piece is too low to hold a closed tunnel. */
export const isLowBody = (body: Body) => bodyHeight(body) < CONFIG.cubeSize;

/**
 * Ball-centre height of a level on a piece. The top groove follows the top of the piece,
 * and on low pieces the middle level sits halfway up, where only an open slot fits.
 */
export function levelZ(level: LevelId, body: Body): number {
  if (level === 'T') return bodyHeight(body);
  if (level === 'M' && isLowBody(body)) return bodyHeight(body) / 2;
  return CONFIG.levels[level].z;
}

/**
 * Ports a body offers. Ports stay on grid-cell centres so pieces can connect, which
 * rules out faces wider than one cell; only boxes carry channels so far.
 */
export function portsFor(body: Body): Port[] {
  if (body.shape !== 'box') return [];
  const [width, length] = body.size;
  return ALL_PORTS.filter((port) => {
    if (isVertical(port)) return width === 1 && length === 1;
    const { face } = parseSide(port);
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

function defaultSection(from: Port, to: Port, body: Body): Section {
  const sides = [from, to].filter((p): p is SidePort => !isVertical(p));
  const sections = sides.map((p) => CONFIG.levels[parseSide(p).level].section);
  if (sections.length === 2) {
    if (isLowBody(body) && sections.includes('tunnel')) return sections.includes('underside') ? 'tunnel' : 'slot';
    if (sections[0] === sections[1]) return sections[0];
    return sections.includes('groove') && sections.includes('tunnel') ? 'slot' : 'tunnel';
  }
  if (sections.length === 0) return 'tunnel';
  const vertical = verticalKind([from, to].find(isVertical) as VerticalPort);
  if (vertical === 'U' && sections[0] === 'groove') return 'groove';
  if (vertical === 'D' && sections[0] === 'underside') return 'underside';
  return 'tunnel';
}

/** Creates a channel; anything not specified follows from its ports and body. */
export function channel(from: Port, to: Port, body: Body = UNIT_BODY, options: ChannelOptions = {}): Channel {
  if (options.profile === 'release' && (isVertical(from) || isVertical(to))) {
    return { from, to, section: options.section ?? defaultSection(from, to, body), profile: 'release' };
  }
  const changesHeight =
    !isVertical(from) && !isVertical(to) && levelZ(parseSide(from).level, body) !== levelZ(parseSide(to).level, body);
  return {
    from,
    to,
    section: options.section ?? defaultSection(from, to, body),
    profile: changesHeight ? (options.profile === 'wave' ? 'wave' : 'linear') : 'flat',
  };
}

export function boxPiece(channels: Channel[], size: Body['size'] = [1, 1, 1], cavities: Cavity[] = []): PieceSpec {
  return { body: { shape: 'box', size }, channels, cavities };
}

/** Applies shape constraints: a cylinder's length always equals its width. */
export function normalizeBody(body: Body): Body {
  const [x, y, z] = body.size;
  return { shape: body.shape, size: [x, body.shape === 'cylinder' ? x : y, z] };
}
