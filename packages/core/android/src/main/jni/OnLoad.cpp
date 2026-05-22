#include "../../../../cpp/nativecompose/threadedruntime/ThreadedRuntimeNitroFunctions.h"

#include <fbjni/fbjni.h>

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    nativecompose::threadedruntime::registerThreadedRuntimeNitroFunctions();
  });
}
