import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Health libraries are native code that Expo Go doesn't include; they need a development build. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const EXPO_GO_REASON =
  'Watch data needs a development build of the app — it can’t be read in Expo Go.';
