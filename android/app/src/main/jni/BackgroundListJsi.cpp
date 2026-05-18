#include "BackgroundListJsi.h"

#include <ReactCommon/CallInvoker.h>
#include <android/log.h>
#include <jsi/jsi.h>
#include <mutex>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace facebook::react {
namespace {

constexpr const char* kLogTag = "BackgroundListJsi";
constexpr const char* kRequestHandlerName =
    "__composeChatBackgroundRequestHandler";

std::mutex gMutex;
std::shared_ptr<CallInvoker> gCallInvoker;

std::vector<int> toVector(jni::alias_ref<jintArray> array) {
  std::vector<int> result;
  if (!array) {
    return result;
  }

  auto* env = jni::Environment::current();
  const auto size = env->GetArrayLength(array.get());
  result.resize(size);
  if (size > 0) {
    env->GetIntArrayRegion(array.get(), 0, size, result.data());
  }
  return result;
}

jsi::Array toJsiArray(jsi::Runtime& runtime, const std::vector<int>& values) {
  jsi::Array array(runtime, values.size());
  for (size_t index = 0; index < values.size(); index += 1) {
    array.setValueAtIndex(runtime, index, values[index]);
  }
  return array;
}

} // namespace

void BackgroundListJsi::registerNatives() {
  javaClassLocal()->registerNatives({
      makeNativeMethod(
          "installDirectDispatcher", BackgroundListJsi::installDirectDispatcher),
      makeNativeMethod("directRequestItems", BackgroundListJsi::directRequestItems),
      makeNativeMethod(
          "clearDirectRequestHandler", BackgroundListJsi::clearDirectRequestHandler),
  });
}

void BackgroundListJsi::installDirectDispatcher(
    jni::alias_ref<BackgroundListJsi> /*jobj*/,
    jni::alias_ref<CallInvokerHolder::javaobject> callInvokerHolder) {
  std::lock_guard<std::mutex> lock(gMutex);
  gCallInvoker = callInvokerHolder ? callInvokerHolder->cthis()->getCallInvoker() : nullptr;
}

jboolean BackgroundListJsi::directRequestItems(
    jni::alias_ref<BackgroundListJsi> /*jobj*/,
    jni::alias_ref<jstring> listName,
    jint requestId,
    jint version,
    jdouble nativeDispatchUptimeMs,
    jni::alias_ref<jintArray> indices,
    jni::alias_ref<jintArray> windowIndices,
    jni::alias_ref<jintArray> resetIndices) {
  std::shared_ptr<CallInvoker> callInvoker;
  {
    std::lock_guard<std::mutex> lock(gMutex);
    callInvoker = gCallInvoker;
  }

  if (!callInvoker) {
    return JNI_FALSE;
  }

  auto listNameString = listName->toStdString();
  auto requestedIndices = toVector(indices);
  auto requestedWindowIndices = toVector(windowIndices);
  auto requestedResetIndices = toVector(resetIndices);

  callInvoker->invokeAsync(
      [listNameString = std::move(listNameString),
       requestId,
       version,
       nativeDispatchUptimeMs,
       requestedIndices = std::move(requestedIndices),
       requestedWindowIndices = std::move(requestedWindowIndices),
       requestedResetIndices = std::move(requestedResetIndices)](jsi::Runtime& runtime) {
        try {
          jsi::Object payload(runtime);
          payload.setProperty(
              runtime,
              "listName",
              jsi::String::createFromUtf8(runtime, listNameString));
          payload.setProperty(runtime, "requestId", requestId);
          payload.setProperty(runtime, "version", version);
          payload.setProperty(runtime, "nativeDispatchUptimeMs", nativeDispatchUptimeMs);
          payload.setProperty(runtime, "indices", toJsiArray(runtime, requestedIndices));
          payload.setProperty(
              runtime, "windowIndices", toJsiArray(runtime, requestedWindowIndices));
          payload.setProperty(
              runtime, "resetIndices", toJsiArray(runtime, requestedResetIndices));
          auto handlerValue =
              runtime.global().getProperty(runtime, kRequestHandlerName);
          if (!handlerValue.isObject() ||
              !handlerValue.asObject(runtime).isFunction(runtime)) {
            __android_log_print(
                ANDROID_LOG_ERROR, kLogTag, "direct request handler is not set");
            return;
          }
          auto requestHandler = handlerValue.asObject(runtime).asFunction(runtime);
          requestHandler.call(runtime, std::move(payload));
        } catch (const std::exception& error) {
          __android_log_print(
              ANDROID_LOG_ERROR,
              kLogTag,
              "directRequestItems failed: %s",
              error.what());
        }
      });

  return JNI_TRUE;
}

void BackgroundListJsi::clearDirectRequestHandler(
    jni::alias_ref<BackgroundListJsi> /*jobj*/) {
  std::lock_guard<std::mutex> lock(gMutex);
  gCallInvoker.reset();
}

} // namespace facebook::react
