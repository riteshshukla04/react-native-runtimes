#import <React/RCTViewManager.h>

#import "ThreadedRuntimeSurfaceView.h"

@interface ThreadedRuntimeSurfaceManager : RCTViewManager
@end

@implementation ThreadedRuntimeSurfaceManager

RCT_EXPORT_MODULE(ThreadedRuntimeSurface)

- (UIView *)view
{
  return [ThreadedRuntimeSurfaceView new];
}

RCT_EXPORT_VIEW_PROPERTY(appName, NSString)
RCT_EXPORT_VIEW_PROPERTY(blockStatus, NSString)
RCT_EXPORT_VIEW_PROPERTY(componentName, NSString)
RCT_EXPORT_VIEW_PROPERTY(initialPropsJson, NSString)
RCT_EXPORT_VIEW_PROPERTY(mode, NSString)
RCT_EXPORT_VIEW_PROPERTY(runtimeName, NSString)
RCT_EXPORT_VIEW_PROPERTY(surfaceKey, NSString)

@end
