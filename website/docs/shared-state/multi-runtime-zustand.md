---
id: multi-runtime-zustand
title: Multi Runtime Zustand
---

`@react-native-runtimes/state` is a small Zustand-like API backed by a native C++ singleton. It lets the main runtime and threaded runtimes read and update shared state without passing large props through the threaded surface.

Create a store:

```tsx
import { createSharedStore } from '@react-native-runtimes/state';

type ChatState = {
  conversations: Record<string, Message[]>;
  metadata: Record<string, { updatedAt: string }>;
};

type ChatAction =
  | { type: 'replaceMessages'; conversationId: string; messages: Message[] }
  | { type: 'markUpdated'; conversationId: string; updatedAt: string };

export const chatStore = createSharedStore<ChatState, ChatAction>({
  name: 'chat',
  initialState: {
    conversations: {},
    metadata: {},
  },
  slices: {
    conversations: (state, action) => {
      if (action.type !== 'replaceMessages') {
        return state;
      }

      return {
        ...state,
        [action.conversationId]: action.messages,
      };
    },
    metadata: (state, action) => {
      if (action.type !== 'markUpdated') {
        return state;
      }

      return {
        ...state,
        [action.conversationId]: { updatedAt: action.updatedAt },
      };
    },
  },
});
```

Subscribe in either runtime:

```tsx
function Conversation({ conversationId }: { conversationId: string }) {
  const messages = chatStore.useStore(
    state => state.conversations[conversationId] ?? [],
    ['conversations'],
  );

  return <MessageList messages={messages} />;
}
```

Dispatch from either runtime:

```tsx
await chatStore.dispatchSubtree(
  {
    type: 'replaceMessages',
    conversationId,
    messages,
  },
  'conversations',
);
```

## Subtrees

Subtrees let independent parts of the store update without locking or rewriting the full state. Prefer subtrees for larger stores:

- `conversations`
- `metadata`
- `presence`
- `drafts`

Dispatch to the subtree that owns the change:

```tsx
await chatStore.dispatchSubtree(
  { type: 'markUpdated', conversationId, updatedAt: new Date().toISOString() },
  'metadata',
);
```

## Persistence

Enable persistence when the state should survive runtime teardown or app restart:

```tsx
export const preferencesStore = createSharedStore({
  name: 'preferences',
  initialState: {
    theme: 'system',
    density: 'comfortable',
  },
  persist: {
    key: 'preferences-v1',
  },
});
```

For larger stores, persist specific subtrees:

```tsx
export const chatStore = createSharedStore({
  name: 'chat',
  initialState,
  slices,
  persist: {
    key: 'chat-v1',
    subtrees: ['metadata', 'drafts'],
  },
});
```

## Hydration Conflicts

Use clear ownership for writes:

- UI state can be owned by the runtime rendering that UI.
- Data fetches can be owned by a main runtime producer or a headless threaded runtime.
- Different subtrees can be written independently.
- If two runtimes may update the same subtree, use actions/reducers instead of blind replacement.

The native store tracks revisions per subtree. Subscribers receive updates through native events in every active runtime.
