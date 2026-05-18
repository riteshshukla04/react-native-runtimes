import {useEffect, useRef} from 'react';
import {StyleSheet} from 'react-native';
import {NativeEventEmitter, NativeModules} from 'react-native';
import {
  createRandomMessages,
  VersionedChatDataSource,
} from './VersionedChatDataSource';
import {ChatBubble} from './ChatBubble';
import {
  ComposeChatBackgroundHostNativeComponent,
  type ComposeChatListDataState,
} from '../native/ComposeChatListNativeComponent';
import {
  FabricItemWindow,
  maxDataOpSeq,
  useFabricItemWindow,
} from '../native/FabricItemWindow';

type BackgroundRequest = {
  listName: string;
  requestId: number;
  version: number;
  nativeDispatchUptimeMs?: number;
  indices: number[];
  windowIndices?: number[];
  resetIndices?: number[];
};

type PendingBackgroundRequest = BackgroundRequest & {
  receivedAt: number;
};

type BackgroundDataState = {
  listName: string;
  state: ComposeChatListDataState;
};

type DirectBackgroundRequestGlobal = typeof globalThis & {
  __composeChatBackgroundRequestHandler?: (event: BackgroundRequest) => void;
};

const {BackgroundListBridge} = NativeModules;
const backgroundEvents = new NativeEventEmitter(BackgroundListBridge);

const sourcesByListName = new Map<string, VersionedChatDataSource>();
const BACKGROUND_REQUEST_COALESCE_MS = 0;

export default function BackgroundChatRenderer({
  listName = 'background-chat-list',
}: {
  listName?: string;
}) {
  const sourceRef = useRef(getSource(listName));
  const appliedFabricSeqRef = useRef(0);
  const pendingRequestRef = useRef<PendingBackgroundRequest | null>(null);
  const requestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    applyOps,
    items: fabricItems,
    mergeItems,
    reset,
  } = useFabricItemWindow();

  useEffect(() => {
    sourceRef.current = getSource(listName);

    const dataSubscription = backgroundEvents.addListener(
      'ComposeChatBackgroundDataState',
      (event: BackgroundDataState) => {
        if (event.listName !== listName) {
          return;
        }
        sourceRef.current.applyNativeState(event.state);
        const unappliedOps = event.state.ops.filter(
          op => op.seq > appliedFabricSeqRef.current,
        );
        appliedFabricSeqRef.current = Math.max(
          appliedFabricSeqRef.current,
          maxDataOpSeq(event.state.ops),
        );
        if (event.state.reset) {
          reset();
        } else {
          applyOps(unappliedOps);
        }
      },
    );

    const handleBackgroundRequest = (event: BackgroundRequest) => {
        if (event.listName !== listName) {
          return;
        }

        if (event.version !== sourceRef.current.version) {
          return;
        }

        const receivedAt = Date.now();
        const pendingRequest = pendingRequestRef.current;
        pendingRequestRef.current =
          pendingRequest == null
            ? {...event, receivedAt}
            : mergePendingRequest(pendingRequest, event, receivedAt);

        const flushPendingRequest = () => {
          const request = pendingRequestRef.current;
          pendingRequestRef.current = null;
          if (request == null) {
            return;
          }

          const source = sourceRef.current;
          if (request.version !== source.version) {
            return;
          }

          const renderStartedAt = Date.now();
          source.resetRenderedItems(request.resetIndices ?? []);
          const items = source.renderItems(request.indices);
          const renderFinishedAt = Date.now();
          BackgroundListBridge.deliverRenderedItems(listName, {
            version: request.version,
            requestId: request.requestId,
            nativeDispatchUptimeMs: request.nativeDispatchUptimeMs,
            jsRenderDurationMs: renderFinishedAt - renderStartedAt,
            jsTotalDurationMs: renderFinishedAt - request.receivedAt,
            items,
          });
          mergeItems(items, request.windowIndices);
        };

        if (BACKGROUND_REQUEST_COALESCE_MS <= 0) {
          flushPendingRequest();
          return;
        }

        if (requestTimerRef.current != null) {
          return;
        }

        requestTimerRef.current = setTimeout(() => {
          requestTimerRef.current = null;
          flushPendingRequest();
        }, BACKGROUND_REQUEST_COALESCE_MS);
    };
    const directRequestGlobal = globalThis as DirectBackgroundRequestGlobal;
    directRequestGlobal.__composeChatBackgroundRequestHandler =
      handleBackgroundRequest;
    BackgroundListBridge.rendererReady(listName);
    const requestSubscription = backgroundEvents.addListener(
      'ComposeChatBackgroundRequestItems',
      handleBackgroundRequest,
    );

    return () => {
      delete directRequestGlobal.__composeChatBackgroundRequestHandler;
      if (requestTimerRef.current != null) {
        clearTimeout(requestTimerRef.current);
        requestTimerRef.current = null;
      }
      pendingRequestRef.current = null;
      dataSubscription.remove();
      requestSubscription.remove();
    };
  }, [applyOps, listName, mergeItems, reset]);

  return (
    <ComposeChatBackgroundHostNativeComponent
      listName={listName}
      style={styles.host}>
      <FabricItemWindow
        items={fabricItems}
        renderItem={({item}) => (
          <ChatBubble
            item={item}
            onReaction={reaction => {
              BackgroundListBridge.reactToItem(listName, item.index, reaction);
            }}
          />
        )}
      />
    </ComposeChatBackgroundHostNativeComponent>
  );
}

function getSource(listName: string) {
  let source = sourcesByListName.get(listName);
  if (!source) {
    source = new VersionedChatDataSource(createRandomMessages(10_000));
    sourcesByListName.set(listName, source);
  }
  return source;
}

function mergePendingRequest(
  previous: PendingBackgroundRequest,
  next: BackgroundRequest,
  receivedAt: number,
): PendingBackgroundRequest {
  const nextWindow = new Set(next.windowIndices ?? next.indices);
  const carriedIndices = previous.indices.filter(index => nextWindow.has(index));
  const carriedResetIndices = (previous.resetIndices ?? []).filter(index =>
    nextWindow.has(index),
  );

  return {
    ...next,
    indices: mergeUniqueIndices(carriedIndices, next.indices),
    resetIndices: mergeUniqueIndices(carriedResetIndices, next.resetIndices ?? []),
    receivedAt: Math.min(previous.receivedAt, receivedAt),
  };
}

function mergeUniqueIndices(first: number[], second: number[]) {
  if (first.length === 0) {
    return second;
  }
  if (second.length === 0) {
    return first;
  }
  const seen = new Set<number>();
  const merged: number[] = [];
  for (const index of [...first, ...second]) {
    if (seen.has(index)) {
      continue;
    }
    seen.add(index);
    merged.push(index);
  }
  return merged;
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
