import { boxPiece, channel as c, type Body, type PieceSpec, type Shape } from './ports';

const solid = (shape: Shape, size: [number, number, number]): PieceSpec => ({ body: { shape, size }, channels: [] });

const box = (size: [number, number, number]): Body => ({ shape: 'box', size });
const LOW = box([1, 1, 0.5]);
const LONG2 = box([1, 2, 0.5]);
const LONG3 = box([1, 3, 0.5]);

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
  rampLong2: boxPiece([c('N.T.0', 'S.M.0', LONG2)], [1, 2, 0.5]),
  rampLong3: boxPiece([c('N.T.0', 'S.M.0', LONG3)], [1, 3, 0.5]),
  waveLong3: boxPiece([c('N.T.0', 'S.M.0', LONG3, { profile: 'wave' })], [1, 3, 0.5]),
  tunnelRamp: boxPiece([c('N.T.0', 'S.M.0', box([1, 1, 1]), { section: 'tunnel' })]),
};

export const LIBRARY: { category: 'catBlocks' | 'catStructures' | 'catChannels' | 'catLow' | 'catRamps'; items: string[] }[] = [
  { category: 'catBlocks', items: ['cube', 'halfBlock', 'longBlock2', 'longBlock3', 'plate'] },
  { category: 'catChannels', items: ['straightTop', 'curveTop', 'crossTop', 'drop', 'straightTunnel', 'curveTunnel', 'topToTunnel', 'underside', 'double'] },
  { category: 'catRamps', items: ['rampStraight', 'rampLow', 'rampCurve', 'rampCurveLow', 'rampLong2', 'rampLong3', 'waveLong3', 'tunnelRamp'] },
  { category: 'catLow', items: ['halfGroove', 'halfCurve', 'longGroove2', 'longGroove3', 'longTunnel2'] },
  { category: 'catStructures', items: ['cylinder', 'halfRound', 'arch', 'roof'] },
];

/** One slice holding every channel section, to test the ball and the fit. */
export const CALIBRATION = boxPiece([c('N.T.0', 'S.T.0'), c('N.M.0', 'S.M.0'), c('N.B.0', 'S.B.0')]);
export const CALIBRATION_THICKNESS = 15;
