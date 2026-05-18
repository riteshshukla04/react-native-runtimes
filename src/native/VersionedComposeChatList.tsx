import {
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {Platform, type StyleProp, type ViewStyle} from 'react-native';
import ComposeChatListNativeComponent, {
  ComposeChatListCommands,
  type ComposeChatListDataState,
  type ComposeChatListPlaceholderSpec,
  type ComposeChatListRenderedItems,
  type ReactToItemEvent,
  type RenderedChatItem,
  type RequestItemsEvent,
} from './ComposeChatListNativeComponent';
import {
  FabricItemWindow,
  maxDataOpSeq,
  parseIndexList,
  useFabricItemWindow,
} from './FabricItemWindow';

export type VersionedComposeChatData = {
  readonly version: number;
  readonly count: number;
  toNativeState(reset?: boolean): ComposeChatListDataState;
  renderItems(indices: number[]): RenderedChatItem[];
  resetRenderedItems(indices: number[]): void;
};

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
  const appliedFabricSeqRef = useRef(maxDataOpSeq(data.toNativeState(true).ops));
  const [dataState, setDataState] = useState(() => data.toNativeState(true));
  const [renderedItems, setRenderedItems] =
    useState<ComposeChatListRenderedItems>(() => ({
      version: data.version,
      requestId: 0,
      items: [],
    }));
  const fabricWindow = useFabricItemWindow();

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
      appliedFabricSeqRef.current = maxDataOpSeq(data.toNativeState(true).ops);
      setDataState(data.toNativeState(true));
      setRenderedItems({
        version: data.version,
        requestId: 0,
        items: [],
      });
      fabricWindow.reset();
      return;
    }

    publishState(false);
    // Mutable sources use extraData as the FlatList-style invalidation signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, extraData]);

  function publishState(reset: boolean) {
    const nextState = data.toNativeState(reset);
    const unappliedOps = nextState.ops.filter(
      op => op.seq > appliedFabricSeqRef.current,
    );
    appliedFabricSeqRef.current = Math.max(
      appliedFabricSeqRef.current,
      maxDataOpSeq(nextState.ops),
    );
    setDataState(nextState);
    if (reset) {
      fabricWindow.reset();
    } else {
      fabricWindow.applyOps(unappliedOps);
    }
  }

  function handleRequestItems(event: RequestItemsEvent) {
    if (renderMode !== 'main' && Platform.OS !== 'ios') {
      return;
    }

    const {
      indicesJson,
      requestId,
      resetIndicesJson,
      version,
      windowIndicesJson,
    } = event.nativeEvent;
    const indices = parseIndexList(indicesJson);
    const resetIndices = parseIndexList(resetIndicesJson);
    const windowIndices = parseIndexList(windowIndicesJson);
    setTimeout(() => {
      if (version !== data.version) {
        return;
      }

      data.resetRenderedItems(resetIndices);
      const items = data.renderItems(indices);
      setRenderedItems({
        version,
        requestId,
        items,
      });
      fabricWindow.mergeItems(items, windowIndices);
    }, 24);
  }

  function handleReactToItem(event: ReactToItemEvent) {
    const {index, reaction} = event.nativeEvent;
    onReactToItem?.(index, reaction);
    publishState(false);
  }

  return (
    <ComposeChatListNativeComponent
      ref={nativeRef}
      accessibilityLabel={accessibilityLabel}
      backgroundAppName={backgroundAppName}
      dataState={dataState}
      initialIndexToRender={initialIndexToRender}
      listName={listName}
      onReactToItem={handleReactToItem}
      onRequestItems={handleRequestItems}
      placeholderSpec={placeholderSpec}
      renderMode={renderMode}
      renderedItems={renderedItems}
      style={style}
      testID={testID}>
      {renderMode === 'main' && renderItem
        ? (
          <FabricItemWindow
            items={fabricWindow.items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
          />
        )
        : null}
    </ComposeChatListNativeComponent>
  );
});

function defaultKeyExtractor(item: RenderedChatItem) {
  return item.id;
}

export default VersionedComposeChatList;
