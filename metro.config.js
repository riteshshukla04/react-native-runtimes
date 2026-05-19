const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withThreadedRuntime} = require('@native-compose/threaded-runtime/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

module.exports = withThreadedRuntime(
  mergeConfig(getDefaultConfig(__dirname), config),
  {
    roots: ['App.tsx'],
  },
);
