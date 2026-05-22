---
id: pass-props
title: Passing Props
---

Props are serialized by the main runtime and passed to the threaded surface as JSON. Keep them small and stable.

```tsx
<ThreadedScreen
  component={ConversationScreen}
  props={{
    conversationId: 'release-room',
    initialMessageCount: 96,
    participants: 'Ava, Noah, Mia',
  }}
  runtimeName="conversation-release-room-runtime"
/>
```

Inside the threaded component, read props normally:

```tsx
type ConversationScreenProps = {
  conversationId: string;
  initialMessageCount: number;
  participants: string;
  runtimeName?: string;
};

export const ConversationScreen = threadedComponent<ConversationScreenProps>(
  'ConversationScreen',
  function ConversationScreen(props) {
    return <ConversationRoute {...props} />;
  },
);
```

## Rules

- Props must be JSON-serializable.
- Do not pass functions, class instances, refs, native handles, or cyclic objects.
- Prefer ids, cursors, and config values over large datasets.
- Use `@react-native-runtimes/state` for mutable or shared state.
- Keep `runtimeName` stable for a logical owner, such as one runtime per conversation.

## Recommended Pattern

Pass identity through props, then load or subscribe to the real data inside the threaded runtime:

```tsx
<ThreadedScreen
  component={ConversationScreen}
  props={{ conversationId }}
  runtimeName={`conversation-${conversationId}-runtime`}
/>
```

```tsx
function ConversationRoute({ conversationId }: { conversationId: string }) {
  const messages = messagesStore.useStore(
    state => state.conversations[conversationId] ?? [],
    ['conversations'],
  );

  return <MessageList messages={messages} />;
}
```
