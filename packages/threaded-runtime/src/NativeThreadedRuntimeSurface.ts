import {
  UIManager,
  requireNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  appName?: string;
  blockStatus?: string;
  componentName?: string;
  initialPropsJson?: string;
  mode?: string;
  runtimeName?: string;
  surfaceKey?: string;
}

const nativeSurfaceName =
  UIManager.getViewManagerConfig?.('ThreadedRuntimeSurface') != null
    ? 'ThreadedRuntimeSurface'
    : 'SecondRuntimeSurface';

export default requireNativeComponent<NativeProps>(
  nativeSurfaceName,
) as HostComponent<NativeProps>;
