package com.nativecomposechat

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ComposeChatListManagerDelegate
import com.facebook.react.viewmanagers.ComposeChatListManagerInterface

class ComposeChatListManager :
    ViewGroupManager<ComposeChatListView>(), ComposeChatListManagerInterface<ComposeChatListView> {
  private val delegate: ViewManagerDelegate<ComposeChatListView> =
      ComposeChatListManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ComposeChatListView> = delegate

  override fun getName(): String = "ComposeChatList"

  override fun createViewInstance(reactContext: ThemedReactContext): ComposeChatListView =
      ComposeChatListView(reactContext)

  @ReactProp(name = "dataState")
  override fun setDataState(view: ComposeChatListView, dataState: ReadableMap?) {
    view.applyDataState(dataState)
  }

  @ReactProp(name = "renderedItems")
  override fun setRenderedItems(view: ComposeChatListView, renderedItems: ReadableMap?) {
    view.applyRenderedItems(renderedItems)
  }

  @ReactProp(name = "placeholderSpec")
  override fun setPlaceholderSpec(view: ComposeChatListView, placeholderSpec: ReadableMap?) {
    view.setPlaceholderSpec(placeholderSpec)
  }

  @ReactProp(name = "initialIndexToRender", defaultInt = 0)
  override fun setInitialIndexToRender(view: ComposeChatListView, initialIndexToRender: Int) {
    view.setInitialIndexToRender(initialIndexToRender)
  }

  @ReactProp(name = "renderMode")
  override fun setRenderMode(view: ComposeChatListView, renderMode: String?) {
    view.setRenderMode(renderMode ?: "main")
  }

  @ReactProp(name = "listName")
  override fun setListName(view: ComposeChatListView, listName: String?) {
    view.setListName(listName ?: "compose-chat-list")
  }

  @ReactProp(name = "backgroundAppName")
  override fun setBackgroundAppName(view: ComposeChatListView, backgroundAppName: String?) {
    view.setBackgroundAppName(backgroundAppName ?: "ComposeChatBackgroundRenderer")
  }

  override fun scrollToItem(view: ComposeChatListView, index: Int, animated: Boolean) {
    view.scrollToItem(index, animated)
  }

  override fun resetItem(view: ComposeChatListView, index: Int) {
    view.resetItem(index)
  }

  override fun addView(parent: ComposeChatListView, child: android.view.View, index: Int) {
    parent.addFabricChild(child, index)
  }

  @Suppress("PARAMETER_NAME_CHANGED_ON_OVERRIDE")
  override fun removeView(parent: ComposeChatListView, child: android.view.View) {
    parent.removeFabricChild(child)
  }

  override fun removeViewAt(parent: ComposeChatListView, index: Int) {
    parent.removeFabricChildAt(index)
  }

  override fun removeAllViews(parent: ComposeChatListView) {
    parent.removeAllFabricChildren()
  }

  override fun getChildAt(parent: ComposeChatListView, index: Int): android.view.View? =
      parent.getFabricChildAt(index)

  override fun getChildCount(parent: ComposeChatListView): Int = parent.fabricChildCount

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
      mutableMapOf(
          "topRequestItems" to mutableMapOf("registrationName" to "onRequestItems"),
          "topReactToItem" to mutableMapOf("registrationName" to "onReactToItem"),
      )
}
