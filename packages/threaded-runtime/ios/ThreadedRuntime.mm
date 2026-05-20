#import "ThreadedRuntime.h"

#import <React/RCTConvert.h>
#import <React/RCTLog.h>
#import <React/RCTUtils.h>
#import <React-RCTAppDelegate/RCTAppSetupUtils.h>
#import <React-RCTAppDelegate/RCTReactNativeFactory.h>
#import <ReactCommon/RCTHost.h>
#import <react/runtime/JSRuntimeFactory.h>
#import <react/runtime/JSRuntimeFactoryCAPI.h>

static NSString *const ThreadedRuntimeDefaultRuntimeName = @"background-list";
static NSString *const ThreadedRuntimeDefaultHostAppName = @"ThreadedRuntimeHost";

@interface ThreadedRuntimeHostDelegate : NSObject <RCTHostDelegate>

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate runtimeName:(NSString *)runtimeName;

@end

@implementation ThreadedRuntimeHostDelegate {
  __weak id<RCTReactNativeFactoryDelegate> _delegate;
  NSString *_runtimeName;
}

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate runtimeName:(NSString *)runtimeName
{
  if (self = [super init]) {
    _delegate = delegate;
    _runtimeName = [runtimeName copy];
  }
  return self;
}

- (void)hostDidStart:(RCTHost *)host
{
  if ([_delegate respondsToSelector:@selector(hostDidStart:)]) {
    [_delegate hostDidStart:host];
  }
}

- (NSArray<NSString *> *)unstableModulesRequiringMainQueueSetup
{
  if ([_delegate respondsToSelector:@selector(unstableModulesRequiringMainQueueSetup)]) {
    return [_delegate unstableModulesRequiringMainQueueSetup];
  }

  return @[];
}

- (void)host:(RCTHost *)host didInitializeRuntime:(facebook::jsi::Runtime &)runtime
{
  auto global = runtime.global();
  global.setProperty(runtime, "global", global);
  global.setProperty(runtime, "globalThis", global);
  global.setProperty(runtime, "_is_it_a_list_env", true);

  auto threadedEnv = facebook::jsi::Object(runtime);
  threadedEnv.setProperty(runtime, "kind", facebook::jsi::String::createFromUtf8(runtime, "threaded-runtime"));
  threadedEnv.setProperty(runtime, "runtimeName", facebook::jsi::String::createFromUtf8(runtime, [_runtimeName UTF8String]));
  threadedEnv.setProperty(runtime, "version", 1);
  global.setProperty(runtime, "__THREADED_RUNTIME_ENV__", threadedEnv);

  auto listEnv = facebook::jsi::Object(runtime);
  listEnv.setProperty(runtime, "kind", facebook::jsi::String::createFromUtf8(runtime, "background-list"));
  listEnv.setProperty(runtime, "runtimeName", facebook::jsi::String::createFromUtf8(runtime, [_runtimeName UTF8String]));
  listEnv.setProperty(runtime, "version", 1);
  global.setProperty(runtime, "__COMPOSE_CHAT_LIST_ENV__", listEnv);

  if ([_delegate respondsToSelector:@selector(host:didInitializeRuntime:)]) {
    [_delegate host:host didInitializeRuntime:runtime];
  }
}

@end

@interface ThreadedRuntimeTurboModuleDelegate : NSObject <RCTTurboModuleManagerDelegate>

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate;

@end

@implementation ThreadedRuntimeTurboModuleDelegate {
  __weak id<RCTReactNativeFactoryDelegate> _delegate;
}

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate
{
  if (self = [super init]) {
    _delegate = delegate;
  }
  return self;
}

- (Class)getModuleClassFromName:(const char *)name
{
  if ([_delegate respondsToSelector:@selector(getModuleClassFromName:)]) {
    return [_delegate getModuleClassFromName:name];
  }
  return nullptr;
}

