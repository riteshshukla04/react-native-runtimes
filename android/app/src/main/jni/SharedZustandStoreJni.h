#pragma once

#include <fbjni/fbjni.h>

namespace facebook::react {

class SharedZustandStoreJni : public jni::JavaClass<SharedZustandStoreJni> {
 public:
  static constexpr const char* kJavaDescriptor =
      "Lcom/nativecomposechat/SharedZustandStoreModule;";

  static void registerNatives();

 private:
  static jni::local_ref<jstring> nativeGetState(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> storeName,
      jni::alias_ref<jstring> subtreeKey);

  static jint nativeSetState(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> storeName,
      jni::alias_ref<jstring> subtreeKey,
      jni::alias_ref<jstring> stateJson);

  static jint nativeGetRevision(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> storeName,
      jni::alias_ref<jstring> subtreeKey);

  static jint nativeClear(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> storeName,
      jni::alias_ref<jstring> subtreeKey);
};

} // namespace facebook::react
