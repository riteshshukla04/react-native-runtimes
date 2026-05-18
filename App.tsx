import {useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {EaseView} from 'react-native-ease';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  createRandomMessage,
  createRandomMessages,
  VersionedChatDataSource,
} from './src/chat/VersionedChatDataSource';
import {ChatBubble} from './src/chat/ChatBubble';
import type {
  ComposeChatListPlaceholderSpec,
  RenderedChatItem,
} from './src/native/ComposeChatListNativeComponent';
import VersionedComposeChatList, {
  type VersionedComposeChatListRef,
} from './src/native/VersionedComposeChatList';

type NativeBenchmarkMode = 'main' | 'background';
type BenchmarkMode = NativeBenchmarkMode | 'animated';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [mode, setMode] = useState<BenchmarkMode>('main');
  const [blockStatus, setBlockStatus] = useState('idle');
  const [blockJsEnabled, setBlockJsEnabled] = useState(false);
  const blockJsEnabledRef = useRef(false);

  useEffect(() => {
    blockJsEnabledRef.current = blockJsEnabled;

    if (!blockJsEnabled) {
      setBlockStatus('idle');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function blockChunk() {
      if (cancelled || !blockJsEnabledRef.current) {
        return;
      }

      setBlockStatus('blocking');
      const startedAt = Date.now();
      while (Date.now() - startedAt < 850) {
        Math.sqrt(Math.random() * Number.MAX_SAFE_INTEGER);
      }

      if (cancelled || !blockJsEnabledRef.current) {
        return;
      }

      setBlockStatus('yielding');
      timer = setTimeout(blockChunk, 80);
    }

    timer = setTimeout(blockChunk, 80);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [blockJsEnabled]);

  return (
    <View style={[styles.container, {paddingTop: safeAreaInsets.top}]}>
      <View style={styles.tabs}>
        <TabButton
          active={mode === 'main'}
          id="tab-main-rn"
          label="Native JSX"
          onPress={() => setMode('main')}
        />
        <TabButton
          active={mode === 'background'}
          id="tab-second-rn"
          label="Native 2RN JSX"
          onPress={() => setMode('background')}
        />
        <TabButton
          active={mode === 'animated'}
          id="tab-rn-ease"
          label="RN FlatList"
          onPress={() => setMode('animated')}
        />
        <View
          accessibilityLabel="block-js-control"
          style={styles.blockSwitch}
          testID="block-js-control">
          <Text style={styles.blockSwitchText}>Block JS</Text>
          <Switch
            accessibilityLabel="block-js-switch"
            ios_backgroundColor="#CBD5E1"
            onValueChange={setBlockJsEnabled}
            thumbColor="#FFFFFF"
            testID="block-js-switch"
            trackColor={{false: '#CBD5E1', true: '#B91C1C'}}
            value={blockJsEnabled}
          />
        </View>
      </View>
      {mode === 'animated' ? (
        <EaseChatBenchmarkScreen key={mode} blockStatus={blockStatus} />
      ) : (
        <ChatBenchmarkScreen
          key={mode}
          mode={mode}
          listName={`${mode}-compose-chat-list`}
          blockStatus={blockStatus}
        />
      )}
    </View>
  );
}

function ChatBenchmarkScreen({
  mode,
  listName,
  blockStatus,
}: {
  mode: NativeBenchmarkMode;
  listName: string;
  blockStatus: string;
}) {
  const listRef = useRef<VersionedComposeChatListRef | null>(null);
  const sourceRef = useRef<VersionedChatDataSource | null>(null);
  const nextIdRef = useRef(10_000);

  if (sourceRef.current == null) {
    sourceRef.current = new VersionedChatDataSource(createRandomMessages(10_000));
  }

  const source = sourceRef.current;
  const [dataRevision, setDataRevision] = useState(0);

  const stats = `${source.count.toLocaleString()} messages / v${source.version} / ${blockStatus}`;
  const placeholderSpec = useMemo<ComposeChatListPlaceholderSpec>(
    () => ({
      version: 1,
      defaultVariant: 'chat',
      templates: [
        {
          key: 'other-short',
          variant: 'chat',
          align: 'start',
          minWidth: 180,
          maxWidth: 292,
          lines: 2,
          showFooter: true,
        },
        {
          key: 'own-medium',
          variant: 'chat',
          align: 'end',
          minWidth: 190,
          maxWidth: 322,
          lines: 3,
          showFooter: true,
        },
        {
          key: 'other-compact',
          variant: 'compact',
          align: 'start',
          minWidth: 210,
          maxWidth: 300,
          lines: 1,
        },
      ],
    }),
    [],
  );

  function publishState() {
    setDataRevision(revision => revision + 1);
  }

  function addMessage() {
    const id = `new-${nextIdRef.current++}`;
    source.addAtIndex(0, createRandomMessage(id, nextIdRef.current));
    publishState();
  }

  function prependThousandMessages() {
    const startId = nextIdRef.current;
    const messages = Array.from({length: 1000}, (_, offset) =>
      createRandomMessage(`bulk-${startId + offset}`, startId + offset),
    );
    nextIdRef.current += messages.length;
    source.addManyAtIndex(0, messages);
    publishState();
  }

  function editLatest() {
    source.updateItem(0, {
      body: `Edited at version ${source.version + 1}. This row was invalidated by index and filled again after native requested it.`,
    });
    publishState();
  }

  function reactToLatest() {
    source.toggleReaction(0);
    publishState();
  }

  function removeLatest() {
    source.removeAtIndex(0);
    publishState();
  }

  function swapFirstTenPairs() {
    source.swapAdjacentPairs(0, 10);
    publishState();
  }

  function scrollToBenchmarkItem() {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollToItem(7500, false);
  }

  function scrollToSwapTail() {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollToItem(8, false);
  }

  function resetLatestRender() {
    if (!listRef.current) {
      return;
    }

    listRef.current.resetItem(0);
  }

  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {mode === 'main'
              ? 'Native LazyColumn + JSX Cells'
              : 'Native LazyColumn + 2nd RN JSX'}
          </Text>
          <Text style={styles.subtitle}>
            {stats} / Jetpack Compose owns scrolling
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionButton id="action-add-message" label="+" onPress={addMessage} />
          <ActionButton
            id="action-prepend-1000"
            label="1k+"
            onPress={prependThousandMessages}
          />
          <ActionButton id="action-edit-message" label="Edit" onPress={editLatest} />
          <ActionButton id="action-react-latest" label="+1" onPress={reactToLatest} />
          <ActionButton id="action-delete-message" label="Del" onPress={removeLatest} />
          <ActionButton
            id="action-swap-first-ten-pairs"
            label="Swap"
            onPress={swapFirstTenPairs}
          />
          <ActionButton
            id="action-scroll-to-7500"
            label="7500"
            onPress={scrollToBenchmarkItem}
          />
          <ActionButton id="action-scroll-to-8" label="8" onPress={scrollToSwapTail} />
          <ActionButton
            id="action-reset-item-0"
            label="R0"
            onPress={resetLatestRender}
          />
        </View>
      </View>
      <VersionedComposeChatList
        ref={listRef}
        accessibilityLabel={`compose-chat-list-${mode}`}
        backgroundAppName="ComposeChatBackgroundRenderer"
        data={source}
        extraData={dataRevision}
        initialIndexToRender={0}
        keyExtractor={item => item.id}
        listName={listName}
        onReactToItem={(index, reaction) => {
          source.toggleReaction(index, reaction);
          publishState();
        }}
        placeholderSpec={placeholderSpec}
        renderItem={({item}) =>
          renderFabricChatItem(item, reaction => {
            source.toggleReaction(item.index, reaction);
            publishState();
          })
        }
        renderMode={mode}
        style={styles.list}
        testID={`compose-chat-list-${mode}`}
      />
    </>
  );
}

