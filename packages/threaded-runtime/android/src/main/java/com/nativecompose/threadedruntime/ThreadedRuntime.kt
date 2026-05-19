package com.nativecompose.threadedruntime

import android.app.Activity
import android.content.Context
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.JSBundleLoader
import com.facebook.react.bridge.JSBundleLoaderDelegate
import com.facebook.react.common.LifecycleState
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.defaults.DefaultComponentsRegistry
import com.facebook.react.defaults.DefaultReactHostDelegate
import com.facebook.react.defaults.DefaultTurboModuleManagerDelegate
import com.facebook.react.fabric.ComponentFactory
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import com.facebook.react.runtime.ReactHostImpl
import com.facebook.react.runtime.hermes.HermesInstance
import com.facebook.react.shell.MainReactPackage
import com.facebook.react.uimanager.ThemedReactContext
import java.io.File

object ThreadedRuntime {
  const val DEFAULT_RUNTIME_NAME = "background-list"
  const val DEFAULT_HOST_APP_NAME = "ThreadedRuntimeHost"

  private val hosts = mutableMapOf<String, ReactHost>()
  private var extraReactPackagesProvider: (() -> List<ReactPackage>)? = null

  @JvmStatic
  fun setExtraReactPackagesProvider(provider: (() -> List<ReactPackage>)?) {
    extraReactPackagesProvider = provider
  }

  @OptIn(UnstableReactNativeAPI::class)
  fun createSurface(
      runtimeName: String,
      reactContext: ThemedReactContext,
      appName: String,
      props: android.os.Bundle,
  ): ReactSurface =
      ensureHost(reactContext.applicationContext, reactContext.currentActivity, runtimeName)
          .createSurface(reactContext, appName, props)

  fun preloadRuntime(context: Context, runtimeName: String) {
    ensureHost(context.applicationContext, null, runtimeName).start()
  }

  fun destroyRuntime(runtimeName: String) {
    hosts.remove(runtimeName)?.destroy("destroyRuntime($runtimeName)", null)
  }

  fun destroyAllRuntimes() {
    hosts.keys.toList().forEach { destroyRuntime(it) }
  }

  fun runtimeNames(): List<String> = hosts.keys.toList()

  @OptIn(UnstableReactNativeAPI::class, FrameworkAPI::class)
  private fun ensureHost(
      context: Context,
      activity: Activity?,
      runtimeName: String,
  ): ReactHost {
    hosts[runtimeName]?.let { return it }

    val componentFactory = ComponentFactory()
    DefaultComponentsRegistry.register(componentFactory)

    val delegate =
        DefaultReactHostDelegate(
            jsMainModulePath = "index",
            jsBundleLoader = ThreadedRuntimeBundleLoader(context, runtimeName),
            reactPackages = buildReactPackages(),
            jsRuntimeFactory = HermesInstance(),
            turboModuleManagerDelegateBuilder = DefaultTurboModuleManagerDelegate.Builder(),
            exceptionHandler = { throw it },
        )

    val nextHost =
        ReactHostImpl(
            context,
            delegate,
            componentFactory,
            true,
            isAppDebuggable(context),
        )

    if (activity != null) {
      nextHost.onHostResume(activity, activity as? DefaultHardwareBackBtnHandler)
    }

    return nextHost.also { hosts[runtimeName] = it }
  }

  private fun buildReactPackages(): List<ReactPackage> =
      buildList {
        add(MainReactPackage())
        add(ThreadedRuntimePackage())
        addAll(extraReactPackagesProvider?.invoke().orEmpty())
      }

  private fun isAppDebuggable(context: Context): Boolean =
      (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
}

private class ThreadedRuntimeBundleLoader(
    private val context: Context,
    private val runtimeName: String,
) : JSBundleLoader() {
  override fun loadScript(delegate: JSBundleLoaderDelegate): String {
    val prelude = File(context.cacheDir, "threaded-runtime-env-${safeFileName(runtimeName)}.js")
    prelude.writeText(
        """
        var __threadedRuntimeGlobal =
          typeof globalThis !== 'undefined' ? globalThis : Function('return this')();
        __threadedRuntimeGlobal.global = __threadedRuntimeGlobal;
        __threadedRuntimeGlobal.globalThis = __threadedRuntimeGlobal;
        __threadedRuntimeGlobal._is_it_a_list_env = true;
        __threadedRuntimeGlobal.__THREADED_RUNTIME_ENV__ = {
          kind: 'threaded-runtime',
          runtimeName: ${jsString(runtimeName)},
          version: 1
        };
        __threadedRuntimeGlobal.__COMPOSE_CHAT_LIST_ENV__ = {
          kind: 'background-list',
          runtimeName: ${jsString(runtimeName)},
          version: 1
        };
        """.trimIndent(),
    )

    val sourceUrl = prelude.absolutePath
    delegate.loadScriptFromFile(prelude.absolutePath, sourceUrl, false)
    delegate.loadScriptFromAssets(context.assets, "assets://index.android.bundle", true)
    return "assets://index.android.bundle"
  }

  private fun jsString(value: String): String =
      "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

  private fun safeFileName(value: String): String =
      value.replace(Regex("[^A-Za-z0-9_.-]"), "_")
}
