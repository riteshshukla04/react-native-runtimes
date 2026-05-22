package com.nativecompose.threadedruntime

import android.content.Context
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.uimanager.ThemedReactContext

class ThreadedRuntimeSurfaceView(context: Context) : FrameLayout(context) {
  private companion object {
    const val LOG_TAG = "ThreadedRuntime"
  }

  private var appName = ThreadedRuntime.DEFAULT_HOST_APP_NAME
  private var blockStatus = "idle"
  private var componentName = ""
  private var initialPropsJson = "{}"
  private var mode = ""
  private var runtimeName = ThreadedRuntime.DEFAULT_RUNTIME_NAME
  private var surfaceKey = ""
  private var reactSurface: ReactSurface? = null

  fun setAppName(nextAppName: String) {
    if (appName == nextAppName) return
    appName = nextAppName
    restartSurfaceIfAttached()
  }

  fun setBlockStatus(nextBlockStatus: String) {
    if (blockStatus == nextBlockStatus) return
    blockStatus = nextBlockStatus
    if (reactSurface != null) {
      Log.i(
          LOG_TAG,
          "surface ignoreBlockStatusUpdate blockStatus=$blockStatus surfaceId=${reactSurface?.surfaceID}",
      )
    }
  }

  fun setComponentName(nextComponentName: String) {
    if (componentName == nextComponentName) return
    componentName = nextComponentName
    restartSurfaceIfAttached()
  }

  fun setInitialPropsJson(nextInitialPropsJson: String) {
    if (initialPropsJson == nextInitialPropsJson) return
    initialPropsJson = nextInitialPropsJson
    restartSurfaceIfAttached()
  }

  fun setMode(nextMode: String) {
    if (mode == nextMode) return
    mode = nextMode
    restartSurfaceIfAttached()
  }

  fun setRuntimeName(nextRuntimeName: String) {
    if (runtimeName == nextRuntimeName) return
    runtimeName = nextRuntimeName
    restartSurfaceIfAttached()
  }

  fun setSurfaceKey(nextSurfaceKey: String) {
    if (surfaceKey == nextSurfaceKey) return
    surfaceKey = nextSurfaceKey
    restartSurfaceIfAttached()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    ensureSurface()
  }

  override fun onDetachedFromWindow() {
    stopSurface()
    super.onDetachedFromWindow()
  }

  private fun restartSurfaceIfAttached() {
    if (!isAttachedToWindow) return
    stopSurface()
    ensureSurface()
  }

  private fun ensureSurface() {
    if (reactSurface != null) return
    val themedContext = context as? ThemedReactContext ?: return
    val props =
        Bundle().apply {
          putString("blockStatus", blockStatus)
          putString("componentName", componentName)
          putString("initialPropsJson", initialPropsJson)
          putString("mode", mode)
          putString("runtimeName", runtimeName)
          putString("surfaceKey", surfaceKey)
        }
    val surface = ThreadedRuntime.createSurface(runtimeName, themedContext, appName, props)
    val surfaceView = checkNotNull(surface.view)
    surfaceView.visibility = View.VISIBLE
    addView(surfaceView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    surface.start()
    reactSurface = surface
    Log.i(
        LOG_TAG,
        "surface start runtimeName=$runtimeName appName=$appName componentName=$componentName " +
            "surfaceKey=$surfaceKey surfaceId=${surface.surfaceID}",
    )
  }

  private fun stopSurface() {
    val surface = reactSurface ?: return
    removeView(surface.view)
    surface.stop()
    surface.detach()
    reactSurface = null
    Log.i(
        LOG_TAG,
        "surface stop runtimeName=$runtimeName appName=$appName componentName=$componentName " +
            "surfaceKey=$surfaceKey surfaceId=${surface.surfaceID}",
    )
  }
}
