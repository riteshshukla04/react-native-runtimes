#import "RCTComposeChatList.h"

#import <React/RCTConversions.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <react/renderer/components/NativeComposeChatSpec/ComponentDescriptors.h>
#import <react/renderer/components/NativeComposeChatSpec/EventEmitters.h>
#import <react/renderer/components/NativeComposeChatSpec/Props.h>
#import <react/renderer/components/NativeComposeChatSpec/RCTComponentViewHelpers.h>

#import "NativeComposeChat-Swift.h"

using namespace facebook::react;

static NSDictionary *MessagePayloadToNSDictionary(const ComposeChatListDataStateOpsItemStruct &item);
static NSArray<NSDictionary *> *DataOpsToNSArray(const std::vector<ComposeChatListDataStateOpsStruct> &ops);
static NSArray<NSDictionary *> *RenderedItemsToNSArray(const std::vector<ComposeChatListRenderedItemsItemsStruct> &items);
static NSDictionary *PlaceholderSpecToNSDictionary(const ComposeChatListPlaceholderSpecStruct &spec);
static NSDictionary *PlaceholderTemplateToNSDictionary(const ComposeChatListPlaceholderSpecTemplatesStruct &templateItem);

@interface RCTComposeChatList () <RCTComposeChatListViewProtocol, ComposeChatListViewDelegate>
@end

@implementation RCTComposeChatList {
  ComposeChatListHostingView *_hostingView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ComposeChatListComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ComposeChatListProps>();
    _props = defaultProps;

    _hostingView = [ComposeChatListHostingView new];
    _hostingView.delegate = self;
    _hostingView.translatesAutoresizingMaskIntoConstraints = NO;
    [self addSubview:_hostingView];
  }

  return self;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _hostingView.frame = self.bounds;
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_hostingView prepareForRecycle];
}

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTComposeChatListHandleCommand(self, commandName, args);
}

- (void)scrollToItem:(NSInteger)index animated:(BOOL)animated
{
  [_hostingView scrollToItemWithIndex:index animated:animated];
}

- (void)resetItem:(NSInteger)index
{
  [_hostingView resetItemWithIndex:index];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<const ComposeChatListProps>(props);

  [_hostingView setListName:[NSString stringWithUTF8String:newProps.listName.c_str()]];
  [_hostingView setRenderMode:[NSString stringWithUTF8String:toString(newProps.renderMode).c_str()]];
  [_hostingView setPlaceholderSpec:PlaceholderSpecToNSDictionary(newProps.placeholderSpec)];
  [_hostingView setInitialIndexToRender:newProps.initialIndexToRender];
  [_hostingView applyDataStateWithVersion:newProps.dataState.version
                                     count:newProps.dataState.count
                                     reset:newProps.dataState.reset
                                       ops:DataOpsToNSArray(newProps.dataState.ops)];
  [_hostingView applyRenderedItemsWithVersion:newProps.renderedItems.version
                                    requestId:newProps.renderedItems.requestId
                                        items:RenderedItemsToNSArray(newProps.renderedItems.items)];

  [super updateProps:props oldProps:oldProps];
}

- (void)composeChatListView:(ComposeChatListHostingView *)view
               requestItems:(NSNumber *)requestId
                    version:(NSNumber *)version
                indicesJson:(NSString *)indicesJson
           resetIndicesJson:(NSString *)resetIndicesJson
{
  if (!_eventEmitter) {
    return;
  }

  std::static_pointer_cast<const ComposeChatListEventEmitter>(_eventEmitter)
      ->onRequestItems(ComposeChatListEventEmitter::OnRequestItems{
          requestId.intValue,
          version.intValue,
          indicesJson.UTF8String,
          resetIndicesJson.UTF8String,
      });
}

- (void)composeChatListView:(ComposeChatListHostingView *)view
                reactToItem:(NSNumber *)index
                   reaction:(NSString *)reaction
{
  if (!_eventEmitter) {
    return;
  }

  std::static_pointer_cast<const ComposeChatListEventEmitter>(_eventEmitter)
      ->onReactToItem(ComposeChatListEventEmitter::OnReactToItem{
          index.intValue,
          reaction.UTF8String,
      });
}

