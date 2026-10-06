const { getDefaultConfig } = require('expo/metro-config');

// expo-sqlite runs in a web worker on web. With lazy bundling (the development default), Metro
// leaves the worker's code out of the bundle and then fails with "Worker chunk not found" when
// web.output is "server" (which the API route needs). Bundle everything up front instead.
process.env.EXPO_NO_METRO_LAZY = '1';

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
