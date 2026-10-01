/** Request body for POST /api/estimate-food. */
export interface EstimateFoodRequest {
  /** Base64 image data, without a `data:` prefix. */
  image: string;
  mediaType: EstimateMediaType;
}

export const ESTIMATE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type EstimateMediaType = (typeof ESTIMATE_MEDIA_TYPES)[number];

/** Claude's estimate for the food in a photo. Macros are for the whole portion shown. */
export interface FoodEstimate {
  foodName: string;
  /** What the numbers are for, e.g. "1 wrap, about 250 g". */
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type EstimateFoodResponse =
  | { ok: true; estimate: FoodEstimate }
  | { ok: false; error: string };
