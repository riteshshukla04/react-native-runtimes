# @native-compose/threaded-runtime

Small React Native API for mounting selected React components in a named Android
ReactHost/Hermes runtime.

The package owns the JS registry and host API:

- `registerThreadedComponent(name, Component)`
- `ThreadedReactSurface`
- `ThreadedRuntimeHost`
- `ThreadedRuntime.preload/destroy/destroyAll/getRuntimeNames`

## Register Components

Register threaded components at module load time. The threaded runtime loads the
same JS bundle, but uses `ThreadedRuntimeHost` as the app root, so registration
code must not mount the main app by itself.

```tsx
import {registerThreadedComponent} from '@native-compose/threaded-runtime';

function ExpensivePanel({runtimeName}: {runtimeName?: string}) {
  return <Panel title={runtimeName ?? 'threaded'} />;
}

registerThreadedComponent('ExpensivePanel', ExpensivePanel);
```

## Mount A Threaded Surface

```tsx
import {ThreadedReactSurface} from '@native-compose/threaded-runtime';

<ThreadedReactSurface
  componentName="ExpensivePanel"
  initialProps={{mode: 'compare'}}
  runtimeName="analytics-runtime"
  style={{flex: 1}}
  surfaceKey="analytics-panel"
/>;
```

`initialProps` are JSON serialized and passed to the threaded root. Changing
`componentName`, `initialProps`, `runtimeName`, or `surfaceKey` restarts the
native surface.

## Register The Host App

The secondary runtime must register `ThreadedRuntimeHost` under the same app name
that native uses when it creates a surface:

```js
const {AppRegistry} = require('react-native');

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
