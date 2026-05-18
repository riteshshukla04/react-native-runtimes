#pragma once

#include <ReactCommon/CallInvokerHolder.h>
#include <fbjni/fbjni.h>
#include <jni.h>

namespace facebook::react {

class BackgroundListJsi : public jni::JavaClass<BackgroundListJsi> {
 public:
  static constexpr const char* kJavaDescriptor =
      "Lcom/nativecomposechat/BackgroundListBridgeModule;";

  static void registerNatives();

 private:
  static void installDirectDispatcher(
      jni::alias_ref<BackgroundListJsi> jobj,
      jni::alias_ref<CallInvokerHolder::javaobject> callInvokerHolder);

  static jboolean directRequestItems(
      jni::alias_ref<BackgroundListJsi> jobj,
      jni::alias_ref<jstring> listName,
      jint requestId,
      jint version,
      jdouble nativeDispatchUptimeMs,
      jni::alias_ref<jintArray> indices,
      jni::alias_ref<jintArray> windowIndices,
      jni::alias_ref<jintArray> resetIndices);

  static void clearDirectRequestHandler(jni::alias_ref<BackgroundListJsi> jobj);
};

} // namespace facebook::react
