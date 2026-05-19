import {useEffect, useRef, useState} from 'react';
import {NativeEventEmitter, NativeModules, StyleSheet} from 'react-native';
import {
  createRandomMessages,
  VersionedChatDataSource,
} from './VersionedChatDataSource';
import {ChatBubble} from './ChatBubble';
import {
  ComposeChatBackgroundHostNativeComponent,
  type ComposeChatListDataState,
} from '../native/ComposeChatListNativeComponent';
import {RuntimeItemRenderer} from '../native/RuntimeItemRenderer';

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
  const [dataState, setDataState] = useState(() =>
    sourceRef.current.toNativeState(true),
  );

  useEffect(() => {
    sourceRef.current = getSource(listName);
    setDataState(sourceRef.current.toNativeState(true));
    console.info(
      `RuntimeCheck native2rn renderer listName=${listName} runtime=${runtimeKind()}`,
    );

    const dataSubscription = backgroundEvents.addListener(
      'ComposeChatBackgroundDataState',
      (event: BackgroundDataState) => {
        if (event.listName !== listName) {
          return;
        }
        sourceRef.current.applyNativeState(event.state);
        setDataState(event.state);
      },
    );

    return () => {
      dataSubscription.remove();
    };
  }, [listName]);

  return (
    <RuntimeItemRenderer
      data={sourceRef.current}
      dataState={dataState}
      nativeListName={listName}
      renderItem={({item}) => (
        <ChatBubble
          item={item}
          onReaction={reaction => {
            BackgroundListBridge.reactToItem(listName, item.index, reaction);
          }}
        />
      )}
      renderMode="background"
      runtimeListName={listName}>
      {({renderFabricWindow}) => (
        <ComposeChatBackgroundHostNativeComponent
          listName={listName}
          style={styles.host}>
          {renderFabricWindow()}
        </ComposeChatBackgroundHostNativeComponent>
      )}
    </RuntimeItemRenderer>
  );
}

function runtimeKind() {
  return (
    (globalThis as {__COMPOSE_CHAT_LIST_ENV__?: {kind?: string}})
      .__COMPOSE_CHAT_LIST_ENV__?.kind ?? 'main'
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
