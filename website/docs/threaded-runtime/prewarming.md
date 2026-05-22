---
id: prewarming
title: Prewarming
---

Prewarming creates and starts a named secondary runtime before a surface needs it.

```tsx
import { ThreadedRuntime } from '@react-native-runtimes/core';

await ThreadedRuntime.prewarm('conversation-release-room-runtime');
```

`preload` is an alias:

```tsx
await ThreadedRuntime.preload('conversation-release-room-runtime');
```

`ThreadedScreen` preloads its runtime by default, but that preload runs from a React effect. For low-latency navigation, prewarm earlier, such as while a picker or inbox is visible.

```tsx
const runtimeNames = conversations.map(
  conversation => `conversation-${conversation.id}-runtime`,
);

useEffect(() => {
  for (const runtimeName of runtimeNames) {
    void ThreadedRuntime.prewarm(runtimeName);
  }
}, [runtimeNames]);
```

On tap, prewarm the selected runtime again before switching screens. This is cheap when the runtime already exists:

```tsx
function openConversation(conversationId: string) {
  void ThreadedRuntime.prewarm(`conversation-${conversationId}-runtime`);
  setSelectedConversationId(conversationId);
}
```

## Native Prewarm

Android:

```kotlin
ThreadedRuntime.prewarmRuntime(
  applicationContext,
  "conversation-release-room-runtime",
)
```

iOS:

```swift
ThreadedRuntime.prewarmRuntime("conversation-release-room-runtime")
```

C++:

```cpp
#include <nativecompose/threadedruntime/ThreadedRuntimeDispatcher.h>

nativecompose::threadedruntime::prewarmRuntime(
  "conversation-release-room-runtime"
);
```

## Releasing Runtimes

Destroy a named runtime when it no longer owns useful work:

```tsx
await ThreadedRuntime.destroy('conversation-release-room-runtime');
```

For route components, set `destroyOnUnmount` when the screen should release the runtime immediately:

```tsx
<ThreadedScreen
  component={ConversationScreen}
  destroyOnUnmount
  props={{ conversationId }}
  runtimeName={`conversation-${conversationId}-runtime`}
/>
```
