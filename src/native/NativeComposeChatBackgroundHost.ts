import type {HostComponent, ViewProps} from 'react-native';
// eslint-disable-next-line @react-native/no-deep-imports
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface NativeProps extends ViewProps {
  listName?: string;
}

export default codegenNativeComponent<NativeProps>(
  'ComposeChatBackgroundHost',
) as HostComponent<NativeProps>;
