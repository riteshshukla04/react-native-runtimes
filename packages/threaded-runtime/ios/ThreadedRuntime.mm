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
static NSString *const ThreadedRuntimeDefaultBusinessRuntimeName = @"business-runtime";
static NSString *const ThreadedRuntimeDefaultHostAppName = @"ThreadedRuntimeHost";
static NSString *const ThreadedRuntimeDefaultRuntimeKind = @"threaded-runtime";
static NSString *const ThreadedRuntimeBusinessRuntimeKind = @"business-runtime";
static NSString *const ThreadedRuntimeHeadlessTaskRunnerModule = @"ThreadedRuntimeHeadlessTaskRunner";

@interface ThreadedRuntime (Private)

+ (void)runtimeDidStartWithRuntimeName:(NSString *)runtimeName host:(RCTHost *)host;

@end

@interface ThreadedRuntimeHostDelegate : NSObject <RCTHostDelegate>

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate runtimeName:(NSString *)runtimeName;
- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate
                      runtimeName:(NSString *)runtimeName
                             kind:(NSString *)kind;

@end

@implementation ThreadedRuntimeHostDelegate {
  __weak id<RCTReactNativeFactoryDelegate> _delegate;
  NSString *_runtimeName;
  NSString *_kind;
}

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate runtimeName:(NSString *)runtimeName
{
  return [self initWithDelegate:delegate runtimeName:runtimeName kind:ThreadedRuntimeDefaultRuntimeKind];
}

- (instancetype)initWithDelegate:(id<RCTReactNativeFactoryDelegate>)delegate
                      runtimeName:(NSString *)runtimeName
                             kind:(NSString *)kind
{
  if (self = [super init]) {
    _delegate = delegate;
    _runtimeName = [runtimeName copy];
    NSString *resolvedKind = kind.length > 0 ? kind : ThreadedRuntimeDefaultRuntimeKind;
    _kind = [resolvedKind copy];
  }
  return self;
}

- (void)hostDidStart:(RCTHost *)host
{
  if ([_delegate respondsToSelector:@selector(hostDidStart:)]) {
    [_delegate hostDidStart:host];
  }
  [ThreadedRuntime runtimeDidStartWithRuntimeName:_runtimeName host:host];
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
  threadedEnv.setProperty(runtime, "kind", facebook::jsi::String::createFromUtf8(runtime, [_kind UTF8String]));
  threadedEnv.setProperty(runtime, "runtimeName", facebook::jsi::String::createFromUtf8(runtime, [_runtimeName UTF8String]));
  threadedEnv.setProperty(runtime, "isBackgroundRuntime", ![_kind isEqualToString:ThreadedRuntimeDefaultRuntimeKind]);
  threadedEnv.setProperty(runtime, "useMainNativeModules", true);
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

static NSMutableDictionary<NSString *, NSString *> *ThreadedRuntimeKinds()
{
  static NSMutableDictionary<NSString *, NSString *> *kinds;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    kinds = [NSMutableDictionary new];
  });
  return kinds;
}

static NSMutableDictionary<NSString *, NSMutableArray<NSDictionary<NSString *, NSString *> *> *> *ThreadedRuntimePendingHeadlessTasks()
{
  static NSMutableDictionary<NSString *, NSMutableArray<NSDictionary<NSString *, NSString *> *> *> *tasks;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    tasks = [NSMutableDictionary new];
  });
  return tasks;
}

static NSMutableSet<NSString *> *ThreadedRuntimeStartingRuntimeNames()
{
  static NSMutableSet<NSString *> *runtimeNames;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    runtimeNames = [NSMutableSet new];
  });
  return runtimeNames;
}

static NSMutableSet<NSString *> *ThreadedRuntimeStartedRuntimeNames()
{
  static NSMutableSet<NSString *> *runtimeNames;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    runtimeNames = [NSMutableSet new];
  });
  return runtimeNames;
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
  [self prewarmRuntime:runtimeName kind:ThreadedRuntimeDefaultRuntimeKind useMainNativeModules:NO];
}

+ (void)prewarmRuntime:(NSString *)runtimeName
                  kind:(NSString *)kind
  useMainNativeModules:(BOOL)useMainNativeModules
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  NSString *normalizedKind = [self normalizeRuntimeKind:kind];
  [self configureRuntimeKind:normalizedKind runtimeName:normalizedRuntimeName];
  (void)useMainNativeModules;
  BOOL reused = ThreadedRuntimeHosts()[normalizedRuntimeName] != nil;
  RCTHost *host = [self ensureHostWithRuntimeName:normalizedRuntimeName];
  [self startRuntimeAndFlushWithRuntimeName:normalizedRuntimeName host:host];
  NSLog(
      @"[ThreadedRuntime] runtime prewarm runtimeName=%@ kind=%@ useMainNativeModules=true reused=%@ active=%@",
      normalizedRuntimeName,
      normalizedKind,
      reused ? @"true" : @"false",
      ThreadedRuntimeHosts().allKeys);
  RCTLogInfo(
      @"[ThreadedRuntime] runtime prewarm runtimeName=%@ kind=%@ useMainNativeModules=true reused=%@ active=%@",
      normalizedRuntimeName,
      normalizedKind,
      reused ? @"true" : @"false",
      ThreadedRuntimeHosts().allKeys);
}

