package com.nativecomposechat

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.SecondRuntimeSurfaceManagerDelegate
import com.facebook.react.viewmanagers.SecondRuntimeSurfaceManagerInterface

class SecondRuntimeSurfaceManager :
    ViewGroupManager<SecondRuntimeSurfaceView>(),
    SecondRuntimeSurfaceManagerInterface<SecondRuntimeSurfaceView> {
  private val delegate: ViewManagerDelegate<SecondRuntimeSurfaceView> =
      SecondRuntimeSurfaceManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<SecondRuntimeSurfaceView> = delegate

  override fun getName(): String = "SecondRuntimeSurface"

  override fun createViewInstance(reactContext: ThemedReactContext): SecondRuntimeSurfaceView =
      SecondRuntimeSurfaceView(reactContext)

  @ReactProp(name = "appName")
  override fun setAppName(view: SecondRuntimeSurfaceView, value: String?) {
    view.setAppName(value ?: "ComposeChatSecondRuntimeRnList")
  }

  @ReactProp(name = "mode")
  override fun setMode(view: SecondRuntimeSurfaceView, value: String?) {
    view.setMode(value ?: "flashlist")
  }

  @ReactProp(name = "blockStatus")
  override fun setBlockStatus(view: SecondRuntimeSurfaceView, value: String?) {
    view.setBlockStatus(value ?: "idle")
  }

  @ReactProp(name = "surfaceKey")
  override fun setSurfaceKey(view: SecondRuntimeSurfaceView, value: String?) {
    view.setSurfaceKey(value ?: "")
  }
}
