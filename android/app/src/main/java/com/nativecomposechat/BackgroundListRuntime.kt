package com.nativecomposechat

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import com.facebook.react.ReactHost
import com.facebook.react.ReactRootView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JSBundleLoader
import com.facebook.react.bridge.JSBundleLoaderDelegate
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.common.LifecycleState
import com.facebook.react.defaults.DefaultComponentsRegistry
import com.facebook.react.defaults.DefaultReactHostDelegate
import com.facebook.react.defaults.DefaultTurboModuleManagerDelegate
import com.facebook.react.fabric.ComponentFactory
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import com.facebook.react.runtime.ReactHostImpl
import com.facebook.react.runtime.hermes.HermesInstance
import com.facebook.react.shell.MainReactPackage
import com.facebook.react.uimanager.ThemedReactContext
import java.io.File
import java.lang.ref.WeakReference

object BackgroundListRuntime {
  private const val REQUEST_EVENT = "ComposeChatBackgroundRequestItems"
  private const val DATA_STATE_EVENT = "ComposeChatBackgroundDataState"
  private const val MESSAGE_LOAD_LOG_TAG = "MessageLoadTelemetry"

  private var host: ReactHost? = null
  private var module: BackgroundListBridgeModule? = null
  private val views = mutableMapOf<String, WeakReference<ComposeChatListView>>()
  private val pendingEvents = mutableListOf<Pair<String, ReadableMap>>()
  private val readyLists = mutableSetOf<String>()

  fun registerView(listName: String, view: ComposeChatListView) {
    views[listName] = WeakReference(view)
  }

  fun unregisterView(listName: String, view: ComposeChatListView) {
    if (views[listName]?.get() === view) {
      views.remove(listName)
    }
  }

  @OptIn(UnstableReactNativeAPI::class)
  fun createHiddenRoot(
      reactContext: ThemedReactContext,
      appName: String,
      listName: String,
  ): View {
    val reactHost = ensureHost(reactContext)
    val props = Bundle()
    props.putString("listName", listName)
    val reactSurface = reactHost.createSurface(reactContext, appName, props)
    reactSurface.view?.visibility = View.INVISIBLE
    reactSurface.start()
    return checkNotNull(reactSurface.view)
  }

  fun attachModule(nextModule: BackgroundListBridgeModule) {
    module = nextModule
    flushPendingEvents()
  }

  fun detachModule(oldModule: BackgroundListBridgeModule) {
    if (module === oldModule) {
      module = null
    }
  }

  fun markRendererReady(listName: String) {
    readyLists.add(listName)
    flushPendingEvents()
  }

  fun updateDataState(listName: String, state: ReadableMap) {
    val payload = Arguments.createMap()
    payload.putString("listName", listName)
    payload.putMap("state", state.deepCopy())
    emitOrQueue(DATA_STATE_EVENT, payload)
  }

  fun requestItems(
      listName: String,
      requestId: Int,
      version: Int,
      indices: List<Int>,
      windowIndices: List<Int>,
      resetIndices: List<Int> = emptyList(),
  ) {
    val nativeDispatchUptimeMs = SystemClock.uptimeMillis().toDouble()
    if (readyLists.contains(listName)) {
      val didScheduleDirect =
          module?.requestItemsDirect(
              listName,
              requestId,
              version,
              nativeDispatchUptimeMs,
              indices.toIntArray(),
              windowIndices.toIntArray(),
              resetIndices.toIntArray(),
          ) == true
      if (didScheduleDirect) {
        Log.i(
            MESSAGE_LOAD_LOG_TAG,
            "dispatch path=direct requestId=$requestId version=$version count=${indices.size} missing=$indices window=$windowIndices reset=$resetIndices")
        return
      }
    }

    val payload = Arguments.createMap()
    val indicesArray = Arguments.createArray()
    val windowIndicesArray = Arguments.createArray()
    val resetIndicesArray = Arguments.createArray()
    indices.forEach { indicesArray.pushInt(it) }
    windowIndices.forEach { windowIndicesArray.pushInt(it) }
    resetIndices.forEach { resetIndicesArray.pushInt(it) }
    payload.putString("listName", listName)
    payload.putInt("requestId", requestId)
    payload.putInt("version", version)
    payload.putDouble("nativeDispatchUptimeMs", nativeDispatchUptimeMs)
    payload.putArray("indices", indicesArray)
    payload.putArray("windowIndices", windowIndicesArray)
    payload.putArray("resetIndices", resetIndicesArray)
    Log.i(
        MESSAGE_LOAD_LOG_TAG,
        "dispatch path=event requestId=$requestId version=$version count=${indices.size} missing=$indices window=$windowIndices reset=$resetIndices")
    emitOrQueue(REQUEST_EVENT, payload)
  }

