import type { HealthProvider } from './provider.types';

/** Web and other platforms have no health store. iOS and Android use provider.ios.ts / provider.android.ts. */
export function getHealthProvider(): HealthProvider | null {
  return null;
}
