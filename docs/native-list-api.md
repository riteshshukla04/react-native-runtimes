# Native List API

`ComposeChatList` is a Fabric native component. Native owns the scroll container and asks React Native to render only the items it needs.

The public JS wrapper is exported from:

- `src/native/ComposeChatListNativeComponent.ts`
- `src/native/NativeComposeChatList.ts`
- `src/native/NativeComposeChatListItem.ts`
- `src/native/VersionedComposeChatList.tsx`

## FlatList-Style Wrapper

Use `VersionedComposeChatList` for app code. It keeps `data` as the custom versioned source instead of an array, but exposes the familiar `renderItem`, `keyExtractor`, `extraData`, `initialIndexToRender`, and imperative scroll/reset methods.

```tsx
const listRef = useRef<VersionedComposeChatListRef>(null);
const [revision, setRevision] = useState(0);

<VersionedComposeChatList
  ref={listRef}
  data={source}
  extraData={revision}
  renderMode="main"
  initialIndexToRender={lastReadIndex}
  renderItem={({item, index}) => <MessageBubble item={item} index={index} />}
  keyExtractor={item => item.id}
  onReactToItem={(index, reaction) => {
    source.toggleReaction(index, reaction);
    setRevision(value => value + 1);
  }}
/>

listRef.current?.scrollToItem(7500, false);
listRef.current?.resetItem(0);
```

The wrapper expects a versioned data object with `version`, `count`, `toNativeState()`, `renderItems(indices)`, and `resetRenderedItems(indices)`. After mutating the source, change `extraData`, just like a `FlatList` that receives a stable mutable data object.

## Component Props

```tsx
<ComposeChatListNativeComponent
  dataState={dataState}
  renderedItems={renderedItems}
  placeholderSpec={placeholderSpec}
  initialIndexToRender={lastReadIndex}
  renderMode="main"
  listName="main-compose-chat-list"
  backgroundAppName="ComposeChatBackgroundRenderer"
  onRequestItems={handleRequestItems}
  onReactToItem={handleReactToItem}
/>
```

## JSX Render Items

For the main-runtime path on Android, `renderItem` can return normal React Native JSX. The app wraps each rendered item in `ComposeChatListItemNativeComponent`; Fabric mounts that subtree as native views, and `ComposeChatList` hosts those views inside the Jetpack Compose `LazyColumn`.

For `renderMode="background"`, the hidden Android RN app mounts the same JSX under `ComposeChatBackgroundHost`. Native routes those `ComposeChatListItem` views back to the visible list by `listName`, so the second-runtime tab still uses Fabric JSX cells instead of the serialized fallback renderer.

```tsx
<ComposeChatListNativeComponent {...listProps}>
  {visibleItems.map(item => (
    <ComposeChatListItemNativeComponent
      key={item.id}
      itemIndex={item.index}
      itemId={item.id}
      renderVersion={item.renderVersion}
      contentType={item.type}
      measuredHeight={measuredHeights[item.id] ?? 0}
      style={{width: '100%'}}>
      <View onLayout={event => cacheMeasuredHeight(item.id, event)}>
        {renderItem({item})}
      </View>
    </ComposeChatListItemNativeComponent>
  ))}
</ComposeChatListNativeComponent>
```

Rules:

- `renderItem` may use regular RN components such as `View`, `Text`, `Pressable`, images, and app components.
- `itemIndex`, `itemId`, `renderVersion`, `contentType`, and `measuredHeight` notify native which logical row the Fabric subtree represents and how tall Yoga laid it out.
- Keep React keys stable across `renderVersion` changes. Use the item id as the key; `renderVersion` is update metadata, not identity. Including it in the key remounts the Fabric subtree and causes visible flicker on reaction updates.
- Native keeps the previous rendered cell while an updated item is dirty and waiting for a replacement render, so reaction updates do not fall back to skeletons.
- Android keeps the Fabric cell measurable with explicit specs, then updates the Compose row height from the wrapper `onLayout` value produced by Yoga. The native list does not try to infer text height from message length.
- iOS has a codegen provider for `ComposeChatListItem`, but the SwiftUI list path still renders from serialized payloads.

## RN Ease Example

The third benchmark tab uses `react-native-ease` for native mount animations on every rendered bubble:

```tsx
<EaseView
  initialAnimate={{opacity: 0, translateY: 16, scale: 0.96}}
  animate={{opacity: 1, translateY: 0, scale: 1}}
  transition={{
    opacity: {type: 'timing', duration: 160, easing: 'easeOut'},
    transform: {type: 'spring', damping: 17, stiffness: 240, mass: 1},
  }}
  useHardwareLayer>
  <MessageBubble item={item} />
</EaseView>
```

This is intentionally separate from the native Compose/SwiftUI list path. It gives a pure-RN baseline where mount animations run on native platform APIs without an Animated JS loop.

### `dataState`

`dataState` describes the source data shape and recent mutations. It is intentionally operation-based so native can update indexes without receiving the full array.

