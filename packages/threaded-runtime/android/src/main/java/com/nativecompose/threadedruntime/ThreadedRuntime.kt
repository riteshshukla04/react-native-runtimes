package com.nativecompose.threadedruntime

import android.app.Activity
import android.content.Context
import android.util.Log
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.JSBundleLoader
import com.facebook.react.bridge.JSBundleLoaderDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeArray
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
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object ThreadedRuntime {
  const val DEFAULT_RUNTIME_NAME = "background-list"
  const val DEFAULT_HOST_APP_NAME = "ThreadedRuntimeHost"
  private const val HEADLESS_TASK_RUNNER_MODULE = "ThreadedRuntimeHeadlessTaskRunner"
  private const val LOG_TAG = "ThreadedRuntime"

  private data class HeadlessTaskRequest(
      val taskName: String,
      val payloadJson: String,
  )

  private val lock = Any()
  private val hosts = mutableMapOf<String, ReactHost>()
  private val pendingHeadlessTasks = mutableMapOf<String, MutableList<HeadlessTaskRequest>>()
  private val startingRuntimes = mutableSetOf<String>()
  private val startedRuntimes = mutableSetOf<String>()
  private val dispatchExecutor =
      Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "ThreadedRuntimeDispatch").apply { isDaemon = true }
      }
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

  fun preloadRuntime(context: Context, runtimeName: String) = prewarmRuntime(context, runtimeName)

  @JvmOverloads
  @JvmStatic
  fun prewarmRuntime(context: Context, runtimeName: String = DEFAULT_RUNTIME_NAME) {
    val normalizedRuntimeName = runtimeName.orDefaultRuntimeName()
    val didReuseHost = synchronized(lock) { hosts.containsKey(normalizedRuntimeName) }
    val host = ensureHost(context.applicationContext, null, normalizedRuntimeName)
    startRuntimeAndFlush(normalizedRuntimeName, host)
    Log.i(
        LOG_TAG,
        "runtime prewarm runtimeName=$normalizedRuntimeName " +
            "reused=$didReuseHost active=${runtimeNames()}")
  }

  fun destroyRuntime(runtimeName: String) {
    val normalizedRuntimeName = runtimeName.orDefaultRuntimeName()
    val host =
        synchronized(lock) {
          pendingHeadlessTasks.remove(normalizedRuntimeName)
          startingRuntimes.remove(normalizedRuntimeName)
          startedRuntimes.remove(normalizedRuntimeName)
          hosts.remove(normalizedRuntimeName)
        }
    host?.destroy("destroyRuntime($normalizedRuntimeName)", null)
  }

  @JvmStatic
  fun runHeadlessTask(
      context: Context,
      runtimeName: String,
      taskName: String,
      payloadJson: String,
  ) = dispatchHeadlessTask(context, runtimeName, taskName, payloadJson)

  @JvmStatic
  fun dispatchHeadlessTask(
      context: Context,
      runtimeName: String?,
      taskName: String,
      payloadJson: String?,
  ) {
    val normalizedRuntimeName = runtimeName.orDefaultRuntimeName()
    val host = ensureHost(context.applicationContext, null, normalizedRuntimeName)
    synchronized(lock) {
      pendingHeadlessTasks
          .getOrPut(normalizedRuntimeName) { mutableListOf() }
          .add(HeadlessTaskRequest(taskName, payloadJson ?: "null"))
    }
    startRuntimeAndFlush(normalizedRuntimeName, host)
    Log.i(
        LOG_TAG,
        "headless task queued runtimeName=$normalizedRuntimeName taskName=$taskName")
  }

  fun destroyAllRuntimes() {
    runtimeNames().forEach { destroyRuntime(it) }
  }

  fun runtimeNames(): List<String> = synchronized(lock) { hosts.keys.toList() }

  @OptIn(UnstableReactNativeAPI::class, FrameworkAPI::class)
  private fun ensureHost(
      context: Context,
      activity: Activity?,
      runtimeName: String,
  ): ReactHost {
    synchronized(lock) { hosts[runtimeName] }?.let {
      resumeHost(it, activity)
      return it
    }

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

    resumeHost(nextHost, activity)

    synchronized(lock) { hosts[runtimeName] = nextHost }
    return nextHost
  }

  private fun startRuntimeAndFlush(runtimeName: String, host: ReactHost) {
    val shouldStart =
        synchronized(lock) {
          if (startedRuntimes.contains(runtimeName)) {
            false
          } else {
            startingRuntimes.add(runtimeName)
          }
        }

    if (!shouldStart) {
      flushHeadlessTasks(runtimeName, host)
      return
    }

    dispatchExecutor.execute {
      try {
        val startTask = host.start()
        startTask.waitForCompletion(30, TimeUnit.SECONDS)
        startTask.getError()?.let { throw it }
        synchronized(lock) {
          startingRuntimes.remove(runtimeName)
          startedRuntimes.add(runtimeName)
        }
        flushHeadlessTasks(runtimeName, host)
      } catch (error: Throwable) {
        synchronized(lock) { startingRuntimes.remove(runtimeName) }
        Log.e(LOG_TAG, "runtime start failed runtimeName=$runtimeName", error)
      }
    }
  }

  private fun flushHeadlessTasks(runtimeName: String, host: ReactHost) {
    val requests =
        synchronized(lock) {
          if (!startedRuntimes.contains(runtimeName)) {
            return
          }
          pendingHeadlessTasks.remove(runtimeName)?.toList().orEmpty()
        }
    if (requests.isEmpty()) {
      return
    }

    dispatchExecutor.execute {
      requests.forEach { request ->
        try {
          invokeHeadlessTask(host, runtimeName, request)
        } catch (error: Throwable) {
          Log.e(
              LOG_TAG,
              "headless task dispatch failed runtimeName=$runtimeName taskName=${request.taskName}",
              error,
          )
        }
      }
    }
  }

  private fun invokeHeadlessTask(
      host: ReactHost,
      runtimeName: String,
      request: HeadlessTaskRequest,
  ) {
    val args =
        Arguments.fromJavaArgs(arrayOf(request.taskName, request.payloadJson, runtimeName))
            as NativeArray
    val method =
        host.javaClass.getDeclaredMethod(
            "callFunctionOnModule",
            String::class.java,
            String::class.java,
            NativeArray::class.java,
        )
    method.isAccessible = true
    val callTask =
        method.invoke(host, HEADLESS_TASK_RUNNER_MODULE, "run", args)
            as? com.facebook.react.interfaces.TaskInterface<*>
    callTask?.waitForCompletion(5, TimeUnit.SECONDS)
    callTask?.getError()?.let { throw it }
    Log.i(
        LOG_TAG,
        "headless task dispatched runtimeName=$runtimeName taskName=${request.taskName}")
  }

  private fun resumeHost(host: ReactHost, activity: Activity?) {
    if (activity != null) {
      host.onHostResume(activity, activity as? DefaultHardwareBackBtnHandler)
    }
  }

  private fun buildReactPackages(): List<ReactPackage> =
      buildList {
        add(MainReactPackage())
        add(ThreadedRuntimePackage())
        addAll(extraReactPackagesProvider?.invoke().orEmpty())
      }

  private fun isAppDebuggable(context: Context): Boolean =
      (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0

  private fun String?.orDefaultRuntimeName(): String =
      this?.takeIf { it.isNotBlank() } ?: DEFAULT_RUNTIME_NAME
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
