import { detailsOf, type HardwareItem } from '../geometry/details';
import type { Shape } from '../geometry/ports';
import type { StringKey } from './i18n';

type Translate = (key: StringKey, values?: Record<string, string>) => string;

interface PartLine {
  name: string;
  orientation: string;
  grams?: number;
}

interface Sheet {
  parts: PartLine[];
  hardware: (HardwareItem & { name: string })[];
  steps: string[];
  use: string;
  motor: string | null;
}

/** Everything the details of a piece say, in the current language. */
function sheetOf(shape: Shape, t: Translate, grams: number[] = []): Sheet | null {
  const details = detailsOf(shape);
  if (!details) return null;
  return {
    parts: details.printed.map((suffix, i) => {
      const [name, orientation] = t(`part_${shape}_${suffix}` as StringKey).split('|');
      return { name, orientation, grams: grams[i] };
    }),
    hardware: details.hardware.map((item) => ({ ...item, name: t(`hw_${item.id}` as StringKey) })),
    steps: t(`asm_${shape}` as StringKey).split('|'),
    use: t(`use_${shape}` as StringKey),
    motor: details.motorReady ? t(`motor_${shape}` as StringKey) : null,
  };
}

export const hasDetails = (shape: Shape) => detailsOf(shape) !== null;

/** The details section of the piece panel. */
export function renderDetails(shape: Shape, t: Translate, grams: number[], exploded: boolean): string {
  const sheet = sheetOf(shape, t, grams);
  if (!sheet) return '';
  const weight = (value?: number) => (value === undefined ? '' : t('detGrams', { grams: value.toFixed(0) }));
  return `
    <h2>${t('detTitle')}</h2>
    <label class="toggle explode"><input type="checkbox" id="explode"${exploded ? ' checked' : ''} /> ${t('detExplode')}</label>
    <h3><span class="swatch printed"></span>${t('detPrinted')}</h3>
    <table class="bom">
      ${sheet.parts.map((part, i) => `<tr><td class="count">${i + 1}</td><td>${part.name}<small>${part.orientation}</small></td><td class="spec">${weight(part.grams)}</td></tr>`).join('')}
    </table>
    <h3><span class="swatch steel"></span>${t('detHardware')}</h3>
    <table class="bom">
      ${sheet.hardware.map((item) => `<tr><td class="count">${item.count}×</td><td>${item.name}<small>${item.spec}</small></td><td></td></tr>`).join('')}
    </table>
    <h3>${t('detAssembly')}</h3>
    <ol class="steps">${sheet.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
    <h3>${t('detUse')}</h3>
    <p class="hint">${sheet.use}</p>
    ${sheet.motor ? `<h3>${t('detMotor')}</h3><p class="hint">${sheet.motor}</p>` : ''}
    <div class="notice warn">${t('detNote')}</div>`;
}

/** The same details as plain text, to go with the exported files. */
export function detailsText(shape: Shape, title: string, t: Translate): string | null {
  const sheet = sheetOf(shape, t);
  if (!sheet) return null;
  const lines = [
    title,
    '',
    t('detPrinted'),
    ...sheet.parts.map((part, i) => `  ${i + 1}. ${part.name} (${part.orientation})`),
    '',
    t('detHardware'),
    ...sheet.hardware.map((item) => `  ${item.count} × ${item.name} · ${item.spec}`),
    '',
    t('detAssembly'),
    ...sheet.steps.map((step, i) => `  ${i + 1}. ${step}`),
    '',
    t('detUse'),
    `  ${sheet.use}`,
  ];
  if (sheet.motor) lines.push('', t('detMotor'), `  ${sheet.motor}`);
  lines.push('', t('detNote'));
  return lines.join('\n');
}
