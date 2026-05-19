#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@protocol RCTReactNativeFactoryDelegate;
@class RCTFabricSurface;

NS_ASSUME_NONNULL_BEGIN

@interface ThreadedRuntime : NSObject <RCTBridgeModule>

+ (void)configureWithReactNativeDelegate:(id<RCTReactNativeFactoryDelegate>)delegate
                           launchOptions:(nullable NSDictionary *)launchOptions;
+ (void)prewarmRuntime:(nullable NSString *)runtimeName;
+ (void)destroyRuntime:(nullable NSString *)runtimeName;
+ (void)destroyAllRuntimes;
+ (NSArray<NSString *> *)runtimeNames;
+ (RCTFabricSurface *)createSurfaceWithRuntimeName:(nullable NSString *)runtimeName
                                           appName:(nullable NSString *)appName
                                        properties:(NSDictionary *)properties;

@end

NS_ASSUME_NONNULL_END
