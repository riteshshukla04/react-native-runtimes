#import "ThreadedRuntime.h"

#include "../cpp/nativecompose/threadedruntime/ThreadedRuntimeDispatcher.h"

namespace nativecompose::threadedruntime {

static NSString *NSStringFromStdString(const std::string &value)
{
  return [NSString stringWithUTF8String:value.c_str()];
}

void dispatchHeadlessTask(
    const std::string &runtimeName,
    const std::string &taskName,
    const std::string &payloadJson)
{
  [ThreadedRuntime dispatchHeadlessTaskWithRuntimeName:NSStringFromStdString(runtimeName)
                                             taskName:NSStringFromStdString(taskName)
                                          payloadJson:NSStringFromStdString(payloadJson)];
}

void prewarmRuntime(const std::string &runtimeName)
{
  [ThreadedRuntime prewarmRuntime:NSStringFromStdString(runtimeName)];
}

} // namespace nativecompose::threadedruntime
