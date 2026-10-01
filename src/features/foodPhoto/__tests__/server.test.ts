import type Anthropic from '@anthropic-ai/sdk';

import { foodItemFromEstimate } from '../../dailyLog/form';
import { handleEstimateRequest, parseEstimateRequest } from '../server';

const IMAGE = 'aGVsbG8='; // any base64

/** A stand-in for the Anthropic client whose parse() returns the given response. */
function fakeClient(response: object) {
  const parse = jest.fn().mockResolvedValue(response);
  const client = { beta: { messages: { parse } } } as unknown as Anthropic;
  return { client, parse };
}

const post = (body: unknown, client: Anthropic) =>
  handleEstimateRequest(
    new Request('http://localhost/api/estimate-food', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    () => client,
  );

const parsed = (overrides: object = {}) => ({
  stop_reason: 'end_turn',
  parsed_output: {
    isFood: true,
    foodName: ' Chicken wrap ',
    portion: '1 wrap, about 250 g',
    calories: 552.4,
    proteinG: 40.26,
    carbsG: 50,
    fatG: 18.04,
    ...overrides,
  },
});

describe('POST /api/estimate-food', () => {
  it('sends the photo to Claude and returns a cleaned-up estimate', async () => {
    const { client, parse } = fakeClient(parsed());
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

    const params = parse.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE },
    });
  });

  it('clamps numbers into the food log’s valid ranges', async () => {
    const { client } = fakeClient(parsed({ calories: 25000, proteinG: -3, carbsG: 2000, fatG: NaN }));
    const { estimate } = await (await post({ image: IMAGE, mediaType: 'image/jpeg' }, client)).json();
    expect(estimate).toMatchObject({ calories: 10000, proteinG: 0, carbsG: 1000, fatG: 0 });
  });

  it('rejects a photo that is not food', async () => {
    const { client } = fakeClient(parsed({ isFood: false }));
    const res = await post({ image: IMAGE, mediaType: 'image/jpeg' }, client);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/doesn't seem to show food/);
  });

  it('reports a refusal without reading the content', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', parsed_output: null });
    expect((await post({ image: IMAGE, mediaType: 'image/jpeg' }, client)).status).toBe(422);
  });

  it('reports an unparseable response', async () => {
    const { client } = fakeClient({ stop_reason: 'end_turn', parsed_output: null });
    expect((await post({ image: IMAGE, mediaType: 'image/jpeg' }, client)).status).toBe(502);
  });

  it('rejects bad request bodies before calling Claude', async () => {
    const { client, parse } = fakeClient(parsed());
    expect((await post('not json', client)).status).toBe(400);
    expect((await post({ mediaType: 'image/jpeg' }, client)).status).toBe(400);
    expect((await post({ image: IMAGE, mediaType: 'image/gif' }, client)).status).toBe(400);
    expect(parse).not.toHaveBeenCalled();
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