function renderFabricChatItem(
  item: RenderedChatItem,
  onReaction: (reaction: string) => void,
) {
  return <ChatBubble item={item} onReaction={onReaction} />;
}

function EaseChatBenchmarkScreen({blockStatus}: {blockStatus: string}) {
  const listRef = useRef<FlatList<number> | null>(null);
  const sourceRef = useRef<VersionedChatDataSource | null>(null);
  const nextIdRef = useRef(10_000);

  if (sourceRef.current == null) {
    sourceRef.current = new VersionedChatDataSource(createRandomMessages(10_000));
  }

  const source = sourceRef.current;
  const [dataVersion, setDataVersion] = useState(source.version);
  const [itemCount, setItemCount] = useState(source.count);
  const [spacingStatus, setSpacingStatus] = useState(
    'visible-list-spacing-pending',
  );
  const rowLayoutsRef = useRef(new Map<number, VisibleRowLayout>());
  const indices = useMemo(
    () => Array.from({length: itemCount}, (_, index) => index),
    [itemCount],
  );
  const stats = useMemo(
    () =>
      `${itemCount.toLocaleString()} messages / v${dataVersion} / ${blockStatus}`,
    [blockStatus, dataVersion, itemCount],
  );

  function publishState() {
    setDataVersion(source.version);
    setItemCount(source.count);
    rowLayoutsRef.current.clear();
    setSpacingStatus('visible-list-spacing-pending');
  }

  function addMessage() {
    const id = `new-${nextIdRef.current++}`;
    source.addAtIndex(0, createRandomMessage(id, nextIdRef.current));
    publishState();
    listRef.current?.scrollToOffset({offset: 0, animated: false});
  }

  function prependThousandMessages() {
    const startId = nextIdRef.current;
    const messages = Array.from({length: 1000}, (_, offset) =>
      createRandomMessage(`bulk-${startId + offset}`, startId + offset),
    );
    nextIdRef.current += messages.length;
    source.addManyAtIndex(0, messages);
    publishState();
  }

  function editLatest() {
    source.updateItem(0, {
      body: `Edited at version ${source.version + 1}. This row was rendered by the pure RN easing benchmark.`,
    });
    publishState();
  }

  function reactToLatest() {
    source.toggleReaction(0);
    publishState();
  }

  function removeLatest() {
    source.removeAtIndex(0);
    publishState();
  }

  function scrollToBenchmarkItem() {
    listRef.current?.scrollToIndex({index: 7500, animated: false});
  }

  const renderItem: ListRenderItem<number> = ({item: index}) => {
    const renderedItem = source.renderItem(index);
    if (!renderedItem) {
      return null;
    }

    return (
      <EasedChatBubble
        item={renderedItem}
        onLayout={event => {
          rowLayoutsRef.current.set(index, {
            index,
            offset: event.nativeEvent.layout.y,
            size: event.nativeEvent.layout.height,
          });
          setSpacingStatus(spacingStatusForRows(rowLayoutsRef.current));
        }}
        onReaction={reaction => {
          source.toggleReaction(index, reaction);
          publishState();
        }}
      />
    );
  };

  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>RN FlatList + react-native-ease</Text>
          <Text style={styles.subtitle}>
            {stats} / React Native owns scrolling
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionButton id="action-rn-ease-add-message" label="+" onPress={addMessage} />
          <ActionButton
            id="action-rn-ease-prepend-1000"
            label="1k+"
            onPress={prependThousandMessages}
          />
          <ActionButton
            id="action-rn-ease-edit-message"
            label="Edit"
            onPress={editLatest}
          />
          <ActionButton
            id="action-rn-ease-react-latest"
            label="+1"
            onPress={reactToLatest}
          />
          <ActionButton
            id="action-rn-ease-delete-message"
            label="Del"
            onPress={removeLatest}
          />
          <ActionButton
            id="action-rn-ease-scroll-to-7500"
            label="7500"
            onPress={scrollToBenchmarkItem}
          />
        </View>
      </View>
      <FlatList
        ref={listRef}
        accessibilityLabel="rn-ease-chat-list"
        contentContainerStyle={styles.rnEaseContent}
        data={indices}
        extraData={dataVersion}
        initialNumToRender={10}
        keyExtractor={index => source.renderItem(index)?.id ?? String(index)}
        maxToRenderPerBatch={10}
        onScrollToIndexFailed={({index}) => {
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({index, animated: false});
          });
        }}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderItem}
        style={styles.list}
        testID="rn-ease-chat-list"
        updateCellsBatchingPeriod={16}
        windowSize={7}
      />
      <View
        accessibilityLabel={spacingStatus}
        style={styles.layoutProbe}
        testID="visible-list-spacing-status"
      />
    </>
  );
}

