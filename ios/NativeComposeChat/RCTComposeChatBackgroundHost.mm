#import "RCTComposeChatBackgroundHost.h"

#import <react/renderer/components/NativeComposeChatSpec/ComponentDescriptors.h>
#import <react/renderer/components/NativeComposeChatSpec/Props.h>
#import <react/renderer/components/NativeComposeChatSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RCTComposeChatBackgroundHost () <RCTComposeChatBackgroundHostViewProtocol>
@end

@implementation RCTComposeChatBackgroundHost

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ComposeChatBackgroundHostComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ComposeChatBackgroundHostProps>();
    _props = defaultProps;
  }

  return self;
}

@end
