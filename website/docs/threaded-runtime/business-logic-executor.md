---
id: business-logic-executor
title: Business Logic Executor
---

Headless threaded runtimes can act as named business logic executors. Instead of
mounting UI, the runtime stays warm and receives jobs such as encryption,
signature verification, document parsing, local search indexing, or data
normalization.

This is useful when the work is too expensive for the main JS runtime and would
delay navigation, gestures, or rendering.

## Model

Use one or more named runtimes as executors:

- `crypto-worker-runtime`
- `search-index-runtime`
- `sync-engine-runtime`

Each executor registers headless tasks. The main runtime or native code
dispatches jobs by name. Results are written to a shared store, native storage,
or a native module.

```tsx
await ThreadedRuntime.prewarm('crypto-worker-runtime');

await ThreadedRuntime.runHeadlessTask('encryptPayload', {
  runtimeName: 'crypto-worker-runtime',
  payload: {
    jobId: 'job-42',
    keyId: 'local-key-v1',
    plaintextRef: 'draft-message-123',
  },
});
```

The promise resolves when native accepts the dispatch. Track completion through
shared state instead of waiting for the dispatch promise.

## App-Lifetime Business Runtime

Some apps use two JavaScript runtimes for the whole app lifetime:

- the main runtime renders UI
- a business runtime owns sync, caching, queues, crypto orchestration, and other
  non-visual work

Prewarm that runtime natively during app startup and keep it alive:

```tsx
await ThreadedRuntime.prewarmBusinessRuntime('business-runtime');
```

Native injects this global before the bundle runs:

```tsx
const runtimeEnv = global.__THREADED_RUNTIME_ENV__;

if (runtimeEnv?.kind === 'business-runtime') {
  require('./src/businessRuntimeEntry');
} else {
  require('./src/mainRuntimeEntry');
}
```

The injected object has:

```tsx
type ThreadedRuntimeEnv = {
  kind: 'threaded-runtime' | 'business-runtime' | string;
  runtimeName: string;
  isBackgroundRuntime: boolean;
  useMainNativeModules: boolean;
  version: 1;
};
```

Use this when one bundle should contain both entrypoints. The business runtime
can skip UI registration and only register headless tasks, shared-store
listeners, sync loops, and native-module consumers.

## Native Startup

Android library code cannot directly import the app-generated `PackageList`.
Pass the main package list once, then prewarm the business runtime with
`useMainNativeModules=true`:

```kotlin
import com.facebook.react.PackageList
import com.nativecompose.threadedruntime.ThreadedRuntime

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()

    ThreadedRuntime.setMainReactPackagesProvider {
      PackageList(this).packages
    }

    loadReactNative(this)
    ThreadedRuntime.prewarmBusinessRuntime(applicationContext, "business-runtime")
  }
}
```

If you only want a small isolated runtime, use `prewarmRuntime` or pass
`useMainNativeModules=false`.

iOS threaded runtimes already use the configured React Native delegate for native
module lookup. Configure the package once and prewarm the business runtime:

```swift
import NativeComposeThreadedRuntime

ThreadedRuntime.configure(
  withReactNativeDelegate: delegate,
  launchOptions: launchOptions
)

ThreadedRuntime.prewarmBusinessRuntime("business-runtime")
```

The cross-platform JS equivalent is:

```tsx
await ThreadedRuntime.prewarm('business-runtime', {
  kind: 'business-runtime',
  useMainNativeModules: true,
});
```

## Store Job State

Keep job status in a shared store so every runtime can observe it.

```tsx
import {createSharedStore} from '@native-compose/threaded-zustand';

type CryptoJob = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  resultRef?: string;
  error?: string;
};

type CryptoState = {
  jobs: Record<string, CryptoJob>;
};

type CryptoAction =
  | {type: 'queued'; jobId: string}
  | {type: 'running'; jobId: string}
  | {type: 'done'; jobId: string; resultRef: string}
  | {type: 'failed'; jobId: string; error: string};

export const cryptoJobsStore = createSharedStore<CryptoState, CryptoAction>({
  name: 'crypto-jobs',
  initialState: {
    jobs: {},
  },
  slices: {
    jobs: (jobs, action) => {
      const current = jobs[action.jobId] ?? {
        id: action.jobId,
        status: 'queued',
      };

      switch (action.type) {
        case 'queued':
          return {...jobs, [action.jobId]: current};
        case 'running':
          return {...jobs, [action.jobId]: {...current, status: 'running'}};
        case 'done':
          return {
            ...jobs,
            [action.jobId]: {
              ...current,
              status: 'done',
              resultRef: action.resultRef,
            },
          };
        case 'failed':
          return {
            ...jobs,
            [action.jobId]: {
              ...current,
              status: 'failed',
              error: action.error,
            },
          };
      }
    },
  },
  persist: {
    key: 'crypto-jobs-v1',
    subtrees: ['jobs'],
  },
});
```