function EasedChatBubble({
  item,
  onLayout,
  onReaction,
}: {
  item: RenderedChatItem;
  onLayout: (event: LayoutChangeEvent) => void;
  onReaction: (reaction: string) => void;
}) {
  return (
    <EaseView
      accessibilityLabel={`rn-ease-chat-row-${item.index}-v${item.renderVersion}`}
      animate={{opacity: 1, translateY: 0, scale: 1}}
      collapsable={false}
      initialAnimate={{opacity: 0, translateY: 16, scale: 0.96}}
      style={[
        styles.rnEaseRow,
        item.isOwn && styles.rnEaseRowOwn,
      ]}
      onLayout={onLayout}
      transition={{
        opacity: {type: 'timing', duration: 160, easing: 'easeOut'},
        transform: {type: 'spring', damping: 17, stiffness: 240, mass: 1},
      }}
      useHardwareLayer>
      <ChatBubble
        item={item}
        onReaction={onReaction}
        reactionPrefix="rn-ease-reaction"
        rowPrefix="rn-ease-chat-row"
      />
    </EaseView>
  );
}

type VisibleRowLayout = {
  index: number;
  offset: number;
  size: number;
};

function spacingStatusForRows(rowLayouts: Map<number, VisibleRowLayout>) {
  const orderedRows = Array.from(rowLayouts.values())
    .sort((left, right) => left.index - right.index)
    .filter((row, index, rows) => {
      if (index === 0) {
        return rows[index + 1]?.index === row.index + 1;
      }
      return rows[index - 1]?.index === row.index - 1;
    });

  if (orderedRows.length < 3) {
    return 'visible-list-spacing-pending';
  }

  let expectedGap: number | null = null;
  let checkedPairs = 0;

  for (let index = 0; index < orderedRows.length - 1; index += 1) {
    const current = orderedRows[index];
    const next = orderedRows[index + 1];
    if (next.index !== current.index + 1) {
      continue;
    }

    const gap = next.offset - (current.offset + current.size);
    if (gap < -1) {
      return 'visible-list-spacing-overlap';
    }

    if (expectedGap == null) {
      expectedGap = gap;
    } else if (Math.abs(gap - expectedGap) > 2) {
      return 'visible-list-spacing-gap-mismatch';
    }
    checkedPairs += 1;
  }

  if (checkedPairs < 2) {
    return 'visible-list-spacing-pending';
  }

  return `visible-list-spacing-ok-gap-${Math.round(expectedGap ?? 0)}`;
}

