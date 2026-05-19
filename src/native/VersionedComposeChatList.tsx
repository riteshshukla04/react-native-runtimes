import {
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {type StyleProp, type ViewStyle} from 'react-native';
import ComposeChatListNativeComponent, {
  ComposeChatListCommands,
  type ComposeChatListDataState,
  type ComposeChatListPlaceholderSpec,
  type ComposeChatListRenderedItems,
  type ReactToItemEvent,
  type RenderedChatItem,
} from './ComposeChatListNativeComponent';
import {
  mainRuntimeListName,
  RuntimeItemRenderer,
  type VersionedComposeChatData,
} from './RuntimeItemRenderer';

export type {VersionedComposeChatData};

export type VersionedComposeChatListRef = {
  scrollToItem: (index: number, animated?: boolean) => void;
  resetItem: (index: number) => void;
};

export type VersionedComposeChatListRenderInfo = {
  item: RenderedChatItem;
  index: number;
};

export type VersionedComposeChatListProps = {
  data: VersionedComposeChatData;
  extraData?: unknown;
  renderItem?: (
    info: VersionedComposeChatListRenderInfo,
  ) => ReactElement | null;
  keyExtractor?: (item: RenderedChatItem, index: number) => string;
  onReactToItem?: (index: number, reaction: string) => void;
  renderMode?: 'main' | 'background';
  listName?: string;
  backgroundAppName?: string;
  placeholderSpec?: ComposeChatListPlaceholderSpec;
  initialIndexToRender?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

const EMPTY_RENDERED_ITEMS: RenderedChatItem[] = [];
const EMPTY_RENDERED_RESPONSES: NonNullable<
  ComposeChatListRenderedItems['responses']
> = [];

export const VersionedComposeChatList = forwardRef<
  VersionedComposeChatListRef,
  VersionedComposeChatListProps
>(function VersionedComposeChatList(
  {
    data,
    extraData,
    renderItem,
    keyExtractor = defaultKeyExtractor,
    onReactToItem,
    renderMode = 'main',
    listName = 'compose-chat-list',
    backgroundAppName = 'ComposeChatBackgroundRenderer',
    placeholderSpec,
    initialIndexToRender = 0,
    style,
    testID,
    accessibilityLabel,
  },
  ref,
) {
  const nativeRef = useRef<any>(null);
  const dataRef = useRef(data);
  const [dataState, setDataState] = useState<ComposeChatListDataState>(() =>
    data.toNativeState(true),
  );
  const emptyRenderedItems = useRef<ComposeChatListRenderedItems>({
    version: data.version,
    requestId: 0,
    items: EMPTY_RENDERED_ITEMS,
    responseSeq: 0,
    responses: EMPTY_RENDERED_RESPONSES,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number, animated = false) {
        if (nativeRef.current) {
          ComposeChatListCommands.scrollToItem(nativeRef.current, index, animated);
        }
      },
      resetItem(index: number) {
        if (nativeRef.current) {
          ComposeChatListCommands.resetItem(nativeRef.current, index);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (dataRef.current !== data) {
      dataRef.current = data;
      const nextState = data.toNativeState(true);
      emptyRenderedItems.current = {
        version: data.version,
        requestId: 0,
        items: EMPTY_RENDERED_ITEMS,
        responseSeq: 0,
        responses: EMPTY_RENDERED_RESPONSES,
      };
      setDataState(nextState);
      return;
    }

    setDataState(data.toNativeState(false));
    // Mutable sources use extraData as the FlatList-style invalidation signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, extraData]);

  function handleReactToItem(event: ReactToItemEvent) {
    const {index, reaction} = event.nativeEvent;
    onReactToItem?.(index, reaction);
    setDataState(data.toNativeState(false));
  }

  const nativeProps = {
    ref: nativeRef,
    accessibilityLabel,
    backgroundAppName,
    dataState,
    initialIndexToRender,
    listName,
    onReactToItem: handleReactToItem,
    placeholderSpec,
    renderMode,
    style,
    testID,
  };

  if (renderMode !== 'main' || !renderItem) {
    return (
      <ComposeChatListNativeComponent
        {...nativeProps}
        onRequestItems={() => {}}
        renderedItems={emptyRenderedItems.current}
      />
    );
  }

  return (
    <RuntimeItemRenderer
      data={data}
      dataState={dataState}
      keyExtractor={keyExtractor}
      nativeListName={listName}
      renderItem={renderItem}
      renderMode="main"
      runtimeListName={mainRuntimeListName(listName)}>
      {({onRequestItems, renderedItems, renderFabricWindow}) => (
        <ComposeChatListNativeComponent
          {...nativeProps}
          onRequestItems={onRequestItems}
          renderedItems={renderedItems}>
          {renderFabricWindow()}
        </ComposeChatListNativeComponent>
      )}
    </RuntimeItemRenderer>
  );
});

function defaultKeyExtractor(item: RenderedChatItem) {
  return item.id;
}

export default VersionedComposeChatList;