## Register The Executor Task

Register the task in code loaded by the threaded bundle. The task can run JS
logic directly or call a native module that performs the sensitive or optimized
part.

```tsx
import {NativeModules} from 'react-native';
import {registerThreadedHeadlessTask} from '@native-compose/threaded-runtime';
import {cryptoJobsStore} from './cryptoJobsStore';

const {LocalCryptoModule} = NativeModules;

registerThreadedHeadlessTask<{
  jobId: string;
  keyId: string;
  plaintextRef: string;
}>('encryptPayload', async ({payload}) => {
  await cryptoJobsStore.dispatchSubtree(
    {type: 'running', jobId: payload.jobId},
    'jobs',
  );

  try {
    const resultRef = await LocalCryptoModule.encryptStoredPayload(
      payload.keyId,
      payload.plaintextRef,
    );

    await cryptoJobsStore.dispatchSubtree(
      {type: 'done', jobId: payload.jobId, resultRef},
      'jobs',
    );
  } catch (error) {
    await cryptoJobsStore.dispatchSubtree(
      {
        type: 'failed',
        jobId: payload.jobId,
        error: error instanceof Error ? error.message : String(error),
      },
      'jobs',
    );
  }
});
```

For cryptography, prefer native crypto implementations for the actual primitive
work. Use the headless JS runtime to coordinate the job, choose inputs, call
native modules, and publish state. Do not pass private keys or large plaintexts
through JSON props or task payloads; pass ids or storage references.

## Dispatch Jobs From UI

```tsx
import {ThreadedRuntime} from '@native-compose/threaded-runtime';
import {cryptoJobsStore} from './cryptoJobsStore';

async function encryptDraft(draftId: string) {
  const jobId = `encrypt-${draftId}-${Date.now()}`;

  await cryptoJobsStore.dispatchSubtree({type: 'queued', jobId}, 'jobs');

  await ThreadedRuntime.runHeadlessTask('encryptPayload', {
    runtimeName: 'crypto-worker-runtime',
    payload: {
      jobId,
      keyId: 'local-key-v1',
      plaintextRef: draftId,
    },
  });

  return jobId;
}
```

Subscribe to progress from any runtime:

```tsx
function CryptoJobStatus({jobId}: {jobId: string}) {
  const job = cryptoJobsStore.useStore(state => state.jobs[jobId], ['jobs']);

  if (!job) {
    return null;
  }

  return <Text>{job.status}</Text>;
}
```

## Dispatch Jobs From Native

Native code can enqueue work before the runtime is ready. The task waits in the
native queue and flushes when the named runtime starts.

Android:

```kotlin
ThreadedRuntime.dispatchHeadlessTask(
  applicationContext,
  "crypto-worker-runtime",
  "encryptPayload",
  """{"jobId":"job-42","keyId":"local-key-v1","plaintextRef":"draft-123"}""",
)
```

iOS:

```swift
ThreadedRuntime.dispatchHeadlessTask(
  withRuntimeName: "crypto-worker-runtime",
  taskName: "encryptPayload",
  payloadJson: #"{"jobId":"job-42","keyId":"local-key-v1","plaintextRef":"draft-123"}"#
)
```

## Operational Guidance

- Prewarm long-lived executors at app startup or before the screen that needs
  them.
- Use one runtime for related serial work when ordering matters.
- Use separate runtimes for independent domains only when the memory overhead is
  worth it.
- Keep payloads small and serializable.
- Store large inputs and outputs by reference.
- Write progress and results to shared state or native storage.
- Treat task dispatch as fire-and-observe, not request-response.
- Avoid JS implementations for security-sensitive crypto primitives unless your
  threat model explicitly allows it.
