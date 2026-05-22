---
id: scheduling-functions
title: Scheduling Functions on Another Runtime
---

Use awaitable runtime functions when one runtime needs a return value from code
executed on another named runtime.

```tsx
import { runtimeFunction, usingRuntime } from '@react-native-runtimes/core';

function fibonacci(n: number) {
  if (n < 2) {
    return n;
  }

  return fibonacci(n - 1) + fibonacci(n - 2);
}

export const calculateFibonacci = runtimeFunction(
  ({ n }: { n: number }) => {
    const input = Math.max(0, Math.min(45, Math.floor(n)));

    return {
      input,
      result: fibonacci(input),
      computedAt: new Date().toISOString(),
    };
  },
);

const result = await usingRuntime('fibonacci-worker-runtime').run(() =>
  calculateFibonacci({ n: 38 }),
);
```

The `usingRuntime(...).run(...)` callback is syntax for Metro to transform. It
is rewritten to a direct call on the registered runtime function:

```tsx
const result = await calculateFibonacci.runOn('fibonacci-worker-runtime', {
  n: 38,
});
```

## Why Wrap With `runtimeFunction`?

`runtimeFunction` marks a function as callable from another runtime. It attaches
the generated function id, exposes the typed `.runOn(runtimeName, ...args)` API,
and gives Metro a clear export boundary to register.

Metro can generate the stable id for this:

```tsx
export const calculateFibonacci = runtimeFunction(fn);
```

but it still needs to know which exported functions are safe to schedule. Plain
functions can close over local values, mutate module state, depend on runtime-only
objects, or accept values that cannot be serialized. The wrapper is the explicit
contract that says: this function is exported, registered, accepts JSON inputs,
returns JSON output, and can be loaded by another runtime.

We can make this lighter later. For example, Metro could transform an exported
function with a directive or annotation into a runtime function automatically.
For now the wrapper keeps the behavior visible in source and gives TypeScript the
right call shape.

## How Lookup Works

Runtime functions are not sent as source code. Metro gives each exported
`runtimeFunction(...)` a stable id, then generates a registration in the bundle:

```tsx
registerRuntimeFunction(
  'src/examples/fibonacciRuntimeFunction.calculateFibonacci',
  () =>
    require('./src/examples/fibonacciRuntimeFunction').calculateFibonacci,
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
await usingRuntime('fibonacci-worker-runtime').run(() =>
  calculateFibonacci({ n: 38 }),
);
```

Use an explicit id when the generated file-path id should not be part of your
public API:

```tsx
export const calculateFibonacci = runtimeFunction.named(
  'examples.calculateFibonacci',
  ({ n }: { n: number }) => {
    return fibonacci(n);
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
