import {type ReactElement, useCallback, useEffect, useRef, useState} from 'react';
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {
  type ComposeChatListDataState,
  type ComposeChatListRenderedItems,
  type ComposeChatListRenderedItemsResponse,
  type RenderedChatItem,
  type RequestItemsEvent,
} from './ComposeChatListNativeComponent';
import {
  FabricItemWindow,
  maxDataOpSeq,
  parseIndexList,
  useFabricItemWindow,
  type FabricItemWindowRenderer,
} from './FabricItemWindow';

export type VersionedComposeChatData = {
  readonly version: number;
  readonly count: number;
  toNativeState(reset?: boolean): ComposeChatListDataState;
  renderItems(indices: number[]): RenderedChatItem[];
  resetRenderedItems(indices: number[]): void;
};

export type RuntimeRenderMode = 'main' | 'background';

export type RuntimeItemRequest = {
  listName: string;
  requestId: number;
  version: number;
  nativeDispatchUptimeMs?: number;
  indices: number[];
  windowIndices: number[];
  resetIndices?: number[];
};

type RuntimeRequestGlobal = typeof globalThis & {
  __composeChatBackgroundRequestHandler?: (event: RuntimeItemRequest) => void;
};

export type RuntimeItemRendererState = {
  onRequestItems: (event: RequestItemsEvent) => void;
  renderedItems: ComposeChatListRenderedItems;
  renderFabricWindow: () => ReactElement;
  resetFabricWindow: () => void;
};

export type RuntimeItemRendererProps = {
  children: (state: RuntimeItemRendererState) => ReactElement;
  data: VersionedComposeChatData;
  dataState: ComposeChatListDataState;
  keyExtractor?: (item: RenderedChatItem, index: number) => string;
  nativeListName: string;
  renderItem: FabricItemWindowRenderer;
  renderMode: RuntimeRenderMode;
  runtimeListName: string;
};

const EMPTY_RENDERED_ITEMS: RenderedChatItem[] = [];
const EMPTY_RENDERED_RESPONSES: ComposeChatListRenderedItemsResponse[] = [];
const MAX_RENDERED_RESPONSE_QUEUE = 128;
const {BackgroundListBridge} = NativeModules;
const backgroundEvents = BackgroundListBridge
  ? new NativeEventEmitter(BackgroundListBridge)
  : null;

export function RuntimeItemRenderer({
  children,
  data,
  dataState,
  keyExtractor,
  nativeListName,
  renderItem,
  renderMode,
  runtimeListName,
}: RuntimeItemRendererProps) {
  const dataRef = useRef(data);
  const appliedFabricSeqRef = useRef(maxDataOpSeq(data.toNativeState(true).ops));
  const latestWindowIndicesRef = useRef<number[]>([]);
  const directRequestHandlerRef = useRef<(event: RuntimeItemRequest) => void>(
    () => {},
  );
  const {
    applyOps,
    items: fabricItems,
    mergeItems,
    reset: resetFabricWindow,
  } = useFabricItemWindow();
  const [renderedItems, setRenderedItems] =
    useState<ComposeChatListRenderedItems>(() => emptyRenderedItems(data.version));

  useEffect(() => {
    if (dataRef.current !== data) {
      dataRef.current = data;
      appliedFabricSeqRef.current = maxDataOpSeq(data.toNativeState(true).ops);
      setRenderedItems(emptyRenderedItems(data.version));
      resetFabricWindow();
    }
  }, [data, resetFabricWindow]);

  useEffect(() => {
    const unappliedOps = dataState.ops.filter(
      op => op.seq > appliedFabricSeqRef.current,
    );
    appliedFabricSeqRef.current = Math.max(
      appliedFabricSeqRef.current,
      maxDataOpSeq(dataState.ops),
    );
    if (dataState.reset) {
      resetFabricWindow();
    } else {
      applyOps(unappliedOps);
    }
  }, [applyOps, dataState, resetFabricWindow]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !BackgroundListBridge?.rendererReady) {
      return;
    }

    const directGlobal = globalThis as RuntimeRequestGlobal;
    const previousHandler = directGlobal.__composeChatBackgroundRequestHandler;
    const handler = (event: RuntimeItemRequest) => {
      if (event.listName === runtimeListName) {
        directRequestHandlerRef.current(event);
        return;
      }
      previousHandler?.(event);
    };

    directGlobal.__composeChatBackgroundRequestHandler = handler;
    BackgroundListBridge.rendererReady(runtimeListName);

    const requestSubscription = backgroundEvents?.addListener(
      'ComposeChatBackgroundRequestItems',
      handler,
    );

    return () => {
      requestSubscription?.remove();
      if (directGlobal.__composeChatBackgroundRequestHandler === handler) {
        if (previousHandler) {
          directGlobal.__composeChatBackgroundRequestHandler = previousHandler;
        } else {
          delete directGlobal.__composeChatBackgroundRequestHandler;
        }
      }
    };
  }, [runtimeListName]);

  const renderAndDeliverItems = useCallback(
    (
      request: {
        indices: number[];
        nativeDispatchUptimeMs?: number;
        requestId: number;
        resetIndices: number[];
        version: number;
        windowIndices: number[];
      },
      requestReceivedAt: number,
    ) => {
      latestWindowIndicesRef.current = request.windowIndices;
      if (request.version !== dataRef.current.version) {
        return;
      }

      const renderStartedAt = Date.now();
      dataRef.current.resetRenderedItems(request.resetIndices);
      const items = dataRef.current.renderItems(request.indices);
      const renderFinishedAt = Date.now();
      const response: ComposeChatListRenderedItemsResponse = {
        version: request.version,
        requestId: request.requestId,
        nativeDispatchUptimeMs: request.nativeDispatchUptimeMs,
        jsRenderDurationMs: renderFinishedAt - renderStartedAt,
        jsTotalDurationMs: renderFinishedAt - requestReceivedAt,
        items,
      };
      if (Platform.OS === 'android' && BackgroundListBridge?.deliverRenderedItems) {
        BackgroundListBridge.deliverRenderedItems(nativeListName, response);
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
      mergeItems(items, latestWindowIndicesRef.current);
    },
    [mergeItems, nativeListName],
  );

  directRequestHandlerRef.current = (event: RuntimeItemRequest) => {
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

  const handleRequestItems = useCallback(
    (event: RequestItemsEvent) => {
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
      renderAndDeliverItems(
        {
          indices: parseIndexList(indicesJson),
          requestId,
          resetIndices: parseIndexList(resetIndicesJson),
          version,
          windowIndices: parseIndexList(windowIndicesJson),
        },
        Date.now(),
      );
    },
    [renderAndDeliverItems, renderMode],
  );

  const renderFabricWindow = useCallback(
    () => (
      <FabricItemWindow
        items={fabricItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
      />
    ),
    [fabricItems, keyExtractor, renderItem],
  );

  return children({
    onRequestItems: handleRequestItems,
    renderedItems,
    renderFabricWindow,
    resetFabricWindow,
  });
}

export function mainRuntimeListName(listName: string) {
  return `main:${listName}`;
}

function emptyRenderedItems(version: number): ComposeChatListRenderedItems {
  return {
    version,
    requestId: 0,
    items: EMPTY_RENDERED_ITEMS,
    responseSeq: 0,
    responses: EMPTY_RENDERED_RESPONSES,
  };
}
