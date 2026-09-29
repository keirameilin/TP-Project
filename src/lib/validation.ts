export interface ValidationIssue<F extends string = string> {
  field: F;
  message: string;
}

/** Thrown by repositories when input fails validation; shared so `instanceof` works across features. */
export class ValidationError<F extends string = string> extends Error {
  constructor(public readonly issues: ValidationIssue<F>[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ValidationError';
  }
}
