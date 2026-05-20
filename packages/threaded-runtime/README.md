# @native-compose/threaded-runtime

Small React Native API for mounting selected React components in a named
secondary React Native/Hermes runtime.

The package owns the JS registry and host API:

- `threadedComponent(name, Component)`
- `Threaded`
- `ThreadedScreen`
- `withThreadedRuntime(config, options)` from
  `@native-compose/threaded-runtime/metro`
- `registerLazyThreadedComponent(name, loadComponent)`
- `registerThreadedComponent(name, Component)`
- `registerThreadedHeadlessTask(name, task)`
- `ThreadedReactSurface`
- `ThreadedRuntimeHost`
- `ThreadedRuntime.prewarm/preload/runHeadlessTask/destroy/destroyAll/getRuntimeNames`

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

Most consumers should make a component opt in once and then render it through a
secondary runtime like a normal React component.

```tsx
import {
  Threaded,
  ThreadedScreen,
  threadedComponent,
} from '@native-compose/threaded-runtime';

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

For navigation or chat apps where the whole route should live on another JS
runtime, use `ThreadedScreen`:

```tsx
export const ConversationScreen = threadedComponent<ConversationScreenProps>(
  'ConversationScreen',
  function ConversationScreen(props) {
    return <ConversationRoute {...props} />;
  },
);

<ThreadedScreen
  component={ConversationScreen}
  props={{ conversationId }}
  runtimeName={`conversation-${conversationId}`}
  testID="conversation-threaded-screen"
/>;
```

`ThreadedScreen` renders the threaded surface as a full-size screen (`flex: 1`),
preloads the named runtime by default, and keeps the runtime alive when the
screen unmounts. Set `destroyOnUnmount` when the route should release its
secondary runtime immediately.

You can also prewarm the runtime before rendering the screen:

```tsx
import { ThreadedRuntime } from '@native-compose/threaded-runtime';

await ThreadedRuntime.prewarm(`conversation-${conversationId}`);
```

`prewarm` creates and starts the named secondary runtime without mounting a
surface. `preload` is kept as a compatibility alias.

## Headless Work On A Threaded Runtime

Prewarming starts the secondary runtime and loads the bundle, but it does not
give you a clear app-level API for background work. Use headless tasks when you
want to run JS on a named threaded runtime without mounting a view.

Register the task in a module that is loaded by the threaded bundle. If you use
the Metro wrapper, exporting this registration from one of the scanned roots is
enough because `.threaded-runtime/entry` is loaded in the secondary runtime.

```tsx
import { registerThreadedHeadlessTask } from '@native-compose/threaded-runtime';
import { messagesStore } from './messagesStore';

registerThreadedHeadlessTask<{
  conversationId: string;
  limit: number;
}>('hydrateConversation', async ({ payload, runtimeName }) => {
  const messages = await loadMessages(payload.conversationId, payload.limit);
  await messagesStore.setSubtreeState(payload.conversationId, messages, true);
  console.info(`Hydrated ${payload.conversationId} on ${runtimeName}`);
});
```

Dispatch it from the main runtime:

```tsx
import { ThreadedRuntime } from '@native-compose/threaded-runtime';

await ThreadedRuntime.runHeadlessTask('hydrateConversation', {
  runtimeName: 'conversation-worker-runtime',
  payload: {
    conversationId,
    limit: 50,
  },
});
```

`runHeadlessTask` starts or reuses the named runtime and asks that runtime to
invoke the registered task. If the runtime is still starting, native queues the
task and flushes it when that runtime is ready. The returned promise resolves
when native accepts the dispatch; it does not wait for the async task body to
finish. Pass durable output through shared native state, storage, or native
modules.

Headless tasks are useful for:

- warming shared stores before a threaded screen opens
- fetching or decoding data away from the main JS runtime
- running reducer/store work in a long-lived runtime
- keeping a runtime hot without attaching a `Threaded` surface

If you only need to make startup faster, `ThreadedRuntime.prewarm(runtimeName)`
is still enough. Use `runHeadlessTask` when you need actual JS work to execute.

## Native Headless Dispatch

Native code can dispatch the same registered headless tasks. The caller chooses
which named runtime handles the task. If that runtime has been prewarmed but is
not ready yet, the dispatch is queued and flushed after startup. If it has not
been created yet, native creates and starts it.

Kotlin:

```kotlin
import com.nativecompose.threadedruntime.ThreadedRuntime