```ts
type ComposeChatListDataState = {
  version: number;
  count: number;
  ops: ComposeChatListDataOp[];
  reset?: boolean;
};
```

Supported ops:

```ts
type ComposeChatListDataOp =
  | {type: 'insert'; seq: number; index: number; count: number; item?: ChatListMessagePayload}
  | {type: 'remove'; seq: number; index: number; count: number}
  | {type: 'update'; seq: number; index: number; item?: ChatListMessagePayload}
  | {type: 'swapPairs'; seq: number; index: number; count: number}
  | {type: 'reset'; seq: number};
```

Rules:

- `version` increments when underlying data changes.
- `seq` is monotonic and lets native ignore ops it already applied.
- `insert` shifts native row indexes and preserves the current visual anchor if insertion happens before the visible window.
- `update` marks the row dirty. If native already has a rendered row, it keeps the old render visible until the replacement arrives.
- `swapPairs` swaps adjacent pairs inside `[index, index + count)`, for example `(0,1)(2,3)`. Native moves any already-rendered rows immediately, marks affected rows dirty, and asks JS for authoritative replacement rows only if those indices matter now.
- `reset: true` clears native render state and starts over for a new data version.

### `renderedItems`

`renderedItems` is the answer to a native render request.

```ts
type ComposeChatListRenderedItems = {
  version: number;
  requestId: number;
  items: RenderedChatItem[];
};
```

Each item includes a stable `index`, `id`, content type, text payload, reaction summary, and `renderVersion`. The benchmark exposes `renderVersion` in accessibility markers like `chat-row-0-v2`, which is useful for tests.

Native ignores rendered items whose `version` no longer matches current `dataState.version`.

### `placeholderSpec`

`placeholderSpec` lets the app choose native placeholder layouts while waiting for JS-rendered items. This keeps the component usable for feeds, cards, media search results, settings rows, or other item types instead of baking in chat skeletons.

```ts
type ComposeChatListPlaceholderSpec = {
  version?: number;
  defaultVariant?: 'chat' | 'card' | 'media' | 'compact';
  templates?: ComposeChatListPlaceholderTemplate[];
};

type ComposeChatListPlaceholderTemplate = {
  key?: string;
  variant?: 'chat' | 'card' | 'media' | 'compact';
  align?: 'start' | 'end' | 'alternate';
  minWidth?: number;
  maxWidth?: number;
  height?: number;
  lines?: number;
  showAvatar?: boolean;
  showFooter?: boolean;
};
```

Example:

```ts
const placeholderSpec = {
  version: 1,
  defaultVariant: 'card',
  templates: [
    {key: 'feed-card', variant: 'card', lines: 3, showFooter: true},
    {key: 'media-row', variant: 'media', height: 72, lines: 2},
    {key: 'compact-row', variant: 'compact', minWidth: 180, maxWidth: 280},
  ],
};
```

Rules:

- `templates` is a pool. Native deterministically picks `templates[index % templates.length]`.
- `key` should be stable and describes the placeholder shape for native recycling/content-type reuse.
- Dimensions are density-independent native points/dp.
- `version` is for app-level placeholder changes. Bump it when the template pool meaningfully changes.
- A dirty row that already has a rendered item keeps showing that rendered item while native asks JS for the replacement. Placeholders are used only when no prior render exists.

### `initialIndexToRender`

`initialIndexToRender` tells native which row should be requested and positioned first for the initial dataset. It is useful for unread-message or resume-reading flows where the user should land near the latest message they saw instead of the top of the list.

```tsx
<ComposeChatListNativeComponent
  initialIndexToRender={lastReadMessageIndex}
  {...listProps}
/>
```

Behavior:

- Defaults to `0`.
- Native clamps the index into `[0, count - 1]`.
- Native immediately requests the render window around that index, so placeholders appear there while JS asynchronously fills the rows.
- Native applies this initial position once for the current dataset. It runs again if `initialIndexToRender` changes or `dataState.reset` starts a fresh dataset.
- Later data mutations do not keep forcing the scroll position; use `scrollToItem` for explicit navigation after mount.

### `renderMode`

- `main`: native emits `onRequestItems` to the current RN runtime.
- `background`: Android forwards item requests to the second minimal RN runtime. iOS currently uses the same main-runtime event path.

### `listName`

Unique name used to route requests and results. It matters for Android background mode because one hidden RN root can serve multiple native list views.

### `backgroundAppName`

Android app registry name for the hidden background renderer. Current value:

```ts
backgroundAppName="ComposeChatBackgroundRenderer"
```

That component is registered only when:

```ts
global._is_it_a_list_env === true
```

## Events

### `onRequestItems`

Native asks JS to render concrete row indices:

```ts
type RequestItemsEventPayload = {
  requestId: number;
  version: number;
  indicesJson: string;
  resetIndicesJson: string;
};
```

- `indicesJson` is a comma-separated index list, for example `"0,1,2,3"`.
- `resetIndicesJson` is a comma-separated subset that should bypass JS render caches.
- Empty strings mean no indices. Parse by filtering empty tokens before `Number(...)`.

