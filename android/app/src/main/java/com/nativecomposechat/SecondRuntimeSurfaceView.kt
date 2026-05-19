package com.nativecomposechat

import android.content.Context
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.uimanager.ThemedReactContext

class SecondRuntimeSurfaceView(context: Context) : FrameLayout(context) {
  private companion object {
    const val LOG_TAG = "RuntimeCheck"
  }

  private var appName = "ComposeChatSecondRuntimeRnList"
  private var mode = "flashlist"
  private var blockStatus = "idle"
  private var surfaceKey = ""
  private var reactSurface: ReactSurface? = null

  fun setAppName(nextAppName: String) {
    if (appName == nextAppName) return
    appName = nextAppName
    restartSurfaceIfAttached()
  }

  fun setMode(nextMode: String) {
    if (mode == nextMode) return
    mode = nextMode
    restartSurfaceIfAttached()
  }

  fun setBlockStatus(nextBlockStatus: String) {
    if (blockStatus == nextBlockStatus) return
    blockStatus = nextBlockStatus
    if (reactSurface != null) {
      Log.i(
          LOG_TAG,
          "secondRuntimeSurface ignoreBlockStatusUpdate mode=$mode blockStatus=$blockStatus surfaceId=${reactSurface?.surfaceID}",
      )
    }
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
          putString("mode", mode)
          putString("blockStatus", blockStatus)
          putString("surfaceKey", surfaceKey)
        }
    val surface = BackgroundListRuntime.createSurface(themedContext, appName, props)
    val surfaceView = checkNotNull(surface.view)
    surfaceView.visibility = View.VISIBLE
    addView(surfaceView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    surface.start()
    reactSurface = surface
    Log.i(
        LOG_TAG,
        "secondRuntimeSurface start appName=$appName mode=$mode surfaceKey=$surfaceKey surfaceId=${surface.surfaceID}",
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
        "secondRuntimeSurface stop appName=$appName mode=$mode surfaceKey=$surfaceKey surfaceId=${surface.surfaceID}",
    )
  }
}