- (id<RCTTurboModule>)getModuleInstanceFromClass:(Class)moduleClass
{
  if ([_delegate respondsToSelector:@selector(getModuleInstanceFromClass:)]) {
    id<RCTTurboModule> module = [_delegate getModuleInstanceFromClass:moduleClass];
    if (module != nil) {
      return module;
    }
  }
  return RCTAppSetupDefaultModuleFromClass(moduleClass, _delegate.dependencyProvider);
}

- (id<RCTModuleProvider>)getModuleProvider:(const char *)name
{
  if ([_delegate respondsToSelector:@selector(getModuleProvider:)]) {
    return [_delegate getModuleProvider:name];
  }
  return nil;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const std::string &)name
                                                      jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
  if ([_delegate respondsToSelector:@selector(getTurboModule:jsInvoker:)]) {
    return [_delegate getTurboModule:name jsInvoker:jsInvoker];
  }
  return nullptr;
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge:(RCTBridge *)bridge
{
  if ([_delegate respondsToSelector:@selector(extraModulesForBridge:)]) {
    return [_delegate extraModulesForBridge:bridge];
  }
  return @[];
}

@end

@implementation ThreadedRuntime

RCT_EXPORT_MODULE()

static NSMutableDictionary<NSString *, RCTHost *> *ThreadedRuntimeHosts()
{
  static NSMutableDictionary<NSString *, RCTHost *> *hosts;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    hosts = [NSMutableDictionary new];
  });
  return hosts;
}

static NSMutableDictionary<NSString *, ThreadedRuntimeHostDelegate *> *ThreadedRuntimeHostDelegates()
{
  static NSMutableDictionary<NSString *, ThreadedRuntimeHostDelegate *> *delegates;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    delegates = [NSMutableDictionary new];
  });
  return delegates;
}

static NSMutableDictionary<NSString *, ThreadedRuntimeTurboModuleDelegate *> *ThreadedRuntimeTurboModuleDelegates()
{
  static NSMutableDictionary<NSString *, ThreadedRuntimeTurboModuleDelegate *> *delegates;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    delegates = [NSMutableDictionary new];
  });
  return delegates;
}

static id<RCTReactNativeFactoryDelegate> configuredDelegate;
static NSDictionary *configuredLaunchOptions;

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

+ (void)configureWithReactNativeDelegate:(id<RCTReactNativeFactoryDelegate>)delegate
                           launchOptions:(NSDictionary *)launchOptions
{
  configuredDelegate = delegate;
  configuredLaunchOptions = [launchOptions copy];
}

+ (void)prewarmRuntime:(NSString *)runtimeName
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  BOOL reused = ThreadedRuntimeHosts()[normalizedRuntimeName] != nil;
  [[self ensureHostWithRuntimeName:normalizedRuntimeName] start];
  NSLog(
      @"[ThreadedRuntime] runtime prewarm runtimeName=%@ reused=%@ active=%@",
      normalizedRuntimeName,
      reused ? @"true" : @"false",
      ThreadedRuntimeHosts().allKeys);
  RCTLogInfo(
      @"[ThreadedRuntime] runtime prewarm runtimeName=%@ reused=%@ active=%@",
      normalizedRuntimeName,
      reused ? @"true" : @"false",
      ThreadedRuntimeHosts().allKeys);
}

+ (void)destroyRuntime:(NSString *)runtimeName
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  [ThreadedRuntimeHosts() removeObjectForKey:normalizedRuntimeName];
  [ThreadedRuntimeHostDelegates() removeObjectForKey:normalizedRuntimeName];
  [ThreadedRuntimeTurboModuleDelegates() removeObjectForKey:normalizedRuntimeName];
  NSLog(@"[ThreadedRuntime] runtime destroy runtimeName=%@", normalizedRuntimeName);
  RCTLogInfo(@"[ThreadedRuntime] runtime destroy runtimeName=%@", normalizedRuntimeName);
}

