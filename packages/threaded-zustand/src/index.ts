import {useSyncExternalStore} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const ROOT_SUBTREE_KEY = '__root__';

type NativeSharedZustandStore = {
  getState(storeName: string): Promise<string | null>;
  setState(
    storeName: string,
    stateJson: string,
    source: string | null,
  ): Promise<number>;
  getRevision(storeName: string): Promise<number>;
  clear(storeName: string, source: string | null): Promise<number>;
  getSubtreeState(storeName: string, subtreeKey: string): Promise<string | null>;
  setSubtreeState(
    storeName: string,
    subtreeKey: string,
    stateJson: string,
    source: string | null,
  ): Promise<number>;
  getSubtreeRevision(storeName: string, subtreeKey: string): Promise<number>;
  clearSubtree(
    storeName: string,
    subtreeKey: string,
    source: string | null,
  ): Promise<number>;
};

type NativeChangeEvent = {
  storeName: string;
  subtreeKey?: string;
  stateJson: string | null;
  revision: number;
  source?: string | null;
};

export type SharedStoreListener<TState> = (
  state: TState,
  revision: number,
  subtreeKey: string,
) => void;

export type SharedStoreReducer<TState, TAction> = (
  state: TState,
  action: TAction,
) => TState;

export type SharedStoreSubtreeKey<TState> = Extract<keyof TState, string>;

export type SharedStoreSliceReducers<TState, TAction> = Partial<{
  [K in SharedStoreSubtreeKey<TState>]: SharedStoreReducer<TState[K], TAction>;
}>;

export type SharedStoreOptions<TState, TAction> = {
  name: string;
  initialState: TState;
  reducer?: SharedStoreReducer<TState, TAction>;
  slices?: SharedStoreSliceReducers<TState, TAction>;
  subtrees?: readonly SharedStoreSubtreeKey<TState>[];
  sourceId?: string;
};

export type SharedStoreApi<TState, TAction> = {
  name: string;
  getState(): TState;
  getRevision(subtreeKey?: SharedStoreSubtreeKey<TState>): number;
  getSubtreeState<K extends SharedStoreSubtreeKey<TState>>(
    subtreeKey: K,
  ): TState[K];
  hydrate(): Promise<TState>;
  setState(
    partial:
      | TState
      | Partial<TState>
      | ((state: TState) => TState | Partial<TState>),
    replace?: boolean,
  ): Promise<number>;
  setSubtreeState<K extends SharedStoreSubtreeKey<TState>>(
    subtreeKey: K,
    partial: TState[K] | Partial<TState[K]> | ((state: TState[K]) => TState[K] | Partial<TState[K]>),
    replace?: boolean,
  ): Promise<number>;
  dispatch(action: TAction, subtreeKey?: SharedStoreSubtreeKey<TState>): Promise<number>;
  dispatchSubtree<K extends SharedStoreSubtreeKey<TState>>(
    subtreeKey: K,
    action: TAction,
  ): Promise<number>;
  clear(subtreeKey?: SharedStoreSubtreeKey<TState>): Promise<number>;
  subscribe(
    listener: SharedStoreListener<TState>,
    subtreeKeys?: readonly SharedStoreSubtreeKey<TState>[],
  ): () => void;
  useStore(): TState;
  useStore<TSelected>(
    selector: (state: TState) => TSelected,
    subtreeKeys?: readonly SharedStoreSubtreeKey<TState>[],
    getServerSnapshot?: () => TSelected,
  ): TSelected;
};

type ListenerEntry<TState> = {
  listener: SharedStoreListener<TState>;
  subtreeKeys?: ReadonlySet<string>;
};

const nativeStore = NativeModules.SharedZustandStore as
  | NativeSharedZustandStore
  | undefined;

const eventEmitter = nativeStore
  ? new NativeEventEmitter(nativeStore as any)
  : null;
const runtimeSourceId = `runtime-${Math.random().toString(36).slice(2)}`;

function requireNativeStore(): NativeSharedZustandStore {
  if (!nativeStore) {
    throw new Error('SharedZustandStore native module is not installed');
  }
  return nativeStore;
}

function parseState<TState>(stateJson: string): TState {
  return JSON.parse(stateJson) as TState;
}

function stringifyState<TState>(state: TState): string {
  return JSON.stringify(state);
}

function resolveNextState<TState>(
  currentState: TState,
  partial:
    | TState
    | Partial<TState>
    | ((state: TState) => TState | Partial<TState>),
  replace: boolean,
): TState {
  const partialState =
    typeof partial === 'function'
      ? (partial as (state: TState) => TState | Partial<TState>)(currentState)
      : partial;

  if (
    replace ||
    typeof partialState !== 'object' ||
    partialState === null ||
    Array.isArray(partialState)
  ) {
    return partialState as TState;
  }

  return {...(currentState as object), ...(partialState as object)} as TState;
}

