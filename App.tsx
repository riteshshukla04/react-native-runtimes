import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
  type RefObject,
} from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {FlashList, type FlashListRef} from '@shopify/flash-list';
import {LegendList, type LegendListRef} from '@legendapp/list';
import {EaseView} from 'react-native-ease';
import {createSharedStore} from '@native-compose/threaded-zustand';
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
import {
  threadedComponent,
  Threaded,
  ThreadedRuntime,
  ThreadedScreen,
} from '@native-compose/threaded-runtime';

type NativeBenchmarkMode = 'main' | 'background';
type SecondRuntimeRnBenchmarkMode = 'flashlist' | 'legendlist';
type RnBenchmarkMode =
  | 'animated'
  | 'legendlist-main'
  | SecondRuntimeRnBenchmarkMode;
type SharedRuntimeMode =
  | 'home'
  | 'shared-tree'
  | 'poke-shared'
  | 'threaded-chat-screen'
  | 'threaded-chat-app';
type BenchmarkMode = NativeBenchmarkMode | RnBenchmarkMode | SharedRuntimeMode;
type NavigationMode = 'launcher' | BenchmarkMode;
type SharedTreeNodeId = 'root' | 'left' | 'right' | 'leftLeaf' | 'rightLeaf';
type AppLaunchItem = {
  mode: BenchmarkMode;
  title: string;
  eyebrow: string;
  description: string;
  runtime: string;
  workload: string;
};
type AppLaunchSection = {
  title: string;
  items: AppLaunchItem[];
};
type ChatThreadSummary = {
  id: string;
  title: string;
  participants: string;
  preview: string;
  unreadCount: number;
  messageCount: number;
};
type SharedTreeState = {
  nodes: Record<SharedTreeNodeId, string>;
  interaction: {
    lastNode: SharedTreeNodeId;
    lastRuntime: string;
    presses: number;
  };
};
type PokemonEntry = {
  id: number;
  name: string;
  url: string;
};
type PokemonCatalogState = {
  error: string | null;
  fetchedAt: string | null;
  nextOffset: number;
  offset: number;
  requestedBy: string;
  requestedOffset: number;
  requestId: number;
  sourceRuntime: string;
  status: 'idle' | 'requested' | 'loading' | 'loaded' | 'error';
};
type PokemonSharedState = {
  catalog: PokemonCatalogState;
  pokemonItems: PokemonEntry[];
};
type HomePersistenceState = {
  counter: {
    count: number;
    updatedAt: string | null;
    updatedBy: string;
  };
};

const POKEMON_PAGE_SIZE = 24;
const HOME_RUNTIME_NAME = 'home-persistence-runtime';
const CHAT_THREADS: ChatThreadSummary[] = [
  {
    id: 'release-room',
    title: 'Release room',
    participants: 'Ava, Noah, Mia',
    preview: 'Can we validate the threaded route before the release build?',
    unreadCount: 4,
    messageCount: 96,
  },
  {
    id: 'support-escalation',
    title: 'Support escalation',
    participants: 'Iris, Theo',
    preview: 'The customer is still seeing blanks after a small scroll.',
    unreadCount: 2,
    messageCount: 72,
  },
  {
    id: 'mobile-platform',
    title: 'Mobile platform',
    participants: 'Sofia, Leo, Nora',
    preview: 'Let us compare main runtime, threaded runtime, and list reuse.',
    unreadCount: 7,
    messageCount: 118,
  },
  {
    id: 'design-review',
    title: 'Design review',
    participants: 'Maya, Eli',
    preview: 'The chat cells need stable sizing and visible indices for debug.',
    unreadCount: 0,
    messageCount: 58,
  },
];
const DEFAULT_CHAT_THREAD = CHAT_THREADS[0];

function chatThreadRuntimeName(threadId: string) {
  return `chat-thread-${threadId}-runtime`;
}

const CHAT_THREAD_RUNTIME_NAMES = CHAT_THREADS.map(thread =>
  chatThreadRuntimeName(thread.id),
);

const APP_LAUNCH_SECTIONS: AppLaunchSection[] = [
  {
    title: 'Native chat lists',
    items: [
      {
        mode: 'main',
        title: 'Native JSX',
        eyebrow: 'Compose host',
        description: 'Native list with JSX cells rendered by the main runtime.',
        runtime: 'Main RN',
        workload: '10k messages',
      },
      {
        mode: 'background',
        title: 'Native 2RN JSX',
        eyebrow: 'Compose host',
        description:
          'Native list with JSX cells rendered by the threaded runtime.',
        runtime: 'Threaded RN',
        workload: '10k messages',
      },
    ],
  },
  {
    title: 'RN list baselines',
    items: [
      {
        mode: 'animated',
        title: 'RN FlatList',
        eyebrow: 'Baseline',
        description: 'FlatList owns scrolling and renders eased chat rows.',
        runtime: 'Main RN',
        workload: '10k messages',
      },
      {
        mode: 'flashlist',
        title: 'FlashList',
        eyebrow: 'Threaded list',
        description: 'FlashList runs inside a secondary runtime surface.',
        runtime: 'Threaded RN',
        workload: '10k messages',
      },
      {
        mode: 'legendlist',
        title: 'Legend 2RN',
        eyebrow: 'Threaded list',
        description: 'LegendList runs inside a secondary runtime surface.',
        runtime: 'Threaded RN',
        workload: '10k messages',
      },
      {
        mode: 'legendlist-main',
        title: 'Legend Main',
        eyebrow: 'Baseline',
        description: 'LegendList runs on the main runtime for comparison.',
        runtime: 'Main RN',
        workload: '10k messages',
      },
    ],
  },
  {
    title: 'Runtime apps',
    items: [
      {
        mode: 'home',
        title: 'Persistence Lab',
        eyebrow: 'Shared store',
        description:
          'Main and threaded runtime update the same persisted counter.',
        runtime: 'Main + threaded RN',
        workload: 'Persistent state',
      },
      {
        mode: 'shared-tree',
        title: 'Shared Tree',
        eyebrow: 'Shared store',
        description:
          'A tree changes color on main RN and mirrors in threaded RN.',
        runtime: 'Main + threaded RN',
        workload: 'Subtree updates',
      },
      {
        mode: 'poke-shared',
        title: 'Poke Shared',
        eyebrow: 'Fetch + consume',
        description:
          'Main runtime fetches pages while threaded runtime consumes them.',
        runtime: 'Main + threaded RN',
        workload: 'PokeAPI pages',
      },
      {
        mode: 'threaded-chat-screen',
        title: 'Chat Screen',
        eyebrow: 'Threaded screen',
        description: 'The whole chat screen is mounted on another runtime.',
        runtime: 'Threaded RN',
        workload: 'Conversation',
      },
      {
        mode: 'threaded-chat-app',
        title: 'Chat App',
        eyebrow: 'Main picker',
        description:
          'Main RN chooses a thread and opens the chat on another runtime.',
        runtime: 'Main + threaded RN',
        workload: 'Thread picker',
      },
    ],
  },
];
const APP_LAUNCH_ITEMS = APP_LAUNCH_SECTIONS.flatMap(section => section.items);

