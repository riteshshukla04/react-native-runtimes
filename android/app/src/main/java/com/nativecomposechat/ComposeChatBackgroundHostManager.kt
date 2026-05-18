package com.nativecomposechat

import android.view.View
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ComposeChatBackgroundHostManagerDelegate
import com.facebook.react.viewmanagers.ComposeChatBackgroundHostManagerInterface

class ComposeChatBackgroundHostManager :
    ViewGroupManager<ComposeChatBackgroundHostView>(),
    ComposeChatBackgroundHostManagerInterface<ComposeChatBackgroundHostView> {
  private val delegate: ViewManagerDelegate<ComposeChatBackgroundHostView> =
      ComposeChatBackgroundHostManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ComposeChatBackgroundHostView> = delegate

  override fun getName(): String = "ComposeChatBackgroundHost"

  override fun createViewInstance(
      reactContext: ThemedReactContext
  ): ComposeChatBackgroundHostView = ComposeChatBackgroundHostView(reactContext)

  @ReactProp(name = "listName")
  override fun setListName(view: ComposeChatBackgroundHostView, value: String?) {
    view.setListName(value ?: "compose-chat-list")
  }

  override fun addView(parent: ComposeChatBackgroundHostView, child: View, index: Int) {
    parent.addFabricChild(child, index)
  }

  @Suppress("PARAMETER_NAME_CHANGED_ON_OVERRIDE")
  override fun removeView(view: ComposeChatBackgroundHostView, child: View) {
    view.removeFabricChild(child)
  }

  override fun removeViewAt(parent: ComposeChatBackgroundHostView, index: Int) {
    parent.removeFabricChildAt(index)
  }

  override fun removeAllViews(parent: ComposeChatBackgroundHostView) {
    parent.removeAllFabricChildren()
  }

  override fun getChildAt(parent: ComposeChatBackgroundHostView, index: Int): View? =
      parent.getFabricChildAt(index)

  override fun getChildCount(parent: ComposeChatBackgroundHostView): Int =
      parent.fabricChildCount
}
