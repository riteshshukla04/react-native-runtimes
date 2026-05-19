/**
 * @format
 */

const {AppRegistry} = require('react-native');

const isListEnvironment = global._is_it_a_list_env === true;

if (isListEnvironment) {
  // Load app-side threaded component registrations without mounting the main app.
  require('./App');
  AppRegistry.registerComponent(
    'ComposeChatBackgroundRenderer',
    () => require('./src/chat/BackgroundChatRenderer').default,
  );
  AppRegistry.registerComponent(
    'ThreadedRuntimeHost',
    () => require('@native-compose/threaded-runtime').ThreadedRuntimeHost,
  );
  AppRegistry.registerComponent(
    'ComposeChatSecondRuntimeRnList',
    () => require('./App').SecondRuntimeRnListApp,
  );
} else {
  const {name: appName} = require('./app.json');
  AppRegistry.registerComponent(appName, () => require('./App').default);
}
