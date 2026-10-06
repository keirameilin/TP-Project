import type { GoogleGenAI } from '@google/genai';

import { foodItemFromEstimate } from '../../dailyLog/form';
import { handleEstimateRequest, parseEstimateRequest } from '../server';

const IMAGE = 'aGVsbG8='; // any base64

/** A stand-in for the Gemini client whose interactions.create() returns the given response. */
function fakeClient(response: object) {
  const create = jest.fn().mockResolvedValue(response);
  const client = { interactions: { create } } as unknown as GoogleGenAI;
  return { client, create };
}

/** A stand-in whose interactions.create() fails with the given error. */
function failingClient(error: unknown) {
  return { interactions: { create: jest.fn().mockRejectedValue(error) } } as unknown as GoogleGenAI;
}

const post = (body: unknown, client: GoogleGenAI) =>
  handleEstimateRequest(
    new Request('http://localhost/api/estimate-food', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    () => client,
  );

const answered = (overrides: object = {}) => ({
  status: 'completed',
  output_text: JSON.stringify({
    isFood: true,
    foodName: ' Chicken wrap ',
    portion: '1 wrap, about 250 g',
    calories: 552.4,
    proteinG: 40.26,
    carbsG: 50,
    fatG: 18.04,
    ...overrides,
  }),
});

describe('POST /api/estimate-food', () => {
  it('sends the photo to Gemini and returns a cleaned-up estimate', async () => {
    const { client, create } = fakeClient(answered());
    const res = await post({ image: IMAGE, mediaType: 'image/jpeg' }, client);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      estimate: {
        foodName: 'Chicken wrap',
        portion: '1 wrap, about 250 g',
        calories: 552,
        proteinG: 40.3,
        carbsG: 50,
        fatG: 18,
      },
    });

    const params = create.mock.calls[0][0];
    expect(params.model).toBe('gemini-3.5-flash-lite');
    expect(params.store).toBe(false);
    expect(create.mock.calls[0][1]).toEqual({ maxRetries: 0 });
    expect(params.generation_config).toEqual({ thinking_level: 'low' });
    expect(params.input).toContainEqual({ type: 'image', data: IMAGE, mime_type: 'image/jpeg' });
    expect(params.response_format.schema.required).toEqual(
      expect.arrayContaining(['isFood', 'foodName', 'portion', 'calories', 'proteinG', 'carbsG', 'fatG']),
    );
  });

  it('clamps numbers into the food log’s valid ranges', async () => {
    const { client } = fakeClient(answered({ calories: 25000, proteinG: -3, carbsG: 2000, fatG: -0.5 }));
    const { estimate } = await (await post({ image: IMAGE, mediaType: 'image/jpeg' }, client)).json();
    expect(estimate).toMatchObject({ calories: 10000, proteinG: 0, carbsG: 1000, fatG: 0 });
  });

  it('rejects a photo that is not food', async () => {
    const { client } = fakeClient(answered({ isFood: false }));
    const res = await post({ image: IMAGE, mediaType: 'image/jpeg' }, client);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/doesn't seem to show food/);
  });

  it('reports a photo the model would not answer for', async () => {
    const { client } = fakeClient({ status: 'failed' });
    expect((await post({ image: IMAGE, mediaType: 'image/jpeg' }, client)).status).toBe(422);
  });

  it('reports an unparseable response', async () => {
    const notJson = fakeClient({ status: 'completed', output_text: 'Sorry, here is your estimate' });
    expect((await post({ image: IMAGE, mediaType: 'image/jpeg' }, notJson.client)).status).toBe(502);
    const wrongShape = fakeClient({ status: 'completed', output_text: '{"isFood":true}' });
    expect((await post({ image: IMAGE, mediaType: 'image/jpeg' }, wrongShape.client)).status).toBe(502);
  });

  it('maps Gemini errors to clear messages', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const send = (error: unknown) => post({ image: IMAGE, mediaType: 'image/jpeg' }, failingClient(error));

    const rateLimited = await send(Object.assign(new Error('quota'), { status: 429 }));
    expect(rateLimited.status).toBe(429);
    expect((await rateLimited.json()).error).toMatch(/try again in a minute/);

    const dailyLimit = await send(
      Object.assign(new Error('429'), { status: 429, body: 'Rate limit exceeded (limit: 20 requests per day on Free Tier)' }),
    );
    expect(dailyLimit.status).toBe(429);
    expect((await dailyLimit.json()).error).toMatch(/used up/);

    const badKey = await send(Object.assign(new Error('API key not valid'), { status: 403 }));
    expect(badKey.status).toBe(500);
    expect((await badKey.json()).error).toMatch(/not set up/);

    const wrongKey = await send(Object.assign(new Error('400 API error occurred'), { status: 400, body: '{"reason":"API_KEY_INVALID"}' }));
    expect(wrongKey.status).toBe(500);
    expect((await wrongKey.json()).error).toMatch(/not set up/);

    const slow = await send(new Error('Unexpected HTTP client error: Error: Request timed out'));
    expect(slow.status).toBe(504);
    expect((await slow.json()).error).toMatch(/took too long/);

    const down = await send(Object.assign(new Error('overloaded'), { statusCode: 503 }));
    expect(down.status).toBe(502);
    expect((await down.json()).error).toMatch(/unavailable/);
  });

  it('rejects bad request bodies before calling Gemini', async () => {
    const { client, create } = fakeClient(answered());
    expect((await post('not json', client)).status).toBe(400);
    expect((await post({ mediaType: 'image/jpeg' }, client)).status).toBe(400);
    expect((await post({ image: IMAGE, mediaType: 'image/gif' }, client)).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns a clean 500 if the client cannot be created', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleEstimateRequest(
      new Request('http://localhost/api/estimate-food', {
        method: 'POST',
        body: JSON.stringify({ image: IMAGE, mediaType: 'image/jpeg' }),
      }),
      () => {
        throw new Error('no key');
      },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});

it('rejects images over 5 MB', () => {
  expect(() => parseEstimateRequest({ image: 'A'.repeat(7_000_000), mediaType: 'image/jpeg' })).toThrow(/too large/);
});

it('fills the food form from an estimate, keeping the chosen meal', () => {
  expect(
    foodItemFromEstimate(
      { foodName: 'Oats', portion: '1 bowl', calories: 350, proteinG: 12, carbsG: 60.5, fatG: 7 },
      'breakfast',
    ),
  ).toEqual({ mealType: 'breakfast', foodName: 'Oats', calories: '350', protein: '12', carbs: '60.5', fat: '7' });
});
