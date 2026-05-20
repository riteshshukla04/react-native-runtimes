import React, {
  type ComponentType,
  type ReactElement,
  useEffect,
  useMemo,
} from 'react';
import {
  NativeModules,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import NativeThreadedRuntimeSurface from './NativeThreadedRuntimeSurface';

const DEFAULT_RUNTIME_NAME = 'background-list';
const DEFAULT_BUSINESS_RUNTIME_NAME = 'business-runtime';
const DEFAULT_HOST_APP_NAME = 'ThreadedRuntimeHost';
const DEFAULT_RUNTIME_KIND = 'threaded-runtime';
const BUSINESS_RUNTIME_KIND = 'business-runtime';
const THREADED_SCREEN_STYLE: ViewStyle = { flex: 1 };
const HEADLESS_TASK_RUNNER_MODULE = 'ThreadedRuntimeHeadlessTaskRunner';

export type ThreadedComponent<Props extends object = Record<string, never>> =
  ComponentType<Props> & {
    __threadedRuntime: {
      name: string;
    };
  };

type ThreadedComponentLoader = () => ComponentType<any>;
type ThreadedComponentRegistry = Map<string, ThreadedComponentLoader>;
export type ThreadedHeadlessTaskContext<Payload> = {
  payload: Payload;
  runtimeName: ThreadedRuntimeName;
  taskName: string;
};
export type ThreadedHeadlessTask<Payload = unknown> = (
  context: ThreadedHeadlessTaskContext<Payload>,
) => void | Promise<void>;

const threadedComponents: ThreadedComponentRegistry = new Map();
const threadedHeadlessTasks = new Map<string, ThreadedHeadlessTask<any>>();

type ThreadedRuntimeNativeModule = {
  preloadRuntime?: (runtimeName: string) => Promise<void>;
  prewarmRuntime?: (runtimeName: string) => Promise<void>;
  prewarmRuntimeWithOptions?: (
    runtimeName: string,
    kind: string,
    useMainNativeModules: boolean,
  ) => Promise<void>;
  runHeadlessTask?: (
    runtimeName: string,
    taskName: string,
    payloadJson: string,
  ) => Promise<void>;
  dispatchHeadlessTask?: (
    runtimeName: string,
    taskName: string,
    payloadJson: string,
  ) => Promise<void>;
  destroyRuntime?: (runtimeName: string) => Promise<void>;
  destroyAllRuntimes?: () => Promise<void>;
  getRuntimeNames?: () => Promise<string[]>;
};

const nativeRuntime = (NativeModules.ThreadedRuntime ??
  NativeModules.BackgroundListBridge) as
  | ThreadedRuntimeNativeModule
  | undefined;

export type ThreadedRuntimeName = string;
export type ThreadedRuntimePrewarmOptions = {
  kind?: string;
  useMainNativeModules?: boolean;
};
export type ThreadedHeadlessTaskOptions<Payload = unknown> = {
  payload?: Payload;
  runtimeName?: ThreadedRuntimeName;
};

export type ThreadedProps<Props extends object = Record<string, never>> = {
  accessibilityLabel?: string;
  component: ThreadedComponent<Props>;
  props?: Props;
  runtimeName?: ThreadedRuntimeName;
  style?: StyleProp<ViewStyle>;
  surfaceKey?: string;
  testID?: string;
};

export type ThreadedScreenProps<Props extends object = Record<string, never>> =
  ThreadedProps<Props> & {
    destroyOnUnmount?: boolean;
    preload?: boolean;
  };

export type ThreadedReactSurfaceProps<
  Props extends object = Record<string, never>,
> = {
  componentName: string;
  initialProps?: Props;
  runtimeName?: ThreadedRuntimeName;
  surfaceKey?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

export function registerThreadedComponent<Props extends object>(
  name: string,
  component: ComponentType<Props>,
) {
  threadedComponents.set(name, () => component as ComponentType<any>);
}

export function registerLazyThreadedComponent<Props extends object>(
  name: string,
  loadComponent: () => ComponentType<Props>,
) {
  threadedComponents.set(name, loadComponent as ThreadedComponentLoader);
}

export function registerThreadedHeadlessTask<Payload = unknown>(
  name: string,
  task: ThreadedHeadlessTask<Payload>,
) {
  threadedHeadlessTasks.set(name, task as ThreadedHeadlessTask<any>);
}

export function threadedComponent<Props extends object>(
  name: string,
  component: ComponentType<Props>,
): ThreadedComponent<Props> {
  return Object.assign(component, {
    __threadedRuntime: {
      name,
    },
  });
}

export function Threaded<Props extends object>({
  accessibilityLabel,
  component,
  props,
  runtimeName,
  style,
  surfaceKey,
  testID,
}: ThreadedProps<Props>) {
  return (
    <ThreadedReactSurface
      accessibilityLabel={accessibilityLabel}
      componentName={component.__threadedRuntime.name}
      initialProps={props}
      runtimeName={runtimeName}
      style={style}
      surfaceKey={surfaceKey}
      testID={testID}
    />
  );
}

export function ThreadedScreen<Props extends object>({
  accessibilityLabel,
  component,
  destroyOnUnmount = false,
  preload = true,
  props,
  runtimeName,
  style,
  surfaceKey,
  testID,
}: ThreadedScreenProps<Props>) {
  const threadedName = component.__threadedRuntime.name;
  const resolvedRuntimeName = runtimeName ?? `${threadedName}-screen`;

  useEffect(() => {
    if (preload) {
      void ThreadedRuntime.preload(resolvedRuntimeName);
    }

    return () => {
      if (destroyOnUnmount) {
        void ThreadedRuntime.destroy(resolvedRuntimeName);
      }
    };
  }, [destroyOnUnmount, preload, resolvedRuntimeName]);

  return (
    <Threaded
      accessibilityLabel={accessibilityLabel}
      component={component}
      props={props}
      runtimeName={resolvedRuntimeName}
      style={[THREADED_SCREEN_STYLE, style]}
      surfaceKey={surfaceKey ?? resolvedRuntimeName}
      testID={testID}
    />
  );
}

export function ThreadedReactSurface<Props extends object>({
  accessibilityLabel,
  componentName,
  initialProps,
  runtimeName = DEFAULT_RUNTIME_NAME,
  style,
  surfaceKey,
  testID,
}: ThreadedReactSurfaceProps<Props>) {
  const initialPropsJson = useMemo(
    () => JSON.stringify(initialProps ?? {}),
    [initialProps],
  );

  return (
    <NativeThreadedRuntimeSurface
      accessibilityLabel={accessibilityLabel}
      appName={DEFAULT_HOST_APP_NAME}
      componentName={componentName}
      initialPropsJson={initialPropsJson}
      runtimeName={runtimeName}
      style={style}
      surfaceKey={surfaceKey ?? componentName}
      testID={testID}
    />
  );
}

export function ThreadedRuntimeHost({
  componentName,
  initialPropsJson = '{}',
  runtimeName = DEFAULT_RUNTIME_NAME,
}: {
  componentName?: string;
  initialPropsJson?: string;
  runtimeName?: string;
}): ReactElement | null {
  if (!componentName) {
    console.warn('ThreadedRuntimeHost mounted without componentName');
    return null;
  }

  const loadComponent = threadedComponents.get(componentName);
  const Component = loadComponent?.();
  if (!Component) {
    console.warn(`No threaded component registered for "${componentName}"`);
    return null;
  }

  let initialProps: Record<string, unknown>;
  try {
    initialProps = JSON.parse(initialPropsJson);
  } catch {
    initialProps = {};
  }

  return <Component {...initialProps} runtimeName={runtimeName} />;
}

function runRegisteredHeadlessTask(
  taskName: string,
  payloadJson: string,
  runtimeName: string,
) {
  const task = threadedHeadlessTasks.get(taskName);
  if (!task) {
    console.warn(`No threaded headless task registered for "${taskName}"`);
    return;
  }

  let payload: unknown;
  try {
    payload = payloadJson ? JSON.parse(payloadJson) : undefined;
  } catch (error) {
    console.warn(
      `Invalid payload for threaded headless task "${taskName}"`,
      error,
    );
    payload = undefined;
  }

  try {
    void Promise.resolve(
      task({
        payload,
        runtimeName,
        taskName,
      }),
    ).catch(error => {
      console.warn(`Threaded headless task "${taskName}" failed`, error);
    });
  } catch (error) {
    console.warn(`Threaded headless task "${taskName}" failed`, error);
  }
}

function prewarmRuntime(
  runtimeName: ThreadedRuntimeName = DEFAULT_RUNTIME_NAME,
  options: ThreadedRuntimePrewarmOptions = {},
) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return Promise.resolve();
  }
  const kind = options.kind ?? DEFAULT_RUNTIME_KIND;
  const useMainNativeModules = options.useMainNativeModules ?? false;
  if (nativeRuntime?.prewarmRuntimeWithOptions) {
    return nativeRuntime.prewarmRuntimeWithOptions(
      runtimeName,
      kind,
      useMainNativeModules,
    );
  }
  return (
    nativeRuntime?.prewarmRuntime?.(runtimeName) ??
    nativeRuntime?.preloadRuntime?.(runtimeName) ??
    Promise.resolve()
  );
}

