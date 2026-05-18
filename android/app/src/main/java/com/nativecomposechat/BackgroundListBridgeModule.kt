package com.nativecomposechat

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class BackgroundListBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "BackgroundListBridge"

  override fun initialize() {
    super.initialize()
    BackgroundListRuntime.attachModule(this)
  }

  override fun invalidate() {
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

  @ReactMethod
  fun reactToItem(listName: String, index: Int, reaction: String) {
    BackgroundListRuntime.reactToItem(listName, index, reaction)
  }

  @ReactMethod
  fun rendererReady(listName: String) {
    val payload = Arguments.createMap()
    payload.putString("listName", listName)
    BackgroundListRuntime.markRendererReady(listName)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit
}
