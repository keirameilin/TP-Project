import { lbToKg } from '../types';
import { kgToDisplayLb } from '../units';
import { validateBodyWeight } from '../validation';

describe('pounds shown for a stored kg weight', () => {
  it('rounds to one decimal', () => {
    expect(kgToDisplayLb(75)).toBe(165.3);
    expect(kgToDisplayLb(72.5)).toBe(159.8);
  });

  it('gives back exactly what was typed, for every half pound from 60 to 400 lb', () => {
    for (let lb = 60; lb <= 400; lb += 0.5) {
      expect(kgToDisplayLb(lbToKg(lb))).toBe(lb);
    }
  });

  it('matches the range message: 45 and 880 lb are valid, 44 and 882 are not', () => {
    const valid = (lb: number) => validateBodyWeight({ date: '2026-10-04', weightKg: lbToKg(lb) }).length === 0;
    expect([valid(45), valid(880)]).toEqual([true, true]);
    expect([valid(44), valid(882)]).toEqual([false, false]);
  });
});
