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
const DEFAULT_HOST_APP_NAME = 'ThreadedRuntimeHost';
const THREADED_SCREEN_STYLE: ViewStyle = {flex: 1};

export type ThreadedComponent<Props extends object = Record<string, never>> =
  ComponentType<Props> & {
    __threadedRuntime: {
      name: string;
    };
  };

type ThreadedComponentLoader = () => ComponentType<any>;
type ThreadedComponentRegistry = Map<string, ThreadedComponentLoader>;

const threadedComponents: ThreadedComponentRegistry = new Map();

type ThreadedRuntimeNativeModule = {
  preloadRuntime?: (runtimeName: string) => Promise<void>;
  destroyRuntime?: (runtimeName: string) => Promise<void>;
  destroyAllRuntimes?: () => Promise<void>;
  getRuntimeNames?: () => Promise<string[]>;
};

const nativeRuntime = (NativeModules.ThreadedRuntime ??
  NativeModules.BackgroundListBridge) as
  | ThreadedRuntimeNativeModule
  | undefined;

export type ThreadedRuntimeName = string;

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

export const ThreadedRuntime = {
  defaultRuntimeName: DEFAULT_RUNTIME_NAME,

  preload(runtimeName: ThreadedRuntimeName = DEFAULT_RUNTIME_NAME) {
    if (Platform.OS !== 'android') return Promise.resolve();
    return nativeRuntime?.preloadRuntime?.(runtimeName) ?? Promise.resolve();
  },

  destroy(runtimeName: ThreadedRuntimeName = DEFAULT_RUNTIME_NAME) {
    if (Platform.OS !== 'android') return Promise.resolve();
    return nativeRuntime?.destroyRuntime?.(runtimeName) ?? Promise.resolve();
  },

  destroyAll() {
    if (Platform.OS !== 'android') return Promise.resolve();
    return nativeRuntime?.destroyAllRuntimes?.() ?? Promise.resolve();
  },

  getRuntimeNames() {
    if (Platform.OS !== 'android') return Promise.resolve([] as string[]);
    return (
      nativeRuntime?.getRuntimeNames?.() ?? Promise.resolve([] as string[])
    );
  },
};
