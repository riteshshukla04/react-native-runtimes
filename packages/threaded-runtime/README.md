# @native-compose/threaded-runtime

Small React Native API for mounting selected React components in a named Android
ReactHost/Hermes runtime.

The package owns the JS registry and host API:

- `threadedComponent(name, Component)`
- `Threaded`
- `withThreadedRuntime(config, options)` from
  `@native-compose/threaded-runtime/metro`
- `registerLazyThreadedComponent(name, loadComponent)`
- `registerThreadedComponent(name, Component)`
- `ThreadedReactSurface`
- `ThreadedRuntimeHost`
- `ThreadedRuntime.preload/destroy/destroyAll/getRuntimeNames`

## Setup

### 1. Configure Metro

Add the Metro wrapper from this package to your app's `metro.config.js`:

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {
  withThreadedRuntime,
} = require('@native-compose/threaded-runtime/metro');

const config = {};

module.exports = withThreadedRuntime(
  mergeConfig(getDefaultConfig(__dirname), config),
  {
    roots: ['App.tsx', 'src'],
    generatedDir: '.threaded-runtime',
    generatedEntry: 'entry.js',
  },
);
```

`roots` are the files/directories scanned for `threadedComponent(...)` exports.
The wrapper writes `.threaded-runtime/entry.js` and adds the generated directory
to Metro's `watchFolders`.

Add the generated directory to `.gitignore`:

```gitignore
.threaded-runtime/
```

### 2. Load The Generated Entry

Load the generated entry only in the secondary runtime path:

```js
if (global.__THREADED_RUNTIME_ENV__ || global._is_it_a_list_env === true) {
  require('./.threaded-runtime/entry');
}
```

The generated entry registers lazy component loaders and the
`ThreadedRuntimeHost` root:

```js
import { AppRegistry } from 'react-native';
import {
  ThreadedRuntimeHost,
  registerLazyThreadedComponent,
} from '@native-compose/threaded-runtime';

registerLazyThreadedComponent(
  'MessageList',
  () => require('../src/MessageList').MessageList,
);

AppRegistry.registerComponent('ThreadedRuntimeHost', () => ThreadedRuntimeHost);
```

The component module is required only when `ThreadedRuntimeHost` receives that
component name.

### 3. Mark Components And Render Them

The low-level API below is explicit, but most consumers should make a component
opt in once and then render it through a secondary runtime like a normal React
component.

```tsx
import { Threaded, threadedComponent } from '@native-compose/threaded-runtime';

type MessageListProps = {
  conversationId: string;
  initialIndex?: number;
};

export const MessageList = threadedComponent<MessageListProps>(
  'MessageList',
  function MessageList(props) {
    return <ActualMessageList {...props} />;
  },
);

<Threaded
  component={MessageList}
  props={{ conversationId, initialIndex: 120 }}
  runtimeName="messages-runtime"
/>;
```

`threadedComponent` is the annotation/marker that says this component may be
mounted by another runtime. `Threaded` serializes `props` and mounts a native
`ThreadedRuntimeSurface` with the generated component name. Props must be
JSON-serializable; large or mutable data should be passed by id/key and read
through a shared native store.

Generator rules:

- components must be named exports
- threaded names must be unique
- generated output must be deterministic
- duplicate names should fail the build
- generated root should be usable both from the main app bundle and from a
  dedicated threaded runtime bundle

## Metro Generated Registry

The Metro helper is exported from the package as:

```js
const {
  withThreadedRuntime,
} = require('@native-compose/threaded-runtime/metro');
```

In same-bundle mode the generated lazy registry avoids eagerly initializing
every threaded component during secondary runtime startup. In a future
separate-bundle mode, the same generated entry can become the Metro entrypoint
for a smaller `threaded-runtime.android.bundle`.

## Manual Registration Escape Hatch

Register threaded components at module load time. The threaded runtime loads the
same JS bundle, but uses `ThreadedRuntimeHost` as the app root, so registration
code must not mount the main app by itself. This is useful when you are not using
the Metro generated registry.

```tsx
import { registerThreadedComponent } from '@native-compose/threaded-runtime';

function ExpensivePanel({ runtimeName }: { runtimeName?: string }) {
  return <Panel title={runtimeName ?? 'threaded'} />;
}

registerThreadedComponent('ExpensivePanel', ExpensivePanel);
```

## Mount A Threaded Surface

```tsx
import { ThreadedReactSurface } from '@native-compose/threaded-runtime';

<ThreadedReactSurface
  componentName="ExpensivePanel"
  initialProps={{ mode: 'compare' }}
  runtimeName="analytics-runtime"
  style={{ flex: 1 }}
  surfaceKey="analytics-panel"
/>;
```

`initialProps` are JSON serialized and passed to the threaded root. Changing
`componentName`, `initialProps`, `runtimeName`, or `surfaceKey` restarts the
native surface.

## Manual Host Registration

If you are not using `.threaded-runtime/entry`, the secondary runtime must
register `ThreadedRuntimeHost` under the same app name that native uses when it
creates a surface:

```js
const { AppRegistry } = require('react-native');

if (global._is_it_a_list_env === true) {
  require('./App'); // component registrations
  AppRegistry.registerComponent(
    'ThreadedRuntimeHost',
    () => require('@native-compose/threaded-runtime').ThreadedRuntimeHost,
  );
}
```

## Android Native Implementation

This package includes an Android implementation under `android/`. It exports:

- native module `ThreadedRuntime`
- native view manager `ThreadedRuntimeSurface`

`ThreadedRuntimeSurface` creates a named secondary `ReactHost` and mounts
`ThreadedRuntimeHost` in that runtime. The JS layer still falls back to this
repo's older app-local names, `BackgroundListBridge` and `SecondRuntimeSurface`,
while the package migration is in progress.

The native module exposes:

- `preloadRuntime(runtimeName)`
- `destroyRuntime(runtimeName)`
- `destroyAllRuntimes()`
- `getRuntimeNames()`

The native view manager accepts:

- `appName`
- `blockStatus`
- `componentName`
- `initialPropsJson`
- `mode`
- `runtimeName`
- `surfaceKey`

If the threaded runtime needs extra native modules or native views, configure
them once from the host app:

```kotlin
import com.nativecompose.threadedruntime.ThreadedRuntime

ThreadedRuntime.setExtraReactPackagesProvider {
  listOf(AppSpecificPackage())
}
```

Those packages are installed only in the secondary runtime. The example app uses
this to expose the shared zustand module and background list host to threaded RN.