  fun deliverRenderedItems(listName: String, payload: ReadableMap) {
    val nativeReceivedAtMs = SystemClock.uptimeMillis()
    views[listName]?.get()?.post {
      views[listName]?.get()?.applyRenderedItems(payload, nativeReceivedAtMs)
    }
  }

  fun attachFabricChild(listName: String, child: ComposeChatListItemView) {
    views[listName]?.get()?.post { views[listName]?.get()?.addBackgroundFabricChild(child) }
  }

  fun detachFabricChild(listName: String, child: ComposeChatListItemView) {
    views[listName]?.get()?.post { views[listName]?.get()?.removeBackgroundFabricChild(child) }
  }

  fun reactToItem(listName: String, index: Int, reaction: String) {
    views[listName]?.get()?.post { views[listName]?.get()?.reactToItemFromBackground(index, reaction) }
  }

  @OptIn(UnstableReactNativeAPI::class, FrameworkAPI::class)
  private fun ensureHost(reactContext: ThemedReactContext): ReactHost {
    host?.let { return it }

    val activity = reactContext.currentActivity
    val componentFactory = ComponentFactory()
    DefaultComponentsRegistry.register(componentFactory)

    val delegate =
        DefaultReactHostDelegate(
            jsMainModulePath = "index",
            jsBundleLoader = BackgroundListEnvironmentBundleLoader(reactContext.applicationContext),
            reactPackages = listOf(MainReactPackage(), BackgroundListRendererPackage()),
            jsRuntimeFactory = HermesInstance(),
            turboModuleManagerDelegateBuilder = DefaultTurboModuleManagerDelegate.Builder(),
            exceptionHandler = { throw it },
        )

    val nextHost =
        ReactHostImpl(
            reactContext.applicationContext,
            delegate,
            componentFactory,
            true,
            BuildConfig.DEBUG,
        )

    if (activity != null) {
      nextHost.onHostResume(activity, activity as? DefaultHardwareBackBtnHandler)
    }

    return nextHost.also { host = it }
  }

  private fun emitOrQueue(eventName: String, payload: ReadableMap) {
    val listName = payload.getString("listName")
    if (module == null || (listName != null && !readyLists.contains(listName))) {
      pendingEvents.add(eventName to payload.deepCopy())
      return
    }
    module?.emit(eventName, payload)
  }

  private fun flushPendingEvents() {
    val activeModule = module ?: return
    val iterator = pendingEvents.iterator()
    while (iterator.hasNext()) {
      val (eventName, payload) = iterator.next()
      val listName = payload.getString("listName")
      if (listName == null || readyLists.contains(listName)) {
        activeModule.emit(eventName, payload)
        iterator.remove()
      }
    }
  }

  private fun ReadableMap.deepCopy(): ReadableMap =
      Arguments.makeNativeMap(toHashMap())
}

private class BackgroundListEnvironmentBundleLoader(
    private val context: android.content.Context,
) : JSBundleLoader() {
  override fun loadScript(delegate: JSBundleLoaderDelegate): String {
    val prelude = File(context.cacheDir, "compose-chat-list-env.js")
    prelude.writeText(
        """
        var __composeChatGlobal =
          typeof globalThis !== 'undefined' ? globalThis : Function('return this')();
        __composeChatGlobal.global = __composeChatGlobal;
        __composeChatGlobal.globalThis = __composeChatGlobal;
        __composeChatGlobal._is_it_a_list_env = true;
        __composeChatGlobal.__COMPOSE_CHAT_LIST_ENV__ = {kind: 'background-list', version: 1};
        """.trimIndent(),
    )

    val sourceUrl = prelude.absolutePath
    delegate.loadScriptFromFile(prelude.absolutePath, sourceUrl, false)
    delegate.loadScriptFromAssets(context.assets, "assets://index.android.bundle", true)
    return "assets://index.android.bundle"
  }
}
