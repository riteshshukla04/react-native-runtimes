# @native-compose/threaded-zustand

Small native-backed Zustand-style store for React Native runtimes that do not
share a JS heap.

The package includes its Android native module. It stores serialized state in a
process-wide C++ singleton. The main runtime and any secondary React runtime
register the same native module, so either side can read or update the same
store by name.

```ts
import {createSharedStore} from '@native-compose/threaded-zustand';

type CounterAction = {type: 'inc'} | {type: 'reset'};

export const counterStore = createSharedStore({
  name: 'counter',
  initialState: {count: 0},
  reducer(state, action: CounterAction) {
    switch (action.type) {
      case 'inc':
        return {count: state.count + 1};
      case 'reset':
        return {count: 0};
    }
  },
});

counterStore.dispatch({type: 'inc'});
const count = counterStore.useStore(state => state.count);
```

Stores can also be split into independently versioned top-level subtrees:

```ts
export const chatStore = createSharedStore({
  name: 'chat',
  initialState: {
    messages: {},
    reactions: {},
    settings: {theme: 'dark'},
  },
  slices: {
    messages(messages, action) {
      return reduceMessages(messages, action);
    },
    settings(settings, action) {
      return reduceSettings(settings, action);
    },
  },
});

chatStore.dispatchSubtree('messages', {type: 'append', message});
chatStore.setSubtreeState('settings', {theme: 'light'});

const message = chatStore.useStore(
  state => state.messages[id],
  ['messages'],
);
```

Enable native persistence when state should survive process restart:

```ts
export const preferencesStore = createSharedStore({
  name: 'preferences',
  initialState: {
    counter: {count: 0, updatedAt: null},
  },
  subtrees: ['counter'],
  persist: {
    key: 'preferences',
    version: 1,
    subtrees: ['counter'],
  },
});
```

Hydration uses a native `getOrInit` operation, so concurrent runtimes do not
both observe an empty store and race to write their own initial state. If
persistence is enabled, native storage is checked before the initial state is
committed to the process-wide singleton.

## Runtime model

- State is serialized as JSON at the native boundary.
- Native storage is a C++ singleton keyed by store name and subtree key.
- Each subtree has its own state payload, revision, and lock.
- Each React runtime receives `SharedZustandStoreChanged` native events.
- Reducers currently run in the JS runtime that calls `dispatch`.
- Subtree reducers are serialized per subtree by the caller today; the native
  state commits do not lock unrelated subtrees.
- Persisted subtrees are stored in native platform storage and restored during
  hydration before initial state is used.

## Setup

Install the package and let React Native autolink it:

```sh
npm install @native-compose/threaded-zustand
```

For manually wired secondary runtimes, include `ThreadedZustandPackage` in the
package list used to create that runtime:

```kotlin
import com.nativecompose.threadedzustand.ThreadedZustandPackage

ThreadedRuntime.setExtraReactPackagesProvider {
  listOf(ThreadedZustandPackage())
}
```

## Native contract

The JS package expects a native module named `SharedZustandStore` with:

- `getState(storeName)`
- `getOrInitState(storeName, initialJson, persistKey)`
- `setState(storeName, stateJson, source)`
- `getRevision(storeName)`
- `clear(storeName, source)`
- `getSubtreeState(storeName, subtreeKey)`
- `getOrInitSubtreeState(storeName, subtreeKey, initialJson, persistKey)`
- `setSubtreeState(storeName, subtreeKey, stateJson, source)`
- `getSubtreeRevision(storeName, subtreeKey)`
- `clearSubtree(storeName, subtreeKey, source)`
- `setPersistedState(persistKey, stateJson)`
- `clearPersistedState(persistKey)`

The module emits `SharedZustandStoreChanged` to every active React runtime
after commits. Android is implemented inside this package. iOS is still pending.

The next architectural step is a reducer runtime: a non-UI Hermes runtime that
loads the app bundle, registers reducers, receives native actions, and commits
the reduced JSON state back into this singleton. For native-module access from
reducers, that runtime should be a headless RN instance rather than a raw Hermes
runtime.
