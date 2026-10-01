/**
 * Server-only: estimates a food photo's macros with Claude. Imported only by the
 * /api/estimate-food route, so the API key and SDK never ship in the app bundle.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import { CALORIES_MAX, FOOD_NAME_MAX_LENGTH, MACRO_GRAMS_MAX } from '../nutrition/validation';
import {
  ESTIMATE_MEDIA_TYPES,
  type EstimateFoodRequest,
  type EstimateFoodResponse,
  type FoodEstimate,
} from './types';

const MODEL = 'claude-opus-5-5';

/** Claude's per-image limit is 5 MB; the app sends a resized JPEG well under this. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = `You estimate the nutrition of food from a photo for a calorie and macro tracking app used by athletes.

Identify the food and estimate the portion actually shown (use plates, cutlery, hands, and packaging for scale). Give calories and grams of protein, carbohydrate, and fat for that whole portion, not per 100 g. If several foods are on the plate, treat them as one meal and name it briefly (e.g. "Chicken, rice and broccoli"). If a nutrition label is visible, use it, scaled to the amount shown.

Give your single best estimate rather than a range; the user will review and adjust it. Keep foodName under 60 characters and describe the portion you assumed in a few words (e.g. "1 wrap, about 250 g").

If the photo does not show food or drink, set isFood to false and use 0 for every number.`;

const EstimateSchema = z.object({
  isFood: z.boolean(),
  foodName: z.string(),
  portion: z.string(),
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

export class EstimateError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'EstimateError';
  }
}

const clamp = (n: number, max: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), max);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Validates the request body; throws EstimateError(400) when it's unusable. */
export function parseEstimateRequest(body: unknown): EstimateFoodRequest {
  const { image, mediaType } = (body ?? {}) as Partial<EstimateFoodRequest>;
  if (typeof image !== 'string' || image.length === 0) {
    throw new EstimateError('Missing image.', 400);
  }
  if (!(ESTIMATE_MEDIA_TYPES as readonly string[]).includes(mediaType as string)) {
    throw new EstimateError(`mediaType must be one of: ${ESTIMATE_MEDIA_TYPES.join(', ')}`, 400);
  }
  // Base64 encodes 3 bytes in 4 characters.
  if ((image.length * 3) / 4 > MAX_IMAGE_BYTES) {
    throw new EstimateError('Image is too large; the limit is 5 MB.', 413);
  }
  return { image, mediaType: mediaType as EstimateFoodRequest['mediaType'] };
}

/** Asks Claude for the food and macros in the photo, kept within the food log's valid ranges. */
export async function estimateFood(client: Anthropic, request: EstimateFoodRequest): Promise<FoodEstimate> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, retry on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(EstimateSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: request.mediaType, data: request.image } },
          { type: 'text', text: 'Estimate the food and macros in this photo.' },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new EstimateError("Couldn't analyze this photo. Try another one or enter the food manually.", 422);
  }
  const parsed = response.parsed_output;
  if (response.stop_reason === 'max_tokens' || !parsed) {
    throw new EstimateError("Couldn't read the estimate. Please try again.", 502);
  }
  if (!parsed.isFood) {
    throw new EstimateError("This photo doesn't seem to show food. Try another one.", 422);
  }

  return {
    foodName: parsed.foodName.trim().slice(0, FOOD_NAME_MAX_LENGTH) || 'Food from photo',
    portion: parsed.portion.trim(),
    calories: Math.round(clamp(parsed.calories, CALORIES_MAX)),
    proteinG: round1(clamp(parsed.proteinG, MACRO_GRAMS_MAX)),
    carbsG: round1(clamp(parsed.carbsG, MACRO_GRAMS_MAX)),
    fatG: round1(clamp(parsed.fatG, MACRO_GRAMS_MAX)),
  };
}

/**
 * Full request → response handling for the API route, with errors mapped to status codes.
 * The client is created lazily inside the error handling, so a missing key becomes a clean 500.
 */
export async function handleEstimateRequest(request: Request, getClient: () => Anthropic): Promise<Response> {
  const reply = (body: EstimateFoodResponse, status = 200) => Response.json(body, { status });

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new EstimateError('Request body must be JSON.', 400);
    }
    const estimate = await estimateFood(getClient(), parseEstimateRequest(body));
    return reply({ ok: true, estimate });
  } catch (e) {
    if (e instanceof EstimateError) return reply({ ok: false, error: e.message }, e.status);
    if (e instanceof Anthropic.RateLimitError) {
      return reply({ ok: false, error: 'Too many requests right now. Please try again in a minute.' }, 429);
    }
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('estimate-food: Anthropic API key is missing or invalid');
      return reply({ ok: false, error: 'Photo estimates are not set up on the server.' }, 500);
    }
    if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIError) {
      console.error('estimate-food: Claude API error', e);
      return reply({ ok: false, error: 'The estimate service is unavailable. Please try again.' }, 502);
    }
    console.error('estimate-food: unexpected error', e);
    return reply({ ok: false, error: 'Something went wrong estimating this photo.' }, 500);
  }
}