The benchmark handler delays by a small timeout to make skeleton/fill behavior visible:

```ts
source.resetRenderedItems(resetIndices);
setRenderedItems({
  version,
  requestId,
  items: source.renderItems(indices),
});
```

### `onReactToItem`

Native emits a reaction mutation request:

```ts
type ReactToItemEventPayload = {
  index: number;
  reaction: string;
};
```

The benchmark updates the source data, publishes an `update` op, and native decides whether to request the row now based on visibility.

## Commands

Commands are exported as `ComposeChatListCommands`.

### `scrollToItem(viewRef, index, animated)`

Scrolls the native list to `index`.

Behavior:

- Native clamps the target index into `[0, count - 1]`.
- Native immediately requests a render window around the target.
- Android uses Compose `LazyListState.scrollToItem` or `animateScrollToItem`.
- iOS uses `ScrollViewReader.scrollTo`.

### `resetItem(viewRef, index)`

Forces a render-only refresh for one row.

Behavior:

- Native clamps the index.
- Native marks that row dirty and clears any pending request key for it.
- Native keeps the previously rendered row on screen if it has one.
- Native sends `resetIndicesJson` containing that index so JS can invalidate only that row's render cache.
- Data `version` does not change.

This is useful when the native side decides a row should be refreshed without applying a data mutation.

## JS Data Source Helpers

`VersionedChatDataSource` is the benchmark data model. Its API mirrors the native op contract:

```ts
source.addAtIndex(index, message);
source.addManyAtIndex(index, messages);
source.updateItem(index, patch);
source.removeAtIndex(index);
source.toggleReaction(index, reaction);
source.swapAdjacentPairs(index, count);
source.resetRenderedItems(indices);
source.renderItems(indices);
source.toNativeState(reset);
```

`resetRenderedItems(indices)` is render-only. It bumps per-row render generation and clears render cache, but does not change data version or emit data ops.

## Android Background Runtime

Android background mode creates a second `ReactHost` in `BackgroundListRuntime`.

Important pieces:

- `BackgroundListRuntime.ensureHost(...)` constructs the second host.
- `BackgroundListEnvironmentBundleLoader` injects:

```js
global._is_it_a_list_env = true;
global.__COMPOSE_CHAT_LIST_ENV__ = {kind: 'background-list', version: 1};
```

- `index.js` checks `global._is_it_a_list_env` and registers `ComposeChatBackgroundRenderer` instead of the full app.
- `BackgroundChatRenderer` listens for native events, returns rendered item payloads through `BackgroundListBridge`, and mounts JSX cells inside `ComposeChatBackgroundHost`.

## Picking Native Modules For The Second Runtime

The second Android runtime does not use the app's autolinked `PackageList`. Its packages are selected manually here:

```kotlin
DefaultReactHostDelegate(
  jsMainModulePath = "index",
  jsBundleLoader = BackgroundListEnvironmentBundleLoader(...),
  reactPackages = listOf(
    MainReactPackage(),
    BackgroundListRendererPackage(),
  ),
  jsRuntimeFactory = HermesInstance(),
  turboModuleManagerDelegateBuilder = DefaultTurboModuleManagerDelegate.Builder(),
  exceptionHandler = { throw it },
)
```

Current modules:

- `MainReactPackage()` provides React Native core modules.
- `BackgroundListRendererPackage()` exposes `BackgroundListBridgeModule`, `ComposeChatBackgroundHost`, and `ComposeChatListItem`.
- App-specific view managers are limited to the background host and list-item cell host.
- No autolinked third-party packages are installed in the second runtime unless you add them here.

How to add a module:

1. Create or reuse a small `ReactPackage` that returns only the needed native modules.
2. Add that package to `reactPackages` in `BackgroundListRuntime.ensureHost`.
3. Keep the hidden renderer JS guarded with `global._is_it_a_list_env` so it does not import app-only modules.
4. If the module is expensive, verify whether it is lazy in the New Architecture before adding it. Lazy registration still increases available surface area, but most TurboModules are created only when JS accesses them.
5. If a module must never be available in list mode, do not include its package in `reactPackages` and avoid importing JS that references it.

Recommended default:

- Keep only `MainReactPackage()` and `BackgroundListRendererPackage()`.
- Add more packages only when the background renderer directly needs them.
- Prefer plain RN view/text/pressable JSX for list rows. Avoid networking, storage, navigation, analytics, and unrelated UI modules in the background renderer unless there is a concrete benchmark or product need.

## Platform Notes

Android:

- True second RN runtime exists for `renderMode="background"`.
- Jetpack Compose owns list virtualization and visible-window requests.

iOS:

- SwiftUI owns list rendering.
- On iOS, the second tab currently uses the main RN render path; a separate iOS RN runtime is not implemented yet.

## Test Flows

Maestro flows under `maestro/` cover:

- Fast 10k message scrolling and snapshots.
- Reaction no-flicker behavior.
- Reaction re-render behavior.
- Prepending 1000 rows without scroll jump.
- `scrollToItem`.
- `resetItem`.