+ (void)destroyAllRuntimes
{
  [ThreadedRuntimeHosts() removeAllObjects];
  [ThreadedRuntimeHostDelegates() removeAllObjects];
  [ThreadedRuntimeTurboModuleDelegates() removeAllObjects];
  NSLog(@"[ThreadedRuntime] runtime destroyAll");
  RCTLogInfo(@"[ThreadedRuntime] runtime destroyAll");
}

+ (NSArray<NSString *> *)runtimeNames
{
  return ThreadedRuntimeHosts().allKeys;
}

+ (RCTFabricSurface *)createSurfaceWithRuntimeName:(NSString *)runtimeName
                                           appName:(NSString *)appName
                                        properties:(NSDictionary *)properties
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  NSString *normalizedAppName = appName.length > 0 ? appName : ThreadedRuntimeDefaultHostAppName;
  RCTHost *host = [self ensureHostWithRuntimeName:normalizedRuntimeName];
  return [host createSurfaceWithModuleName:normalizedAppName initialProperties:properties ?: @{}];
}

+ (RCTHost *)ensureHostWithRuntimeName:(NSString *)runtimeName
{
  RCTHost *existingHost = ThreadedRuntimeHosts()[runtimeName];
  if (existingHost != nil) {
    return existingHost;
  }

  id<RCTReactNativeFactoryDelegate> delegate = configuredDelegate;
  if (delegate == nil) {
    RCTFatal(RCTErrorWithMessage(@"ThreadedRuntime.configureWithReactNativeDelegate must be called before creating iOS threaded runtimes."));
  }

  ThreadedRuntimeHostDelegate *hostDelegate =
      [[ThreadedRuntimeHostDelegate alloc] initWithDelegate:delegate runtimeName:runtimeName];
  ThreadedRuntimeTurboModuleDelegate *turboModuleDelegate =
      [[ThreadedRuntimeTurboModuleDelegate alloc] initWithDelegate:delegate];
  __weak id<RCTReactNativeFactoryDelegate> weakDelegate = delegate;
  RCTHost *host = [[RCTHost alloc] initWithBundleURLProvider:^NSURL *_Nullable {
    return [weakDelegate bundleURL];
  }
                                      hostDelegate:hostDelegate
                        turboModuleManagerDelegate:turboModuleDelegate
                                  jsEngineProvider:^std::shared_ptr<facebook::react::JSRuntimeFactory>() {
                                    JSRuntimeFactoryRef factory = [weakDelegate createJSRuntimeFactory];
                                    return std::shared_ptr<facebook::react::JSRuntimeFactory>(
                                        reinterpret_cast<facebook::react::JSRuntimeFactory *>(factory),
                                        &js_runtime_factory_destroy);
                                  }
                                     launchOptions:configuredLaunchOptions];

  ThreadedRuntimeHosts()[runtimeName] = host;
  ThreadedRuntimeHostDelegates()[runtimeName] = hostDelegate;
  ThreadedRuntimeTurboModuleDelegates()[runtimeName] = turboModuleDelegate;
  return host;
}

+ (NSString *)normalizeRuntimeName:(NSString *)runtimeName
{
  return runtimeName.length > 0 ? runtimeName : ThreadedRuntimeDefaultRuntimeName;
}

RCT_EXPORT_METHOD(preloadRuntime
                  : (NSString *)runtimeName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  [self prewarmRuntime:runtimeName resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(prewarmRuntime
                  : (NSString *)runtimeName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  @try {
    [ThreadedRuntime prewarmRuntime:runtimeName];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"ERR_THREADED_RUNTIME_PREWARM", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(destroyRuntime
                  : (NSString *)runtimeName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  [ThreadedRuntime destroyRuntime:runtimeName];
  resolve(nil);
}

RCT_EXPORT_METHOD(destroyAllRuntimes
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  [ThreadedRuntime destroyAllRuntimes];
  resolve(nil);
}

RCT_EXPORT_METHOD(getRuntimeNames
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  resolve([ThreadedRuntime runtimeNames]);
}

@end
