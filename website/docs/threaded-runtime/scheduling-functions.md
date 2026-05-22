---
id: scheduling-functions
title: Scheduling Functions on Another Runtime
---

Use awaitable runtime functions when one runtime needs a return value from code
executed on another named runtime.

```tsx
import { runtimeFunction, usingRuntime } from '@react-native-runtimes/core';

export const refreshBusinessState = runtimeFunction(
  async ({ reason }: { reason: string }) => {
    await businessStore.hydrate();
    await businessStore.dispatchSubtree(
      { type: 'refreshRequested', reason },
      'business',
    );

    return businessStore.getSubtreeState('business');
  },
);

const snapshot = await usingRuntime('business-runtime').run(() =>
  refreshBusinessState({ reason: 'manual' }),
);
```

The `usingRuntime(...).run(...)` callback is syntax for Metro to transform. It
is rewritten to a direct call on the registered runtime function:

```tsx
const snapshot = await refreshBusinessState.runOn('business-runtime', {
  reason: 'manual',
});
```

## How Lookup Works

Runtime functions are not sent as source code. Metro gives each exported
`runtimeFunction(...)` a stable id, then generates a registration in the bundle:

```tsx
registerRuntimeFunction(
  'src/business.refreshBusinessState',
  () => require('./src/business').refreshBusinessState,
);
```

Every runtime loads the same bundle and installs the same registration table.
When the caller schedules a function, native sends:

- the target runtime name
- the stable function id
- JSON-stringified arguments

C++/JSI dispatches to the target runtime, looks up the registered loader,
caches the loaded JS function, calls it with parsed arguments, and serializes the
result back to the caller.

## Supported Shape

The callback passed to `usingRuntime(...).run(...)` must contain exactly one
call to one exported runtime function:

```tsx
await usingRuntime('worker-runtime').run(() => doWork({ id: '42' }));
```

Use an explicit id when the generated file-path id should not be part of your
public API:

```tsx
export const doWork = runtimeFunction.named(
  'jobs.doWork',
  async ({ id }: { id: string }) => {
    return jobsStore.getSubtreeState(id);
  },
);
```

Current constraints:

- arguments and return values must be JSON-serializable
- scheduled functions must be exported and wrapped in `runtimeFunction`
- inline lambdas and non-exported functions are not supported
- closures are not captured; pass all inputs as arguments
- synchronous functions avoid the extra Promise hop on the target runtime

Use `ThreadedRuntime.runHeadlessTask(...)` instead when the caller only needs to
enqueue work and observe progress through shared state.