const TREE_COLORS = ['#0F766E', '#7C3AED', '#DC2626', '#2563EB', '#EA580C'];
const TREE_NODES: Array<{
  id: SharedTreeNodeId;
  label: string;
  level: number;
  children?: SharedTreeNodeId[];
}> = [
  {id: 'root', label: 'Root', level: 0, children: ['left', 'right']},
  {id: 'left', label: 'Left', level: 1, children: ['leftLeaf']},
  {id: 'right', label: 'Right', level: 1, children: ['rightLeaf']},
  {id: 'leftLeaf', label: 'Left Leaf', level: 2},
  {id: 'rightLeaf', label: 'Right Leaf', level: 2},
];

const sharedTreeStore = createSharedStore<SharedTreeState>({
  name: 'threaded-tree-demo',
  initialState: {
    nodes: {
      root: TREE_COLORS[0],
      left: TREE_COLORS[1],
      right: TREE_COLORS[2],
      leftLeaf: TREE_COLORS[3],
      rightLeaf: TREE_COLORS[4],
    },
    interaction: {
      lastNode: 'root',
      lastRuntime: 'initial',
      presses: 0,
    },
  },
  subtrees: ['nodes', 'interaction'],
});

const initialPokemonCatalog: PokemonCatalogState = {
  error: null,
  fetchedAt: null,
  nextOffset: 0,
  offset: 0,
  requestedBy: 'initial',
  requestedOffset: 0,
  requestId: 0,
  sourceRuntime: 'initial',
  status: 'idle',
};

const pokemonStore = createSharedStore<PokemonSharedState>({
  name: 'threaded-poke-demo',
  initialState: {
    catalog: initialPokemonCatalog,
    pokemonItems: [],
  },
  subtrees: ['catalog', 'pokemonItems'],
});

const initialHomePersistenceState: HomePersistenceState = {
  counter: {
    count: 0,
    updatedAt: null,
    updatedBy: 'initial',
  },
};

const homePersistenceStore = createSharedStore<HomePersistenceState>({
  name: 'threaded-home-persistence-demo',
  initialState: initialHomePersistenceState,
  persist: {
    key: 'threaded-home-persistence-demo',
    subtrees: ['counter'],
    version: 1,
  },
  subtrees: ['counter'],
});

function pokemonIdFromUrl(url: string): number {
  const match = url.match(/\/pokemon\/(\d+)\/?$/);
  return match ? Number(match[1]) : 0;
}

function pokemonDisplayName(name: string): string {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFetchTime(value: string | null): string {
  if (!value) {
    return 'never';
  }
  return new Date(value).toLocaleTimeString();
}

function formatHomeUpdate(value: string | null): string {
  if (!value) {
    return 'not persisted yet';
  }
  return new Date(value).toLocaleTimeString();
}

async function incrementHomeCounter(runtimeLabel: string) {
  const current = homePersistenceStore.getSubtreeState('counter');
  await homePersistenceStore.setSubtreeState(
    'counter',
    {
      count: current.count + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: runtimeLabel,
    },
    true,
  );
}

async function resetHomeCounter() {
  await homePersistenceStore.clear('counter');
}

async function requestPokemonPage(sourceRuntime: string) {
  const current = pokemonStore.getSubtreeState('catalog');
  if (current.status === 'requested' || current.status === 'loading') {
    return;
  }

  await pokemonStore.setSubtreeState(
    'catalog',
    {
      ...current,
      error: null,
      requestId: current.requestId + 1,
      requestedBy: sourceRuntime,
      requestedOffset: current.nextOffset,
      sourceRuntime,
      status: 'requested',
    },
    true,
  );
}

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
  const [mode, setMode] = useState<NavigationMode>('launcher');
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

  const activeApp = APP_LAUNCH_ITEMS.find(item => item.mode === mode);

  return (
    <View style={[styles.container, {paddingTop: safeAreaInsets.top}]}>
      {mode === 'launcher' ? (
        <HomeLauncherScreen
          blockJsEnabled={blockJsEnabled}
          blockStatus={blockStatus}
          onBlockJsChange={setBlockJsEnabled}
          onOpen={setMode}
        />
      ) : (
        <>
          <AppChromeHeader
            activeApp={activeApp}
            blockJsEnabled={blockJsEnabled}
            blockStatus={blockStatus}
            onBack={() => setMode('launcher')}
            onBlockJsChange={setBlockJsEnabled}
          />
          <AppRouteContent blockStatus={blockStatus} mode={mode} />
        </>
      )}
    </View>
  );
}

function AppRouteContent({
  blockStatus,
  mode,
}: {
  blockStatus: string;
  mode: BenchmarkMode;
}) {
  if (mode === 'home') {
    return <HomeRuntimeScreen />;
  }

  if (mode === 'shared-tree') {
    return <SharedTreeRuntimeScreen />;
  }

  if (mode === 'poke-shared') {
    return <PokemonRuntimeScreen />;
  }

  if (mode === 'threaded-chat-screen') {
    return <ThreadedChatScreenSurface blockStatus={blockStatus} />;
  }

  if (mode === 'threaded-chat-app') {
    return <ThreadedChatAppExample blockStatus={blockStatus} />;
  }

  if (mode === 'animated' || mode === 'legendlist-main') {
    return (
      <RnListBenchmarkScreen
        key={mode}
        blockStatus={blockStatus}
        mode={mode}
      />
    );
  }

  if (mode === 'flashlist' || mode === 'legendlist') {
    return (
      <SecondRuntimeRnListSurface
        key={mode}
        blockStatus={blockStatus}
        mode={mode}
      />
    );
  }

  return (
    <ChatBenchmarkScreen
      key={mode}
      mode={mode}
      listName={`${mode}-compose-chat-list`}
      blockStatus={blockStatus}
    />
  );
}

