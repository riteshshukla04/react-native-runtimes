package com.nativecomposechat

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.ease.EaseViewPackage
import com.nativecompose.threadedruntime.ThreadedRuntime
import com.nativecompose.threadedruntime.ThreadedRuntimePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(ComposeChatListPackage())
          add(ThreadedRuntimePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    ThreadedRuntime.setExtraReactPackagesProvider {
      listOf(BackgroundListRendererPackage(), EaseViewPackage())
    }
    loadReactNative(this)
    ThreadedRuntime.prewarmRuntime(
        applicationContext,
        "chat-thread-release-room-runtime",
    )
  }
}
