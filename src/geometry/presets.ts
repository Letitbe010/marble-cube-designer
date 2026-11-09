import { boxPiece, channel as c, type Body, type Cavity, type CavityType, type PieceSpec, type Port, type Shape } from './ports';

const cavity = (type: CavityType, size: number): Cavity => ({ type, size, cell: [0, 0] });

const solid = (shape: Shape, size: [number, number, number]): PieceSpec => ({ body: { shape, size }, channels: [] });

const box = (size: [number, number, number]): Body => ({ shape: 'box', size });
const LOW = box([1, 1, 0.5]);
const LONG2 = box([1, 2, 0.5]);
const LONG3 = box([1, 3, 0.5]);
const RELEASE = { section: 'slot', profile: 'release' } as const;

export const PRESETS: Record<string, PieceSpec> = {
  cube: solid('box', [1, 1, 1]),
  halfBlock: solid('box', [1, 1, 0.5]),
  longBlock2: solid('box', [1, 2, 1]),
  longBlock3: solid('box', [1, 3, 1]),
  plate: solid('box', [2, 2, 0.5]),

  cylinder: solid('cylinder', [1, 1, 1]),
  halfRound: solid('halfCylinder', [1, 1, 0.5]),
  arch: solid('arch', [2, 1, 1]),
  roof: solid('roof', [1, 1, 0.5]),

  straightTop: boxPiece([c('N.T.0', 'S.T.0')]),
  curveTop: boxPiece([c('N.T.0', 'E.T.0')]),
  crossTop: boxPiece([c('N.T.0', 'S.T.0'), c('E.T.0', 'W.T.0')]),
  drop: boxPiece([c('N.T.0', 'U.0'), c('U.0', 'D.0')]),
  straightTunnel: boxPiece([c('N.M.0', 'S.M.0')]),
  curveTunnel: boxPiece([c('N.M.0', 'E.M.0')]),
  topToTunnel: boxPiece([c('U.0', 'E.M.0')]),
  underside: boxPiece([c('E.B.0', 'W.B.0')]),
  double: boxPiece([c('N.T.0', 'S.T.0'), c('E.M.0', 'W.M.0')]),

  halfGroove: boxPiece([c('N.T.0', 'S.T.0')], [1, 1, 0.5]),
  halfCurve: boxPiece([c('N.T.0', 'E.T.0')], [1, 1, 0.5]),
  longGroove2: boxPiece([c('N.T.0', 'S.T.0')], [1, 2, 0.5]),
  longGroove3: boxPiece([c('N.T.0', 'S.T.0')], [1, 3, 0.5]),
  longTunnel2: boxPiece([c('N.M.0', 'S.M.0')], [1, 2, 1]),

  rampStraight: boxPiece([c('N.T.0', 'S.M.0')]),
  rampLow: boxPiece([c('N.T.0', 'S.M.0', LOW)], [1, 1, 0.5]),
  rampCurve: boxPiece([c('N.T.0', 'E.M.0')]),
  rampCurveLow: boxPiece([c('N.T.0', 'E.M.0', LOW)], [1, 1, 0.5]),
  rampCurveMirror: boxPiece([c('N.T.0', 'W.M.0')]),
  rampCurveLowMirror: boxPiece([c('N.T.0', 'W.M.0', LOW)], [1, 1, 0.5]),
  rampLong2: boxPiece([c('N.T.0', 'S.M.0', LONG2)], [1, 2, 0.5]),
  rampLong3: boxPiece([c('N.T.0', 'S.M.0', LONG3)], [1, 3, 0.5]),
  waveLong3: boxPiece([c('N.T.0', 'S.M.0', LONG3, { profile: 'wave' })], [1, 3, 0.5]),
  tunnelRamp: boxPiece([c('N.T.0', 'S.M.0', box([1, 1, 1]), { section: 'tunnel' })]),

  start: boxPiece([c('U.0', 'S.M.0', box([1, 1, 1]), RELEASE)], [1, 1, 1], [cavity('basin', 12)]),
  startLow: boxPiece([c('U.0', 'S.M.0', LOW, RELEASE)], [1, 1, 0.5], [cavity('basin', 12)]),
  funnelTunnel: boxPiece([c('U.0', 'E.M.0')], [1, 1, 1], [cavity('funnel', 20)]),
  funnelDrop: boxPiece([c('U.0', 'D.0')], [1, 1, 1], [cavity('funnel', 20)]),
  stop: boxPiece([c('N.T.0', 'U.0')], [1, 1, 1], [cavity('basin', 12)]),
  stopLow: boxPiece([c('N.T.0', 'U.0', LOW)], [1, 1, 0.5], [cavity('basin', 12)]),
  basinCross: boxPiece([c('N.T.0', 'S.T.0'), c('E.T.0', 'W.T.0')], [1, 1, 1], [cavity('basin', 20)]),
  basinCrossLow: boxPiece([c('N.T.0', 'S.T.0', LOW), c('E.T.0', 'W.T.0', LOW)], [1, 1, 0.5], [cavity('basin', 20)]),
  chamberCross: boxPiece([c('N.T.0', 'S.T.0'), c('E.T.0', 'W.T.0'), c('U.0', 'D.0')], [1, 1, 1], [cavity('chamber', 20)]),
  chamberDrop: boxPiece([c('N.T.0', 'U.0'), c('U.0', 'D.0')], [1, 1, 1], [cavity('chamber', 20)]),
  spiral: boxPiece([], [2, 2, 0.5], [cavity('spiral', 12)]),
  spiralMirror: boxPiece([], [2, 2, 0.5], [cavity('spiralMirror', 12)]),
};

