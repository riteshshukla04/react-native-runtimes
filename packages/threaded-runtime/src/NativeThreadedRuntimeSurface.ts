import {
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

export default requireNativeComponent<NativeProps>(
  'ThreadedRuntimeSurface',
) as HostComponent<NativeProps>;
