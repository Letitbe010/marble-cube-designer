import { DEFAULT_PARAMS } from '../simulation/marble';
import { checkLevels, CONFIG } from './config';

/** The values worth measuring on printed pieces, kept in the browser once entered. */
export interface CalibrationValues {
  ballDiameter: number;
  boreClearance: number;
  fitClearance: number;
  locatorClearance: number;
  crr: number;
  jointRetention: number;
  jumpRetention: number;
  maxLean: number;
  launchSpeed: number;
}

export type CalibrationField = keyof CalibrationValues;

export const CALIBRATION_FIELDS: { field: CalibrationField; group: 'geometry' | 'simulation'; min: number; max: number; step: number }[] = [
  { field: 'ballDiameter', group: 'geometry', min: 10, max: 25, step: 0.1 },
  { field: 'boreClearance', group: 'geometry', min: 0.3, max: 3, step: 0.1 },
  { field: 'fitClearance', group: 'geometry', min: 0, max: 1, step: 0.05 },
  { field: 'locatorClearance', group: 'geometry', min: 0, max: 0.6, step: 0.05 },
  { field: 'crr', group: 'simulation', min: 0.001, max: 0.2, step: 0.001 },
  { field: 'jointRetention', group: 'simulation', min: 0.5, max: 1, step: 0.01 },
  { field: 'jumpRetention', group: 'simulation', min: 0.2, max: 1, step: 0.01 },
  { field: 'maxLean', group: 'simulation', min: 20, max: 85, step: 1 },
  { field: 'launchSpeed', group: 'simulation', min: 100, max: 4000, step: 50 },
];

const STORAGE_KEY = 'marble-cube-calibration';

/** Runs some work with parts of the configuration replaced, then puts them back. */
export function withConfig<T>(patch: Partial<typeof CONFIG>, work: () => T): T {
  const saved = { ...CONFIG };
  Object.assign(CONFIG, patch);
  try {
    return work();
  } finally {
    Object.assign(CONFIG, saved);
  }
}

export function currentValues(): CalibrationValues {
  const { ballDiameter, boreClearance, fitClearance, locatorClearance } = CONFIG;
  const { crr, jointRetention, jumpRetention, maxLean, launchSpeed } = DEFAULT_PARAMS;
  return { ballDiameter, boreClearance, fitClearance, locatorClearance, crr, jointRetention, jumpRetention, maxLean, launchSpeed };
}

/** Names the fields that are out of range; a bore too large for the levels fails too. */
export function invalidFields(values: CalibrationValues): CalibrationField[] {
  const bad = CALIBRATION_FIELDS.filter(({ field, min, max }) => !(values[field] >= min && values[field] <= max)).map((f) => f.field);
  if (bad.length) return bad;
  const { ballDiameter, boreClearance } = values;
  return withConfig({ ballDiameter, boreClearance }, () => checkLevels()).length ? ['boreClearance'] : [];
}

function apply(values: CalibrationValues) {
  const { ballDiameter, boreClearance, fitClearance, locatorClearance, crr, jointRetention, jumpRetention, maxLean, launchSpeed } = values;
  Object.assign(CONFIG, { ballDiameter, boreClearance, fitClearance, locatorClearance });
  Object.assign(DEFAULT_PARAMS, { crr, jointRetention, jumpRetention, maxLean, launchSpeed });
}

/** Puts any values saved in this browser into effect. Run once, before building anything. */
export function applyStoredCalibration(): boolean {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return false;
    const values = { ...currentValues(), ...JSON.parse(text) } as CalibrationValues;
    if (invalidFields(values).length) return false;
    apply(values);
    return true;
  } catch {
    return false;
  }
}

export function storeCalibration(values: CalibrationValues) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

export function clearCalibration() {
  localStorage.removeItem(STORAGE_KEY);
}
