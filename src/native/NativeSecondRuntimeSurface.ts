import type {HostComponent, ViewProps} from 'react-native';
// eslint-disable-next-line @react-native/no-deep-imports
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface NativeProps extends ViewProps {
  appName?: string;
  blockStatus?: string;
  componentName?: string;
  initialPropsJson?: string;
  mode?: string;
  runtimeName?: string;
  surfaceKey?: string;
}

export default codegenNativeComponent<NativeProps>(
  'SecondRuntimeSurface',
) as HostComponent<NativeProps>;
