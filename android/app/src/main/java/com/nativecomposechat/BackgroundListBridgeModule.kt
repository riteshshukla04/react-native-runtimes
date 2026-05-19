package com.nativecomposechat

import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl

@DoNotStrip
@ReactModule(name = BackgroundListBridgeModule.NAME)
@OptIn(FrameworkAPI::class)
class BackgroundListBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    installDirectDispatcher(reactContext.getJSCallInvokerHolder() as? CallInvokerHolderImpl)
    BackgroundListRuntime.attachModule(this)
  }

  override fun invalidate() {
    clearDirectRequestHandler()
    BackgroundListRuntime.detachModule(this)
    super.invalidate()
  }

  fun emit(eventName: String, payload: ReadableMap) {
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, payload)
  }

  @ReactMethod
  fun deliverRenderedItems(listName: String, payload: ReadableMap) {
    BackgroundListRuntime.deliverRenderedItems(listName, payload)
  }

  fun requestItemsDirect(
      listName: String,
      requestId: Int,
      version: Int,
      nativeDispatchUptimeMs: Double,
      indices: IntArray,
      windowIndices: IntArray,
      resetIndices: IntArray,
  ): Boolean =
      directRequestItems(
          listName,
          requestId,
          version,
          nativeDispatchUptimeMs,
          indices,
          windowIndices,
          resetIndices,
      )

  @DoNotStrip
  private external fun installDirectDispatcher(callInvokerHolder: CallInvokerHolderImpl?)

  @DoNotStrip
  private external fun directRequestItems(
      listName: String,
      requestId: Int,
      version: Int,
      nativeDispatchUptimeMs: Double,
      indices: IntArray,
      windowIndices: IntArray,
      resetIndices: IntArray,
  ): Boolean

  @DoNotStrip private external fun clearDirectRequestHandler()

  @ReactMethod
  fun reactToItem(listName: String, index: Int, reaction: String) {
    BackgroundListRuntime.reactToItem(listName, index, reaction)
  }

  @ReactMethod
  fun rendererReady(listName: String) {
    installDirectDispatcher(reactContext.getJSCallInvokerHolder() as? CallInvokerHolderImpl)
    BackgroundListRuntime.attachModule(this)
    val payload = Arguments.createMap()
    payload.putString("listName", listName)
    BackgroundListRuntime.markRendererReady(listName)
  }

  @ReactMethod
  fun preloadRuntime(runtimeName: String, promise: Promise) {
    try {
      BackgroundListRuntime.preloadRuntime(reactContext, runtimeName)
      promise.resolve(null)
    } catch (exception: Exception) {
      promise.reject("E_PRELOAD_RUNTIME", exception)
    }
  }

  @ReactMethod
  fun destroyRuntime(runtimeName: String, promise: Promise) {
    try {
      BackgroundListRuntime.destroyRuntime(runtimeName)
      promise.resolve(null)
    } catch (exception: Exception) {
      promise.reject("E_DESTROY_RUNTIME", exception)
    }
  }

  @ReactMethod
  fun destroyAllRuntimes(promise: Promise) {
    try {
      BackgroundListRuntime.destroyAllRuntimes()
      promise.resolve(null)
    } catch (exception: Exception) {
      promise.reject("E_DESTROY_ALL_RUNTIMES", exception)
    }
  }

  @ReactMethod
  fun getRuntimeNames(promise: Promise) {
    val names = Arguments.createArray()
    BackgroundListRuntime.runtimeNames().forEach { names.pushString(it) }
    promise.resolve(names)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    const val NAME = "BackgroundListBridge"
  }
}
