package com.nativecompose.threadedruntime

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ThreadedRuntimeBridgeModule.NAME)
class ThreadedRuntimeBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  @ReactMethod
  fun preloadRuntime(runtimeName: String?, promise: Promise) {
    try {
      ThreadedRuntime.preloadRuntime(reactContext, runtimeName.orDefaultRuntimeName())
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("ERR_THREADED_RUNTIME_PRELOAD", error)
    }
  }

  @ReactMethod
  fun destroyRuntime(runtimeName: String?, promise: Promise) {
    try {
      ThreadedRuntime.destroyRuntime(runtimeName.orDefaultRuntimeName())
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("ERR_THREADED_RUNTIME_DESTROY", error)
    }
  }

  @ReactMethod
  fun destroyAllRuntimes(promise: Promise) {
    try {
      ThreadedRuntime.destroyAllRuntimes()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("ERR_THREADED_RUNTIME_DESTROY_ALL", error)
    }
  }

  @ReactMethod
  fun getRuntimeNames(promise: Promise) {
    val names = Arguments.createArray()
    ThreadedRuntime.runtimeNames().forEach { names.pushString(it) }
    promise.resolve(names)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  private fun String?.orDefaultRuntimeName(): String =
      this?.takeIf { it.isNotBlank() } ?: ThreadedRuntime.DEFAULT_RUNTIME_NAME

  companion object {
    const val NAME = "ThreadedRuntime"
  }
}
