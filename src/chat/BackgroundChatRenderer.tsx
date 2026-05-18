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
  indices: number[];
  windowIndices?: number[];
  resetIndices?: number[];
};

type BackgroundDataState = {
  listName: string;
  state: ComposeChatListDataState;
};

const {BackgroundListBridge} = NativeModules;
const backgroundEvents = new NativeEventEmitter(BackgroundListBridge);

const sourcesByListName = new Map<string, VersionedChatDataSource>();

export default function BackgroundChatRenderer({
  listName = 'background-chat-list',
}: {
  listName?: string;
}) {
  const sourceRef = useRef(getSource(listName));
  const appliedFabricSeqRef = useRef(0);
  const {
    applyOps,
    items: fabricItems,
    mergeItems,
    reset,
  } = useFabricItemWindow();

  useEffect(() => {
    sourceRef.current = getSource(listName);
    BackgroundListBridge.rendererReady(listName);

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

    const requestSubscription = backgroundEvents.addListener(
      'ComposeChatBackgroundRequestItems',
      (event: BackgroundRequest) => {
        if (event.listName !== listName) {
          return;
        }

        const source = sourceRef.current;
        if (event.version !== source.version) {
          return;
        }

        source.resetRenderedItems(event.resetIndices ?? []);
        const items = source.renderItems(event.indices);
        BackgroundListBridge.deliverRenderedItems(listName, {
          version: event.version,
          requestId: event.requestId,
          items,
        });
        mergeItems(items, event.windowIndices);
      },
    );

    return () => {
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

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
