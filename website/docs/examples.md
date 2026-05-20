---
id: examples
title: Examples
---

## Chat Screen On A Secondary Runtime

```tsx
const CHAT_RUNTIME_NAMES = conversations.map(
  conversation => `conversation-${conversation.id}-runtime`,
);

function ConversationPicker() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId != null) {
      return;
    }

    for (const runtimeName of CHAT_RUNTIME_NAMES) {
      void ThreadedRuntime.prewarm(runtimeName);
    }
  }, [selectedId]);

  if (selectedId) {
    return (
      <ThreadedScreen
        component={ConversationScreen}
        props={{conversationId: selectedId}}
        runtimeName={`conversation-${selectedId}-runtime`}
      />
    );
  }

  return (
    <ConversationList
      onOpen={conversationId => {
        void ThreadedRuntime.prewarm(`conversation-${conversationId}-runtime`);
        setSelectedId(conversationId);
      }}
    />
  );
}
```

## Shared Store Producer And Threaded Consumer

Main runtime fetches data:

```tsx
async function fetchMore() {
  const page = await fetchNextPage();

  await pokemonStore.dispatchSubtree(
    {type: 'appendPage', page},
    'pokemonItems',
  );
}
```

Threaded runtime consumes it:

```tsx
export const PokemonConsumer = threadedComponent(
  'PokemonConsumer',
  function PokemonConsumer() {
    const items = pokemonStore.useStore(state => state.pokemonItems, [
      'pokemonItems',
    ]);

    return <FlatList data={items} renderItem={renderPokemon} />;
  },
);
```

## Headless Hydration Before Opening A Screen

```tsx
async function prepareAndOpen(conversationId: string) {
  const runtimeName = `conversation-${conversationId}-runtime`;

  await ThreadedRuntime.prewarm(runtimeName);
  await ThreadedRuntime.runHeadlessTask('hydrateConversation', {
    runtimeName,
    payload: {
      conversationId,
      limit: 50,
    },
  });

  navigation.navigate('Conversation', {conversationId});
}
```

## Native Queued Dispatch

This can be called before the runtime is ready. Native queues the request and flushes it once startup completes.

```kotlin
ThreadedRuntime.dispatchHeadlessTask(
  applicationContext,
  "conversation-release-room-runtime",
  "hydrateConversation",
  """{"conversationId":"release-room","limit":50}""",
)
```

## Run The Example App

Android:

```sh
npm install
npm run android
```

iOS:

```sh
npm install
cd ios
bundle exec pod install
cd ..
npm run ios
```

The sample app includes:

- Native JSX chat list.
- Native 2RN JSX chat list.
- FlashList and LegendList on a threaded runtime.
- Main-runtime LegendList comparison.
- Shared tree state across runtimes.
- PokeAPI producer on main runtime and consumer on a threaded runtime.
- Threaded chat screen and chat app examples.
