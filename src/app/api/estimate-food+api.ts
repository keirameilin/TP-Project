import { GoogleGenAI } from '@google/genai';

import { EstimateError, handleEstimateRequest } from '../../features/foodPhoto/server';

// GEMINI_API_KEY comes from the server environment (.env.local in development, an EAS
// environment variable when deployed). It is never sent to the app.
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    console.error('estimate-food: GEMINI_API_KEY is not set');
    // In development, name the fix; players of a released app can't act on it.
    const detail = process.env.NODE_ENV === 'production' ? '' : ' (GEMINI_API_KEY is missing from .env.local.)';
    throw new EstimateError(`Photo estimates are not set up on the server.${detail}`, 500);
  }
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

export function POST(request: Request): Promise<Response> {
  return handleEstimateRequest(request, getClient);
}
