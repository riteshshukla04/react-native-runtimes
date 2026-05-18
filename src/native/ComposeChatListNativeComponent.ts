import type {ComponentType} from 'react';
import type {HostComponent, NativeSyntheticEvent, ViewProps} from 'react-native';
import NativeComposeChatList, {Commands} from './NativeComposeChatList';
import NativeComposeChatBackgroundHost from './NativeComposeChatBackgroundHost';
import NativeComposeChatListItem from './NativeComposeChatListItem';

export type ComposeChatListDataOp =
  | {
      type: 'insert';
      seq: number;
      index: number;
      count: number;
      item?: ChatListMessagePayload;
    }
  | {type: 'remove'; seq: number; index: number; count: number}
  | {type: 'update'; seq: number; index: number; item?: ChatListMessagePayload}
  | {type: 'swapPairs'; seq: number; index: number; count: number}
  | {type: 'reset'; seq: number};

export type ChatListMessagePayload = {
  id: string;
  author: string;
  body: string;
  isOwn: boolean;
  reactions: Record<string, number>;
};

export type ComposeChatListDataState = {
  version: number;
  count: number;
  ops: ComposeChatListDataOp[];
  reset?: boolean;
};

export type RenderedChatItem = {
  index: number;
  id: string;
  type: 'message-own' | 'message-other';
  author: string;
  body: string;
  isOwn: boolean;
  reactionSummary: string;
  reactionDetails: string;
  renderVersion: number;
};

export type ComposeChatListRenderedItems = {
  version: number;
  requestId: number;
  items: RenderedChatItem[];
};

export type ComposeChatListPlaceholderTemplate = {
  key?: string;
  variant?: 'chat' | 'card' | 'media' | 'compact';
  align?: 'start' | 'end' | 'alternate';
  minWidth?: number;
  maxWidth?: number;
  height?: number;
  lines?: number;
  showAvatar?: boolean;
  showFooter?: boolean;
};

export type ComposeChatListPlaceholderSpec = {
  version?: number;
  defaultVariant?: 'chat' | 'card' | 'media' | 'compact';
  templates?: ComposeChatListPlaceholderTemplate[];
};

export type RequestItemsEventPayload = {
  requestId: number;
  version: number;
  indicesJson: string;
  windowIndicesJson: string;
  resetIndicesJson: string;
};

export type RequestItemsEvent =
  NativeSyntheticEvent<RequestItemsEventPayload>;

export type ReactToItemEventPayload = {
  index: number;
  reaction: string;
};

export type ReactToItemEvent =
  NativeSyntheticEvent<ReactToItemEventPayload>;

export type ComposeChatListProps = ViewProps & {
  dataState: ComposeChatListDataState;
  renderedItems: ComposeChatListRenderedItems;
  placeholderSpec?: ComposeChatListPlaceholderSpec;
  initialIndexToRender?: number;
  renderMode?: 'main' | 'background';
  listName?: string;
  backgroundAppName?: string;
  onRequestItems: (event: RequestItemsEvent) => void;
  onReactToItem: (event: ReactToItemEvent) => void;
};

export const ComposeChatListCommands = Commands;

export const ComposeChatBackgroundHostNativeComponent =
  NativeComposeChatBackgroundHost;

export const ComposeChatListItemNativeComponent =
  NativeComposeChatListItem as unknown as HostComponent<ViewProps & {
    itemIndex: number;
    itemId: string;
    renderVersion: number;
    contentType?: string;
    measuredHeight?: number;
  }> &
    ComponentType<
      ViewProps & {
        itemIndex: number;
        itemId: string;
        renderVersion: number;
        contentType?: string;
        measuredHeight?: number;
      }
    >;

export default NativeComposeChatList as unknown as HostComponent<ComposeChatListProps> &
  ComponentType<ComposeChatListProps>;