static NSArray<NSDictionary *> *DataOpsToNSArray(const std::vector<ComposeChatListDataStateOpsStruct> &ops)
{
  NSMutableArray<NSDictionary *> *result = [NSMutableArray arrayWithCapacity:ops.size()];
  for (const auto &op : ops) {
    NSMutableDictionary *dictionary = [NSMutableDictionary dictionary];
    dictionary[@"type"] = [NSString stringWithUTF8String:op.type.c_str()];
    dictionary[@"seq"] = @(op.seq);
    dictionary[@"index"] = @(op.index);
    dictionary[@"count"] = @(op.count);
    dictionary[@"item"] = MessagePayloadToNSDictionary(op.item);
    [result addObject:dictionary];
  }
  return result;
}

static NSDictionary *MessagePayloadToNSDictionary(const ComposeChatListDataStateOpsItemStruct &item)
{
  return @{
    @"id" : [NSString stringWithUTF8String:item.id.c_str()],
    @"author" : [NSString stringWithUTF8String:item.author.c_str()],
    @"body" : [NSString stringWithUTF8String:item.body.c_str()],
    @"isOwn" : @(item.isOwn),
    @"reactions" : @{
      @"like" : @(item.reactions.like),
      @"love" : @(item.reactions.love),
      @"laugh" : @(item.reactions.laugh),
      @"wow" : @(item.reactions.wow),
      @"fire" : @(item.reactions.fire),
    },
  };
}

static NSArray<NSDictionary *> *RenderedItemsToNSArray(const std::vector<ComposeChatListRenderedItemsItemsStruct> &items)
{
  NSMutableArray<NSDictionary *> *result = [NSMutableArray arrayWithCapacity:items.size()];
  for (const auto &item : items) {
    [result addObject:@{
      @"index" : @(item.index),
      @"id" : [NSString stringWithUTF8String:item.id.c_str()],
      @"type" : [NSString stringWithUTF8String:item.type.c_str()],
      @"author" : [NSString stringWithUTF8String:item.author.c_str()],
      @"body" : [NSString stringWithUTF8String:item.body.c_str()],
      @"isOwn" : @(item.isOwn),
      @"reactionSummary" : [NSString stringWithUTF8String:item.reactionSummary.c_str()],
      @"reactionDetails" : [NSString stringWithUTF8String:item.reactionDetails.c_str()],
      @"renderVersion" : @(item.renderVersion),
    }];
  }
  return result;
}

static NSDictionary *PlaceholderSpecToNSDictionary(const ComposeChatListPlaceholderSpecStruct &spec)
{
  NSMutableArray<NSDictionary *> *templates = [NSMutableArray arrayWithCapacity:spec.templates.size()];
  for (const auto &templateItem : spec.templates) {
    [templates addObject:PlaceholderTemplateToNSDictionary(templateItem)];
  }

  return @{
    @"version" : @(spec.version),
    @"defaultVariant" : [NSString stringWithUTF8String:spec.defaultVariant.c_str()],
    @"templates" : templates,
  };
}

static NSDictionary *PlaceholderTemplateToNSDictionary(const ComposeChatListPlaceholderSpecTemplatesStruct &templateItem)
{
  return @{
    @"key" : [NSString stringWithUTF8String:templateItem.key.c_str()],
    @"variant" : [NSString stringWithUTF8String:templateItem.variant.c_str()],
    @"align" : [NSString stringWithUTF8String:templateItem.align.c_str()],
    @"minWidth" : @(templateItem.minWidth),
    @"maxWidth" : @(templateItem.maxWidth),
    @"height" : @(templateItem.height),
    @"lines" : @(templateItem.lines),
    @"showAvatar" : @(templateItem.showAvatar),
    @"showFooter" : @(templateItem.showFooter),
  };
}

@end
