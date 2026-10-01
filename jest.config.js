const path = require('path');

// jest-expo's setup requires expo-modules-core from its own folder, which only works when npm
// happens to hoist it. Resolve it from `expo` instead, so tests don't depend on the install layout.
const expoModulesCore = path.dirname(
  require.resolve('expo-modules-core/package.json', {
    paths: [path.dirname(require.resolve('expo/package.json'))],
  }),
);

module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^expo-modules-core(/.*)?$': `${expoModulesCore}$1`,
  },
};
