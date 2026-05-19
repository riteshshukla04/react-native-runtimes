package com.nativecompose.threadedruntime

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp

class ThreadedRuntimeSurfaceManager : ViewGroupManager<ThreadedRuntimeSurfaceView>() {
  override fun getName(): String = "ThreadedRuntimeSurface"

  override fun createViewInstance(reactContext: ThemedReactContext): ThreadedRuntimeSurfaceView =
      ThreadedRuntimeSurfaceView(reactContext)

  @ReactProp(name = "appName")
  fun setAppName(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setAppName(value ?: ThreadedRuntime.DEFAULT_HOST_APP_NAME)
  }

  @ReactProp(name = "blockStatus")
  fun setBlockStatus(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setBlockStatus(value ?: "idle")
  }

  @ReactProp(name = "componentName")
  fun setComponentName(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setComponentName(value ?: "")
  }

  @ReactProp(name = "initialPropsJson")
  fun setInitialPropsJson(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setInitialPropsJson(value ?: "{}")
  }

  @ReactProp(name = "mode")
  fun setMode(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setMode(value ?: "")
  }

  @ReactProp(name = "runtimeName")
  fun setRuntimeName(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setRuntimeName(value ?: ThreadedRuntime.DEFAULT_RUNTIME_NAME)
  }

  @ReactProp(name = "surfaceKey")
  fun setSurfaceKey(view: ThreadedRuntimeSurfaceView, value: String?) {
    view.setSurfaceKey(value ?: "")
  }
}