const pair = (from: 'N.T' | 'N.M', to: 'S.T' | 'S.M') =>
  ([-1, 1] as const).map((lane) => c(`${from}.${lane}` as Port, `${to}.${lane}` as Port));

const lean = (size: [number, number, number]): PieceSpec => {
  const body: Body = { shape: 'leanRamp', size };
  return { body, channels: [c('N.T.0', 'S.M.0', body)], cavities: [] };
};

Object.assign(PRESETS, {
  leanRamp2: lean([1, 2, 1.5]),
  leanRamp3: lean([1, 3, 2]),
  seesaw: solid('seesaw', [1, 3, 1]),
  rampOneLane: boxPiece([c('N.T.-1', 'S.M.-1')]),
  doubleStraight: boxPiece(pair('N.T', 'S.T')),
  doubleTunnel: boxPiece(pair('N.M', 'S.M')),
  doubleRamp: boxPiece(pair('N.T', 'S.M')),
  doubleCurve: boxPiece([c('N.T.-1', 'E.T.-1'), c('N.T.1', 'E.T.1')]),
  doubleOverTunnel: boxPiece([...pair('N.T', 'S.T'), c('E.M.0', 'W.M.0')]),
  doubleLow: boxPiece([c('N.T.-1', 'S.T.-1', LOW), c('N.T.1', 'S.T.1', LOW)], [1, 1, 0.5]),
  yMerge: boxPiece([c('N.T.-1', 'S.T.0'), c('N.T.1', 'S.T.0')]),
  yMergeRamp: boxPiece([c('N.T.-1', 'S.M.0'), c('N.T.1', 'S.M.0')]),
  laneShift: boxPiece([c('N.T.-1', 'S.T.1')]),
  tunnelShift: boxPiece([c('N.M.-1', 'S.M.1')]),
  twinIntoHole: boxPiece([c('N.T.-1', 'D.0'), c('N.T.1', 'D.0')]),
} satisfies Record<string, PieceSpec>);

export const LIBRARY: { category: 'catBlocks' | 'catStructures' | 'catChannels' | 'catLow' | 'catRamps' | 'catSpecial' | 'catDouble' | 'catMoving'; items: string[] }[] = [
  { category: 'catBlocks', items: ['cube', 'halfBlock', 'longBlock2', 'longBlock3', 'plate'] },
  { category: 'catChannels', items: ['straightTop', 'curveTop', 'crossTop', 'drop', 'straightTunnel', 'curveTunnel', 'topToTunnel', 'underside', 'double'] },
  { category: 'catRamps', items: ['rampStraight', 'rampLow', 'rampCurve', 'rampCurveMirror', 'rampCurveLow', 'rampCurveLowMirror', 'rampLong2', 'rampLong3', 'waveLong3', 'tunnelRamp'] },
  { category: 'catSpecial', items: ['start', 'startLow', 'funnelTunnel', 'funnelDrop', 'stop', 'stopLow', 'basinCross', 'basinCrossLow', 'chamberCross', 'chamberDrop', 'spiral', 'spiralMirror'] },
  { category: 'catDouble', items: ['rampOneLane', 'doubleStraight', 'doubleTunnel', 'doubleRamp', 'doubleCurve', 'doubleOverTunnel', 'doubleLow', 'yMerge', 'yMergeRamp', 'laneShift', 'tunnelShift', 'twinIntoHole'] },
  { category: 'catMoving', items: ['leanRamp2', 'leanRamp3', 'seesaw'] },
  { category: 'catLow', items: ['halfGroove', 'halfCurve', 'longGroove2', 'longGroove3', 'longTunnel2'] },
  { category: 'catStructures', items: ['cylinder', 'halfRound', 'arch', 'roof'] },
];

/** One slice holding every channel section, to test the ball and the fit. */
export const CALIBRATION = boxPiece([c('N.T.0', 'S.T.0'), c('N.M.0', 'S.M.0'), c('N.B.0', 'S.B.0')]);
export const CALIBRATION_THICKNESS = 15;
