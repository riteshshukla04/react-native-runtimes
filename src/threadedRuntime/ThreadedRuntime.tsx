import React, {type ComponentType, type ReactElement, useMemo} from 'react';
import {
  NativeModules,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import NativeSecondRuntimeSurface from '../native/NativeSecondRuntimeSurface';

const DEFAULT_RUNTIME_NAME = 'background-list';
const DEFAULT_HOST_APP_NAME = 'ThreadedRuntimeHost';

type ThreadedComponentRegistry = Map<string, ComponentType<any>>;

const threadedComponents: ThreadedComponentRegistry = new Map();

type ThreadedRuntimeNativeModule = {
  preloadRuntime?: (runtimeName: string) => Promise<void>;
  destroyRuntime?: (runtimeName: string) => Promise<void>;
  destroyAllRuntimes?: () => Promise<void>;
  getRuntimeNames?: () => Promise<string[]>;
};

const nativeRuntime = NativeModules.BackgroundListBridge as
  | ThreadedRuntimeNativeModule
  | undefined;

export type ThreadedRuntimeName = string;

export type ThreadedReactSurfaceProps<Props extends object = Record<string, never>> = {
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
  threadedComponents.set(name, component as ComponentType<any>);
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
    <NativeSecondRuntimeSurface
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

  const Component = threadedComponents.get(componentName);
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
    return nativeRuntime?.getRuntimeNames?.() ?? Promise.resolve([] as string[]);
  },
};
