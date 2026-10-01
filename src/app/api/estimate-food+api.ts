import Anthropic from '@anthropic-ai/sdk';

import { EstimateError, handleEstimateRequest } from '../../features/foodPhoto/server';

// ANTHROPIC_API_KEY comes from the server environment (.env.local in development, an EAS
// environment variable when deployed). It is never sent to the app.
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('estimate-food: ANTHROPIC_API_KEY is not set');
    throw new EstimateError('Photo estimates are not set up on the server.', 500);
  }
  return (client ??= new Anthropic());
}

export function POST(request: Request): Promise<Response> {
  return handleEstimateRequest(request, getClient);
}
