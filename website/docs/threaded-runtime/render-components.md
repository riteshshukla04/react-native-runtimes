---
id: render-components
title: Rendering Components On A Background Runtime
---

Use `threadedComponent` to mark a component as available to secondary runtimes. Then render it with `Threaded` or `ThreadedScreen`.

```tsx
import {
  Threaded,
  ThreadedScreen,
  threadedComponent,
} from '@native-compose/threaded-runtime';

type MessageListProps = {
  conversationId: string;
  initialIndex?: number;
};

export const MessageList = threadedComponent<MessageListProps>(
  'MessageList',
  function MessageList(props) {
    return <ActualMessageList {...props} />;
  },
);

export function ConversationPreview() {
  return (
    <Threaded
      component={MessageList}
      props={{conversationId: 'release-room', initialIndex: 120}}
      runtimeName="messages-runtime"
    />
  );
}
```

`Threaded` mounts a native `ThreadedRuntimeSurface`. The surface asks the named runtime to render `ThreadedRuntimeHost`, and that host resolves the registered component by name.

## Whole Screens

For a whole route, use `ThreadedScreen`. It applies a full-size surface style and preloads the runtime by default.

```tsx
type ConversationScreenProps = {
  conversationId: string;
};

export const ConversationScreen = threadedComponent<ConversationScreenProps>(
  'ConversationScreen',
  function ConversationScreen({conversationId}) {
    return <ConversationRoute conversationId={conversationId} />;
  },
);

<ThreadedScreen
  component={ConversationScreen}
  props={{conversationId: 'release-room'}}
  runtimeName="conversation-release-room-runtime"
  testID="conversation-threaded-screen"
/>;
```

Keep runtime names stable. If the name changes, native creates or switches to another runtime.

## When To Use It

- Long chat or feed screens.
- Heavy list renderers such as FlashList or LegendList.
- Components that can keep working while the main JS runtime is blocked.
- Screens where native navigation should stay responsive even when the screen's JS work is busy.
