/**
 * Server-only: estimates a food photo's macros with Gemini. Imported only by the
 * /api/estimate-food route, so the API key and SDK never ship in the app bundle.
 */
import type { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

import { CALORIES_MAX, FOOD_NAME_MAX_LENGTH, MACRO_GRAMS_MAX } from '../nutrition/validation';
import {
  ESTIMATE_MEDIA_TYPES,
  type EstimateFoodRequest,
  type EstimateFoodResponse,
  type FoodEstimate,
} from './types';

/**
 * Has a free tier on the Gemini API, which is why this feature costs nothing to run. The larger
 * gemini-3.8-flash is also free but allows only 20 requests a day and took about a minute a photo.
 */
const MODEL = 'gemini-3.5-flash-lite';

/** The app sends a resized JPEG of a few hundred KB; this only stops oversized uploads. */
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

/** The model's JSON answer, or null if it isn't the shape that was asked for. */
function parseEstimate(text: string): z.infer<typeof EstimateSchema> | null {
  try {
    const result = EstimateSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** The HTTP status carried by an SDK error, if it has one. */
function httpStatus(e: unknown): number | null {
  const { status, statusCode } = (e ?? {}) as { status?: unknown; statusCode?: unknown };
  if (typeof status === 'number') return status;
  return typeof statusCode === 'number' ? statusCode : null;
}

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

/** Asks Gemini for the food and macros in the photo, kept within the food log's valid ranges. */
export async function estimateFood(client: GoogleGenAI, request: EstimateFoodRequest): Promise<FoodEstimate> {
  const interaction = await client.interactions.create(
    {
      model: MODEL,
      // Don't keep the player's photos on Google's side for later retrieval.
      store: false,
      // Reading a plate doesn't need long reasoning, and more thinking makes the player wait.
      generation_config: { thinking_level: 'low' },
      system_instruction: SYSTEM_PROMPT,
      input: [
        { type: 'text', text: 'Estimate the food and macros in this photo.' },
        { type: 'image', data: request.image, mime_type: request.mediaType },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: z.toJSONSchema(EstimateSchema) },
    },
    // The SDK otherwise retries by itself, and each retry uses up one of the free tier's few daily requests.
    { maxRetries: 0 },
  );

  // Anything but a finished answer (blocked by a safety filter, cut short, failed) has no usable text.
  if (interaction.status !== 'completed' || !interaction.output_text) {
    throw new EstimateError("Couldn't analyze this photo. Try another one or enter the food manually.", 422);
  }
  const parsed = parseEstimate(interaction.output_text);
  if (!parsed) {
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
export async function handleEstimateRequest(request: Request, getClient: () => GoogleGenAI): Promise<Response> {
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
    const status = httpStatus(e);
    // The SDK's message often leaves out Google's explanation; the response body has it.
    const body = (e as { body?: unknown }).body;
    const reason = typeof body === 'string' && body ? body : e instanceof Error ? e.message : String(status);
    if (status === 429) {
      // The free tier allows only so many photos a minute and a day.
      console.error(`estimate-food: Gemini rate limit: ${reason}`);
      const detail = process.env.NODE_ENV === 'production' ? '' : ` (${reason})`;
      const message = /per day/i.test(reason)
        ? "Today's free photo estimates are used up. Add this food manually, or try a photo again tomorrow."
        : 'Too many photo estimates right now. Please try again in a minute.';
      return reply({ ok: false, error: `${message}${detail}` }, 429);
    }
    // Google answers a wrong key with a 400, not a 401.
    if (status === 401 || status === 403 || reason.includes('API_KEY_INVALID')) {
      console.error('estimate-food: GEMINI_API_KEY is not a valid Gemini API key');
      const detail = process.env.NODE_ENV === 'production' ? '' : ' (GEMINI_API_KEY is not a valid Gemini API key.)';
      return reply({ ok: false, error: `Photo estimates are not set up on the server.${detail}` }, 500);
    }
    if (status !== null) {
      console.error(`estimate-food: Gemini API error ${status}: ${reason}`);
      // In development, say why: the generic message hides setup problems like a bad model name.
      const detail = process.env.NODE_ENV === 'production' ? '' : ` (${status}: ${reason})`;
      return reply({ ok: false, error: `The estimate service is unavailable. Please try again.${detail}` }, 502);
    }
    if (/timed out|timeout/i.test(reason)) {
      console.error(`estimate-food: Gemini request timed out: ${reason}`);
      return reply({ ok: false, error: 'The estimate took too long. Please try again.' }, 504);
    }
    console.error('estimate-food: unexpected error', e);
    const detail = process.env.NODE_ENV === 'production' ? '' : ` (${reason})`;
    return reply({ ok: false, error: `Something went wrong estimating this photo.${detail}` }, 500);
  }
}