function HomeLauncherScreen({
  blockJsEnabled,
  blockStatus,
  onBlockJsChange,
  onOpen,
}: {
  blockJsEnabled: boolean;
  blockStatus: string;
  onBlockJsChange: (value: boolean) => void;
  onOpen: (mode: BenchmarkMode) => void;
}) {
  return (
    <ScrollView
      accessibilityLabel="home-launcher-screen"
      contentContainerStyle={styles.launcherContent}
      style={styles.launcher}
      testID="home-launcher-screen">
      <View style={styles.launcherHeader}>
        <View style={styles.launcherTitleBlock}>
          <Text style={styles.launcherEyebrow}>Native Compose Chat</Text>
          <Text style={styles.launcherTitle}>Runtime lab</Text>
          <Text style={styles.launcherSubtitle}>
            Open a benchmark, shared-state demo, or threaded screen.
          </Text>
        </View>
        <BlockJsControl
          blockStatus={blockStatus}
          onValueChange={onBlockJsChange}
          value={blockJsEnabled}
        />
      </View>
      {APP_LAUNCH_SECTIONS.map(section => (
        <View key={section.title} style={styles.launcherSection}>
          <Text style={styles.launcherSectionTitle}>{section.title}</Text>
          <View style={styles.launcherGrid}>
            {section.items.map(item => (
              <AppLaunchCard
                item={item}
                key={item.mode}
                onPress={() => onOpen(item.mode)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function AppLaunchCard({
  item,
  onPress,
}: {
  item: AppLaunchItem;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`open-${item.mode}`}
      onPress={onPress}
      style={({pressed}) => [
        styles.launcherCard,
        pressed && styles.launcherCardPressed,
      ]}
      testID={`open-${item.mode}`}>
      <View style={styles.launcherCardTop}>
        <Text style={styles.launcherCardEyebrow}>{item.eyebrow}</Text>
        <Text style={styles.launcherCardAction}>Open</Text>
      </View>
      <Text style={styles.launcherCardTitle}>{item.title}</Text>
      <Text style={styles.launcherCardDescription}>{item.description}</Text>
      <View style={styles.launcherCardMeta}>
        <Text style={styles.launcherMetaText}>{item.runtime}</Text>
        <Text style={styles.launcherMetaText}>{item.workload}</Text>
      </View>
    </Pressable>
  );
}

function AppChromeHeader({
  activeApp,
  blockJsEnabled,
  blockStatus,
  onBack,
  onBlockJsChange,
}: {
  activeApp?: AppLaunchItem;
  blockJsEnabled: boolean;
  blockStatus: string;
  onBack: () => void;
  onBlockJsChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.appChrome}>
      <Pressable
        accessibilityLabel="back-to-home"
        onPress={onBack}
        style={styles.backButton}
        testID="back-to-home">
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
      <View style={styles.appChromeTitleBlock}>
        <Text numberOfLines={1} style={styles.appChromeTitle}>
          {activeApp?.title ?? 'Example'}
        </Text>
        <Text numberOfLines={1} style={styles.appChromeSubtitle}>
          {activeApp?.runtime ?? 'Runtime'} / {activeApp?.workload ?? 'demo'}
        </Text>
      </View>
      <BlockJsControl
        blockStatus={blockStatus}
        compact
        onValueChange={onBlockJsChange}
        value={blockJsEnabled}
      />
    </View>
  );
}

function BlockJsControl({
  blockStatus,
  compact = false,
  onValueChange,
  value,
}: {
  blockStatus: string;
  compact?: boolean;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View
      accessibilityLabel="block-js-control"
      style={[styles.blockSwitch, compact && styles.blockSwitchCompact]}
      testID="block-js-control">
      <View style={styles.blockSwitchLabel}>
        <Text style={styles.blockSwitchText}>Block JS</Text>
        {!compact ? (
          <Text style={styles.blockSwitchStatus}>{blockStatus}</Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel="block-js-switch"
        ios_backgroundColor="#CBD5E1"
        onValueChange={onValueChange}
        thumbColor="#FFFFFF"
        testID="block-js-switch"
        trackColor={{false: '#CBD5E1', true: '#B91C1C'}}
        value={value}
      />
    </View>
  );
}

function HomeRuntimeScreen() {
  const [prewarmStatus, setPrewarmStatus] = useState('pending');
  const [runtimeNames, setRuntimeNames] = useState<string[]>([]);

  const refreshRuntimeNames = useCallback(() => {
    ThreadedRuntime.getRuntimeNames()
      .then(setRuntimeNames)
      .catch(error => {
        console.warn('[home] failed to read threaded runtime names', error);
      });
  }, []);

  const prewarmHomeRuntime = useCallback(() => {
    const startedAt = Date.now();
    setPrewarmStatus('prewarming');
    ThreadedRuntime.prewarm(HOME_RUNTIME_NAME)
      .then(() => {
        setPrewarmStatus(`ready in ${Date.now() - startedAt}ms`);
        refreshRuntimeNames();
      })
      .catch(error => {
        setPrewarmStatus('failed');
        console.warn('[home] failed to prewarm runtime', error);
      });
  }, [refreshRuntimeNames]);

  useEffect(() => {
    void homePersistenceStore.hydrate();
    prewarmHomeRuntime();
  }, [prewarmHomeRuntime]);

  return (
    <View
      accessibilityLabel="home-runtime-screen"
      style={styles.homeScreen}
      testID="home-runtime-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Runtime lab</Text>
        <Text style={styles.subtitle}>
          Prewarm status {prewarmStatus} / active{' '}
          {runtimeNames.length ? runtimeNames.join(', ') : 'none reported'}
        </Text>
      </View>
      <View style={styles.homePanels}>
        <View
          accessibilityLabel="home-main-persistence-panel"
          style={styles.homePanel}
          testID="home-main-persistence-panel">
          <HomeCounterPanel runtimeLabel="main RN" />
        </View>
        <View style={styles.sharedTreeDivider} />
        <Threaded
          accessibilityLabel="home-threaded-persistence-panel"
          component={HomeThreadedPersistenceApp}
          props={{runtimeLabel: 'threaded RN'}}
          runtimeName={HOME_RUNTIME_NAME}
          style={styles.homeThreadedSurface}
          surfaceKey="home-threaded-persistence-panel"
          testID="home-threaded-persistence-panel"
        />
      </View>
      <View style={styles.homeFooter}>
        <ActionButton
          id="home-prewarm-runtime"
          label="Prewarm"
          onPress={prewarmHomeRuntime}
        />
      </View>
    </View>
  );
}

function HomeCounterPanel({runtimeLabel}: {runtimeLabel: string}) {
  const counter = homePersistenceStore.useStore(
    state => state.counter,
    ['counter'],
  );
  const [hydrationStatus, setHydrationStatus] = useState('hydrated');
  const panelId = useMemo(
    () => runtimeLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    [runtimeLabel],
  );

  const increment = useCallback(() => {
    void incrementHomeCounter(runtimeLabel);
  }, [runtimeLabel]);

  const reset = useCallback(() => {
    void resetHomeCounter();
  }, []);

  const hydrate = useCallback(() => {
    setHydrationStatus('hydrating');
    homePersistenceStore
      .hydrate()
      .then(() => setHydrationStatus('hydrated'))
      .catch(error => {
        setHydrationStatus('failed');
        console.warn('[home] failed to hydrate persisted store', error);
      });
  }, []);

  return (
    <View style={styles.homePanelContent}>
      <View style={styles.homePanelHeader}>
        <Text style={styles.sharedTreeRuntime}>{runtimeLabel}</Text>
        <Text style={styles.sharedTreeMeta}>
          rev {homePersistenceStore.getRevision('counter')} /{' '}
          {hydrationStatus}
        </Text>
      </View>
      <View style={styles.homeCounterBlock}>
        <Text
          accessibilityLabel={`home-counter-${runtimeLabel}`}
          style={styles.homeCounter}
          testID={`home-counter-${panelId}`}>
          {counter.count}
        </Text>
        <Text style={styles.homeCounterMeta}>
          last {counter.updatedBy} / {formatHomeUpdate(counter.updatedAt)}
        </Text>
      </View>
      <View style={styles.actions}>
        <ActionButton
          id={`home-counter-increment-${panelId}`}
          label="+1"
          onPress={increment}
        />
        <ActionButton
          id={`home-counter-reset-${panelId}`}
          label="Reset"
          onPress={reset}
        />
        <ActionButton
          id={`home-counter-hydrate-${panelId}`}
          label="Hydrate"
          onPress={hydrate}
        />
      </View>
    </View>
  );
}

type HomeThreadedPersistenceAppProps = {
  runtimeLabel?: string;
  runtimeName?: string;
};

export const HomeThreadedPersistenceApp =
  threadedComponent<HomeThreadedPersistenceAppProps>(
    'HomeThreadedPersistence',
    function HomeThreadedPersistenceApp({
      runtimeLabel = 'threaded RN',
      runtimeName,
    }: HomeThreadedPersistenceAppProps) {
      return (
        <HomeCounterPanel
          runtimeLabel={`${runtimeLabel} / ${runtimeName ?? runtimeKind()}`}
        />
      );
    },
  );

function ThreadedChatScreenSurface({blockStatus}: {blockStatus: string}) {
  return (
    <ThreadedScreen
      accessibilityLabel="threaded-chat-screen"
      component={ThreadedChatScreenApp}
      props={{
        blockStatus: `threaded screen / ${blockStatus}`,
        initialMessageCount: DEFAULT_CHAT_THREAD.messageCount,
        participants: DEFAULT_CHAT_THREAD.participants,
        threadId: DEFAULT_CHAT_THREAD.id,
        threadTitle: DEFAULT_CHAT_THREAD.title,
      }}
      runtimeName="threaded-chat-screen-runtime"
      style={styles.threadedScreenSurface}
      testID="threaded-chat-screen"
    />
  );
}

function ThreadedChatAppExample({blockStatus}: {blockStatus: string}) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const selectedThread =
    CHAT_THREADS.find(thread => thread.id === selectedThreadId) ?? null;

  useEffect(() => {
    if (selectedThreadId != null) {
      return;
    }

    for (const runtimeName of CHAT_THREAD_RUNTIME_NAMES) {
      void ThreadedRuntime.prewarm(runtimeName);
    }
  }, [selectedThreadId]);

  const openThread = useCallback((threadId: string) => {
    void ThreadedRuntime.prewarm(chatThreadRuntimeName(threadId));
    setSelectedThreadId(threadId);
  }, []);

  if (selectedThread) {
    return (
      <View
        accessibilityLabel="threaded-chat-app-conversation"
        style={styles.threadedChatAppScreen}
        testID="threaded-chat-app-conversation">
        <View style={styles.threadedChatAppNav}>
          <ActionButton
            id="threaded-chat-app-back"
            label="Back"
            onPress={() => setSelectedThreadId(null)}
          />
          <View style={styles.threadedChatTitleBlock}>
            <Text style={styles.title}>{selectedThread.title}</Text>
            <Text style={styles.subtitle}>
              Main RN chose the thread. Conversation below is threaded.
            </Text>
          </View>
        </View>
        <ThreadedScreen
          accessibilityLabel={`threaded-chat-app-screen-${selectedThread.id}`}
          component={ThreadedChatScreenApp}
          props={{
            blockStatus: `selected on main runtime / ${blockStatus}`,
            initialMessageCount: selectedThread.messageCount,
            participants: selectedThread.participants,
            threadId: selectedThread.id,
            threadTitle: selectedThread.title,
          }}
          runtimeName={chatThreadRuntimeName(selectedThread.id)}
          style={styles.threadedScreenSurface}
          surfaceKey={`chat-thread-${selectedThread.id}`}
          testID={`threaded-chat-app-screen-${selectedThread.id}`}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="threaded-chat-thread-picker"
      style={styles.threadPickerScreen}
      testID="threaded-chat-thread-picker">
      <View style={styles.header}>
        <Text style={styles.title}>Threaded chat app</Text>
        <Text style={styles.subtitle}>
          Thread list is main RN. Opening a thread mounts the chat screen on a
          second runtime.
        </Text>
      </View>
      <View style={styles.threadPickerList}>
        {CHAT_THREADS.map(thread => (
          <Pressable
            accessibilityLabel={`open-chat-thread-${thread.id}`}
            key={thread.id}
            onPress={() => openThread(thread.id)}
            style={styles.threadRow}
            testID={`open-chat-thread-${thread.id}`}>
            <View style={styles.threadRowText}>
              <View style={styles.threadRowTitleLine}>
                <Text style={styles.threadRowTitle}>{thread.title}</Text>
                {thread.unreadCount > 0 ? (
                  <Text style={styles.threadUnread}>{thread.unreadCount}</Text>
                ) : null}
              </View>
              <Text style={styles.threadParticipants}>
                {thread.participants}
              </Text>
              <Text style={styles.threadPreview}>{thread.preview}</Text>
            </View>
            <Text style={styles.threadMessageCount}>{thread.messageCount}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type ThreadedChatScreenAppProps = {
  blockStatus?: string;
  initialMessageCount?: number;
  participants?: string;
  runtimeName?: string;
  threadId?: string;
  threadTitle?: string;
};

export const ThreadedChatScreenApp =
  threadedComponent<ThreadedChatScreenAppProps>(
    'ThreadedChatScreen',
    function ThreadedChatScreenApp({
      blockStatus = 'threaded screen',
      initialMessageCount = DEFAULT_CHAT_THREAD.messageCount,
      participants = DEFAULT_CHAT_THREAD.participants,
      runtimeName,
      threadId = DEFAULT_CHAT_THREAD.id,
      threadTitle = DEFAULT_CHAT_THREAD.title,
    }: ThreadedChatScreenAppProps) {
      return (
        <ThreadedChatScreenContent
          blockStatus={blockStatus}
          initialMessageCount={initialMessageCount}
          participants={participants}
          runtimeName={runtimeName}
          threadId={threadId}
          threadTitle={threadTitle}
        />
      );
    },
  );

function ThreadedChatScreenContent({
  blockStatus,
  initialMessageCount,
  participants,
  runtimeName,
  threadId,
  threadTitle,
}: {
  blockStatus: string;
  initialMessageCount: number;
  participants: string;
  runtimeName?: string;
  threadId: string;
  threadTitle: string;
}) {
  const sourceRef = useRef<VersionedChatDataSource | null>(null);
  const nextIdRef = useRef(1_000);

  if (sourceRef.current == null) {
    sourceRef.current = new VersionedChatDataSource(
      createRandomMessages(initialMessageCount),
    );
  }

  const source = sourceRef.current;
  const [dataVersion, setDataVersion] = useState(source.version);
  const [itemCount, setItemCount] = useState(source.count);
  const rows = useMemo(
    () =>
      Array.from({length: itemCount}, (_, index) => source.renderItem(index))
        .filter(item => item != null)
        .reverse(),
    [dataVersion, itemCount, source],
  );

  useEffect(() => {
    console.info(
      `RuntimeCheck threadedChatScreen runtime=${
        runtimeName ?? runtimeKind()
      } threadId=${threadId} rows=${itemCount}`,
    );
  }, [itemCount, runtimeName, threadId]);

  const publishState = useCallback(() => {
    setDataVersion(source.version);
    setItemCount(source.count);
  }, [source]);

  const addReply = useCallback(() => {
    const id = `${threadId}-${nextIdRef.current++}`;
    source.addAtIndex(0, createRandomMessage(id, nextIdRef.current));
    publishState();
  }, [publishState, source, threadId]);

  const editLatest = useCallback(() => {
    source.updateItem(0, {
      body: `Threaded screen edit v${
        source.version + 1
      }. ${threadTitle} is running in ${runtimeName ?? runtimeKind()}.`,
    });
    publishState();
  }, [publishState, runtimeName, source, threadTitle]);

  const renderThreadedChatRow = useCallback<ListRenderItem<RenderedChatItem>>(
    ({item}) => (
      <ChatBubble
        item={item}
        onReaction={reaction => {
          source.toggleReaction(item.index, reaction);
          publishState();
        }}
        reactionPrefix="threaded-screen-reaction"
        rowPrefix="threaded-screen-row"
      />
    ),
    [publishState, source],
  );

  const keyExtractor = useCallback(
    (item: RenderedChatItem) => `${item.id}:${item.renderVersion}`,
    [],
  );

  return (
    <View
      accessibilityLabel="threaded-chat-screen-content"
      style={styles.threadedChatScreen}
      testID="threaded-chat-screen-content">
      <View style={styles.threadedChatHeader}>
        <View style={styles.threadedChatTitleBlock}>
          <Text style={styles.title}>{threadTitle}</Text>
          <Text style={styles.subtitle}>
            {itemCount} messages / v{dataVersion} /{' '}
            {runtimeName ?? runtimeKind()} / {participants} / {blockStatus}
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionButton
            id="threaded-chat-screen-add"
            label="+"
            onPress={addReply}
          />
          <ActionButton
            id="threaded-chat-screen-edit"
            label="Edit"
            onPress={editLatest}
          />
        </View>
      </View>
      <FlatList
        accessibilityLabel="threaded-chat-screen-scroll"
        contentContainerStyle={styles.threadedChatContent}
        data={rows}
        initialNumToRender={8}
        keyExtractor={keyExtractor}
        maxToRenderPerBatch={6}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderThreadedChatRow}
        style={styles.list}
        testID="threaded-chat-screen-scroll"
        updateCellsBatchingPeriod={16}
        windowSize={5}
      />
    </View>
  );
}

function SecondRuntimeRnListSurface({
  blockStatus,
  mode,
}: {
  blockStatus: string;
  mode: SecondRuntimeRnBenchmarkMode;
}) {
  return (
    <Threaded
      accessibilityLabel={`second-runtime-${mode}`}
      component={SecondRuntimeRnListApp}
      props={{
        blockStatus: 'second-runtime',
        mode,
      }}
      style={styles.secondRuntimeSurface}
      surfaceKey={mode}
      testID={`second-runtime-${mode}`}
    />
  );
}

type SecondRuntimeRnListAppProps = {
  blockStatus?: string;
  mode?: string;
  runtimeName?: string;
};

export const SecondRuntimeRnListApp =
  threadedComponent<SecondRuntimeRnListAppProps>(
    'BenchmarkRnList',
    function SecondRuntimeRnListApp({
      blockStatus = 'second-runtime',
      mode = 'flashlist',
      runtimeName,
    }: SecondRuntimeRnListAppProps) {
      const normalizedMode: SecondRuntimeRnBenchmarkMode =
        mode === 'legendlist' ? 'legendlist' : 'flashlist';
      return (
        <RnListBenchmarkScreen
          blockStatus={`${blockStatus} / ${runtimeName ?? runtimeKind()}`}
          mode={normalizedMode}
        />
      );
    },
  );

function SharedTreeRuntimeScreen() {
  return (
    <View style={styles.sharedTreeScreen}>
      <View style={styles.header}>
        <Text style={styles.title}>Shared state across RN runtimes</Text>
        <Text style={styles.subtitle}>
          Top half is main RN. Bottom half is rendered by ThreadedReactSurface.
        </Text>
      </View>
      <View style={styles.sharedTreePanels}>
        <View
          accessibilityLabel="shared-tree-main-panel"
          style={styles.sharedTreePanel}
          testID="shared-tree-main-panel">
          <SharedTreePanel runtimeLabel="main RN" />
        </View>
        <View style={styles.sharedTreeDivider} />
        <Threaded
          accessibilityLabel="shared-tree-threaded-panel"
          component={SharedTreeThreadedApp}
          props={{interactive: false, runtimeLabel: 'threaded RN'}}
          runtimeName="shared-tree-runtime"
          style={styles.sharedTreePanel}
          surfaceKey="shared-tree-threaded-panel"
          testID="shared-tree-threaded-panel"
        />
      </View>
    </View>
  );
}

function SharedTreePanel({
  interactive = true,
  runtimeLabel,
}: {
  interactive?: boolean;
  runtimeLabel: string;
}) {
  const nodes = sharedTreeStore.useStore(state => state.nodes, ['nodes']);
  const interaction = sharedTreeStore.useStore(
    state => state.interaction,
    ['interaction'],
  );

  async function pressNode(nodeId: SharedTreeNodeId) {
    const currentColor = nodes[nodeId];
    const currentIndex = TREE_COLORS.indexOf(currentColor);
    const nextColor = TREE_COLORS[(currentIndex + 1) % TREE_COLORS.length];

    await sharedTreeStore.setSubtreeState('nodes', {
      ...nodes,
      [nodeId]: nextColor,
    });
    await sharedTreeStore.setSubtreeState('interaction', {
      lastNode: nodeId,
      lastRuntime: runtimeLabel,
      presses: interaction.presses + 1,
    });
  }

  return (
    <View style={styles.sharedTreePanelContent}>
      <View style={styles.sharedTreePanelHeader}>
        <Text style={styles.sharedTreeRuntime}>{runtimeLabel}</Text>
        <Text style={styles.sharedTreeMeta}>
          {interaction.presses} presses / last {interaction.lastNode} from{' '}
          {interaction.lastRuntime}
        </Text>
      </View>
      <View style={styles.sharedTreeCanvas}>
        {TREE_NODES.map(node => {
          const nodeStyle = [
            styles.sharedTreeNode,
            {backgroundColor: nodes[node.id], marginLeft: node.level * 28},
          ];
          const nodeContent = (
            <>
              <Text style={styles.sharedTreeNodeText}>{node.label}</Text>
              <Text style={styles.sharedTreeNodeSubtext}>
                {node.children?.join(' / ') ?? 'leaf'}
              </Text>
            </>
          );

          return interactive ? (
            <Pressable
              accessibilityLabel={`shared-tree-node-${runtimeLabel}-${node.id}`}
              key={node.id}
              onPress={() => {
                void pressNode(node.id);
              }}
              style={nodeStyle}
              testID={`shared-tree-node-${runtimeLabel}-${node.id}`}>
              {nodeContent}
            </Pressable>
          ) : (
            <View
              accessibilityLabel={`shared-tree-node-${runtimeLabel}-${node.id}`}
              key={node.id}
              style={nodeStyle}
              testID={`shared-tree-node-${runtimeLabel}-${node.id}`}>
              {nodeContent}
            </View>
          );
        })}
      </View>
    </View>
  );
}

type SharedTreeThreadedAppProps = {
  interactive?: boolean;
  runtimeLabel?: string;
  runtimeName?: string;
};

export const SharedTreeThreadedApp =
  threadedComponent<SharedTreeThreadedAppProps>(
    'SharedTreePanel',
    function SharedTreeThreadedApp({
      interactive = false,
      runtimeLabel = 'threaded RN',
      runtimeName,
    }: SharedTreeThreadedAppProps) {
      return (
        <SharedTreePanel
          interactive={interactive}
          runtimeLabel={`${runtimeLabel} / ${runtimeName ?? runtimeKind()}`}
        />
      );
    },
  );

function PokemonRuntimeScreen() {
  return (
    <View style={styles.pokemonScreen}>
      <View style={styles.header}>
        <Text style={styles.title}>PokeAPI shared runtime feed</Text>
        <Text style={styles.subtitle}>
          Main RN fetches pages. Threaded RN renders the shared catalog.
        </Text>
      </View>
      <View style={styles.pokemonPanels}>
        <View
          accessibilityLabel="pokemon-main-producer"
          style={styles.pokemonProducerPanel}
          testID="pokemon-main-producer">
          <PokemonProducerPanel />
        </View>
        <View style={styles.sharedTreeDivider} />
        <Threaded
          accessibilityLabel="pokemon-threaded-consumer"
          component={PokemonThreadedApp}
          props={{runtimeLabel: 'threaded RN'}}
          runtimeName="pokemon-runtime"
          style={styles.pokemonConsumerSurface}
          surfaceKey="pokemon-threaded-consumer"
          testID="pokemon-threaded-consumer"
        />
      </View>
    </View>
  );
}

function PokemonProducerPanel() {
  return (
    <View style={styles.pokemonProducerContent}>
      <PokemonPageFetcher />
      <Text style={styles.sharedTreeRuntime}>main RN fetcher</Text>
      <PokemonProducerStatus />
      <PokemonProducerActions />
      <PokemonProducerPreview />
    </View>
  );
}

function PokemonPageFetcher() {
  const catalog = pokemonStore.useStore(state => state.catalog, ['catalog']);
  const activeRequestRef = useRef(0);

  async function fetchPokemonPage(request: PokemonCatalogState) {
    const {requestId, requestedOffset} = request;
    activeRequestRef.current = requestId;

    await pokemonStore.setSubtreeState(
      'catalog',
      {
        ...request,
        error: null,
        offset: requestedOffset,
        sourceRuntime: 'main RN',
        status: 'loading',
      },
      true,
    );

    try {
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_PAGE_SIZE}&offset=${requestedOffset}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        results: Array<{name: string; url: string}>;
      };
      const items = payload.results.map(item => ({
        id: pokemonIdFromUrl(item.url),
        name: item.name,
        url: item.url,
      }));

      const latestCatalog = pokemonStore.getSubtreeState('catalog');
      if (
        latestCatalog.requestId !== requestId ||
        activeRequestRef.current !== requestId
      ) {
        return;
      }
      const latestItems = pokemonStore.getSubtreeState('pokemonItems');
      const nextItems =
        requestedOffset === 0 ? items : [...latestItems, ...items];

      await pokemonStore.setSubtreeState('pokemonItems', nextItems, true);

      await pokemonStore.setSubtreeState(
        'catalog',
        {
          error: null,
          fetchedAt: new Date().toISOString(),
          nextOffset: requestedOffset + items.length,
          offset: requestedOffset,
          requestedBy: latestCatalog.requestedBy,
          requestedOffset,
          requestId,
          sourceRuntime: 'main RN',
          status: 'loaded',
        },
        true,
      );
    } catch (error) {
      const latest = pokemonStore.getSubtreeState('catalog');
      if (
        latest.requestId !== requestId ||
        activeRequestRef.current !== requestId
      ) {
        return;
      }

      await pokemonStore.setSubtreeState(
        'catalog',
        {
          ...latest,
          error: error instanceof Error ? error.message : String(error),
          fetchedAt: new Date().toISOString(),
          sourceRuntime: 'main RN',
          status: 'error',
        },
        true,
      );
    }
  }

  useEffect(() => {
    if (
      catalog.status !== 'requested' ||
      activeRequestRef.current === catalog.requestId
    ) {
      return;
    }
    fetchPokemonPage(catalog);
  }, [catalog]);

  return null;
}

function PokemonProducerStatus() {
  const catalog = pokemonStore.useStore(state => state.catalog, ['catalog']);
  const itemCount = pokemonStore.useStore(
    state => state.pokemonItems.length,
    ['pokemonItems'],
  );

  return (
    <>
      <Text numberOfLines={2} style={styles.pokemonStatus}>
        {catalog.status} / {itemCount} items / next offset{' '}
        {catalog.nextOffset} / requested by {catalog.requestedBy} /{' '}
        {formatFetchTime(catalog.fetchedAt)}
      </Text>
      {catalog.error ? (
        <Text style={styles.pokemonError}>{catalog.error}</Text>
      ) : null}
    </>
  );
}

const PokemonProducerActions = memo(function PokemonProducerActions() {
  const requestNextPage = useCallback(() => {
    const catalog = pokemonStore.getSubtreeState('catalog');
    if (catalog.status === 'loading' || catalog.status === 'requested') {
      return;
    }
    requestPokemonPage('main RN');
  }, []);

  const clearCatalog = useCallback(() => {
    const catalog = pokemonStore.getSubtreeState('catalog');
    if (catalog.status === 'loading' || catalog.status === 'requested') {
      return;
    }
    clearPokemonCatalog(catalog.requestId + 1);
  }, []);

  return (
    <View style={styles.pokemonActions}>
      <Pressable
        accessibilityLabel="pokemon-request-more"
        onPress={requestNextPage}
        style={styles.actionButton}
        testID="pokemon-request-more">
        <Text style={styles.actionText}>Request</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="pokemon-clear"
        onPress={clearCatalog}
        style={styles.actionButton}
        testID="pokemon-clear">
        <Text style={styles.actionText}>Clear</Text>
      </Pressable>
    </View>
  );
});

function PokemonProducerPreview() {
  const pokemonItems = pokemonStore.useStore(
    state => state.pokemonItems,
    ['pokemonItems'],
  );

  return (
    <View style={styles.pokemonPreview}>
      {pokemonItems.slice(0, 6).map(item => (
        <View key={item.id} style={styles.pokemonPreviewChip}>
          <Text style={styles.pokemonPreviewText}>
            #{item.id} {pokemonDisplayName(item.name)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function useStablePokemonItems(items: PokemonEntry[]) {
  const cacheRef = useRef(new Map<number, PokemonEntry>());

  return useMemo(() => {
    const nextCache = new Map<number, PokemonEntry>();
    const stableItems = items.map(item => {
      const cached = cacheRef.current.get(item.id);
      if (
        cached &&
        cached.name === item.name &&
        cached.url === item.url
      ) {
        nextCache.set(item.id, cached);
        return cached;
      }
      nextCache.set(item.id, item);
      return item;
    });
    cacheRef.current = nextCache;
    return stableItems;
  }, [items]);
}

async function clearPokemonCatalog(nextRequestId: number) {
  await pokemonStore.setSubtreeState('pokemonItems', [], true);
  await pokemonStore.setSubtreeState(
    'catalog',
    {
      ...initialPokemonCatalog,
      requestId: nextRequestId,
      sourceRuntime: 'main RN',
    },
    true,
  );
}

const PokemonRow = memo(function PokemonRow({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  return (
    <View style={styles.pokemonRow}>
      <Text style={styles.pokemonId}>#{id}</Text>
      <Text style={styles.pokemonName}>{pokemonDisplayName(name)}</Text>
    </View>
  );
});

const PokemonEmptyList = memo(function PokemonEmptyList() {
  return (
    <Text style={styles.pokemonEmpty}>Requesting Pokemon from main RN</Text>
  );
});

const pokemonKeyExtractor = (item: PokemonEntry) => String(item.id);

function PokemonConsumerPanel({runtimeLabel}: {runtimeLabel: string}) {
  const catalog = pokemonStore.useStore(state => state.catalog, ['catalog']);

  return (
    <View style={styles.pokemonConsumerPanel}>
      <View style={styles.pokemonConsumerHeader}>
        <Text style={styles.sharedTreeRuntime}>{runtimeLabel}</Text>
        <Text style={styles.pokemonStatus}>
          {catalog.status} / rev {catalog.requestId} / from{' '}
          {catalog.sourceRuntime} / requested by {catalog.requestedBy}
        </Text>
      </View>
      <PokemonItemsList runtimeLabel={runtimeLabel} />
    </View>
  );
}

const PokemonItemsList = memo(function PokemonItemsList({
  runtimeLabel,
}: {
  runtimeLabel: string;
}) {
  const pokemonItems = pokemonStore.useStore(
    state => state.pokemonItems,
    ['pokemonItems'],
  );
  const stablePokemonItems = useStablePokemonItems(pokemonItems);
  const canRequestMoreAfterScrollRef = useRef(false);
  const lastRequestedItemCountRef = useRef(-1);
  const renderPokemonItem = useCallback(
    ({item}: {item: PokemonEntry}) => (
      <PokemonRow id={item.id} name={item.name} />
    ),
    [],
  );

  useEffect(() => {
    const catalog = pokemonStore.getSubtreeState('catalog');
    if (pokemonItems.length > 0 || catalog.status !== 'idle') {
      return;
    }
    lastRequestedItemCountRef.current = 0;
    requestPokemonPage(runtimeLabel);
  }, [pokemonItems.length, runtimeLabel]);

  const requestMoreFromThreadedRuntime = useCallback(() => {
    const catalog = pokemonStore.getSubtreeState('catalog');
    if (
      pokemonItems.length === 0 ||
      catalog.status === 'requested' ||
      catalog.status === 'loading' ||
      !canRequestMoreAfterScrollRef.current ||
      lastRequestedItemCountRef.current === pokemonItems.length
    ) {
      return;
    }

    canRequestMoreAfterScrollRef.current = false;
    lastRequestedItemCountRef.current = pokemonItems.length;
    requestPokemonPage(runtimeLabel);
  }, [pokemonItems.length, runtimeLabel]);

  const markRequestMoreAllowed = useCallback(() => {
    canRequestMoreAfterScrollRef.current = true;
  }, []);

  return (
    <FlatList
      contentContainerStyle={styles.pokemonListContent}
      data={stablePokemonItems}
      keyExtractor={pokemonKeyExtractor}
      ListEmptyComponent={PokemonEmptyList}
      onEndReached={requestMoreFromThreadedRuntime}
      onEndReachedThreshold={0.35}
      onMomentumScrollBegin={markRequestMoreAllowed}
      onScrollBeginDrag={markRequestMoreAllowed}
      renderItem={renderPokemonItem}
    />
  );
});

type PokemonThreadedAppProps = {
  runtimeLabel?: string;
  runtimeName?: string;
};

export const PokemonThreadedApp = threadedComponent<PokemonThreadedAppProps>(
  'PokemonConsumerPanel',
  function PokemonThreadedApp({
    runtimeLabel = 'threaded RN',
    runtimeName,
  }: PokemonThreadedAppProps) {
    return (
      <PokemonConsumerPanel
        runtimeLabel={`${runtimeLabel} / ${runtimeName ?? runtimeKind()}`}
      />
    );
  },
);

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
    sourceRef.current = new VersionedChatDataSource(
      createRandomMessages(10_000),
    );
  }

  const source = sourceRef.current;
  const [dataRevision, setDataRevision] = useState(0);

  const stats = `${source.count.toLocaleString()} messages / v${
    source.version
  } / ${blockStatus}`;
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
      body: `Edited at version ${
        source.version + 1
      }. This row was invalidated by index and filled again after native requested it.`,
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
          <ActionButton
            id="action-add-message"
            label="+"
            onPress={addMessage}
          />
          <ActionButton
            id="action-prepend-1000"
            label="1k+"
            onPress={prependThousandMessages}
          />
          <ActionButton
            id="action-edit-message"
            label="Edit"
            onPress={editLatest}
          />
          <ActionButton
            id="action-react-latest"
            label="+1"
            onPress={reactToLatest}
          />
          <ActionButton
            id="action-delete-message"
            label="Del"
            onPress={removeLatest}
          />
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
          <ActionButton
            id="action-scroll-to-8"
            label="8"
            onPress={scrollToSwapTail}
          />
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

function RnListBenchmarkScreen({
  blockStatus,
  mode,
}: {
  blockStatus: string;
  mode: RnBenchmarkMode;
}) {
  const listRef = useRef<
    FlatList<number> | FlashListRef<number> | LegendListRef | null
  >(null);
  const sourceRef = useRef<VersionedChatDataSource | null>(null);
  const nextIdRef = useRef(10_000);

  if (sourceRef.current == null) {
    sourceRef.current = new VersionedChatDataSource(
      createRandomMessages(10_000),
    );
  }

  useEffect(() => {
    console.info(`RuntimeCheck rnList mode=${mode} runtime=${runtimeKind()}`);
  }, [mode]);

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
    scrollRnListToOffset(listRef.current, 0);
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
      body: `Edited at version ${
        source.version + 1
      }. This row was rendered by the pure RN easing benchmark.`,
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
    scrollRnListToIndex(listRef.current, 7500);
  }

  const renderItem = ({item: index}: {item: number; index: number}) => {
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
          <Text style={styles.title}>{titleForRnMode(mode)}</Text>
          <Text style={styles.subtitle}>
            {stats} / React Native owns scrolling
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionButton
            id={`action-${mode}-add-message`}
            label="+"
            onPress={addMessage}
          />
          <ActionButton
            id={`action-${mode}-prepend-1000`}
            label="1k+"
            onPress={prependThousandMessages}
          />
          <ActionButton
            id={`action-${mode}-edit-message`}
            label="Edit"
            onPress={editLatest}
          />
          <ActionButton
            id={`action-${mode}-react-latest`}
            label="+1"
            onPress={reactToLatest}
          />
          <ActionButton
            id={`action-${mode}-delete-message`}
            label="Del"
            onPress={removeLatest}
          />
          <ActionButton
            id={`action-${mode}-scroll-to-7500`}
            label="7500"
            onPress={scrollToBenchmarkItem}
          />
        </View>
      </View>
      {renderRnList({
        dataVersion,
        indices,
        listRef,
        mode,
        renderItem,
        source,
      })}
      <View
        accessibilityLabel={spacingStatus}
        style={styles.layoutProbe}
        testID="visible-list-spacing-status"
      />
    </>
  );
}

function renderRnList({
  dataVersion,
  indices,
  listRef,
  mode,
  renderItem,
  source,
}: {
  dataVersion: number;
  indices: number[];
  listRef: MutableRefObject<
    FlatList<number> | FlashListRef<number> | LegendListRef | null
  >;
  mode: RnBenchmarkMode;
  renderItem: (info: {item: number; index: number}) => ReactElement | null;
  source: VersionedChatDataSource;
}) {
  const keyExtractor = (index: number) =>
    source.renderItem(index)?.id ?? String(index);
  const testID = `${mode}-chat-list`;
  const commonProps = {
    accessibilityLabel: testID,
    contentContainerStyle: styles.rnEaseContent,
    data: indices,
    extraData: dataVersion,
    keyExtractor,
    style: styles.list,
    testID,
  };

  if (mode === 'flashlist') {
    return (
      <FlashList
        {...commonProps}
        ref={listRef as RefObject<FlashListRef<number>>}
        drawDistance={1200}
        renderItem={renderItem}
      />
    );
  }

  if (mode === 'legendlist' || mode === 'legendlist-main') {
    return (
      <LegendList
        {...commonProps}
        ref={listRef as RefObject<LegendListRef>}
        drawDistance={1200}
        estimatedItemSize={148}
        renderItem={renderItem}
        recycleItems
      />
    );
  }

  return (
    <FlatList
      {...commonProps}
      ref={listRef as RefObject<FlatList<number>>}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      onScrollToIndexFailed={({index}) => {
        requestAnimationFrame(() => {
          scrollRnListToIndex(listRef.current, index);
        });
      }}
      removeClippedSubviews={Platform.OS === 'android'}
      renderItem={renderItem as ListRenderItem<number>}
      updateCellsBatchingPeriod={16}
      windowSize={7}
    />
  );
}

function titleForRnMode(mode: RnBenchmarkMode) {
  switch (mode) {
    case 'flashlist':
      return 'RN FlashList 2RN + react-native-ease';
    case 'legendlist':
      return 'RN LegendList 2RN + react-native-ease';
    case 'legendlist-main':
      return 'RN LegendList Main + react-native-ease';
    default:
      return 'RN FlatList + react-native-ease';
  }
}

function runtimeKind() {
  return (
    (globalThis as {__COMPOSE_CHAT_LIST_ENV__?: {kind?: string}})
      .__COMPOSE_CHAT_LIST_ENV__?.kind ?? 'main'
  );
}

function scrollRnListToIndex(
  list: FlatList<number> | FlashListRef<number> | LegendListRef | null,
  index: number,
) {
  if (!list) return;
  list.scrollToIndex({index, animated: false});
}

function scrollRnListToOffset(
  list: FlatList<number> | FlashListRef<number> | LegendListRef | null,
  offset: number,
) {
  if (!list) return;
  const unsafeList = list as any;
  if (typeof unsafeList.scrollToOffset === 'function') {
    unsafeList.scrollToOffset({offset, animated: false});
  } else {
    unsafeList.scrollToIndex({index: 0, animated: false});
  }
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
      style={[styles.rnEaseRow, item.isOwn && styles.rnEaseRowOwn]}
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
  launcher: {
    flex: 1,
  },
  launcherContent: {
    paddingBottom: 22,
  },
  launcherHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  launcherTitleBlock: {
    gap: 4,
  },
  launcherEyebrow: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  launcherTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
  launcherSubtitle: {
    color: '#4B5563',
    fontSize: 12,
    lineHeight: 17,
  },
  launcherSection: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  launcherSectionTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  launcherGrid: {
    gap: 8,
  },
  launcherCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 104,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  launcherCardPressed: {
    backgroundColor: '#F1F5F9',
  },
  launcherCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  launcherCardEyebrow: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  launcherCardAction: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '800',
  },
  launcherCardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  launcherCardDescription: {
    color: '#4B5563',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  launcherCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  launcherMetaText: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#1E3A8A',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  appChrome: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  appChromeTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  appChromeTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  appChromeSubtitle: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
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
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 9,
  },
  blockSwitchCompact: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  blockSwitchLabel: {
    gap: 1,
  },
  blockSwitchText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  blockSwitchStatus: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
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
  actionButtonDisabled: {
    opacity: 0.48,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  secondRuntimeSurface: {
    flex: 1,
  },
  homeScreen: {
    backgroundColor: '#F6F7F9',
    flex: 1,
  },
  homePanels: {
    backgroundColor: '#D1D5DB',
    flex: 1,
  },
  homePanel: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  homeThreadedSurface: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  homePanelContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    rowGap: 14,
  },
  homePanelHeader: {
    gap: 2,
  },
  homeCounterBlock: {
    alignItems: 'flex-start',
    gap: 2,
  },
  homeCounter: {
    color: '#111827',
    fontSize: 48,
    fontWeight: '800',
  },
  homeCounterMeta: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '700',
  },
  homeFooter: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  threadedScreenSurface: {
    flex: 1,
  },
  threadedChatScreen: {
    backgroundColor: '#F6F7F9',
    flex: 1,
  },
  threadedChatHeader: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  threadedChatTitleBlock: {
    flex: 1,
  },
  threadedChatContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  threadedChatAppScreen: {
    backgroundColor: '#F6F7F9',
    flex: 1,
  },
  threadedChatAppNav: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  threadPickerScreen: {
    backgroundColor: '#F6F7F9',
    flex: 1,
  },
  threadPickerList: {
    gap: 10,
    padding: 12,
  },
  threadRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 108,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  threadRowText: {
    flex: 1,
    gap: 3,
  },
  threadRowTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  threadRowTitle: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  threadUnread: {
    backgroundColor: '#B91C1C',
    borderRadius: 999,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 24,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: 'center',
  },
  threadParticipants: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '700',
  },
  threadPreview: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
  },
  threadMessageCount: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 38,
    textAlign: 'right',
  },
  sharedTreeScreen: {
    flex: 1,
  },
  sharedTreePanels: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  sharedTreePanel: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  sharedTreeDivider: {
    backgroundColor: '#9CA3AF',
    height: StyleSheet.hairlineWidth,
  },
  sharedTreePanelContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sharedTreePanelHeader: {
    gap: 2,
    marginBottom: 6,
  },
  sharedTreeRuntime: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  sharedTreeMeta: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '600',
  },
  sharedTreeCanvas: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  sharedTreeNode: {
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#111827',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.14,
    shadowRadius: 3,
  },
  sharedTreeNodeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sharedTreeNodeSubtext: {
    color: '#EEF2FF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  pokemonScreen: {
    flex: 1,
  },
  pokemonPanels: {
    backgroundColor: '#D1D5DB',
    flex: 1,
  },
  pokemonProducerPanel: {
    backgroundColor: '#F8FAFC',
    minHeight: 178,
  },
  pokemonProducerContent: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pokemonStatus: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '600',
    minHeight: 34,
    textAlignVertical: 'top',
  },
  pokemonError: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  pokemonActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pokemonPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pokemonPreviewChip: {
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pokemonPreviewText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
  },
  pokemonConsumerSurface: {
    flex: 1,
  },
  pokemonConsumerPanel: {
    backgroundColor: '#F8FAFC',
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  pokemonConsumerHeader: {
    gap: 2,
    marginBottom: 8,
  },
  pokemonListContent: {
    gap: 6,
    paddingBottom: 14,
  },
  pokemonEmpty: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 12,
  },
  pokemonRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  pokemonId: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 44,
  },
  pokemonName: {
    color: '#111827',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
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
