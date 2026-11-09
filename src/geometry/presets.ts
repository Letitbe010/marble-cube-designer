import type { Segment } from './ports';

export const PRESETS: Record<string, Segment[]> = {
  straightTop: [{ from: 'N.T', to: 'S.T' }],
  curveTop: [{ from: 'N.T', to: 'E.T' }],
  crossTop: [{ from: 'N.T', to: 'S.T' }, { from: 'E.T', to: 'W.T' }],
  drop: [{ from: 'N.T', to: 'U' }, { from: 'U', to: 'D' }],
  straightTunnel: [{ from: 'N.M', to: 'S.M' }],
  curveTunnel: [{ from: 'N.M', to: 'E.M' }],
  topToTunnel: [{ from: 'U', to: 'E.M' }],
  double: [{ from: 'N.T', to: 'S.T' }, { from: 'E.M', to: 'W.M' }],
};

export const CALIBRATION: Segment[] = [{ from: 'N.T', to: 'S.T' }, { from: 'N.M', to: 'S.M' }];
export const CALIBRATION_THICKNESS = 15;
