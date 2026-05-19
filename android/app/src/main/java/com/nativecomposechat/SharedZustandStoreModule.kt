package com.nativecomposechat

import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.CopyOnWriteArraySet

@DoNotStrip
@ReactModule(name = SharedZustandStoreModule.NAME)
class SharedZustandStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    modules.add(this)
  }

  override fun invalidate() {
    modules.remove(this)
    super.invalidate()
  }

  @ReactMethod
  fun getState(storeName: String, promise: Promise) {
    getSubtreeState(storeName, ROOT_SUBTREE_KEY, promise)
  }

  @ReactMethod
  fun getSubtreeState(storeName: String, subtreeKey: String, promise: Promise) {
    try {
      promise.resolve(nativeGetState(storeName, subtreeKey))
    } catch (exception: Exception) {
      promise.reject("E_SHARED_ZUSTAND_GET_STATE", exception)
    }
  }

  @ReactMethod
  fun setState(storeName: String, stateJson: String, source: String?, promise: Promise) {
    setSubtreeState(storeName, ROOT_SUBTREE_KEY, stateJson, source, promise)
  }

  @ReactMethod
  fun setSubtreeState(
      storeName: String,
      subtreeKey: String,
      stateJson: String,
      source: String?,
      promise: Promise,
  ) {
    try {
      val revision = nativeSetState(storeName, subtreeKey, stateJson)
      notifyChanged(storeName, subtreeKey, stateJson, revision, source)
      promise.resolve(revision)
    } catch (exception: Exception) {
      promise.reject("E_SHARED_ZUSTAND_SET_STATE", exception)
    }
  }

  @ReactMethod
  fun getRevision(storeName: String, promise: Promise) {
    getSubtreeRevision(storeName, ROOT_SUBTREE_KEY, promise)
  }

  @ReactMethod
  fun getSubtreeRevision(storeName: String, subtreeKey: String, promise: Promise) {
    try {
      promise.resolve(nativeGetRevision(storeName, subtreeKey))
    } catch (exception: Exception) {
      promise.reject("E_SHARED_ZUSTAND_GET_REVISION", exception)
    }
  }

  @ReactMethod
  fun clear(storeName: String, source: String?, promise: Promise) {
    clearSubtree(storeName, ROOT_SUBTREE_KEY, source, promise)
  }

  @ReactMethod
  fun clearSubtree(storeName: String, subtreeKey: String, source: String?, promise: Promise) {
    try {
      val revision = nativeClear(storeName, subtreeKey)
      notifyChanged(storeName, subtreeKey, null, revision, source)
      promise.resolve(revision)
    } catch (exception: Exception) {
      promise.reject("E_SHARED_ZUSTAND_CLEAR", exception)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun emitChanged(
      storeName: String,
      subtreeKey: String,
      stateJson: String?,
      revision: Int,
      source: String?,
  ) {
    val payload = Arguments.createMap()
    payload.putString("storeName", storeName)
    payload.putString("subtreeKey", subtreeKey)
    if (stateJson == null) {
      payload.putNull("stateJson")
    } else {
      payload.putString("stateJson", stateJson)
    }
    payload.putInt("revision", revision)
    if (source == null) {
      payload.putNull("source")
    } else {
      payload.putString("source", source)
    }

    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(CHANGED_EVENT, payload)
  }

  @DoNotStrip private external fun nativeGetState(storeName: String, subtreeKey: String): String?

  @DoNotStrip
  private external fun nativeSetState(storeName: String, subtreeKey: String, stateJson: String): Int

  @DoNotStrip private external fun nativeGetRevision(storeName: String, subtreeKey: String): Int

  @DoNotStrip private external fun nativeClear(storeName: String, subtreeKey: String): Int

  companion object {
    const val NAME = "SharedZustandStore"
    const val CHANGED_EVENT = "SharedZustandStoreChanged"
    const val ROOT_SUBTREE_KEY = "__root__"

    private val modules = CopyOnWriteArraySet<SharedZustandStoreModule>()

    private fun notifyChanged(
        storeName: String,
        subtreeKey: String,
        stateJson: String?,
        revision: Int,
        source: String?,
    ) {
      modules.forEach { module ->
        try {
          module.emitChanged(storeName, subtreeKey, stateJson, revision, source)
        } catch (_: Exception) {
          modules.remove(module)
        }
      }
    }
  }
}
