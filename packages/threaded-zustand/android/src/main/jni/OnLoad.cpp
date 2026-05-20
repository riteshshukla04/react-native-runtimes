#include "SharedZustandStoreJni.h"
#include "SharedZustandNitroStore.h"

#include <fbjni/fbjni.h>

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::SharedZustandStoreJni::registerNatives();
    facebook::react::registerSharedZustandNitroStore();
  });
}
