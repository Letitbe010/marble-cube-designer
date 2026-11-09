import { boxPiece, channel as c, type PieceSpec } from './ports';

export const PRESETS: Record<string, PieceSpec> = {
  straightTop: boxPiece([c('N.T.0', 'S.T.0')]),
  curveTop: boxPiece([c('N.T.0', 'E.T.0')]),
  crossTop: boxPiece([c('N.T.0', 'S.T.0'), c('E.T.0', 'W.T.0')]),
  drop: boxPiece([c('N.T.0', 'U.0'), c('U.0', 'D.0')]),
  straightTunnel: boxPiece([c('N.M.0', 'S.M.0')]),
  curveTunnel: boxPiece([c('N.M.0', 'E.M.0')]),
  topToTunnel: boxPiece([c('U.0', 'E.M.0')]),
  underside: boxPiece([c('E.B.0', 'W.B.0')]),
  double: boxPiece([c('N.T.0', 'S.T.0'), c('E.M.0', 'W.M.0')]),
};

/** One slice holding every channel section, to test the ball and the fit. */
export const CALIBRATION = boxPiece([c('N.T.0', 'S.T.0'), c('N.M.0', 'S.M.0'), c('N.B.0', 'S.B.0')]);
export const CALIBRATION_THICKNESS = 15;
