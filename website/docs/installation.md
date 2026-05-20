---
id: installation
title: Installation
---

Install the runtime and shared store packages:

```sh
npm install @native-compose/threaded-runtime @native-compose/threaded-zustand react-native-nitro-modules
```

For local development in this repository the app uses file dependencies:

```json
{
  "dependencies": {
    "@native-compose/threaded-runtime": "file:packages/threaded-runtime",
    "@native-compose/threaded-zustand": "file:packages/threaded-zustand"
  }
}
```

## iOS

Install pods after adding the packages:

```sh
cd ios
bundle exec pod install
```

Configure the threaded runtime from the app delegate before any secondary runtime is created:

```swift
import NativeComposeThreadedRuntime

ThreadedRuntime.configure(
  withReactNativeDelegate: delegate,
  launchOptions: launchOptions
)
```

If your app wants a runtime ready at startup, prewarm it from Swift:

```swift
ThreadedRuntime.prewarmRuntime("conversation-inbox-runtime")
```

## Android

Add extra packages that threaded runtimes need but that may not be part of the generated host package list:

```kotlin
import com.nativecompose.threadedruntime.ThreadedRuntime
import com.nativecompose.threadedzustand.ThreadedZustandPackage
import com.margelo.nitro.NitroModulesPackage

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()

    ThreadedRuntime.setExtraReactPackagesProvider {
      listOf(
        NitroModulesPackage(),
        ThreadedZustandPackage(),
      )
    }

    loadReactNative(this)
  }
}
```

Prewarm a named runtime from Kotlin when useful:

```kotlin
ThreadedRuntime.prewarmRuntime(
  applicationContext,
  "conversation-inbox-runtime",
)
```

## Metro

Wrap your Metro config so the package can generate the threaded entry file:

```js
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
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

Add the generated folder to `.gitignore`:

```gitignore
.threaded-runtime/
```

Load the generated entry only inside threaded runtimes:

```js
if (global.__THREADED_RUNTIME_ENV__ || global._is_it_a_list_env === true) {
  require('./.threaded-runtime/entry');
}
```

The generated entry registers lazy component loaders and the `ThreadedRuntimeHost` root used by native.
