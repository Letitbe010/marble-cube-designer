import { CALIBRATION_FIELDS, clearCalibration, currentValues, invalidFields, storeCalibration, type CalibrationField, type CalibrationValues } from '../geometry/calibration';
import type { StringKey } from './i18n';

export interface CalibrationDeps {
  t: (key: StringKey, values?: Record<string, string>) => string;
  onChange: () => void;
  downloadKit: () => void;
  ready: () => boolean;
}

/** The calibration tab: the test pieces to print, and the measured values to enter. */
export class CalibrationPanel {
  private values: CalibrationValues = currentValues();
  private invalid: CalibrationField[] = [];

  constructor(private readonly deps: CalibrationDeps) {}

  handleClick(target: HTMLElement) {
    const action = target.dataset.cal;
    if (action === 'kit') this.deps.downloadKit();
    else if (action === 'reset') {
      clearCalibration();
      location.reload();
    } else if (action === 'apply') {
      this.invalid = invalidFields(this.values);
      if (this.invalid.length) {
        this.deps.onChange();
        return;
      }
      storeCalibration(this.values);
      location.reload();
    }
  }

  handleChange(target: HTMLInputElement | HTMLSelectElement) {
    const field = target.dataset.calField as CalibrationField | undefined;
    if (field) this.values = { ...this.values, [field]: Number(target.value) };
  }

  private renderFields(group: 'geometry' | 'simulation'): string {
    const { t } = this.deps;
    return CALIBRATION_FIELDS.filter((f) => f.group === group)
      .map(({ field, min, max, step }) => {
        const invalid = this.invalid.includes(field) ? ' class="invalid"' : '';
        return `<label${invalid}>${t(`cal_${field}` as StringKey)}<input type="number" data-cal-field="${field}" min="${min}" max="${max}" step="${step}" value="${this.values[field]}" /></label>`;
      })
      .join('');
  }

  render(): string {
    const { t, ready } = this.deps;
    const steps = (['calStep1', 'calStep2', 'calStep3', 'calStep4'] as StringKey[]).map((key) => `<li>${t(key)}</li>`).join('');
    return `
      <p class="hint">${t('calHint')}</p>
      <h2>${t('calKitTitle')}</h2>
      <button class="btn primary spaced" data-cal="kit"${ready() ? '' : ' disabled'}>${t('calKit')}</button>
      <ol class="steps">${steps}</ol>
      <h2>${t('calGeometry')}</h2>
      <div class="params two">${this.renderFields('geometry')}</div>
      <h2>${t('calSimulation')}</h2>
      <div class="params two">${this.renderFields('simulation')}</div>
      ${this.invalid.length ? `<div class="notice error">${t('calInvalid')}</div>` : ''}
      <button class="btn primary spaced" data-cal="apply">${t('calApply')}</button>
      <button class="btn wide" data-cal="reset">${t('calReset')}</button>
      <p class="hint">${t('calNote')}</p>
    `;
  }
}
