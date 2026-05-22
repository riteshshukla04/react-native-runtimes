#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ThreadedRuntimeSurfaceView : UIView

@property (nonatomic, copy) NSString *appName;
@property (nonatomic, copy) NSString *blockStatus;
@property (nonatomic, copy) NSString *componentName;
@property (nonatomic, copy) NSString *initialPropsJson;
@property (nonatomic, copy) NSString *mode;
@property (nonatomic, copy) NSString *runtimeName;
@property (nonatomic, copy) NSString *surfaceKey;

@end

NS_ASSUME_NONNULL_END