+ (void)prewarmBusinessRuntime:(NSString *)runtimeName
{
  [self prewarmRuntime:runtimeName ?: ThreadedRuntimeDefaultBusinessRuntimeName
                  kind:ThreadedRuntimeBusinessRuntimeKind
  useMainNativeModules:YES];
}

+ (void)dispatchHeadlessTaskWithRuntimeName:(NSString *)runtimeName
                                   taskName:(NSString *)taskName
                                payloadJson:(NSString *)payloadJson
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  RCTHost *host = [self ensureHostWithRuntimeName:normalizedRuntimeName];
  NSDictionary<NSString *, NSString *> *task = @{
    @"taskName" : taskName ?: @"",
    @"payloadJson" : payloadJson ?: @"null",
  };

  @synchronized(self) {
    NSMutableArray<NSDictionary<NSString *, NSString *> *> *pending =
        ThreadedRuntimePendingHeadlessTasks()[normalizedRuntimeName];
    if (pending == nil) {
      pending = [NSMutableArray new];
      ThreadedRuntimePendingHeadlessTasks()[normalizedRuntimeName] = pending;
    }
    [pending addObject:task];
  }

  [self startRuntimeAndFlushWithRuntimeName:normalizedRuntimeName host:host];
  NSLog(
      @"[ThreadedRuntime] headless task queued runtimeName=%@ taskName=%@",
      normalizedRuntimeName,
      taskName);
  RCTLogInfo(
      @"[ThreadedRuntime] headless task queued runtimeName=%@ taskName=%@",
      normalizedRuntimeName,
      taskName);
}

+ (void)runHeadlessTaskWithRuntimeName:(NSString *)runtimeName
                              taskName:(NSString *)taskName
                           payloadJson:(NSString *)payloadJson
{
  [self dispatchHeadlessTaskWithRuntimeName:runtimeName taskName:taskName payloadJson:payloadJson];
}

+ (void)destroyRuntime:(NSString *)runtimeName
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  @synchronized(self) {
    [ThreadedRuntimePendingHeadlessTasks() removeObjectForKey:normalizedRuntimeName];
    [ThreadedRuntimeStartingRuntimeNames() removeObject:normalizedRuntimeName];
    [ThreadedRuntimeStartedRuntimeNames() removeObject:normalizedRuntimeName];
  }
  [ThreadedRuntimeHosts() removeObjectForKey:normalizedRuntimeName];
  [ThreadedRuntimeHostDelegates() removeObjectForKey:normalizedRuntimeName];
  [ThreadedRuntimeTurboModuleDelegates() removeObjectForKey:normalizedRuntimeName];
  [ThreadedRuntimeKinds() removeObjectForKey:normalizedRuntimeName];
  NSLog(@"[ThreadedRuntime] runtime destroy runtimeName=%@", normalizedRuntimeName);
  RCTLogInfo(@"[ThreadedRuntime] runtime destroy runtimeName=%@", normalizedRuntimeName);
}

