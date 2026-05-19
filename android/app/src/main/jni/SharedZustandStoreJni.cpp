#include "SharedZustandStoreJni.h"

#include "SharedZustandStore.h"

namespace facebook::react {

void SharedZustandStoreJni::registerNatives() {
  javaClassLocal()->registerNatives({
      makeNativeMethod("nativeGetState", SharedZustandStoreJni::nativeGetState),
      makeNativeMethod("nativeSetState", SharedZustandStoreJni::nativeSetState),
      makeNativeMethod(
          "nativeGetRevision", SharedZustandStoreJni::nativeGetRevision),
      makeNativeMethod("nativeClear", SharedZustandStoreJni::nativeClear),
  });
}

jni::local_ref<jstring> SharedZustandStoreJni::nativeGetState(
    jni::alias_ref<SharedZustandStoreJni> /*jobj*/,
    jni::alias_ref<jstring> storeName,
    jni::alias_ref<jstring> subtreeKey) {
  const auto entry = SharedZustandStore::instance().getState(
      storeName->toStdString(), subtreeKey->toStdString());
  if (!entry.has_value()) {
    return nullptr;
  }
  return jni::make_jstring(entry->stateJson);
}

jint SharedZustandStoreJni::nativeSetState(
    jni::alias_ref<SharedZustandStoreJni> /*jobj*/,
    jni::alias_ref<jstring> storeName,
    jni::alias_ref<jstring> subtreeKey,
    jni::alias_ref<jstring> stateJson) {
  const auto entry = SharedZustandStore::instance().setState(
      storeName->toStdString(), subtreeKey->toStdString(), stateJson->toStdString());
  return entry.revision;
}

jint SharedZustandStoreJni::nativeGetRevision(
    jni::alias_ref<SharedZustandStoreJni> /*jobj*/,
    jni::alias_ref<jstring> storeName,
    jni::alias_ref<jstring> subtreeKey) {
  return SharedZustandStore::instance().getRevision(
      storeName->toStdString(), subtreeKey->toStdString());
}

jint SharedZustandStoreJni::nativeClear(
    jni::alias_ref<SharedZustandStoreJni> /*jobj*/,
    jni::alias_ref<jstring> storeName,
    jni::alias_ref<jstring> subtreeKey) {
  return SharedZustandStore::instance().clear(
      storeName->toStdString(), subtreeKey->toStdString());
}

} // namespace facebook::react
