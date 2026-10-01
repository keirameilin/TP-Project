import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { EstimateFoodRequest, EstimateFoodResponse, FoodEstimate } from './types';

/** Longest side sent for analysis — plenty to recognise food, and keeps uploads to a few hundred KB. */
const MAX_DIMENSION = 1024;

export type PhotoSource = 'camera' | 'library';

/**
 * Lets the user take or pick a photo, then shrinks it to a JPEG for upload.
 * Returns base64 image data, or null if they cancelled.
 */
export async function pickFoodPhoto(source: PhotoSource): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera access is turned off. Allow it in Settings to photograph food.');
    }
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const { uri, width, height } = result.assets[0];
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_DIMENSION) {
    // Giving one side keeps the aspect ratio.
    context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error("Couldn't read the photo. Please try again.");
  return saved.base64;
}

/** Sends the photo to the server, which asks Claude for the food and its macros. */
export async function requestFoodEstimate(image: string): Promise<FoodEstimate> {
  const request: EstimateFoodRequest = { image, mediaType: 'image/jpeg' };
  // Relative URL: Expo Router resolves it against the dev server, or the `origin` set for production.
  const response = await fetch('/api/estimate-food', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  let body: EstimateFoodResponse;
  try {
    body = await response.json();
  } catch {
    throw new Error(`The estimate service isn't responding (HTTP ${response.status}).`);
  }
  if (!body.ok) throw new Error(body.error);
  return body.estimate;
}
