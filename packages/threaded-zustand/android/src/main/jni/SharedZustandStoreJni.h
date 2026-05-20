#pragma once

#include <fbjni/fbjni.h>

namespace facebook::react {

class SharedZustandStoreJni : public jni::JavaClass<SharedZustandStoreJni> {
 public:
  static constexpr const char* kJavaDescriptor =
      "Lcom/nativecompose/threadedzustand/SharedZustandStoreModule;";

  static void registerNatives();

 private:
  static jni::local_ref<jstring> nativeGetState(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> storeName,
      jni::alias_ref<jstring> subtreeKey);

  static jni::local_ref<jstring> nativeGetOrInitState(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> storeName,
      jni::alias_ref<jstring> subtreeKey,
      jni::alias_ref<jstring> initialJson,
      jni::alias_ref<jstring> persistKey);

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

  static void nativeSetPersistenceDirectory(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> directory);

  static void nativeSetPersistedState(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> persistKey,
      jni::alias_ref<jstring> stateJson);

  static void nativeClearPersistedState(
      jni::alias_ref<SharedZustandStoreJni> jobj,
      jni::alias_ref<jstring> persistKey);
};

} // namespace facebook::react
