# Threaded Runtime API

This API mounts a React component into a separate Android ReactHost/Hermes runtime.
Use it when a component should keep executing while the main app runtime is busy.

## Register a component

Register components at module load time. The background/threaded bundle loads `App.tsx`
only for registration when `_is_it_a_list_env` is set, so do not mount the main app
from registration code.

```tsx
import {registerThreadedComponent} from './src/threadedRuntime';

function ExpensiveList({mode}: {mode: 'legendlist' | 'flashlist'}) {
  return <ListBenchmark mode={mode} />;
}

registerThreadedComponent('ExpensiveList', ExpensiveList);
```

## Mount it from the main runtime

```tsx
import {ThreadedReactSurface} from './src/threadedRuntime';

<ThreadedReactSurface
  componentName="ExpensiveList"
  initialProps={{mode: 'legendlist'}}
  runtimeName="background-list"
  style={{flex: 1}}
  surfaceKey="legendlist"
/>;
```

`initialProps` are JSON serialized and passed when the native surface starts.
Changing `componentName`, `initialProps`, `runtimeName`, or `surfaceKey` restarts the
surface. Keep these stable for long-lived scrollable views.

## Control runtimes

```ts
import {ThreadedRuntime} from './src/threadedRuntime';

await ThreadedRuntime.preload('background-list');
const names = await ThreadedRuntime.getRuntimeNames();
await ThreadedRuntime.destroy('background-list');
await ThreadedRuntime.destroyAll();
```

`runtimeName` maps to a native ReactHost. Multiple surfaces can share one runtime by
using the same name. A different name creates a different host/runtime.

## Current Android packaging

Threaded runtimes currently load the same release JS bundle as the main app, but use
`ThreadedRuntimeHost` as the app root. This prevents mounting the main app tree, but it
does not yet create a minimal separate bundle. For a production library, split the
threaded entrypoint into its own Metro bundle and Hermes bytecode artifact.