function topLevelKeys<TState>(state: TState): SharedStoreSubtreeKey<TState>[] {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return [];
  }
  return Object.keys(state) as SharedStoreSubtreeKey<TState>[];
}

function uniqueSubtrees<TState, TAction>(
  initialState: TState,
  slices?: SharedStoreSliceReducers<TState, TAction>,
  subtrees?: readonly SharedStoreSubtreeKey<TState>[],
): SharedStoreSubtreeKey<TState>[] {
  const keys = subtrees?.length
    ? subtrees
    : slices
      ? (Object.keys(slices) as SharedStoreSubtreeKey<TState>[])
      : topLevelKeys(initialState);
  return Array.from(new Set(keys));
}

export function createSharedStore<TState, TAction = unknown>({
  name,
  initialState,
  reducer,
  slices,
  subtrees,
  sourceId = runtimeSourceId,
}: SharedStoreOptions<TState, TAction>): SharedStoreApi<TState, TAction> {
  const sliceKeys = uniqueSubtrees(initialState, slices, subtrees);
  const usesSubtrees = sliceKeys.length > 0 && !reducer;
  const nativeSubtreeKeys = usesSubtrees ? sliceKeys : [ROOT_SUBTREE_KEY];
  const listeners = new Set<ListenerEntry<TState>>();
  const subtreeRevisions = new Map<string, number>();
  let currentState = initialState;
  let currentRevision = 0;

  function publish(nextState: TState, subtreeKey: string, revision: number) {
    currentState = nextState;
    subtreeRevisions.set(subtreeKey, revision);
    currentRevision = Math.max(currentRevision, revision);
    listeners.forEach(({listener, subtreeKeys}) => {
      if (!subtreeKeys || subtreeKeys.has(subtreeKey)) {
        listener(currentState, currentRevision, subtreeKey);
      }
    });
  }

  function patchSubtree<K extends SharedStoreSubtreeKey<TState>>(
    subtreeKey: K,
    subtreeState: TState[K],
  ): TState {
    return {...(currentState as object), [subtreeKey]: subtreeState} as TState;
  }

  function initialSubtree<K extends SharedStoreSubtreeKey<TState>>(
    subtreeKey: K,
  ): TState[K] {
    return (initialState as Record<string, unknown>)[subtreeKey] as TState[K];
  }

  const subscription = eventEmitter?.addListener(
    'SharedZustandStoreChanged',
    (event: NativeChangeEvent) => {
      if (event.storeName !== name) {
        return;
      }
      const subtreeKey = event.subtreeKey ?? ROOT_SUBTREE_KEY;
      const currentSubtreeRevision = subtreeRevisions.get(subtreeKey) ?? 0;
      if (event.revision < currentSubtreeRevision) {
        return;
      }

      if (!usesSubtrees || subtreeKey === ROOT_SUBTREE_KEY) {
        const nextState =
          event.stateJson == null
            ? initialState
            : parseState<TState>(event.stateJson);
        publish(nextState, subtreeKey, event.revision);
        return;
      }

      const typedSubtreeKey = subtreeKey as SharedStoreSubtreeKey<TState>;
      const nextSubtreeState =
        event.stateJson == null
          ? initialSubtree(typedSubtreeKey)
          : parseState<TState[typeof typedSubtreeKey]>(event.stateJson);
      publish(patchSubtree(typedSubtreeKey, nextSubtreeState), subtreeKey, event.revision);
    },
  );

  async function hydrateSubtree(subtreeKey: string) {
    const store = requireNativeStore();
    const stateJson =
      subtreeKey === ROOT_SUBTREE_KEY
        ? await store.getState(name)
        : await store.getSubtreeState(name, subtreeKey);

    if (stateJson == null) {
      const initialJson =
        subtreeKey === ROOT_SUBTREE_KEY
          ? stringifyState(initialState)
          : stringifyState(
              initialSubtree(subtreeKey as SharedStoreSubtreeKey<TState>),
            );
      const revision =
        subtreeKey === ROOT_SUBTREE_KEY
          ? await store.setState(name, initialJson, sourceId)
          : await store.setSubtreeState(name, subtreeKey, initialJson, sourceId);
      subtreeRevisions.set(subtreeKey, revision);
      currentRevision = Math.max(currentRevision, revision);
      return;
    }

    const revision =
      subtreeKey === ROOT_SUBTREE_KEY
        ? await store.getRevision(name)
        : await store.getSubtreeRevision(name, subtreeKey);
    if (subtreeKey === ROOT_SUBTREE_KEY) {
      publish(parseState<TState>(stateJson), subtreeKey, revision);
      return;
    }
    const typedSubtreeKey = subtreeKey as SharedStoreSubtreeKey<TState>;
    publish(
      patchSubtree(typedSubtreeKey, parseState<TState[typeof typedSubtreeKey]>(stateJson)),
      subtreeKey,
      revision,
    );
  }

  void Promise.all(nativeSubtreeKeys.map(hydrateSubtree)).catch(error => {
    console.warn(`[threaded-zustand] Failed to hydrate ${name}`, error);
  });

  const api: SharedStoreApi<TState, TAction> = {
    name,
    getState() {
      return currentState;
    },
    getRevision(subtreeKey) {
      if (subtreeKey == null) {
        return currentRevision;
      }
      return subtreeRevisions.get(subtreeKey) ?? 0;
    },
    getSubtreeState(subtreeKey) {
      return (currentState as Record<string, unknown>)[subtreeKey] as TState[typeof subtreeKey];
    },
    async hydrate() {
      await Promise.all(nativeSubtreeKeys.map(hydrateSubtree));
      return currentState;
    },
    async setState(partial, replace = false) {
      const nextState = resolveNextState(currentState, partial, replace);
      if (!usesSubtrees) {
        const revision = await requireNativeStore().setState(
          name,
          stringifyState(nextState),
          sourceId,
        );
        publish(nextState, ROOT_SUBTREE_KEY, revision);
        return revision;
      }

      const changedKeys = sliceKeys.filter(
        subtreeKey =>
          (nextState as Record<string, unknown>)[subtreeKey] !==
          (currentState as Record<string, unknown>)[subtreeKey],
      );
      const keysToCommit = changedKeys.length > 0 ? changedKeys : sliceKeys;
      let maxRevision = currentRevision;
      for (const subtreeKey of keysToCommit) {
        const revision = await api.setSubtreeState(
          subtreeKey,
          (nextState as Record<string, unknown>)[subtreeKey] as TState[typeof subtreeKey],
          true,
        );
        maxRevision = Math.max(maxRevision, revision);
      }
      return maxRevision;
    },
    async setSubtreeState(subtreeKey, partial, replace = false) {
      if (!usesSubtrees) {
        return api.setState(
          state =>
            resolveNextState(
              state,
              {
                [subtreeKey]: resolveNextState(
                  (state as Record<string, unknown>)[subtreeKey],
                  partial as unknown,
                  replace,
                ),
              } as Partial<TState>,
              false,
            ),
          false,
        );
      }

      const nextSubtreeState = resolveNextState(
        api.getSubtreeState(subtreeKey),
        partial,
        replace,
      );
      const revision = await requireNativeStore().setSubtreeState(
        name,
        subtreeKey,
        stringifyState(nextSubtreeState),
        sourceId,
      );
      publish(patchSubtree(subtreeKey, nextSubtreeState), subtreeKey, revision);
      return revision;
    },
    async dispatch(action, subtreeKey) {
      if (subtreeKey != null) {
        return api.dispatchSubtree(subtreeKey, action);
      }
      if (reducer) {
        return api.setState(reducer(currentState, action), true);
      }
      if (sliceKeys.length === 1) {
        return api.dispatchSubtree(sliceKeys[0], action);
      }
      throw new Error(
        `Shared store ${name} has multiple subtrees; dispatch requires a subtreeKey`,
      );
    },
    async dispatchSubtree(subtreeKey, action) {
      const sliceReducer = slices?.[subtreeKey];
      if (!sliceReducer) {
        throw new Error(
          `Shared store ${name} does not have a reducer for subtree ${subtreeKey}`,
        );
      }
      return api.setSubtreeState(
        subtreeKey,
        sliceReducer(api.getSubtreeState(subtreeKey), action),
        true,
      );
    },
    async clear(subtreeKey) {
      if (subtreeKey != null) {
        const revision = await requireNativeStore().clearSubtree(
          name,
          subtreeKey,
          sourceId,
        );
        publish(patchSubtree(subtreeKey, initialSubtree(subtreeKey)), subtreeKey, revision);
        return revision;
      }

      if (!usesSubtrees) {
        const revision = await requireNativeStore().clear(name, sourceId);
        publish(initialState, ROOT_SUBTREE_KEY, revision);
        return revision;
      }

      let maxRevision = currentRevision;
      for (const key of sliceKeys) {
        maxRevision = Math.max(maxRevision, await api.clear(key));
      }
      return maxRevision;
    },
    subscribe(listener, subtreeKeys) {
      const entry: ListenerEntry<TState> = {
        listener,
        subtreeKeys: subtreeKeys ? new Set(subtreeKeys) : undefined,
      };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    useStore<TSelected>(
      selector?: (state: TState) => TSelected,
      subtreeKeys?: readonly SharedStoreSubtreeKey<TState>[],
      getServerSnapshot?: () => TSelected,
    ) {
      const select =
        selector ?? ((state: TState) => state as unknown as TSelected);
      return useSyncExternalStore(
        onStoreChange => api.subscribe(() => onStoreChange(), subtreeKeys),
        () => select(currentState),
        getServerSnapshot ?? (() => select(initialState)),
      );
    },
  };

  void subscription;
  return api;
}

export function destroySharedStore(store: SharedStoreApi<unknown, unknown>) {
  void store.clear();
}
