---
id: headless-runtime
title: Headless Background Runtime With Prewarm
---

A headless task runs JS on a named threaded runtime without mounting any UI. Use it when a runtime should fetch, hydrate, decode, or update shared state before a screen opens.

Register a task in code loaded by the threaded bundle:

```tsx
import {registerThreadedHeadlessTask} from '@native-compose/threaded-runtime';
import {messagesStore} from './messagesStore';

registerThreadedHeadlessTask<{
  conversationId: string;
  limit: number;
}>('hydrateConversation', async ({payload, runtimeName}) => {
  const messages = await loadMessages(payload.conversationId, payload.limit);

  await messagesStore.setSubtreeState(
    payload.conversationId,
    messages,
    true,
  );

  console.info(`Hydrated ${payload.conversationId} on ${runtimeName}`);
});
```

Dispatch the task from JS:

```tsx
import {ThreadedRuntime} from '@native-compose/threaded-runtime';

await ThreadedRuntime.runHeadlessTask('hydrateConversation', {
  runtimeName: 'conversation-worker-runtime',
  payload: {
    conversationId: 'release-room',
    limit: 50,
  },
});
```

Native starts or reuses the named runtime. If the runtime is still starting, the task is queued and flushed after startup. The returned promise resolves when native accepts the dispatch, not when the async task body finishes.

## Native Dispatch

Android Kotlin:

```kotlin
ThreadedRuntime.dispatchHeadlessTask(
  context = applicationContext,
  runtimeName = "conversation-worker-runtime",
  taskName = "hydrateConversation",
  payloadJson = """{"conversationId":"release-room","limit":50}""",
)
```

iOS Swift:

```swift
ThreadedRuntime.dispatchHeadlessTask(
  withRuntimeName: "conversation-worker-runtime",
  taskName: "hydrateConversation",
  payloadJson: #"{"conversationId":"release-room","limit":50}"#
)
```

Android C++:

```cpp
#include <nativecompose/threadedruntime/ThreadedRuntimeDispatcher.h>

nativecompose::threadedruntime::dispatchHeadlessTask(
  env,
  applicationContext,
  "conversation-worker-runtime",
  "hydrateConversation",
  R"({"conversationId":"release-room","limit":50})"
);
```

Apple C++ or Objective-C++:

```cpp
#include <nativecompose/threadedruntime/ThreadedRuntimeDispatcher.h>

nativecompose::threadedruntime::dispatchHeadlessTask(
  "conversation-worker-runtime",
  "hydrateConversation",
  R"({"conversationId":"release-room","limit":50})"
);
```

## Typical Flow

1. Prewarm the runtime while the user is still on the previous screen.
2. Dispatch a headless hydration task to that runtime.
3. Store durable output in shared state or native storage.
4. Open a `ThreadedScreen` using the same runtime name.
5. The screen reads the already-warmed data from the shared store.
