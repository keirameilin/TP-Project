import { kgToLb, lbToKg } from '../types';
import { validateBodyWeight } from '../validation';

const fieldsWithIssues = (date: string, weightKg: number) =>
  validateBodyWeight({ date, weightKg }).map((i) => i.field);

describe('validateBodyWeight', () => {
  it('accepts a normal weigh-in, including decimals and the range bounds', () => {
    expect(fieldsWithIssues('2026-09-29', 72.35)).toEqual([]);
    expect(fieldsWithIssues('2026-09-29', 20)).toEqual([]);
    expect(fieldsWithIssues('2026-09-29', 400)).toEqual([]);
  });

  it.each([0, -70, 19.9, 400.1, NaN, Infinity, undefined as never, null as never])(
    'rejects weight %p',
    (weightKg) => {
      expect(fieldsWithIssues('2026-09-29', weightKg)).toEqual(['weightKg']);
    },
  );

  it('rejects a bad date', () => {
    expect(fieldsWithIssues('2026-02-30', 70)).toEqual(['date']);
  });
});

it('converts between pounds and kilograms', () => {
  expect(lbToKg(100)).toBeCloseTo(45.359, 3);
  expect(kgToLb(lbToKg(165.4))).toBeCloseTo(165.4, 10);
});