export const ThreadedRuntime = {
  defaultRuntimeName: DEFAULT_RUNTIME_NAME,
  defaultBusinessRuntimeName: DEFAULT_BUSINESS_RUNTIME_NAME,

  preload(
    runtimeName: ThreadedRuntimeName = DEFAULT_RUNTIME_NAME,
    options: ThreadedRuntimePrewarmOptions = {},
  ) {
    return prewarmRuntime(runtimeName, options);
  },

  prewarm(
    runtimeName: ThreadedRuntimeName = DEFAULT_RUNTIME_NAME,
    options: ThreadedRuntimePrewarmOptions = {},
  ) {
    return prewarmRuntime(runtimeName, options);
  },

  prewarmBusinessRuntime(
    runtimeName: ThreadedRuntimeName = DEFAULT_BUSINESS_RUNTIME_NAME,
  ) {
    return prewarmRuntime(runtimeName, {
      kind: BUSINESS_RUNTIME_KIND,
      useMainNativeModules: true,
    });
  },

  runHeadlessTask<Payload = unknown>(
    taskName: string,
    options: ThreadedHeadlessTaskOptions<Payload> = {},
  ) {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return Promise.resolve();
    }

    const runtimeName = options.runtimeName ?? DEFAULT_RUNTIME_NAME;
    const payloadJson = JSON.stringify(options.payload ?? null);
    const nativeDispatch =
      nativeRuntime?.dispatchHeadlessTask ?? nativeRuntime?.runHeadlessTask;
    if (!nativeDispatch) {
      return Promise.reject(
        new Error(
          'ThreadedRuntime native module does not support headless tasks',
        ),
      );
    }
    return nativeDispatch(runtimeName, taskName, payloadJson);
  },

  destroy(runtimeName: ThreadedRuntimeName = DEFAULT_RUNTIME_NAME) {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return Promise.resolve();
    }
    return nativeRuntime?.destroyRuntime?.(runtimeName) ?? Promise.resolve();
  },

  destroyAll() {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return Promise.resolve();
    }
    return nativeRuntime?.destroyAllRuntimes?.() ?? Promise.resolve();
  },

  getRuntimeNames() {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return Promise.resolve([] as string[]);
    }
    return (
      nativeRuntime?.getRuntimeNames?.() ?? Promise.resolve([] as string[])
    );
  },
};

const registerCallableModule =
  require('react-native/Libraries/Core/registerCallableModule').default as (
    name: string,
    moduleOrFactory: object | (() => object),
  ) => void;

registerCallableModule(HEADLESS_TASK_RUNNER_MODULE, () => ({
  run: runRegisteredHeadlessTask,
}));
