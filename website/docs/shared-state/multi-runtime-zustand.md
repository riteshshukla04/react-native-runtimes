---
id: multi-runtime-zustand
title: Multi Runtime Zustand
---

`@react-native-runtimes/state` is a small Zustand-like API backed by a native
C++ singleton. Use it when the main runtime and threaded runtimes need to read
and update the same state without pushing large props through a threaded
surface.

## Dynamic Paths

Create one store, then take native-backed path handles from it:

```tsx
import { createSharedStore } from '@react-native-runtimes/state';

type ChatState = {
  conversations: Record<string, Message[]>;
  metadata: Record<string, { updatedAt: string | null }>;
};

export const chatStore = createSharedStore<ChatState>({
  name: 'chat',
  initialState: {
    conversations: {},
    metadata: {},
  },
});

export function conversationMessages(conversationId: string) {
  return chatStore.path<Message[]>(['conversations', conversationId]);
}
```

The path is the native key. It can be a dot string or an array of segments:

```tsx
const messages = chatStore.path<Message[]>('conversations.release-room');
const sameMessages = chatStore.path<Message[]>([
  'conversations',
  'release-room',
]);
```

## Read And Write

Subscribe from any runtime with `path.use()`:

```tsx
function Conversation({ conversationId }: { conversationId: string }) {
  const messages = conversationMessages(conversationId).use(
    value => value ?? [],
  );

  return <MessageList messages={messages} />;
}
```

Write through the same path handle:

```tsx
const messages = conversationMessages(conversationId);

await messages.set(nextMessages, true);
await messages.update(current => [...(current ?? []), newMessage]);
```

The old top-level APIs still work, but new code should prefer `store.path(...)`
because it supports paths created from ids without declaring every slice up
front.

## Locking And Revisions

Each path has a native state payload and revision:

```tsx
const messages = chatStore.path<Message[]>('conversations.release-room');

await messages.hydrate();
console.log(messages.getRevision());
```

Subscribers are invalidated for related paths. A subscriber on `conversations`
will be notified when `conversations.release-room` changes, and a subscriber on
`conversations.release-room` will be notified when `conversations` changes.

Prefer one writer per path. If two runtimes can update the same path, use
`update(...)` or a path reducer instead of replacing stale snapshots.

## Persistence

Enable persistence when state should survive runtime teardown or app restart:

```tsx
export const preferencesStore = createSharedStore({
  name: 'preferences',
  initialState: {
    counter: { count: 0, updatedAt: null },
  },
  persist: {
    key: 'preferences-v1',
    subtrees: ['counter'],
  },
});

export const counter = preferencesStore.path<{
  count: number;
  updatedAt: string | null;
}>('counter');
```

`persist.subtrees` lists paths that should be eagerly restored during store
hydration. Dynamic paths that are not listed still hydrate lazily when their
handle is created or `path.hydrate()` is called.

## Predeclared Subtrees

Use `subtrees` when the store has a small set of known hot paths that should be
hydrated immediately:

```tsx
export const pokemonStore = createSharedStore<PokemonState>({
  name: 'pokemon',
  initialState: {
    catalog: initialCatalog,
    pokemonItems: [],
  },
  subtrees: ['catalog', 'pokemonItems'],
});

export const catalog = pokemonStore.path<PokemonState['catalog']>('catalog');
export const pokemonItems =
  pokemonStore.path<PokemonState['pokemonItems']>('pokemonItems');
```

Use dynamic paths when ids define ownership:

```tsx
export const conversationDraft = (conversationId: string) =>
  chatStore.path<string>(['drafts', conversationId]);
```

The native store tracks revisions per path. Every active runtime receives
native change events and updates matching subscribers.
