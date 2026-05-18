import type {HostComponent, ViewProps} from 'react-native';
// eslint-disable-next-line @react-native/no-deep-imports
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
// eslint-disable-next-line @react-native/no-deep-imports
import codegenNativeCommands from 'react-native/Libraries/Utilities/codegenNativeCommands';
import type {
  DirectEventHandler,
  Int32,
  WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes';
import * as React from 'react';

export type RequestItemsEventPayload = {
  requestId: Int32;
  version: Int32;
  indicesJson: string;
  windowIndicesJson: string;
  resetIndicesJson: string;
};

export type ReactToItemEventPayload = {
  index: Int32;
  reaction: string;
};

type NativeReactionMap = Readonly<{
  like?: Int32;
  love?: Int32;
  laugh?: Int32;
  wow?: Int32;
  fire?: Int32;
}>;

type NativeMessagePayload = Readonly<{
  id: string;
  author: string;
  body: string;
  isOwn: boolean;
  reactions?: NativeReactionMap;
}>;

type NativeDataOp = Readonly<{
  type: string;
  seq: Int32;
  index?: Int32;
  count?: Int32;
  item?: NativeMessagePayload;
}>;

type NativeDataState = Readonly<{
  version: Int32;
  count: Int32;
  ops: ReadonlyArray<NativeDataOp>;
  reset?: boolean;
}>;

type NativeRenderedChatItem = Readonly<{
  index: Int32;
  id: string;
  type: string;
  author: string;
  body: string;
  isOwn: boolean;
  reactionSummary: string;
  reactionDetails: string;
  renderVersion: Int32;
}>;

type NativeRenderedItems = Readonly<{
  version: Int32;
  requestId: Int32;
  jsRenderDurationMs?: Int32;
  jsTotalDurationMs?: Int32;
  items: ReadonlyArray<NativeRenderedChatItem>;
}>;

type NativePlaceholderTemplate = Readonly<{
  key?: string;
  variant?: string;
  align?: string;
  minWidth?: Int32;
  maxWidth?: Int32;
  height?: Int32;
  lines?: Int32;
  showAvatar?: boolean;
  showFooter?: boolean;
}>;

type NativePlaceholderSpec = Readonly<{
  version?: Int32;
  defaultVariant?: string;
  templates?: ReadonlyArray<NativePlaceholderTemplate>;
}>;

export interface NativeProps extends ViewProps {
  dataState: NativeDataState;
  renderedItems: NativeRenderedItems;
  placeholderSpec?: NativePlaceholderSpec;
  initialIndexToRender?: Int32;
  renderMode?: WithDefault<'main' | 'background', 'main'>;
  listName?: string;
  backgroundAppName?: string;
  onRequestItems: DirectEventHandler<RequestItemsEventPayload>;
  onReactToItem: DirectEventHandler<ReactToItemEventPayload>;
}

type NativeType = HostComponent<NativeProps>;

interface NativeCommands {
  scrollToItem: (
    viewRef: React.ElementRef<NativeType>,
    index: Int32,
    animated: boolean,
  ) => void;
  resetItem: (viewRef: React.ElementRef<NativeType>, index: Int32) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['scrollToItem', 'resetItem'],
});

export default codegenNativeComponent<NativeProps>(
  'ComposeChatList',
) as NativeType;