ThreadedRuntime.dispatchHeadlessTask(
  context = applicationContext,
  runtimeName = "conversation-worker-runtime",
  taskName = "hydrateConversation",
  payloadJson = """{"conversationId":"inbox","limit":50}""",
)
```

Swift:

```swift
import NativeComposeThreadedRuntime

ThreadedRuntime.dispatchHeadlessTask(
  withRuntimeName: "conversation-worker-runtime",
  taskName: "hydrateConversation",
  payloadJson: #"{"conversationId":"inbox","limit":50}"#
)
```

C++ on Android:

```cpp
#include <nativecompose/threadedruntime/ThreadedRuntimeDispatcher.h>

nativecompose::threadedruntime::dispatchHeadlessTask(
    env,
    applicationContext,
    "conversation-worker-runtime",
    "hydrateConversation",
    R"({"conversationId":"inbox","limit":50})");
```

C++/Objective-C++ on Apple platforms:

```cpp
#include <nativecompose/threadedruntime/ThreadedRuntimeDispatcher.h>

nativecompose::threadedruntime::dispatchHeadlessTask(
    "conversation-worker-runtime",
    "hydrateConversation",
    R"({"conversationId":"inbox","limit":50})");
```

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

## Native Implementation

This package includes Android and iOS implementations under `android/` and
`ios/`. It exports:

- native module `ThreadedRuntime`
- native view manager `ThreadedRuntimeSurface`

`ThreadedRuntimeSurface` creates a named secondary runtime and mounts
`ThreadedRuntimeHost` in that runtime. On Android this is backed by `ReactHost`;
on iOS it is backed by `RCTHost` and a Fabric surface. The JS layer still falls
back to this repo's older app-local names, `BackgroundListBridge` and
`SecondRuntimeSurface`, while the package migration is in progress.

The native module exposes:

- `prewarmRuntime(runtimeName)`
- `prewarmRuntimeWithOptions(runtimeName, kind, useMainNativeModules)`
- `prewarmBusinessRuntime(runtimeName)`
- `preloadRuntime(runtimeName)`
- `dispatchHeadlessTask(runtimeName, taskName, payloadJson)`
- `runHeadlessTask(runtimeName, taskName, payloadJson)`
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

For an app-lifetime business runtime that should see the same native module set
as the main runtime, pass the app package list once and prewarm the named
business runtime:

```kotlin
import com.facebook.react.PackageList
import com.nativecompose.threadedruntime.ThreadedRuntime

ThreadedRuntime.setMainReactPackagesProvider {
  PackageList(this).packages
}

ThreadedRuntime.prewarmBusinessRuntime(applicationContext, "business-runtime")
```

That runtime receives `global.__THREADED_RUNTIME_ENV__` before the bundle runs:

```tsx
if (global.__THREADED_RUNTIME_ENV__?.kind === 'business-runtime') {
  require('./src/businessRuntimeEntry');
} else {
  require('./src/mainRuntimeEntry');
}
```

iOS threaded runtimes already use the configured React Native delegate for
native-module lookup, so `ThreadedRuntime.prewarmBusinessRuntime("business-runtime")`
uses the app's module resolution path.

Host apps can prewarm a runtime from Kotlin before a threaded screen is needed:

```kotlin
import com.nativecompose.threadedruntime.ThreadedRuntime

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()

    ThreadedRuntime.setExtraReactPackagesProvider {
      listOf(AppSpecificPackage())
    }

    loadReactNative(this)
    ThreadedRuntime.prewarmRuntime(
      applicationContext,
      "conversation-inbox-runtime",
    )
  }
}
```

This creates and starts the named `ReactHost` without attaching a surface. When
`ThreadedScreen` later mounts with the same `runtimeName`, native reuses the
prewarmed runtime and resumes it with the current Activity.

Host apps can prewarm a runtime from Swift after configuring the package with
the app's React Native delegate:

```swift
import NativeComposeThreadedRuntime

let delegate = ReactNativeDelegate()
let factory = RCTReactNativeFactory(delegate: delegate)
delegate.dependencyProvider = RCTAppDependencyProvider()

ThreadedRuntime.configure(
  withReactNativeDelegate: delegate,
  launchOptions: launchOptions
)

factory.startReactNative(
  withModuleName: "NativeComposeChat",
  in: window,
  launchOptions: launchOptions
)

ThreadedRuntime.prewarmRuntime("conversation-inbox-runtime")
```

This creates and starts the named `RCTHost` without attaching a surface. When
`ThreadedScreen` later mounts with the same `runtimeName`, native reuses the
prewarmed host.
