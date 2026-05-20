#pragma once

#include <string>

#if defined(__ANDROID__)
#include <jni.h>
#endif

namespace nativecompose::threadedruntime {

#if defined(__ANDROID__)
inline void dispatchHeadlessTask(
    JNIEnv *env,
    jobject context,
    const std::string &runtimeName,
    const std::string &taskName,
    const std::string &payloadJson)
{
  jclass runtimeClass =
      env->FindClass("com/nativecompose/threadedruntime/ThreadedRuntime");
  if (runtimeClass == nullptr) {
    return;
  }

  jmethodID dispatchMethod = env->GetStaticMethodID(
      runtimeClass,
      "dispatchHeadlessTask",
      "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V");
  if (dispatchMethod == nullptr) {
    env->DeleteLocalRef(runtimeClass);
    return;
  }

  jstring runtimeNameValue = env->NewStringUTF(runtimeName.c_str());
  jstring taskNameValue = env->NewStringUTF(taskName.c_str());
  jstring payloadJsonValue = env->NewStringUTF(payloadJson.c_str());
  env->CallStaticVoidMethod(
      runtimeClass,
      dispatchMethod,
      context,
      runtimeNameValue,
      taskNameValue,
      payloadJsonValue);

  env->DeleteLocalRef(payloadJsonValue);
  env->DeleteLocalRef(taskNameValue);
  env->DeleteLocalRef(runtimeNameValue);
  env->DeleteLocalRef(runtimeClass);
}
#elif defined(__APPLE__)
void dispatchHeadlessTask(
    const std::string &runtimeName,
    const std::string &taskName,
    const std::string &payloadJson);

void prewarmRuntime(const std::string &runtimeName);
#endif

} // namespace nativecompose::threadedruntime
