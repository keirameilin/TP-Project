import { kgToLb } from './types';

/**
 * Weight is stored in kg (the calorie formula needs it) but entered and shown in pounds.
 * Pounds are shown to one decimal, which is finer than any bathroom scale.
 */
export function kgToDisplayLb(kg: number): number {
  return Math.round(kgToLb(kg) * 10) / 10;
}

/** The stored range is 20–400 kg; this is that range in the unit the player types. */
export const WEIGHT_RANGE_LB_MESSAGE = 'Weight must be between 45 and 880 lb';