function TabButton({
  active,
  id,
  label,
  onPress,
}: {
  active: boolean;
  id: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={id}
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      testID={id}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  id,
  label,
  onPress,
}: {
  id: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={id}
      onPress={onPress}
      style={styles.actionButton}
      testID={id}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },
  tabs: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tabButton: {
    alignItems: 'center',
    borderColor: '#D1D5DB',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tabText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  blockSwitch: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
  },
  blockSwitchText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    rowGap: 10,
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 52,
    paddingHorizontal: 10,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  layoutProbe: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 1,
  },
  fabricRow: {
    marginVertical: 5,
    paddingHorizontal: 12,
  },
  fabricRowOther: {
    alignItems: 'flex-start',
  },
  fabricRowOwn: {
    alignItems: 'flex-end',
  },
  fabricBubble: {
    borderRadius: 8,
    maxWidth: 328,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  fabricBubbleOther: {
    backgroundColor: '#FFFFFF',
  },
  fabricBubbleOwn: {
    backgroundColor: '#1D4ED8',
  },
  fabricAuthor: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  fabricAuthorOwn: {
    color: '#DCEAFE',
  },
  fabricBody: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 20,
  },
  fabricBodyOwn: {
    color: '#FFFFFF',
  },
  fabricReactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  fabricReactionChip: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fabricReactionChipOwn: {
    backgroundColor: '#2563EB',
    borderColor: '#93C5FD',
  },
  fabricReactionText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  fabricReactionTextOwn: {
    color: '#FFFFFF',
  },
  rnEaseContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rnEaseRow: {
    alignItems: 'flex-start',
    marginVertical: 5,
  },
  rnEaseRowOwn: {
    alignItems: 'flex-end',
  },
  rnEaseBubble: {
    borderRadius: 8,
    maxWidth: 328,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  rnEaseBubbleOther: {
    backgroundColor: '#FFFFFF',
  },
  rnEaseBubbleOwn: {
    backgroundColor: '#1D4ED8',
  },
  rnEaseAuthor: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  rnEaseAuthorOwn: {
    color: '#DCEAFE',
  },
  rnEaseBody: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 20,
  },
  rnEaseBodyOwn: {
    color: '#FFFFFF',
  },
  rnEaseReactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  rnEaseReactionChip: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rnEaseReactionChipOwn: {
    backgroundColor: '#2563EB',
    borderColor: '#93C5FD',
  },
  rnEaseReactionText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  rnEaseReactionTextOwn: {
    color: '#FFFFFF',
  },
});

export default App;
