import { cmToFeetInches, feetInchesToCm } from '../height';

describe('height conversion', () => {
  it('converts feet and inches to cm', () => {
    expect(feetInchesToCm({ feet: 5, inches: 10 })).toBe(177.8);
    expect(feetInchesToCm({ feet: 6, inches: 0 })).toBe(182.9);
    expect(feetInchesToCm({ feet: 5, inches: 7.5 })).toBe(171.5);
  });

  it('converts cm back to feet and the nearest half inch', () => {
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetInches(171.5)).toEqual({ feet: 5, inches: 7.5 });
  });

  it('carries 12 inches up to the next foot', () => {
    // 182.5 cm is 71.85 in, which rounds to 72 in = 6 ft 0 in, not 5 ft 12 in.
    expect(cmToFeetInches(182.5)).toEqual({ feet: 6, inches: 0 });
  });

  it.each([
    [4, 11],
    [5, 0],
    [5, 6.5],
    [6, 3],
    [7, 0],
  ])('round-trips %p ft %p in', (feet, inches) => {
    expect(cmToFeetInches(feetInchesToCm({ feet, inches }))).toEqual({ feet, inches });
  });
});
