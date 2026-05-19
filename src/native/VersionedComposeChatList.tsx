import {
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  NativeModules,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ComposeChatListNativeComponent, {
  ComposeChatListCommands,
  type ComposeChatListDataState,
  type ComposeChatListPlaceholderSpec,
  type ComposeChatListRenderedItems,
  type ComposeChatListRenderedItemsResponse,
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

const EMPTY_RENDERED_ITEMS: RenderedChatItem[] = [];
const EMPTY_RENDERED_RESPONSES: ComposeChatListRenderedItemsResponse[] = [];
const MAX_RENDERED_RESPONSE_QUEUE = 128;
const {BackgroundListBridge} = NativeModules;

type DirectRequestGlobal = typeof globalThis & {
  __composeChatBackgroundRequestHandler?: (event: DirectItemRequest) => void;
};

type DirectItemRequest = {
  listName: string;
  requestId: number;
  version: number;
  nativeDispatchUptimeMs?: number;
  indices: number[];
  windowIndices: number[];
  resetIndices?: number[];
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
	      items: EMPTY_RENDERED_ITEMS,
	      responseSeq: 0,
	      responses: EMPTY_RENDERED_RESPONSES,
	    }));
  const fabricWindow = useFabricItemWindow();
  const latestWindowIndicesRef = useRef<number[]>([]);
  const directRequestHandlerRef = useRef<(event: DirectItemRequest) => void>(
    () => {},
  );

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
	        items: EMPTY_RENDERED_ITEMS,
	        responseSeq: 0,
	        responses: EMPTY_RENDERED_RESPONSES,
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

  useEffect(() => {
    if (
      renderMode !== 'main' ||
      Platform.OS !== 'android' ||
      !BackgroundListBridge?.rendererReady
    ) {
      return;
    }

    const directListName = mainRuntimeListName(listName);
    const directGlobal = globalThis as DirectRequestGlobal;
    const previousHandler = directGlobal.__composeChatBackgroundRequestHandler;
    const handler = (event: DirectItemRequest) => {
      if (event.listName === directListName) {
        directRequestHandlerRef.current(event);
        return;
      }
      previousHandler?.(event);
    };

    directGlobal.__composeChatBackgroundRequestHandler = handler;
    BackgroundListBridge.rendererReady(directListName);

    return () => {
      if (directGlobal.__composeChatBackgroundRequestHandler === handler) {
        if (previousHandler) {
          directGlobal.__composeChatBackgroundRequestHandler = previousHandler;
        } else {
          delete directGlobal.__composeChatBackgroundRequestHandler;
        }
      }
    };
  }, [listName, renderMode]);

  directRequestHandlerRef.current = (event: DirectItemRequest) => {
    renderAndDeliverItems(
      {
        indices: event.indices,
        nativeDispatchUptimeMs: event.nativeDispatchUptimeMs,
        requestId: event.requestId,
        resetIndices: event.resetIndices ?? [],
        version: event.version,
        windowIndices: event.windowIndices,
      },
      Date.now(),
    );
  };

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
    renderAndDeliverItems(
      {
        indices,
        requestId,
        resetIndices,
        version,
        windowIndices,
      },
      Date.now(),
    );
  }

  function renderAndDeliverItems(
    request: {
      indices: number[];
      nativeDispatchUptimeMs?: number;
      requestId: number;
      resetIndices: number[];
      version: number;
      windowIndices: number[];
    },
    requestReceivedAt: number,
  ) {
    latestWindowIndicesRef.current = request.windowIndices;
    if (request.version !== data.version) {
      return;
    }

    const renderStartedAt = Date.now();
    data.resetRenderedItems(request.resetIndices);
    const items = data.renderItems(request.indices);
    const renderFinishedAt = Date.now();
	    const response: ComposeChatListRenderedItemsResponse = {
      version: request.version,
      requestId: request.requestId,
      nativeDispatchUptimeMs: request.nativeDispatchUptimeMs,
	      jsRenderDurationMs: renderFinishedAt - renderStartedAt,
	      jsTotalDurationMs: renderFinishedAt - requestReceivedAt,
	      items,
	    };
    if (
      renderMode === 'main' &&
      Platform.OS === 'android' &&
      BackgroundListBridge?.deliverRenderedItems
    ) {
      BackgroundListBridge.deliverRenderedItems(listName, response);
    } else {
      setRenderedItems(previous => {
        const responses = [...(previous.responses ?? []), response].slice(
          -MAX_RENDERED_RESPONSE_QUEUE,
        );
        return {
          ...response,
          responseSeq: (previous.responseSeq ?? 0) + 1,
          responses,
        };
      });
    }
    fabricWindow.mergeItems(items, latestWindowIndicesRef.current);
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

function mainRuntimeListName(listName: string) {
  return `main:${listName}`;
}

export default VersionedComposeChatList;
