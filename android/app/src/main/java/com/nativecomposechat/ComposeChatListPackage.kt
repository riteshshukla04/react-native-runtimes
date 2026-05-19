package com.nativecomposechat

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ComposeChatListPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(BackgroundListBridgeModule(reactContext), SharedZustandStoreModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> =
      listOf(ComposeChatListManager(), ComposeChatListItemManager(), SecondRuntimeSurfaceManager())
}
