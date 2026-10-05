const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

export interface FeetInches {
  feet: number;
  inches: number;
}

/** Height is stored in cm (the calorie formula needs it) but entered and shown as feet and inches. */
export function feetInchesToCm({ feet, inches }: FeetInches): number {
  return Math.round((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH * 10) / 10;
}

/** Whole feet plus inches to the nearest half inch, carrying 12 in up to the next foot. */
export function cmToFeetInches(cm: number): FeetInches {
  const totalHalfInches = Math.round((cm / CM_PER_INCH) * 2);
  const feet = Math.floor(totalHalfInches / (INCHES_PER_FOOT * 2));
  return { feet, inches: (totalHalfInches - feet * INCHES_PER_FOOT * 2) / 2 };
}