+ (void)destroyAllRuntimes
{
  [ThreadedRuntimeHosts() removeAllObjects];
  [ThreadedRuntimeHostDelegates() removeAllObjects];
  [ThreadedRuntimeTurboModuleDelegates() removeAllObjects];
  [ThreadedRuntimeKinds() removeAllObjects];
  @synchronized(self) {
    [ThreadedRuntimePendingHeadlessTasks() removeAllObjects];
    [ThreadedRuntimeStartingRuntimeNames() removeAllObjects];
    [ThreadedRuntimeStartedRuntimeNames() removeAllObjects];
  }
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

+ (void)startRuntimeAndFlushWithRuntimeName:(NSString *)runtimeName host:(RCTHost *)host
{
  dispatch_async(dispatch_get_main_queue(), ^{
    BOOL shouldStart = NO;
    @synchronized(self) {
      if ([ThreadedRuntimeStartedRuntimeNames() containsObject:runtimeName]) {
        [self flushHeadlessTasksWithRuntimeName:runtimeName host:host];
        return;
      }
      if (![ThreadedRuntimeStartingRuntimeNames() containsObject:runtimeName]) {
        [ThreadedRuntimeStartingRuntimeNames() addObject:runtimeName];
        shouldStart = YES;
      }
    }

    if (shouldStart) {
      @try {
        [host start];
      } @catch (NSException *exception) {
        @synchronized(self) {
          [ThreadedRuntimeStartingRuntimeNames() removeObject:runtimeName];
        }
        NSLog(
            @"[ThreadedRuntime] runtime start failed runtimeName=%@ reason=%@",
            runtimeName,
            exception.reason);
        RCTLogError(
            @"[ThreadedRuntime] runtime start failed runtimeName=%@ reason=%@",
            runtimeName,
            exception.reason);
      }
    }
  });
}

+ (void)runtimeDidStartWithRuntimeName:(NSString *)runtimeName host:(RCTHost *)host
{
  NSString *normalizedRuntimeName = [self normalizeRuntimeName:runtimeName];
  @synchronized(self) {
    [ThreadedRuntimeStartingRuntimeNames() removeObject:normalizedRuntimeName];
    [ThreadedRuntimeStartedRuntimeNames() addObject:normalizedRuntimeName];
  }
  [self flushHeadlessTasksWithRuntimeName:normalizedRuntimeName host:host];
}

+ (void)flushHeadlessTasksWithRuntimeName:(NSString *)runtimeName host:(RCTHost *)host
{
  NSArray<NSDictionary<NSString *, NSString *> *> *tasks;
  @synchronized(self) {
    if (![ThreadedRuntimeStartedRuntimeNames() containsObject:runtimeName]) {
      return;
    }
    tasks = [ThreadedRuntimePendingHeadlessTasks()[runtimeName] copy];
    [ThreadedRuntimePendingHeadlessTasks() removeObjectForKey:runtimeName];
  }

  for (NSDictionary<NSString *, NSString *> *task in tasks) {
    NSString *taskName = task[@"taskName"] ?: @"";
    NSString *payloadJson = task[@"payloadJson"] ?: @"null";
    [host callFunctionOnJSModule:ThreadedRuntimeHeadlessTaskRunnerModule
                          method:@"run"
                            args:@[ taskName, payloadJson, runtimeName ]];
    NSLog(
        @"[ThreadedRuntime] headless task dispatched runtimeName=%@ taskName=%@",
        runtimeName,
        taskName);
    RCTLogInfo(
        @"[ThreadedRuntime] headless task dispatched runtimeName=%@ taskName=%@",
        runtimeName,
        taskName);
  }
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
      [[ThreadedRuntimeHostDelegate alloc] initWithDelegate:delegate
                                                runtimeName:runtimeName
                                                       kind:[self runtimeKindForRuntimeName:runtimeName]];
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

+ (NSString *)normalizeRuntimeKind:(NSString *)kind
{
  return kind.length > 0 ? kind : ThreadedRuntimeDefaultRuntimeKind;
}

+ (NSString *)runtimeKindForRuntimeName:(NSString *)runtimeName
{
  return ThreadedRuntimeKinds()[runtimeName] ?: ThreadedRuntimeDefaultRuntimeKind;
}

+ (void)configureRuntimeKind:(NSString *)kind runtimeName:(NSString *)runtimeName
{
  RCTHost *existingHost = ThreadedRuntimeHosts()[runtimeName];
  NSString *existingKind = ThreadedRuntimeKinds()[runtimeName];
  if (existingHost != nil && existingKind.length > 0 && ![existingKind isEqualToString:kind]) {
    RCTLogWarn(
        @"[ThreadedRuntime] runtime kind ignored for already-created runtime runtimeName=%@ existing=%@ requested=%@",
        runtimeName,
        existingKind,
        kind);
    return;
  }
  ThreadedRuntimeKinds()[runtimeName] = kind;
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

RCT_EXPORT_METHOD(prewarmRuntimeWithOptions
                  : (NSString *)runtimeName kind
                  : (NSString *)kind useMainNativeModules
                  : (BOOL)useMainNativeModules resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  @try {
    [ThreadedRuntime prewarmRuntime:runtimeName kind:kind useMainNativeModules:useMainNativeModules];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"ERR_THREADED_RUNTIME_PREWARM", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(runHeadlessTask
                  : (NSString *)runtimeName taskName
                  : (NSString *)taskName payloadJson
                  : (NSString *)payloadJson resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  @try {
    [ThreadedRuntime runHeadlessTaskWithRuntimeName:runtimeName taskName:taskName payloadJson:payloadJson];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"ERR_THREADED_RUNTIME_HEADLESS_TASK", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(dispatchHeadlessTask
                  : (NSString *)runtimeName taskName
                  : (NSString *)taskName payloadJson
                  : (NSString *)payloadJson resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  @try {
    [ThreadedRuntime dispatchHeadlessTaskWithRuntimeName:runtimeName taskName:taskName payloadJson:payloadJson];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"ERR_THREADED_RUNTIME_HEADLESS_TASK", exception.reason, nil);
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
